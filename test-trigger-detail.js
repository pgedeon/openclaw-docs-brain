import { join } from 'path';
import fs from 'fs-extra';
import { readFileSync } from 'fs';

const { ensureDirSync } = fs;

// Load OpenClaw config
const configPath = '/root/.openclaw/openclaw.json';
const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

// State directory
const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

// Ensure state dir exists
ensureDirSync(stateDir);

import { ToolsHandler } from './src/tools.js';

const toolsHandler = new ToolsHandler(stateDir, pluginConfig);
await toolsHandler.init();

console.log('Manual trigger test...');
const db = toolsHandler.db;

// First, check the FTS table structure with PRAGMA
try {
  const tableInfo = db.prepare("PRAGMA table_info(chunks_fts)").all();
  console.log('chunks_fts table info:', tableInfo);
} catch (e) {
  console.error('Failed to get table info for chunks_fts:', e.message);
}

// Check if special chunks_fts column exists? Not sure how to check. But let's try to manually insert a delete marker:
try {
  console.log('Trying to manually INSERT a delete marker into chunks_fts...');
  // This is what the trigger would do:
  const testInsert = db.prepare("INSERT INTO chunks_fts(chunks_fts, rowid) VALUES('delete', 999999)");
  testInsert.run();
  console.log('Manual INSERT delete marker succeeded');
} catch (e) {
  console.error('Manual INSERT delete marker failed:', e.message);
}

// Now let's recreate the trigger after dropping it? Actually we dropped it earlier in previous test. But each test is a fresh DB? No, we are using the same state dir. So the trigger is already dropped from previous test. Let's recreate it exactly as defined.
try {
  console.log('Recreating trigger...');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks_meta BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
      VALUES('delete', old.id, old.content, old.title, old.section, old.source_id);
    END;
  `);
  console.log('Trigger recreated.');
} catch (e) {
  console.error('Failed to create trigger:', e.message);
}

// Insert a test row into chunks_meta (requires a source to exist in sources table). Let's ensure source exists.
try {
  db.prepare(`
    INSERT OR REPLACE INTO sources (id, source, title, status, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run('test-source', 'http://example.com', 'Test Source', 'ok');
  console.log('Inserted test source.');
} catch (e) {
  console.error('Failed to insert test source:', e.message);
}

// Insert a test chunk
let testChunkId;
try {
  const stmt = db.prepare(`
    INSERT INTO chunks_meta (source_id, title, section, content, hash, chunk_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run('test-source', 'Test Title', 'Test Section', 'Test content', 'abc123', 0);
  testChunkId = info.lastInsertRowid;
  console.log('Inserted test chunk with id:', testChunkId);
} catch (e) {
  console.error('Failed to insert test chunk:', e.message);
}

// Now delete that row and see if it triggers an error
try {
  console.log('Attempting to delete test chunk...');
  const delStmt = db.prepare('DELETE FROM chunks_meta WHERE id = ?');
  delStmt.run(testChunkId);
  console.log('Delete succeeded!');
} catch (e) {
  console.error('Delete failed:', e.message);
  // Print full error details
  if (e instanceof Error) {
    console.error('Stack:', e.stack);
  }
}

toolsHandler.close();
