import { join } from 'path';
import fs from 'fs-extra';
import { readFileSync } from 'fs';

const { ensureDirSync } = fs;

const configPath = '/root/.openclaw/openclaw.json';
const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

import { ToolsHandler } from './src/tools.js';

const handler = new ToolsHandler(stateDir, pluginConfig);
await handler.init();

const results = handler.searchFTS('register_post_type', 10);
console.log('Top 10 results for register_post_type:');
results.forEach(r => {
  console.log(`[${r.source_id}] ${r.title} - score: ${r.score}`);
});

handler.close();
