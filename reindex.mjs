import { ToolsHandler } from './src/tools.js';
import { Indexer } from './src/indexer.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function reindex() {
  console.log('=== Reindex with Vector Upsert ===\n');

  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  console.log('1. Initializing ToolsHandler...');
  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();
  console.log('   Vector enabled:', handler.vectorEnabled);

  console.log('\n2. Initializing Indexer...');
  const indexer = new Indexer(stateDir, handler, pluginConfig);

  console.log('\n3. Reindexing all sources (FTS + vectors if hybrid/vector)...');
  const results = await indexer.indexAllSources(false);
  const ok = results.filter(r => r.status === 'ok').length;
  const err = results.filter(r => r.status === 'error').length;
  console.log(`   Results: ${ok} OK, ${err} errors`);

  console.log('\n4. Index status:');
  const status = handler.getIndexStatus();
  console.log(`   Docs: ${status.docsCount}, Chunks: ${status.chunkCount}`);

  // Check Qdrant point count
  try {
    const qdrantResp = await fetch(`${handler.qdrantUrl}/collections/${handler.qdrantCollection}/points/count`);
    if (qdrantResp.ok) {
      const qdrantData = await qdrantResp.json();
      console.log(`   Qdrant points: ${qdrantData.result.points_count || qdrantData.count || 'unknown'}`);
    } else {
      console.log('   Qdrant count query failed');
    }
  } catch (e) {
    console.log('   Qdrant check error:', e.message);
  }

  handler.close();
  console.log('\n=== Reindex Complete ===');
}

reindex().catch(err => {
  console.error('Reindex failed:', err);
  process.exit(1);
});
