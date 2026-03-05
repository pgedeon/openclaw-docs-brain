# Changelog

All notable changes to the Docs-Brain plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Hybrid search mode (FTS + vector) with Reciprocal Rank Fusion
- Local directory source support (`type: local-dir`)
- WordPress-specific HTML content extraction (cheerio-based)
- Cheerio dependency for clean Markdown conversion
- `docs.snippets_for_task` tool (planned; alias to `docs.search` for now)
- Auto-indexing on plugin load (configurable)

### Changed
- Switched default embedding model from `text-embedding-nomic-embed-text-v1.5` to `text-embedding-bge-m3` (1024 dims)
- Improved chunking: heading-aware boundaries with 200 token overlap
- FTS query sanitization to prevent SQLite parse errors (hyphens, reserved words)
- Trigger implementation for FTS to avoid column errors on delete

### Fixed
- Qdrant point ID format: now uses UUID derived from chunk hash (first 128 bits)
- ToolsHandler initialization: proper `vectorEnabled` and `embeddingsConfig` setup
- Config schema includes `vectorSize` and `embeddings.apiKey`

### Removed
- Obsolete test scripts and debug artifacts from deployment package

## [1.0.0] – 2026-03-05

Initial public release of Docs-Brain plugin.

- FTS5 search over chunked documentation
- Vector search with LM Studio + Qdrant
- OpenClaw integration with hooks and tool injection
- Supports online, local, and local-dir sources
- Health monitoring in HEARTBEAT.md

---

**Note**: This project is pre-1.0 and under active development. APIs may change.
