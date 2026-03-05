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

console.log('Testing clearChunksForSource for wordpress-plugins...');
try {
  const countBefore = toolsHandler.db.prepare('SELECT COUNT(*) as cnt FROM chunks_meta WHERE source_id = ?').get('wordpress-plugins').cnt;
  console.log(`Chunks for wordpress-plugins before: ${countBefore}`);
  toolsHandler.clearChunksForSource('wordpress-plugins');
  const countAfter = toolsHandler.db.prepare('SELECT COUNT(*) as cnt FROM chunks_meta WHERE source_id = ?').get('wordpress-plugins').cnt;
  console.log(`Chunks for wordpress-plugins after: ${countAfter}`);
  console.log('clearChunksForSource succeeded for wordpress-plugins');
} catch (err) {
  console.error('clearChunksForSource failed:', err.message, err.code);
  console.error('Stack:', err.stack);
}

toolsHandler.close();
