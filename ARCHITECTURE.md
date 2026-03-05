# Architecture

Docs-Brain is a hybrid documentation retrieval plugin for OpenClaw. It combines traditional full-text search (FTS) with modern vector similarity to deliver accurate, context-aware results.

## Components

### 1. Indexer (`src/indexer.js`)

Responsible for ingesting sources and producing searchable chunks.

**Source Types**
- `online`: Fetch HTML → convert to Markdown → clean → chunk
- `local`: Single file (Markdown) → chunk
- `local-dir`: Recursively read `.md` files → chunk per file

**Content Extraction**
- Uses `cheerio` to select main content areas (`main`, `.entry-content`, `.content`, `article`, `body`)
- Strips navigation (`nav`), headers, footers, sidebars (`.sidebar`, `.menu`)
- Converts HTML to Markdown via `turndown`

**Chunking**
- Heading-aware sliding window
- Configurable overlap (default 200 tokens)
- Preserves heading hierarchy to avoid splitting semantic sections

**Outputs**
- Normalized Markdown files: `.openclaw/plugins/docs-brain/normalized/`
- Chunk metadata (JSON): `.openclaw/plugins/docs-brain/chunks/`

### 2. FTS Backend (SQLite)

- Table: `chunks_fts` with columns `source_id`, `title`, `section`, `text`
- FTS5 enabled for fast keyword search
- Triggers keep `chunks_fts` in sync with `chunks` table on INSERT/UPDATE/DELETE
- Query sanitization: hyphens replaced with spaces, prevents parse errors

### 3. Vector Backend (Qdrant)

- Collection: `docs_brain` (configurable)
- Vector dimension: `vectorSize` from plugin config (e.g., 1024 for BGE-M3)
- Distance metric: Cosine
- Payload fields: `source_id`, `title`, `section`, `content`, `hash`, `chunk_id`
- Point ID: UUID derived from chunk SHA256 hash (first 128 bits)

**Embedding Provider**
- OpenAI-compatible endpoint (LM Studio)
- Config: `embeddings.baseUrl`, `embeddings.model`, `embeddings.apiKey`
- Request: `POST /embeddings` with model and input
- Response: embedding vector

### 4. ToolsHandler (`src/tools.js`)

Exposes the plugin's tools to OpenClaw sessions:

- `docs.search(query, top)` – hybrid/vector/fts search
- `docs.snippets_for_task(task, top)` – same as search (future: task-aware expansion)
- `docs.index_status()` – returns `{ docsCount, chunkCount, lastIndexedAt }`
- `docs.reindex(sourceIds?)` – triggers full or partial reindex

Internal methods:
- `ensureVectorCollection()` – creates Qdrant collection if missing
- `generateEmbedding()` – calls LM Studio
- `upsertChunkVectors()` – batch upserter (100 points per batch)
- `searchFTS()` – SQLite FTS query
- `searchVector()` – Qdrant similarity search
- `reciprocalRankFusion()` – merges result lists

### 5. Searcher (`src/search.js`)

Orchestrates search based on `mode`:

- `fts`: FTS only
- `vector`: Qdrant only
- `hybrid`: Both → RRF merge

RRF parameters:
- `k = 60` (default)
- Score formula: `1 / (k + rank)`

Returns normalized, deduplicated results.

### 6. Hook (`src/hooks.js`)

`before_prompt_build` hook injects usage guidance:

```
You have access to a docs.search tool for retrieving context from documentation. Use it with specific queries before coding on unfamiliar topics.
```

This can be optionally set to auto-inject into selected agents.

## Data Flow

1. Start → ToolsHandler `init()`:
   - Open SQLite DB, create tables
   - If vector mode: ensure Qdrant collection exists

2. Indexing:
   - Load `sources.yaml`
   - For each source: fetch/clean/chunk → store chunks (SQLite) + normalized file
   - If vector mode: generate embeddings → upsert to Qdrant

3. Search:
   - Receive query
   - FTS search (if enabled) → list A
   - Vector search (if enabled) → list B
   - Merge via RRF → final ranked list
   - Return top N with payload (title, section, content, source_url)

## Configuration Schema

Defined in `openclaw.plugin.json`. Key options:

- `mode`: `"fts" \| "vector" \| "hybrid"`
- `autoIndex`: boolean
- `autoInject.enabled`: boolean
- `autoInject.agents`: string[]
- `reposRoot`: string (plugin root)
- `stateRoot`: string (relative to reposRoot)
- `sourcesFile`: string (YAML path)
- `vectorSize`: number (embedding dimension)
- `embeddings`: `{ provider, baseUrl, model, apiKey }`
- `qdrant`: `{ url, collection }`

## Limitations and Future Work

- **Chunk boundaries**: May still split code blocks; consider smarter splitting (e.g., by H2-H6 only)
- **Vector updates**: Currently re-embeddings all chunks on reindex; delta updates possible
- **Source webhooks**: No automatic re-crawl; manual `docs.reindex` required
- **Multi-modal**: Images and diagrams not indexed
- **Caching**: LM Studio calls per chunk; could add local cache
- **Task-aware snippets**: `docs.snippets_for_task` could optimize for "how-to" vs "reference"

## Design Rationale

- **SQLite FTS5**: Fast, zero external dependencies for keyword search
- **Qdrant**: High-performance vector DB with payload filtering
- **LM Studio**: Local OpenAI-compatible embeddings, no cloud costs
- **Hybrid RRF**: No weight tuning needed; combines strengths of both systems
- **Heading-aware chunking**: Preserves context for technical docs

---

For implementation details, see source code and doc comments.
