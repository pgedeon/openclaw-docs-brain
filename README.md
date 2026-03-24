# OpenClaw Docs-Brain Plugin

**Intelligent hybrid search for OpenClaw with embeddings + FTS.** Docs-Brain indexes your documentation (online or local) and provides semantic + keyword retrieval via a single `docs.search` tool. Built for teams that want accurate, context-aware answers from their docs.

## Features

- **Hybrid search**: Combines SQLite FTS5 and vector similarity (Qdrant) using Reciprocal Rank Fusion
- **Flexible sources**: Online URLs, local directories (Markdown), or local files
- **Embedding provider**: LM Studio OpenAI-compatible endpoint (supports any model)
- **Chunking**: Heading-aware sliding windows with configurable overlap
- **OpenClaw integration**: Tool-first hooks, auto-injection for coding agents
- **Zero external services**: Runs entirely on your infrastructure

## Quick Install

1. **Copy plugin** into your OpenClaw extensions directory:

   ```bash
   cp -r docs-brain /root/.openclaw/extensions/
   ```

2. **Install dependencies**:

   ```bash
   cd /root/.openclaw/extensions/docs-brain
   npm ci --only=production
   ```

3. **Configure OpenClaw** (`/root/.openclaw/openclaw.json`):

   ```json
   {
     "plugins": {
       "entries": {
         "docs-brain": {
           "enabled": true,
           "config": {
             "mode": "hybrid",
             "reposRoot": "/root/.openclaw/extensions/docs-brain",
             "stateRoot": ".openclaw/plugins/docs-brain/state",
             "sourcesFile": ".openclaw/plugins/docs-brain/sources.yaml",
             "vectorSize": 1024,
             "embeddings": {
               "provider": "lmstudio-openai-compatible",
               "baseUrl": "http://192.168.0.11:1234/v1",
               "model": "text-embedding-bge-m3",
               "apiKey": "YOUR_LM_STUDIO_KEY"
             },
             "qdrant": {
               "url": "http://127.0.0.1:6333",
               "collection": "docs_brain"
             },
             "autoIndex": true,
             "autoInject": { "enabled": false }
           }
         }
       }
     }
   }
   ```

4. **Add sources** (`.openclaw/plugins/docs-brain/sources.yaml`):

   ```yaml
   - id: fastapi
     url: https://fastapi.tiangolo.com/
     title: FastAPI Documentation
     type: online

   - id: openclaw-docs
     url: /usr/lib/node_modules/openclaw/docs
     title: OpenClaw Documentation
     type: local-dir
   ```

5. **Start Qdrant** (Docker recommended):

   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

6. **Index** (automatic on first tool call) or manual:

   ```bash
   node src/tools.js reindex
   ```

That's it—your agents can now call `docs.search(query, top)` and `docs.snippets_for_task(task)`.

## How It Works

- **Indexer**: Fetches HTML/Markdown, cleans content (removes nav/boilerplate), chunks using heading-aware sliding windows
- **FTS**: SQLite FTS5 on title + section + text
- **Vectors**: LM Studio → Qdrant with 768/1024 dims (depending on model)
- **Search**: FTS + vector → RRF merge (k=60) → normalized scores

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `fts` | `fts`, `vector`, or `hybrid` |
| `autoIndex` | boolean | `false` | Auto-index on plugin load |
| `autoInject.enabled` | boolean | `false` | Auto-add tool to agents |
| `autoInject.agents` | array[] | `[]` | Agent IDs to inject into |
| `embeddings.model` | string | `text-embedding-nomic-embed-text-v1.5` | LM Studio model name |
| `qdrant.url` | string | `http://127.0.0.1:6333` | Qdrant endpoint |
| `vectorSize` | number | `768` | Embedding dimension (match model) |

## Tools

- `docs.search(query, top = 5)` → array of results with `{ source_id, title, section, text, score, source_url }`
- `docs.snippets_for_task(task, top = 5)` → same format, optimized for task context
- `docs.index_status()` → `{ docsCount, chunkCount, lastIndexedAt }`
- `docs.reindex(sourceIds?)` → reindex all or specific sources

## Agent Hook

`hooks.before_prompt_build` adds tool usage guidance so agents automatically call `docs.snippets_for_task:` before coding on unfamiliar topics.

## Troubleshooting

**FTS parse errors** (e.g., “no such column: CLI”): queries are sanitized automatically. If this occurs, ensure your query does not contain SQL keywords; hyphenated terms are converted to spaces.

**Qdrant unreachable**: plugin falls back to FTS-only and logs a warning. Check network and collection existence.

**Zero vector results**: verify embedding model loads in LM Studio and `vectorSize` matches actual embedding dimension.

## Performance

Indexing time: ~2–5 minutes for 10 online docs (depends on rate limits). Storage: ~8–15 MB FTS + vector storage (Qdrant).

## License

MIT

## Contributing

PRs welcome. Please add tests for new sources and update `sources.yaml` if applicable.

---

*Made for OpenClaw. Optimized for hybrid retrieval, minimal friction, and running locally.*

---

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-PayPal-blue)](https://www.paypal.com/donate/?business=petermgedeon%40gmail.com)