import fetch from 'node-fetch';

export class Searcher {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.mode = config.mode || 'fts';
    this.qdrantUrl = config.qdrant?.url || 'http://127.0.0.1:6333';
    this.qdrantCollection = config.qdrant?.collection || 'docs_brain';
    this.embeddingsConfig = config.embeddings || null;
  }

  /**
   * Generate embedding for a query using LM Studio endpoint
   */
  async generateEmbedding(text) {
    if (!this.embeddingsConfig) {
      throw new Error('Embeddings configuration missing');
    }

    const { baseUrl, model, apiKey } = this.embeddingsConfig;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
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
   * Perform vector search against Qdrant
   * Returns array of results with score and metadata
   */
  async searchVector(queryVector, limit = 6, library = null) {
    try {
      const searchBody = {
        vector: queryVector,
        limit: limit * 2, // Get more to allow filtering by library
        with_payload: true,
        with_vectors: false
      };

      // Optional library filter
      if (library) {
        searchBody.filter = {
          must: [
            { key: 'source_id', match: { value: library } }
          ]
        };
      }

      const response = await fetch(
        `${this.qdrantUrl}/collections/${this.qdrantCollection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchBody)
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant search error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return data.result.map(hit => ({
        score: hit.score,
        source: hit.payload.source_url || hit.payload.source_id,
        title: hit.payload.title,
        section: hit.payload.section,
        text: hit.payload.content,
        hash: hit.payload.hash,
        source_id: hit.payload.source_id,
        chunk_id: hit.id
      }));
    } catch (error) {
      console.error('[docs-brain] Vector search failed:', error.message);
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) to merge FTS and vector results
   * @param {Array} ftsResults - FTS search results with scores
   * @param {Array} vectorResults - Vector search results with scores
   * @param {number} k - RRF constant (default 60)
   * @returns {Array} merged and re-ranked results
   */
  reciprocalRankFusion(ftsResults, vectorResults, k = 60) {
    const scoreMap = new Map();
    const documents = new Map(); // hash -> document

    // Index FTS results by hash
    ftsResults.forEach((doc, rank) => {
      const hash = doc.hash;
      documents.set(hash, doc);
      const rrfScore = 1 / (k + rank + 1);
      scoreMap.set(hash, (scoreMap.get(hash) || 0) + rrfScore);
    });

    // Index vector results by hash
    vectorResults.forEach((doc, rank) => {
      const hash = doc.hash;
      // Ensure document exists in map (might already exist from FTS)
      if (!documents.has(hash)) {
        documents.set(hash, doc);
      }
      const rrfScore = 1 / (k + rank + 1);
      scoreMap.set(hash, (scoreMap.get(hash) || 0) + rrfScore);
    });

    // Convert to array and sort by RRF score descending
    const merged = Array.from(documents.entries())
      .map(([hash, doc]) => ({
        ...doc,
        score: scoreMap.get(hash)
      }))
      .sort((a, b) => b.score - a.score);

    return merged;
  }

  /**
   * Main search method - routes to appropriate search strategy
   */
  async search(query, topK = 6, library = null) {
    // Always perform FTS search (it's fast and we always want it)
    const ftsResults = this.db.searchFTS(query, topK * 2, library);

    // If mode is FTS-only, return immediately
    if (this.mode === 'fts') {
      return ftsResults.slice(0, topK);
    }

    // For hybrid or vector modes, we need vector search
    if (this.mode === 'vector') {
      try {
        const queryVector = await this.generateEmbedding(query);
        const vectorResults = await this.searchVector(queryVector, topK, library);
        return vectorResults;
      } catch (error) {
        console.error('[docs-brain] Vector-only search failed, falling back to FTS:', error.message);
        return ftsResults.slice(0, topK);
      }
    }

    // Hybrid mode: combine FTS and vector search
    if (this.mode === 'hybrid') {
      try {
        const queryVector = await this.generateEmbedding(query);
        const vectorResults = await this.searchVector(queryVector, topK, library);
        // Use RRF to merge, limiting to topK
        const merged = this.reciprocalRankFusion(ftsResults, vectorResults, 60);
        return merged.slice(0, topK);
      } catch (error) {
        console.warn('[docs-brain] Hybrid search failed, using FTS-only mode:', error.message);
        // If vector component fails, degrade gracefully to FTS
        return ftsResults.slice(0, topK);
      }
    }

    // Unknown mode, default to FTS
    console.warn(`[docs-brain] Unknown mode "${this.mode}", defaulting to FTS`);
    return ftsResults.slice(0, topK);
  }
}
