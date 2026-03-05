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

console.log('Checking database tables...');
const db = toolsHandler.db;

// List tables using prepare
try {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  const tables = stmt.all();
  console.log('Tables:', tables.map(t => t.name));
} catch (e) {
  console.error('Error listing tables:', e.message);
}

// Check if triggers exist
try {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;");
  const triggers = stmt.all();
  console.log('Triggers:', triggers.map(t => t.name));
} catch (e) {
  console.error('Error listing triggers:', e.message);
}

// Try a simple count on chunks_meta
try {
  const result = db.prepare('SELECT COUNT(*) as cnt FROM chunks_meta').get();
  console.log('Chunks in chunks_meta before:', result.cnt);
} catch (e) {
  console.error('Error counting chunks_meta:', e.message);
}

// Now try clearChunksForSource with a non-existent source
try {
  toolsHandler.clearChunksForSource('test-source-nonexistent');
  console.log('clearChunksForSource succeeded for non-existent source');
} catch (err) {
  console.error('clearChunksForSource failed:', err.message, err.code);
  console.error('Stack:', err.stack);
}

toolsHandler.close();
