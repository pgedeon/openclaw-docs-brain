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

console.log('Debugging database operations...');
const db = toolsHandler.db;

// Check if any foreign key constraints are enabled
try {
  const pragma = db.prepare('PRAGMA foreign_keys;').get();
  console.log('foreign_keys pragma:', pragma);
} catch (e) {
  console.error('Error checking foreign_keys:', e.message);
}

// Check the chunks_meta foreign key definition
try {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks_meta'").get();
  console.log('chunks_meta table definition:', sql.sql);
} catch (e) {
  console.error('Error getting table definition:', e.message);
}

// Check the trigger definition for chunks_ad
try {
  const trig = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='chunks_ad'").get();
  console.log('chunks_ad trigger definition:', trig.sql);
} catch (e) {
  console.error('Error getting trigger definition:', e.message);
}

// Try to manually delete one row from chunks_meta for wordpress-plugins to see the exact error
try {
  console.log('Attempting manual DELETE on chunks_meta for wordpress-plugins...');
  const stmt = db.prepare('DELETE FROM chunks_meta WHERE source_id = ?');
  const info = stmt.run('wordpress-plugins');
  console.log('Manual DELETE result:', info);
} catch (err) {
  console.error('Manual DELETE failed:', err.message);
  // Print extended info
  console.error('Error code:', err.code);
  console.error('Error errno:', err.errno);
  if (err instanceof Error && err.stack) {
    console.error('Stack:', err.stack);
  }
}

toolsHandler.close();
