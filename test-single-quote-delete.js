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

console.log('Direct DELETE with single quotes test...');
const db = toolsHandler.db;

try {
  // Use single quotes for string literal
  const sql = `DELETE FROM chunks_meta WHERE source_id = 'wordpress-plugins'`;
  console.log('Executing:', sql);
  const stmt = db.prepare(sql);
  const info = stmt.run();
  console.log('DELETE result:', info);
} catch (err) {
  console.error('DELETE failed:', err.message);
  console.error('Code:', err.code, 'errno:', err.errno);
}

toolsHandler.close();
