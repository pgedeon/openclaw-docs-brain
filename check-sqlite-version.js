import Database from 'better-sqlite3';
const db = new Database(':memory:');
const version = db.prepare('SELECT sqlite_version() as v').get();
console.log('SQLite version:', version.v);
db.close();