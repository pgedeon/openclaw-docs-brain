# Docs-Brain Plugin Installation Guide

This guide walks you through installing and configuring the Docs-Brain plugin for OpenClaw.

## Prerequisites

- OpenClaw ≥ 2025.12
- Node.js ≥ 18
- LM Studio running with an embedding model loaded
- Qdrant (Docker recommended)

## Step 1: Install Plugin Files

```bash
# From your OpenClaw workspace root:
cp -r docs-brain /root/.openclaw/extensions/
```

The plugin will be located at `/root/.openclaw/extensions/docs-brain/`.

## Step 2: Install Dependencies

```bash
cd /root/.openclaw/extensions/docs-brain
npm ci --only=production
```

This installs `better-sqlite3`, `yaml`, `turndown`, `node-fetch`, and `cheerio`.

## Step 3: Configure OpenClaw

Open `/root/.openclaw/openclaw.json` and add the plugin entry:

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
            "apiKey": "sk-lm-..."
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

Adjust `embeddings.baseUrl`, `model`, and `apiKey` to match your LM Studio setup. Get the vector dimension from your model (BGE-M3 = 1024, Nomic = 768, etc.).

## Step 4: Define Sources

Create or edit `.openclaw/plugins/docs-brain/sources.yaml`:

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

Supported `type` values:
- `online` – website URL (HTML converted to Markdown)
- `local` – single local file path
- `local-dir` – directory of Markdown files (recursive)

## Step 5: Start Qdrant

```bash
docker run -d --name qdrant \
  -p 6333:6333 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

The plugin expects Qdrant at `http://127.0.0.1:6333`. Change config if different.

## Step 6: Index

If `autoIndex` is true, the plugin indexes on first tool call. Otherwise, run:

```bash
cd /root/.openclaw/extensions/docs-brain
node src/tools.js reindex
```

Watch logs for progress. A full index of ~10 sites may take 5–15 minutes.

## Step 7: Verify

```bash
openclaw plugins list --json --verbose | grep -A5 '"id": "docs-brain"'
```

Then test search from an OpenClaw session:

```javascript
const results = await docs.search('FastAPI dependency injection', 5);
console.log(results);
```

You should see `vector: true` in `docs.index_status()`.

## Troubleshooting

| Issue | Check |
|-------|-------|
| `vectorEnabled: false` | Qdrant reachable? Collection created? |
| Empty vector results | Embedding endpoint responds? `vectorSize` matches model? |
| FTS parse errors | Hyphens are sanitized; try without special chars |
| Slow indexing | Respect rate limits; consider caching or `type: local-dir` |

## Uninstall

```bash
rm -rf /root/.openclaw/extensions/docs-brain
# Remove plugin entry from openclaw.json
# Stop Qdrant container if not used elsewhere
```

---

**SEO Keywords**: OpenClaw plugin, documentation search, hybrid search, embeddings, vector database, FTS, LM Studio, Qdrant, AI documentation assistant, semantic search, local AI, developer tools