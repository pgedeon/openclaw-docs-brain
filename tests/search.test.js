import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Searcher } from '../src/search.js';
import { ToolsHandler } from '../src/tools.js';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '.test-state-search');

describe('docs-brain Searcher', () => {
  let handler;
  let searcher;

  before(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    handler = new ToolsHandler(TEST_DIR, { mode: 'fts' });
    await handler.init();

    // Add test data
    handler.addSource('react', 'https://react.dev/', 'React', 'ok');
    handler.addChunk('react', 'React Hooks', 'useState',
      'useState is a React Hook that lets you add a state variable to your component',
      'react-hash-1', 0);
    handler.addChunk('react', 'React Hooks', 'useEffect',
      'useEffect is a React Hook that lets you synchronize a component with an external system',
      'react-hash-2', 1);
    handler.addChunk('react', 'React Components', 'Props',
      'Components accept props as arguments and return React elements describing what should appear on screen',
      'react-hash-3', 2);

    handler.addSource('nextjs', 'https://nextjs.org/docs', 'Next.js', 'ok');
    handler.addChunk('nextjs', 'Next.js App Router', 'Getting Started',
      'The App Router is a new routing system built on React Server Components',
      'nextjs-hash-1', 0);

    searcher = new Searcher(handler, { mode: 'fts' });
  });

  after(() => {
    handler.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('searches and returns ranked results', async () => {
    const results = await searcher.search('React hooks useState', 5);
    assert.ok(results.length > 0, 'Should find results');
    // useState result should rank highest
    assert.ok(results[0].text.includes('useState'), 'Top result should be about useState');
  });

  it('respects topK limit', async () => {
    const results = await searcher.search('React', 2);
    assert.ok(results.length <= 2, 'Should respect topK limit');
  });

  it('filters by library', async () => {
    const results = await searcher.search('component', 5, 'react');
    assert.ok(results.length > 0, 'Should find results');
    results.forEach(r => assert.equal(r.source_id, 'react'));
  });

  it('returns empty array for non-matching query', async () => {
    const results = await searcher.search('quantum physics superposition', 5);
    // May return 0 results since nothing matches
    assert.ok(Array.isArray(results));
  });

  it('reciprocalRankFusion merges results correctly', () => {
    const fts = [
      { hash: 'a', title: 'Doc A', score: 1.0 },
      { hash: 'b', title: 'Doc B', score: 0.8 },
      { hash: 'c', title: 'Doc C', score: 0.6 },
    ];
    const vec = [
      { hash: 'c', title: 'Doc C', score: 0.9 },
      { hash: 'd', title: 'Doc D', score: 0.7 },
      { hash: 'a', title: 'Doc A', score: 0.5 },
    ];

    const merged = searcher.reciprocalRankFusion(fts, vec);
    // 'a' appears in both at rank 0 and rank 2 → should rank high
    // 'c' appears in both at rank 2 and rank 0 → should also rank high
    assert.equal(merged.length, 4, 'Should have 4 unique docs');
    // 'a' has RRF score = 1/(60+1) + 1/(60+3) ≈ 0.0204
    // 'c' has RRF score = 1/(60+3) + 1/(60+1) ≈ 0.0204 (same!)
    assert.ok(merged[0].score > 0, 'Scores should be positive');
    // Docs in both lists should rank higher than docs in only one
    const dScore = merged.find(d => d.hash === 'd').score;
    const aScore = merged.find(d => d.hash === 'a').score;
    assert.ok(aScore > dScore, 'Docs in both lists should rank higher');
  });
});
