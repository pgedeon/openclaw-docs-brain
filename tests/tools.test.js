import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ToolsHandler } from '../src/tools.js';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '.test-state-tools');

describe('docs-brain ToolsHandler', () => {
  let handler;

  before(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    handler = new ToolsHandler(TEST_DIR, { mode: 'fts' });
    await handler.init();
  });

  after(() => {
    handler.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('initializes SQLite with correct tables', () => {
    const tables = handler.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(r => r.name).sort();

    assert.ok(tables.includes('sources'), 'sources table missing');
    assert.ok(tables.includes('chunks_meta'), 'chunks_meta table missing');
    // FTS virtual table
    const fts = handler.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'"
    ).all();
    assert.ok(fts.length > 0, 'chunks_fts FTS5 table missing');
  });

  it('adds and retrieves a source', () => {
    handler.addSource('test-lib', 'https://example.com/docs', 'Test Library', 'ok');
    const source = handler.getSource('test-lib');
    assert.equal(source.id, 'test-lib');
    assert.equal(source.source, 'https://example.com/docs');
    assert.equal(source.title, 'Test Library');
    assert.equal(source.status, 'ok');
  });

  it('updates source status', () => {
    handler.addSource('test-lib2', 'https://example.com', 'Lib2', 'pending');
    handler.updateSourceStatus('test-lib2', 'ok', 'abc123');
    const source = handler.getSource('test-lib2');
    assert.equal(source.status, 'ok');
    assert.equal(source.hash, 'abc123');
  });

  it('adds chunks and retrieves them via FTS', () => {
    handler.addSource('fastapi', 'https://fastapi.tiangolo.com/', 'FastAPI', 'ok');

    handler.addChunk('fastapi', 'FastAPI Quickstart', 'Introduction',
      'FastAPI is a modern fast web framework for building APIs with Python based on standard Python type hints',
      'hash1', 0);

    handler.addChunk('fastapi', 'FastAPI Tutorial', 'Routing',
      'You can create path operations using decorators like app.get and app.post in FastAPI',
      'hash2', 1);

    const results = handler.searchFTS('FastAPI framework', 10);
    assert.ok(results.length >= 1, 'Should find at least 1 result');
    assert.ok(results[0].text.includes('FastAPI'), 'Result should contain search term');
    assert.ok(results[0].score > 0, 'Should have a positive score');
  });

  it('searchFTS filters by library', () => {
    handler.addSource('sqlalchemy', 'https://docs.sqlalchemy.org/', 'SQLAlchemy', 'ok');
    handler.addChunk('sqlalchemy', 'SQLAlchemy Session', 'Basics',
      'SQLAlchemy provides a session manager for database operations',
      'hash3', 0);

    // Search specifically for fastapi
    const fastapiResults = handler.searchFTS('FastAPI', 10, 'fastapi');
    assert.ok(fastapiResults.length > 0, 'Should find fastapi results');
    fastapiResults.forEach(r => assert.equal(r.source_id, 'fastapi'));

    // Search specifically for sqlalchemy
    const saResults = handler.searchFTS('SQLAlchemy session', 10, 'sqlalchemy');
    assert.ok(saResults.length > 0, 'Should find sqlalchemy results');
    saResults.forEach(r => assert.equal(r.source_id, 'sqlalchemy'));
  });

  it('clears chunks for a source', () => {
    handler.addSource('temp-lib', 'https://temp.com', 'Temp', 'ok');
    handler.addChunk('temp-lib', 'Temp Title', 'Section', 'Temp content here', 'hash-t1', 0);
    handler.addChunk('temp-lib', 'Temp Title 2', 'Section 2', 'More temp content', 'hash-t2', 1);

    assert.equal(handler.getChunkCount() >= 2, true, 'Should have chunks before clear');
    handler.clearChunksForSource('temp-lib');

    // Verify chunks gone for that source
    const remaining = handler.db.prepare(
      "SELECT COUNT(*) as c FROM chunks_meta WHERE source_id = ?"
    ).get('temp-lib');
    assert.equal(remaining.c, 0, 'Chunks should be cleared');
  });

  it('getIndexStatus returns correct counts', () => {
    const status = handler.getIndexStatus();
    assert.ok(typeof status.docsCount === 'number');
    assert.ok(typeof status.chunkCount === 'number');
    assert.ok(status.lastIndexedAt);
  });

  it('getAllSources returns all sources', () => {
    const sources = handler.getAllSources();
    assert.ok(sources.length >= 3, 'Should have at least 3 test sources');
    assert.ok(sources.some(s => s.id === 'fastapi'));
    assert.ok(sources.some(s => s.id === 'sqlalchemy'));
  });

  it('vector mode is disabled in fts-only config', () => {
    assert.equal(handler.vectorEnabled, false);
  });

  it('hashToUuid converts SHA256 to UUID format', () => {
    const hash = 'a'.repeat(64);
    const uuid = handler.hashToUuid(hash);
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
