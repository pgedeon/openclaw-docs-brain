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

console.log('Dropping trigger and testing DELETE...');
const db = toolsHandler.db;

try {
  // Drop the trigger
  db.exec('DROP TRIGGER IF EXISTS chunks_ad');
  console.log('Trigger dropped.');
} catch (e) {
  console.error('Failed to drop trigger:', e.message);
}

try {
  const sql = `DELETE FROM chunks_meta WHERE source_id = 'wordpress-plugins'`;
  console.log('Executing DELETE without trigger...');
  const info = db.exec(sql); // db.exec returns an array of changes
  console.log('DELETE result via exec:', info);
} catch (err) {
  console.error('DELETE failed:', err.message);
  console.error('Code:', err.code, 'errno:', err.errno);
}

toolsHandler.close();
