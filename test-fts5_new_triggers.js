import Database from 'better-sqlite3';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5_triggers.db';
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

// Create triggers with simpler approach

// INSERT trigger
db.exec(`
  CREATE TRIGGER chunks_ai AFTER INSERT ON chunks_meta BEGIN
    INSERT INTO chunks_fts(rowid, content, title, section, source_id)
    VALUES (new.id, new.content, new.title, new.section, new.source_id);
  END;
`);

// DELETE trigger
db.exec(`
  CREATE TRIGGER chunks_ad AFTER DELETE ON chunks_meta BEGIN
    DELETE FROM chunks_fts WHERE rowid = old.id;
  END;
`);

// UPDATE trigger (first delete old, then insert new)
db.exec(`
  CREATE TRIGGER chunks_au AFTER UPDATE ON chunks_meta BEGIN
    DELETE FROM chunks_fts WHERE rowid = old.id;
    INSERT INTO chunks_fts(rowid, content, title, section, source_id)
    VALUES (new.id, new.content, new.title, new.section, new.source_id);
  END;
`);

// Insert a source first (needed for foreign key)
db.exec(`INSERT INTO sources (id, source, title, status) VALUES ('src1', 'http://example.com', 'Src', 'ok')`);

// Test: Insert into chunks_meta -> should populate chunks_fts
try {
  const ins = db.prepare(`
    INSERT INTO chunks_meta (source_id, title, section, content, hash, chunk_index)
    VALUES ('src1', 'Title1', 'Sec1', 'Content1', 'hash1', 0)
  `);
  const info = ins.run();
  console.log('Inserted chunk id:', info.lastInsertRowid);
  const fts = db.prepare('SELECT rowid, * FROM chunks_fts').all();
  console.log('FTS after insert:', fts);
} catch (e) {
  console.error('Insert failed:', e.message);
}

// Test: Update the chunk
try {
  const upd = db.prepare(`
    UPDATE chunks_meta SET content = 'Updated content', title = 'Updated title' WHERE id = 1
  `);
  upd.run();
  const fts2 = db.prepare('SELECT rowid, * FROM chunks_fts').all();
  console.log('FTS after update:', fts2);
} catch (e) {
  console.error('Update failed:', e.message);
}

// Test: Delete the chunk
try {
  const del = db.prepare('DELETE FROM chunks_meta WHERE id = 1');
  del.run();
  const fts3 = db.prepare('SELECT rowid, * FROM chunks_fts').all();
  console.log('FTS after delete:', fts3);
} catch (e) {
  console.error('Delete failed:', e.message);
}

db.close();
