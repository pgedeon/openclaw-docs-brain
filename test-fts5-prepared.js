import Database from 'better-sqlite3';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5_prepared.db';
try { fs.unlinkSync(testDbPath); } catch (e) {}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE VIRTUAL TABLE simple_fts USING fts5(content, title);
`);

console.log('Testing FTS5 INSERT with prepared statement...');

try {
  const sql = `INSERT INTO simple_fts(simple_fts, rowid, content, title) VALUES('insert', ?, ?, ?)`;
  const stmt = db.prepare(sql);
  stmt.run(1, 'Hello world', 'Greeting');
  console.log('Prepared INSERT succeeded');
  const row = db.prepare('SELECT rowid, * FROM simple_fts').get();
  console.log('Row:', row);
} catch (e) {
  console.error('Prepared INSERT failed:', e.message);
}

db.close();
