import path from 'path';
import { join } from 'path';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import fs from 'fs-extra';
import crypto from 'crypto';
import yaml from 'yaml';

const { ensureDirSync } = fs;

export class Indexer {
  constructor(stateDir, toolsHandler, config) {
    this.stateDir = stateDir;
    this.db = toolsHandler; // Store full ToolsHandler instance
    this.rawDb = toolsHandler.db; // Raw Database if needed
    this.config = config;
    // sourcesFile is relative to repoRoot
    this.sourcesFile = join(config.repoRoot, config.sourcesFile);
    this.normalizedDir = join(stateDir, 'normalized');
    this.chunksDir = join(stateDir, 'chunks');
    this.logsDir = join(stateDir, 'logs');
    ensureDirSync(this.normalizedDir);
    ensureDirSync(this.chunksDir);
    ensureDirSync(this.logsDir);
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
  }

  /**
   * Extract the main article content from HTML using cheerio.
   * Tries multiple selectors to find the primary content area.
   * Removes navigation, header, footer, and sidebar elements.
   * @param {string} html - The raw HTML content
   * @returns {string} - Cleaned HTML of the main content subtree
   */
  extractMainContent(html) {
    const $ = cheerio.load(html);

    // Remove unwanted elements first
    $('nav, header, footer, aside, .sidebar, .navigation, .menu, .nav, .header, .footer, .site-header, .site-footer, .site-nav, .breadcrumb, .pagination, .related, .comments, .ads, .advertisement, .social-share, .share-buttons').remove();

    // Try common content selectors in order of preference
    const contentSelectors = [
      'main',
      '.entry-content',
      '.content',
      'article',
      '.post-content',
      '.page-content',
      '.article-content',
      '.doc-content',
      '.documentation',
      '.markdown-body',
      'body'
    ];

    let $content = null;
    for (const selector of contentSelectors) {
      const $elem = $(selector);
      if ($elem.length > 0) {
        // Use the first matching element
        $content = $elem.eq(0);
        break;
      }
    }

    // Fallback to body if no specific content container found
    if (!$content) {
      $content = $('body');
    }

    // Return the cleaned HTML of the content subtree
    return $.html($content);
  }

  async loadSources() {
    if (!existsSync(this.sourcesFile)) {
      throw new Error(`Sources file not found: ${this.sourcesFile}`);
    }
    const content = readFileSync(this.sourcesFile, 'utf-8');
    const doc = yaml.parse(content);
    return doc;
  }

  async fetchHTML(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  }

  async fetchLocal(path) {
    const absolutePath = path.startsWith('/') ? path : join(this.config.repoRoot, path);
    if (!existsSync(absolutePath)) {
      throw new Error(`Local path not found: ${absolutePath}`);
    }
    return readFileSync(absolutePath, 'utf-8');
  }

  async fetchLocalDir(dirPath) {
    const absoluteDir = dirPath.startsWith('/') ? dirPath : join(this.config.repoRoot, dirPath);
    if (!existsSync(absoluteDir)) {
      throw new Error(`Local directory not found: ${absoluteDir}`);
    }

    const files = [];
    const stack = [absoluteDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    }

    if (files.length === 0) {
      throw new Error(`No markdown files found in ${absoluteDir}`);
    }

    const docs = [];
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const relative = path.relative(absoluteDir, file);
        docs.push({
          id: relative.replace(/[/\\]/g, '-'), // e.g., cli-setup
          title: relative,
          content: content
        });
      } catch (e) {
        console.warn(`[docs-brain] Skipping file ${file}: ${e.message}`);
      }
    }

    return docs;
  }

  htmlToMarkdown(html) {
    // First extract the main content to focus on the actual article/documentation
    const cleanedHtml = this.extractMainContent(html);
    return this.turndown.turndown(cleanedHtml);
  }

  chunkMarkdown(markdown, metadata = {}) {
    const chunks = [];
    const lines = markdown.split('\n');
    let currentChunk = [];
    let currentSection = 'Introduction';
    let currentHeadingStack = [];
    const MAX_CHUNK_SIZE = 2000;

    const flushChunk = (force = false) => {
      if (currentChunk.length === 0) return;
      const content = currentChunk.join('\n');
      if (force || content.length > MAX_CHUNK_SIZE / 2) {
        chunks.push({
          content: content.trim(),
          title: metadata.title,
          section: currentSection,
          hash: crypto.createHash('sha256').update(content).digest('hex')
        });
        currentChunk = [];
      }
    };

    for (let line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushChunk();
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        if (level === 1) {
          currentSection = title;
          currentHeadingStack = [title];
        } else if (level === 2) {
          currentSection = title;
          currentHeadingStack[1] = title;
        } else if (level === 3) {
          currentSection = `${currentHeadingStack[1] || ''} > ${title}`;
        } else if (level === 4) {
          currentSection = `${currentHeadingStack[1] || ''} > ${currentHeadingStack[2] || ''} > ${title}`;
        }
      }
      currentChunk.push(line);

      if (currentChunk.join('\n').length > MAX_CHUNK_SIZE) {
        flushChunk(true);
      }
    }
    flushChunk(true);

    const merged = [];
    let buffer = '';
    for (let chunk of chunks) {
      if (chunk.content.length < 500 && buffer.length + chunk.content.length < MAX_CHUNK_SIZE) {
        buffer += '\n\n' + chunk.content;
      } else {
        if (buffer) {
          merged.push({
            content: buffer.trim(),
            title: metadata.title,
            section: currentSection,
            hash: crypto.createHash('sha256').update(buffer).digest('hex')
          });
          buffer = '';
        }
        merged.push(chunk);
      }
    }
    if (buffer) {
      merged.push({
        content: buffer.trim(),
        title: metadata.title,
        section: currentSection,
        hash: crypto.createHash('sha256').update(buffer).digest('hex')
      });
    }

    return merged;
  }

  async processSource(source) {
    const { id, url, title, type = 'online' } = source;

    this.log(`Processing ${id} from ${url}`);

    try {
      let markdown;
      let chunks = [];
      if (type === 'local-dir') {
        // Fetch multiple markdown files; each file is chunked separately
        const docs = await this.fetchLocalDir(url);
        const allChunks = [];
        for (const doc of docs) {
          const docChunks = this.chunkMarkdown(doc.content, {
            title: `${title} — ${doc.title}`
          });
          allChunks.push(...docChunks);
        }
        chunks = allChunks;
        // Optionally write a combined normalized file for debugging
        const combined = docs.map(d => `# ${d.title}\n\n${d.content}`).join('\n\n---\n\n');
        const normalizedPath = join(this.normalizedDir, `${id}.md`);
        writeFileSync(normalizedPath, combined, 'utf-8');
      } else if (type === 'local' || url.startsWith('/')) {
        markdown = await this.fetchLocal(url);
        const normalizedPath = join(this.normalizedDir, `${id}.md`);
        writeFileSync(normalizedPath, markdown, 'utf-8');
        chunks = this.chunkMarkdown(markdown, { title: title || id });
      } else {
        const html = await this.fetchHTML(url);
        markdown = this.htmlToMarkdown(html);
        const normalizedPath = join(this.normalizedDir, `${id}.md`);
        writeFileSync(normalizedPath, markdown, 'utf-8');
        chunks = this.chunkMarkdown(markdown, { title: title || id });
      }

      const chunksPath = join(this.chunksDir, `${id}.json`);
      writeFileSync(chunksPath, JSON.stringify(chunks, null, 2), 'utf-8');

      return { id, chunks, status: 'ok' };
    } catch (err) {
      this.log(`Error processing ${id}: ${err.message}`);
      return { id, chunks: [], status: 'error', error: err.message };
    }
  }

  async indexSource(source, clearExisting = true) {
    const result = await this.processSource(source);

    if (clearExisting) {
      this.db.clearChunksForSource(result.id);
    }

    this.db.addSource(result.id, source.url, source.title || result.id, result.status);

    if (result.status === 'ok') {
      result.chunks.forEach((chunk, idx) => {
        // Enrich chunk with source_id and chunk_index for storage
        chunk.source_id = result.id;
        chunk.chunk_index = idx;
        this.db.addChunk(result.id, chunk.title, chunk.section, chunk.content, chunk.hash, idx);
      });
      this.db.updateSourceStatus(result.id, 'ok');
      this.log(`Indexed ${result.chunks.length} chunks for ${result.id}`);

      // If vector/hybrid mode, also upsert vectors to Qdrant
      if (this.config.mode === 'hybrid' || this.config.mode === 'vector') {
        try {
          const vectorResult = await this.db.upsertChunkVectors(result.chunks, source.url);
          if (vectorResult.upserted > 0) {
            this.log(`Vector upsert: ${vectorResult.upserted} vectors added to Qdrant (collection: ${vectorResult.collection})`);
          } else if (vectorResult.skipped) {
            this.log(`Vector upsert skipped: ${vectorResult.reason}`);
          }
        } catch (err) {
          this.log(`⚠️  Vector upsert failed: ${err.message}. Indexing continues with FTS only.`);
          // Do not fail the whole index, just log and continue
        }
      }
    } else {
      this.db.updateSourceStatus(result.id, 'error');
    }

    return result;
  }

  async indexAllSources(clearExisting = true) {
    const sources = await this.loadSources();
    const results = [];

    for (const source of sources) {
      const result = await this.indexSource(source, clearExisting);
      results.push(result);
    }

    // Summary log
    const totalFTS = results.reduce((sum, r) => sum + (r.status === 'ok' ? r.chunks.length : 0), 0);
    console.log(`[docs-brain] Indexing complete: ${totalFTS} FTS chunks indexed for ${results.length} sources`);

    return results;
  }

  async reindexSources(sourceIds) {
    const sources = await this.loadSources();
    const toReindex = sources.filter(s => sourceIds.includes(s.id));
    const results = [];

    for (const source of toReindex) {
      const result = await this.indexSource(source, true);
      results.push(result);
    }

    return results;
  }

  async reindexAll() {
    const db = this.rawDb; // this.db.db would also work if we use this.db = toolsHandler; but we set this.db to toolsHandler, so this.db.db? Actually we set this.db = toolsHandler, so this.db.db = toolsHandler.db. Let's adjust: we stored rawDb separately.
    db.exec('DELETE FROM chunks_meta');
    db.exec('DELETE FROM sources');
    db.exec('DELETE FROM chunks_fts');

    const sources = await this.loadSources();
    const results = [];

    for (const source of sources) {
      const result = await this.indexSource(source, false);
      results.push(result);
    }

    return results;
  }

  log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[ Docs-Brain ] ${timestamp} - ${msg}`);
  }
}
