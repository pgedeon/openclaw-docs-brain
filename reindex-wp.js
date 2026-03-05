import { join } from 'path';
import fs from 'fs-extra';
import { readFileSync, writeFileSync } from 'fs';

const { ensureDirSync } = fs;

// Load OpenClaw config
const configPath = '/root/.openclaw/openclaw.json';
const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

// State directory
const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

// Import and initialize the plugin
import { ToolsHandler } from './src/tools.js';
import { Indexer } from './src/indexer.js';

const toolsHandler = new ToolsHandler(stateDir, pluginConfig);
await toolsHandler.init();
const indexer = new Indexer(stateDir, toolsHandler, pluginConfig);

// Reindex only WordPress sources
const wpSourceIds = ['wordpress-plugins', 'wordpress-themes', 'wordpress-functions', 'wp-cli'];
console.log(`Reindexing WordPress sources: ${wpSourceIds.join(', ')}`);
await indexer.reindexSources(wpSourceIds);
console.log('WordPress reindex complete');

toolsHandler.close();
