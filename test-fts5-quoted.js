import Database from 'better-sqlite3';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5_ops2.db';
try { fs.unlinkSync(testDbPath); } catch (e) {}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

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

console.log('Testing FTS5 operations with quoted column...');

// Test 1: Direct INSERT using special column 'insert' with double quotes
try {
  db.exec(`
    INSERT INTO chunks_fts("chunks_fts", rowid, content, title, section, source_id)
    VALUES('insert', 100, 'Content here', 'Title here', 'Section here', 'src')
  `);
  console.log('Direct INSERT with quoted special column: succeeded');
  const row = db.prepare('SELECT rowid, * FROM chunks_fts WHERE rowid = 100').get();
  console.log('Row inserted:', JSON.stringify(row));
} catch (e) {
  console.error('Direct INSERT with quoted failed:', e.message);
  // Try also unquoted
  try {
    db.exec(`
      INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
      VALUES('insert', 101, 'Content here', 'Title here', 'Section here', 'src')
    `);
    console.log('Direct INSERT with unquoted special column: succeeded');
  } catch (e2) {
    console.error('Direct INSERT unquoted also failed:', e2.message);
  }
}

// Test 2: Direct DELETE from FTS (should work)
try {
  db.exec(`DELETE FROM chunks_fts WHERE rowid = 100`);
  console.log('Direct DELETE from FTS: succeeded');
} catch (e) {
  console.error('Direct DELETE failed:', e.message);
}

db.close();
