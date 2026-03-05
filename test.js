import { ToolsHandler } from './src/tools.js';
import { Indexer } from './src/indexer.js';
import { Searcher } from './src/search.js';

async function test() {
  console.log('=== Docs-Brain Plugin Test ===\n');

  const workspaceRoot = '/root/.openclaw/workspace';
  const stateDir = `${workspaceRoot}/.openclaw/plugins/docs-brain/state`;

  // Initialize tools handler
  console.log('1. Initializing ToolsHandler...');
  const handler = new ToolsHandler(stateDir);
  await handler.init();
  console.log('   SQLite database initialized');

  // Initialize indexer
  console.log('\n2. Initializing Indexer...');
  const config = {
    repoRoot: workspaceRoot,
    sourcesFile: '.openclaw/plugins/docs-brain/sources.yaml'
  };
  const indexer = new Indexer(stateDir, handler, config);
  console.log('   Indexer ready');

  // Load and show sources
  console.log('\n3. Loading sources...');
  const sources = await indexer.loadSources();
  console.log(`   Found ${sources.length} sources:`);
  for (const s of sources) {
    console.log(`   - ${s.id}: ${s.title} (${s.url})`);
  }

  // Index all sources
  console.log('\n4. Indexing sources (this may take a while)...');
  const results = await indexer.indexAllSources(false);
  const okCount = results.filter(r => r.status === 'ok').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  console.log(`   Indexed: ${okCount} OK, ${errorCount} errors`);

  // Check index status
  console.log('\n5. Index status:');
  const status = handler.getIndexStatus();
  console.log(`   Docs: ${status.docsCount}, Chunks: ${status.chunkCount}`);

  // Test search
  console.log('\n6. Testing search...');
  const searcher = new Searcher(handler, { mode: 'fts' });
  const searchResults = await searcher.search('FastAPI dependency injection', 5);
  console.log(`   Found ${searchResults.length} results for "FastAPI dependency injection":`);
  for (const r of searchResults) {
    console.log(`   - [${r.source_id}] ${r.title} (score: ${r.score.toFixed(3)})`);
    console.log(`     "${r.text.substring(0, 150)}..."`);
  }

  // More tests
  console.log('\n7. Testing search for SQLAlchemy async...');
  const search2 = await searcher.search('SQLAlchemy async session', 3);
  console.log(`   Found ${search2.length} results:`);
  for (const r of search2) {
    console.log(`   - [${r.source_id}] ${r.title}`);
  }

  console.log('\n=== Test Complete ===');

  handler.close();
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
