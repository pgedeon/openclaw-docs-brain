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

console.log('Direct DELETE test...');
const db = toolsHandler.db;

try {
  // Try a direct DELETE without bindings
  console.log('Attempting: DELETE FROM chunks_meta WHERE source_id = "wordpress-plugins"');
  const stmt = db.prepare('DELETE FROM chunks_meta WHERE source_id = "wordpress-plugins"');
  const info = stmt.run();
  console.log('Direct DELETE result:', info);
} catch (err) {
  console.error('Direct DELETE failed:', err.message);
  console.error('Code:', err.code, 'errno:', err.errno);
  // Maybe the error is due to the trigger. Let's check if the FTS table exists and has the expected columns.
  try {
    const ftsInfo = db.prepare("PRAGMA table_info(chunks_fts)").all();
    console.log('FTS table columns:', ftsInfo);
  } catch (e2) {
    console.error('Failed to get FTS table info:', e2.message);
  }
}

toolsHandler.close();
