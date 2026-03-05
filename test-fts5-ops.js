import Database from 'better-sqlite3';
import fs from 'fs-extra';

const testDbPath = '/tmp/test_fts5_ops.db';
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

console.log('Testing FTS5 operations...');

// Test 1: Direct INSERT using special column 'insert'
try {
  db.exec(`
    INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
    VALUES('insert', 100, 'Content here', 'Title here', 'Section here', 'src')
  `);
  console.log('Direct INSERT with special column: succeeded');
  const row = db.prepare('SELECT rowid, * FROM chunks_fts WHERE rowid = 100').get();
  console.log('Row inserted:', JSON.stringify(row));
} catch (e) {
  console.error('Direct INSERT failed:', e.message);
}

// Test 2: Direct DELETE of that row
try {
  db.exec(`DELETE FROM chunks_fts WHERE rowid = 100`);
  console.log('Direct DELETE from FTS: succeeded');
  const count = db.prepare('SELECT COUNT(*) as c FROM chunks_fts').get().c;
  console.log('Count after delete:', count);
} catch (e) {
  console.error('Direct DELETE failed:', e.message);
}

// Test 3: Insert again using special column and then try delete via special column insert
try {
  db.exec(`
    INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
    VALUES('insert', 200, 'C2', 'T2', 'S2', 'src2')
  `);
  console.log('Insert row 200 succeeded');
  // Now attempt to delete using special column insert 'delete'
  db.exec(`
    INSERT INTO chunks_fts(chunks_fts, rowid) VALUES('delete', 200)
  `);
  console.log('Delete marker insert succeeded');
  const count2 = db.prepare('SELECT COUNT(*) as c FROM chunks_fts').get().c;
  console.log('Count after delete marker:', count2);
} catch (e) {
  console.error('Delete marker insert failed:', e.message);
}

db.close();
