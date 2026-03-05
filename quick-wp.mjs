import { ToolsHandler } from './src/tools.js';
import { Searcher } from './src/search.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function quickWP() {
  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;
  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();
  const searcher = new Searcher(handler, pluginConfig);

  const results = await searcher.search('plugin activation hook', 3);
  console.log('Results for "plugin activation hook":');
  for (const r of results) {
    console.log(`- [${r.source_id}] ${r.title} (score: ${r.score.toFixed(4)})`);
  }

  handler.close();
}

quickWP().catch(console.error);