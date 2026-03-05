import { ToolsHandler } from './src/tools.js';
import { join } from 'path';
import { readFileSync } from 'fs';

async function debugEmbedding() {
  const configPath = '/root/.openclaw/openclaw.json';
  const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;
  console.log('Embeddings config:', JSON.stringify(pluginConfig.embeddings, null, 2));
  const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

  const handler = new ToolsHandler(stateDir, pluginConfig);
  await handler.init();

  // Manually mimic generateEmbedding to see headers
  const text = 'SQLAlchemy async session';
  const { baseUrl, model, apiKey } = handler.embeddingsConfig;
  console.log('Calling:', `${baseUrl}/embeddings`);
  console.log('Model:', model);
  console.log('Has apiKey:', !!apiKey);

  try {
    const embedding = await handler.generateEmbedding(text);
    console.log('Success, dim:', embedding.length);
  } catch (err) {
    console.error('Error:', err.message);
  }

  handler.close();
}

debugEmbedding().catch(console.error);