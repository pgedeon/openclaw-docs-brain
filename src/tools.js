import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import fs from 'fs-extra';
import crypto from 'crypto';
import yaml from 'yaml';
import path from 'path';
import betterSqlite3 from 'better-sqlite3';

const { ensureDirSync, removeSync } = fs;

export class ToolsHandler {
  constructor(stateDir, pluginConfig) {
    this.stateDir = stateDir;
    this.dbPath = path.join(stateDir, 'docs_index.sqlite');
    this.pluginConfig = pluginConfig;
    this.db = null;

    // Vector backend config (optional)
    this.qdrantUrl = pluginConfig.qdrant?.url || 'http://127.0.0.1:6333';
    this.qdrantCollection = pluginConfig.qdrant?.collection || 'docs_brain';
    this.embeddingsConfig = pluginConfig.embeddings || null;
    this.vectorEnabled = pluginConfig.mode !== 'fts'; // hybrid or vector
    this.vectorSize = pluginConfig.vectorSize || 768;
  }

  async init() {
    ensureDirSync(this.stateDir);
    this.db = betterSqlite3(this.dbPath, { verbose: undefined });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.createTables();

    // If vector mode is enabled, ensure Qdrant collection exists
    if (this.vectorEnabled) {
      try {
        await this.ensureVectorCollection(this.vectorSize);
      } catch (err) {
        console.warn('[docs-brain] Qdrant collection setup failed, disabling vector mode:', err.message);
        this.vectorEnabled = false;
      }
    }
  }

  createTables() {
    const db = this.db;

    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        last_indexed_at TEXT,
        hash TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        title,
        section,
        source_id,
        tokenize = 'porter unicode61'
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        section TEXT,
        content TEXT NOT NULL,
        hash TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES sources (id)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_meta_source_id ON chunks_meta(source_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_meta_hash ON chunks_meta(hash);
    `);

    db.exec('DROP TRIGGER IF EXISTS chunks_ai');
    db.exec('DROP TRIGGER IF EXISTS chunks_ad');
    db.exec('DROP TRIGGER IF EXISTS chunks_au');

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks_meta BEGIN
        INSERT INTO chunks_fts(rowid, content, title, section, source_id)
        VALUES (new.id, new.content, new.title, new.section, new.source_id);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks_meta BEGIN
        DELETE FROM chunks_fts WHERE rowid = old.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks_meta BEGIN
        DELETE FROM chunks_fts WHERE rowid = old.id;
        INSERT INTO chunks_fts(rowid, content, title, section, source_id)
        VALUES (new.id, new.content, new.title, new.section, new.source_id);
      END;
    `);
  }

  /**
   * Ensure Qdrant collection exists. Creates it if missing.
   * Uses vector dimension from config.
   */
  async ensureVectorCollection(vectorSize) {
    if (!this.vectorEnabled) {
      return { skipped: true, reason: 'Vector mode not enabled' };
    }

    try {
      // Check if collection exists
      const getResp = await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}`);
      if (getResp.ok) {
        const info = await getResp.json();
        console.log(`[docs-brain] Qdrant collection "${this.qdrantCollection}" already exists`);
        return { exists: true, info: info.result };
      }

      // Create collection
      const createResp = await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine'
          },
          payload: {
            source_id: { type: 'keyword' },
            title: { type: 'text' },
            section: { type: 'text' },
            content: { type: 'text' },
            hash: { type: 'keyword' },
            chunk_id: { type: 'integer' }
          }
        })
      });

      if (!createResp.ok) {
        const err = await createResp.text();
        throw new Error(`HTTP ${createResp.status}: ${err}`);
      }

      const result = await createResp.json();
      console.log(`[docs-brain] Created Qdrant collection "${this.qdrantCollection}" with ${vectorSize} dimensions`);
      return { created: true, result: result.result };
    } catch (error) {
      console.error('[docs-brain] Failed to ensure Qdrant collection:', error.message);
      throw error;
    }
  }

  addSource(sourceId, url, title, status = 'pending') {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sources (id, source, title, status, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(sourceId, url, title, status);
  }

  updateSourceStatus(sourceId, status, hash = null) {
    const stmt = this.db.prepare(`
      UPDATE sources
      SET status = ?, hash = ?, last_indexed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, hash, sourceId);
  }

  getSource(sourceId) {
    const stmt = this.db.prepare('SELECT * FROM sources WHERE id = ?');
    return stmt.get(sourceId);
  }

  getAllSources() {
    const stmt = this.db.prepare('SELECT * FROM sources ORDER BY id');
    return stmt.all();
  }

  addChunk(sourceId, title, section, content, hash, chunkIndex) {
    const stmt = this.db.prepare(`
      INSERT INTO chunks_meta (source_id, title, section, content, hash, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(sourceId, title, section, content, hash, chunkIndex);
    return info.lastInsertRowid;
  }

  clearChunksForSource(sourceId) {
    const stmt = this.db.prepare('DELETE FROM chunks_meta WHERE source_id = ?');
    stmt.run(sourceId);
  }

  searchFTS(query, limit = 6, library = null) {
    // Sanitize: replace hyphens with spaces to avoid FTS5 parse errors (e.g., WP-CLI -> WP CLI)
    const sanitized = query.replace(/-/g, ' ');
    const matchQuery = `${sanitized}*`;

    let sql = `
      SELECT
        m.id as chunk_id,
        m.source_id,
        m.title,
        m.section,
        m.content,
        m.hash,
        s.source as source_url,
        bm25(chunks_fts) as bm25_score
      FROM chunks_fts
      JOIN chunks_meta m ON chunks_fts.rowid = m.id
      JOIN sources s ON m.source_id = s.id
      WHERE chunks_fts MATCH ?
    `;

    const params = [matchQuery];

    if (library) {
      sql += ` AND m.source_id = ?`;
      params.push(library);
    }

    sql += `
      ORDER BY bm25_score ASC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map(row => ({
      score: -row.bm25_score,
      source: row.source_url,
      title: row.title,
      section: row.section,
      text: row.content,
      hash: row.hash,
      source_id: row.source_id
    }));
  }

  getChunkCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as c FROM chunks_meta');
    return stmt.get().c;
  }

  getDocCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as c FROM sources WHERE status = ?');
    return stmt.get('ok').c;
  }

  getIndexStatus() {
    return {
      docsCount: this.getDocCount(),
      chunkCount: this.getChunkCount(),
      lastIndexedAt: new Date().toISOString()
    };
  }

  /**
   * Generate embedding for a text using LM Studio endpoint
   */
  async generateEmbedding(text) {
    if (!this.embeddingsConfig) {
      throw new Error('Embeddings configuration missing in plugin config');
    }

    const { baseUrl, model, apiKey } = this.embeddingsConfig || {};

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // baseUrl is like http://192.168.0.11:1234/v1 ; embeddings endpoint is /embeddings
    const url = baseUrl.replace(/\/+$/, '') + '/embeddings';

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data) || !data.data[0]?.embedding) {
      throw new Error('Invalid embedding response');
    }

    return data.data[0].embedding;
  }

  /**
   * Convert a SHA256 hash (64-char hex) to a UUID (v4 format) for Qdrant point ID
   * Uses first 128 bits (32 hex chars)
   */
  hashToUuid(hash) {
    const hex = hash.substring(0, 32);
    return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
  }

  /**
   * Upsert chunk vectors to Qdrant.
   * @param {Array} chunks - Array of chunk objects from indexer, each with: source_id, title, section, content, hash, chunk_index
   * @param {string} sourceUrl - The source URL for the document
   */
  async upsertChunkVectors(chunks, sourceUrl) {
    if (!this.vectorEnabled) {
      return { skipped: true, reason: 'Vector mode not enabled' };
    }

    if (!chunks || chunks.length === 0) {
      return { skipped: true, reason: 'No chunks to upsert' };
    }

    try {
      console.log(`[docs-brain] Generating embeddings for ${chunks.length} chunks...`);
      const points = [];

      for (const chunk of chunks) {
        try {
          const embedding = await this.generateEmbedding(chunk.content);
          const pointId = this.hashToUuid(chunk.hash);

          points.push({
            id: pointId,
            vector: embedding,
            payload: {
              source_id: chunk.source_id,
              source_url: sourceUrl,
              title: chunk.title,
              section: chunk.section,
              content: chunk.content,
              hash: chunk.hash,
              chunk_id: chunk.chunk_index
            }
          });
        } catch (err) {
          console.error(`[docs-brain] Failed to generate embedding for chunk ${chunk.hash}:`, err.message);
          // Continue with other chunks
        }
      }

      if (points.length === 0) {
        console.warn('[docs-brain] No embeddings generated, skipping Qdrant upsert');
        return { upserted: 0, error: 'No embeddings generated' };
      }

      // Upsert in batches (Qdrant supports up to 100-1000 per request)
      const batchSize = 100;
      let upsertedCount = 0;

      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        const resp = await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: batch,
            wait: true // Wait for consistency
          })
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Qdrant upsert batch ${i/batchSize + 1} failed: ${resp.status} ${err}`);
        }

        upsertedCount += batch.length;
      }

      console.log(`[docs-brain] ✅ Successfully upserted ${upsertedCount}/${points.length} vectors to Qdrant (collection: ${this.qdrantCollection})`);
      return { upserted: upsertedCount, collection: this.qdrantCollection };
    } catch (error) {
      console.error('[docs-brain] Vector upsert failed:', error.message);
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
