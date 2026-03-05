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

console.log('Manual delete marker insert test after schema check...');
const db = toolsHandler.db;

try {
  // Using the same pattern as the trigger
  const sql = `INSERT INTO chunks_fts(chunks_fts, rowid, content, title, section, source_id)
               VALUES('delete', 999999, 'c', 't', 's', 'src')`;
  db.exec(sql);
  console.log('Manual INSERT succeeded');
} catch (e) {
  console.error('Manual INSERT failed:', e.message);
  // maybe try with quoting the special column name using double quotes?
  try {
    const sql2 = `INSERT INTO "chunks_fts"("chunks_fts", rowid) VALUES('delete', 999998)`;
    db.exec(sql2);
    console.log('INSERT with quoted table/column succeeded');
  } catch (e2) {
    console.error('Second attempt failed:', e2.message);
  }
}

toolsHandler.close();
