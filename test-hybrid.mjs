import { ToolsHandler } from './src/tools.js';
import { Searcher } from './src/search.js';
import { Indexer } from './src/indexer.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function testHybrid() {
  console.log('=== Hybrid Search Test ===\n');

  // Load openclaw.json to get docs-brain config
  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

  console.log('Plugin config embeddings:', JSON.stringify(pluginConfig.embeddings, null, 2));

  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  // Initialize tools handler
  console.log('1. Initializing ToolsHandler...');
  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();
  console.log('   Vector enabled:', handler.vectorEnabled);

  // Initialize searcher
  console.log('\n2. Initializing Searcher...');
  const searcher = new Searcher(handler, pluginConfig);

  // Test search
  console.log('\n3. Testing hybrid search for "SQLAlchemy async session"...');
  const results = await searcher.search('SQLAlchemy async session', 5);
  console.log(`   Returned ${results.length} results:`);
  for (const r of results) {
    console.log(`   - [${r.source_id}] ${r.title} (score: ${r.score.toFixed(4)})`);
    console.log(`     ${r.text.substring(0, 120)}...`);
  }

  // Test another query
  console.log('\n4. Testing hybrid search for "Pydantic validation error"...');
  const results2 = await searcher.search('Pydantic validation error', 5);
  console.log(`   Returned ${results2.length} results:`);
  for (const r of results2) {
    console.log(`   - [${r.source_id}] ${r.title} (score: ${r.score.toFixed(4)})`);
  }

  // Index status
  console.log('\n5. Index status:');
  const status = handler.getIndexStatus();
  console.log(`   Docs: ${status.docsCount}, Chunks: ${status.chunkCount}`);

  handler.close();
  console.log('\n=== Test Complete ===');
}

testHybrid().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
