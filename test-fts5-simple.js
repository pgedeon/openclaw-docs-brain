import Database from 'better-sqlite3';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5_simple.db';
try { fs.unlinkSync(testDbPath); } catch (e) {}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Create FTS5 table with default tokenizer (no tokenize option)
db.exec(`
  CREATE VIRTUAL TABLE simple_fts USING fts5(content, title);
`);

console.log('Testing simple FTS5...');

try {
  db.exec(`
    INSERT INTO simple_fts(simple_fts, rowid, content, title)
    VALUES('insert', 1, 'Hello world', 'Greeting')
  `);
  console.log('INSERT succeeded');
  const row = db.prepare('SELECT rowid, * FROM simple_fts').get();
  console.log('Row:', row);
} catch (e) {
  console.error('INSERT failed:', e.message);
}

db.close();
