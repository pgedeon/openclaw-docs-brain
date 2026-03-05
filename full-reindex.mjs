import { ToolsHandler } from './src/tools.js';
import { Indexer } from './src/indexer.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function fullReindex() {
  console.log('=== Full Reindex with BGE-M3 (1024 dims) ===\n');

  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  console.log('1. Initializing ToolsHandler...');
  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();
  console.log('   Vector enabled:', handler.vectorEnabled);
  console.log('   Vector size:', pluginConfig.vectorSize);

  console.log('\n2. Initializing Indexer...');
  const indexer = new Indexer(stateDir, handler, pluginConfig);

  console.log('\n3. Full reindex (clear + rebuild all sources)...');
  const results = await indexer.reindexAll();
  const ok = results.filter(r => r.status === 'ok').length;
  const err = results.filter(r => r.status === 'error').length;
  console.log(`   Results: ${ok} OK, ${err} errors`);

  console.log('\n4. Index status:');
  const status = handler.getIndexStatus();
  console.log(`   Docs: ${status.docsCount}, Chunks: ${status.chunkCount}`);

  console.log('\n5. Verifying vector count in Qdrant...');
  try {
    const resp = await fetch(`${handler.qdrantUrl}/collections/${handler.qdrantCollection}/points/count`);
    if (resp.ok) {
      const data = await resp.json();
      console.log(`   Qdrant points: ${data.result.points_count || data.count || 'unknown'}`);
    } else {
      const txt = await resp.text();
      console.log(`   Qdrant count error: ${resp.status} ${txt}`);
    }
  } catch (e) {
    console.log('   Qdrant check failed:', e.message);
  }

  handler.close();
  console.log('\n=== Full Reindex Complete ===');
}

fullReindex().catch(err => {
  console.error('Full reindex failed:', err);
  process.exit(1);
});