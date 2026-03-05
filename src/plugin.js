import { join } from 'path';
import { ensureDirSync } from 'fs-extra';
import { ToolsHandler } from './tools.js';
import { Indexer } from './indexer.js';
import { Searcher } from './search.js';
import { Hooks } from './hooks.js';

export default {
  id: 'docs-brain',
  name: 'Docs Brain',
  description: 'Full-text search over documentation with tool-first access for coding agents',
  configSchema: {
    type: 'object',
    required: ['repoRoot', 'injectAgents'],
    additionalProperties: false,
    properties: {
      repoRoot: { type: 'string', description: 'Absolute workspace root path' },
      mode: { type: 'string', enum: ['fts', 'hybrid', 'vector'], default: 'fts' },
      autoIndex: { type: 'boolean', default: true },
      autoInject: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', default: false },
          topK: { type: 'integer', minimum: 1, default: 6 },
          maxChars: { type: 'integer', minimum: 500, default: 3500 }
        }
      },
      injectAgents: {
        type: 'array',
        'items': { type: 'string' },
        description: 'Agent IDs allowed to receive docs-brain prompt guidance/injection'
      },
      qdrant: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', default: 'http://127.0.0.1:6333' },
          collection: { type: 'string', default: 'docs_brain' }
        }
      },
      embeddings: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string', default: 'lmstudio-openai-compatible' },
          baseUrl: { type: 'string', default: 'http://192.168.0.11:1234/v1' },
          model: { type: 'string', default: 'text-embedding-nomic-embed-text-v1.5' },
          apiKey: { type: 'string', description: 'API key for embedding provider (if required)' }
        }
      },
      vectorSize: {
        type: 'integer',
        description: 'Vector dimension for embeddings (e.g., 768 for nomic-embed-text-v1.5)',
        default: 768
      },
      sourcesFile: {
        type: 'string',
        default: '.openclaw/plugins/docs-brain/sources.yaml'
      }
    }
  },

  register(api) {
    const config = api.pluginConfig;
    const repoRoot = config.repoRoot;
    const stateDir = join(repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

    // Ensure state directory exists
    ensureDirSync(stateDir);

    let toolsHandler = null;
    let searcher = null;
    let indexer = null;
    let hooks = null;
    let initialized = false;

    const initialize = async () => {
      if (initialized) return;

      // Initialize tools handler (SQLite FTS + vector ops)
      toolsHandler = new ToolsHandler(stateDir, config);
      await toolsHandler.init();

      // Initialize searcher
      searcher = new Searcher(toolsHandler, config);

      // Initialize indexer (pass toolsHandler for vector upserts)
      indexer = new Indexer(stateDir, toolsHandler, config);

      // Initialize hooks
      hooks = new Hooks(toolsHandler, searcher, indexer, config, api);

      initialized = true;
    };

    // Auto-index if configured
    if (config.autoIndex) {
      initialize().then(() => {
        try {
          const stats = toolsHandler.getIndexStatus();
          if (stats.chunkCount === 0) {
            console.log('[docs-brain] Auto-indexing initial sources...');
            indexer.indexAllSources().catch(err => {
              console.error('[docs-brain] Auto-index failed:', err.message);
            });
          }
        } catch (e) {
          console.warn('[docs-brain] Auto-index check failed:', e.message);
        }
      }).catch(err => {
        console.error('[docs-brain] Initialization failed:', err.message);
      });
    }

    // Tool: docs.search
    api.registerTool({
      name: 'docs.search',
      label: 'Search Documentation',
      description: 'Search indexed documentation using full-text search. Returns ranked results with source metadata.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          topK: { type: 'number', description: 'Maximum results to return', default: 6 },
          library: { type: ['string', 'null'], description: 'Optional library filter (fastapi, sqlalchemy, etc.)' }
        },
        required: ['query']
      },
      execute: async (toolCallId, rawParams) => {
        await initialize();
        const params = rawParams;
        const results = await searcher.search(params.query, params.topK || 6, params.library);
        return {
          query: params.query,
          mode: config.mode,
          results: results
        };
      }
    });

    // Tool: docs.snippets_for_task
    api.registerTool({
      name: 'docs.snippets_for_task',
      label: 'Get Docs Snippets for Task',
      description: 'Retrieve relevant documentation snippets for a coding task. Combines task description and repo context.',
      parameters: {
        type: 'object',
        properties: {
          taskText: { type: 'string', description: 'Description of the coding task' },
          repoContext: { type: ['string', 'null'], description: 'Optional current file/function context' },
          topK: { type: 'number', description: 'Maximum snippets to return', default: 8 }
        },
        required: ['taskText']
      },
      execute: async (toolCallId, rawParams) => {
        await initialize();
        const params = rawParams;
        const query = params.repoContext
          ? `${params.taskText}\n\nRelevant repo context:\n${params.repoContext}`
          : params.taskText;
        const results = await searcher.search(query, params.topK || 8);
        return {
          retrievalQuery: query,
          query: query,
          mode: config.mode,
          results: results
        };
      }
    });

    // Tool: docs.index_status
    api.registerTool({
      name: 'docs.index_status',
      label: 'Documentation Index Status',
      description: 'Get current indexing status, including document and chunk counts.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (toolCallId, rawParams) => {
        await initialize();
        const status = toolsHandler.getIndexStatus();
        const sources = toolsHandler.getAllSources();
        return {
          mode: config.mode,
          docsCount: status.docsCount,
          chunkCount: status.chunkCount,
          lastIndexedAt: status.lastIndexedAt,
          backend: { 
            fts: true, 
            vector: toolsHandler.vectorEnabled 
          },
          sources: sources.map(s => ({
            id: s.id,
            status: s.status === 'ok' ? 'ok' : 'error'
          }))
        };
      }
    });

    // Tool: docs.reindex
    api.registerTool({
      name: 'docs.reindex',
      label: 'Reindex Documentation',
      description: 'Reindex documentation sources. Can target specific sources or rebuild everything.',
      parameters: {
        type: 'object',
        properties: {
          sourceIds: { type: 'array', items: { type: 'string' }, description: 'Optional list of source IDs to reindex' },
          full: { type: 'boolean', description: 'If true, rebuild entire index from scratch', default: false }
        }
      },
      execute: async (toolCallId, rawParams) => {
        await initialize();
        const params = rawParams;
        const jobId = `reindex-${new Date().toISOString().replace(/[:.]/g, '-')}`;

        try {
          if (params.full) {
            await indexer.reindexAll();
          } else if (params.sourceIds && params.sourceIds.length > 0) {
            await indexer.reindexSources(params.sourceIds);
          } else {
            await indexer.indexAllSources();
          }
          return { started: true, jobId, mode: config.mode };
        } catch (err) {
          console.error('[docs-brain] Reindex failed:', err.message);
          throw err;
        }
      }
    });

    // Register hook for before_prompt_build
    api.on('before_prompt_build', async (event, ctx) => {
      return hooks.beforePromptBuild(event, ctx);
    });
  }
};
