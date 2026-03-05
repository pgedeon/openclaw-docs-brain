import { ToolsHandler } from './src/tools.js';
import { Searcher } from './src/search.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function testWordPressQueries() {
  console.log('=== WordPress Docs Recall Test ===\n');

  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  console.log('Initializing...');
  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();
  const searcher = new Searcher(handler, pluginConfig);

  const queries = [
    'plugin activation hook',
    'register_post_type',
    'WP-CLI command structure',
    'theme template hierarchy',
    'add_action example'
  ];

  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const results = await searcher.search(q, 3);
    console.log(`  Results: ${results.length}`);
    for (const r of results) {
      console.log(`  - [${r.source_id}] ${r.title} (score: ${r.score.toFixed(4)})`);
      console.log(`    ${r.text.substring(0, 120).replace(/\n/g, ' ')}...`);
    }
  }

  console.log('\n=== Test Complete ===');
  handler.close();
}

testWordPressQueries().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});