import { ToolsHandler } from './src/tools.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function testEmbedding() {
  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;
  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();

  try {
    console.log('Generating embedding for test text...');
    const embedding = await handler.generateEmbedding('Hello world test');
    console.log('Embedding dimension:', embedding.length);
    console.log('First 5 values:', embedding.slice(0,5));
  } catch (err) {
    console.error('Embedding error:', err.message);
  }

  handler.close();
}

testEmbedding().catch(console.error);