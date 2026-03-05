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

console.log('Checking FTS table schema...');
const db = toolsHandler.db;

try {
  const res = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks_fts'").get();
  console.log('chunks_fts CREATE statement:');
  console.log(res.sql);
} catch (e) {
  console.error('Failed to get chunks_fts schema:', e.message);
}

// Also check the trigger definitions
try {
  const trigs = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name='chunks_ad'").get();
  console.log('chunks_ad trigger definition:');
  console.log(trigs.sql);
} catch (e) {
  console.error('Failed to get trigger:', e.message);
}

// Also check the table info with PRAGMA table_xinfo for hidden columns
try {
  const cols = db.prepare("PRAGMA table_xinfo('chunks_fts')").all();
  console.log('chunks_fts extended info (including hidden):');
  cols.forEach(col => console.log(`  ${col.name}: ${col.type} hidden=${col.hidden}`));
} catch (e) {
  console.error('Failed table_xinfo:', e.message);
}

toolsHandler.close();
