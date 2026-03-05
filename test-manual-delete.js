import { join } from 'path';
import fs from 'fs-extra';
import { readFileSync } from 'fs';

const { ensureDirSync } = fs;

// Load OpenClaw config
const configPath = '/root/.openclaw/openclaw.json';
const openclawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
const pluginConfig = openclawConfig.plugins.entries['docs-brain'].config;

// State directory
const stateDir = join(pluginConfig.repoRoot, '.openclaw', 'plugins', 'docs-brain', 'state');

// Ensure state dir exists
ensureDirSync(stateDir);

import { ToolsHandler } from './src/tools.js';

const toolsHandler = new ToolsHandler(stateDir, pluginConfig);
await toolsHandler.init();

console.log('Manual database inspection...');
const db = toolsHandler.db;

// Check one row from chunks_meta
try {
  const row = db.prepare('SELECT * FROM chunks_meta WHERE source_id = ? LIMIT 1').get('wordpress-plugins');
  console.log('Sample chunk_meta row for wordpress-plugins:');
  console.log(JSON.stringify(row, null, 2));
} catch (e) {
  console.error('Error selecting from chunks_meta:', e.message);
}

// Check the corresponding FTS table rows
try {
  const ftsRow = db.prepare('SELECT * FROM chunks_fts WHERE source_id = ? LIMIT 1').get('wordpress-plugins');
  console.log('Sample FTS row for wordpress-plugins:');
  console.log(JSON.stringify(ftsRow, null, 2));
} catch (e) {
  console.error('Error selecting from chunks_fts:', e.message);
}

// Try to delete just that one row manually, with explicit transaction
try {
  console.log('Attempting DELETE within transaction...');
  const transaction = db.transaction(() => {
    const stmt = db.prepare('DELETE FROM chunks_meta WHERE id = ?');
    // Get the id of the first chunk
    const first = db.prepare('SELECT id FROM chunks_meta WHERE source_id = ? LIMIT 1').get('wordpress-plugins');
    if (first) {
      const info = stmt.run(first.id);
      console.log('DELETE result:', info);
    } else {
      console.log('No rows to delete');
    }
  });
  transaction();
  console.log('Transaction committed');
} catch (err) {
  console.error('Transaction failed:', err.message);
  console.error('Code:', err.code, 'errno:', err.errno);
}

toolsHandler.close();
