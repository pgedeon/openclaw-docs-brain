import Database from 'better-sqlite3';
import path from 'path';
import { join } from 'path';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5.db';
// Remove existing test db
try { fs.unlinkSync(testDbPath); } catch (e) {}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Create sources table first
db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    last_indexed_at TEXT,
    hash TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create FTS5 table
db.exec(`
  CREATE VIRTUAL TABLE chunks_fts USING fts5(
    content,
    title,
    section,
    source_id,
    tokenize = 'porter unicode61'
  );
`);

// Create regular table
db.exec(`
  CREATE TABLE chunks_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    section TEXT,
    content TEXT NOT NULL,
    hash TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    FOREIGN KEY (source_id) REFERENCES sources (id)
  );
`);

// Create trigger
db.exec(`
  CREATE TRIGGER chunks_ad AFTER DELETE ON chunks_meta BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
    VALUES('delete', old.id, old.content, old.title, old.section, old.source_id);
  END;
`);

// Insert a test source first
const srcStmt = db.prepare(`
  INSERT OR REPLACE INTO sources (id, source, title, status)
  VALUES (?, ?, ?, ?)
`);
srcStmt.run('test-src', 'http://example.com', 'Test Source', 'ok');

// Insert a test row into chunks_meta
const stmt = db.prepare(`
  INSERT INTO chunks_meta (source_id, title, section, content, hash, chunk_index)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const info = stmt.run('test-src', 'Test Title', 'Test Section', 'Test content', 'hash123', 0);
console.log('Inserted chunk id:', info.lastInsertRowid);

// Now delete it
try {
  const del = db.prepare('DELETE FROM chunks_meta WHERE id = ?');
  const delInfo = del.run(info.lastInsertRowid);
  console.log('Deleted successfully, changes:', delInfo.changes);
} catch (err) {
  console.error('DELETE failed:', err.message);
  // Show the FTS table content to see if anything inserted?
  const ftsRows = db.prepare('SELECT * FROM chunks_fts').all();
  console.log('FTS rows after attempt:', ftsRows);
}

db.close();
