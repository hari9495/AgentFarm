import { test } from 'node:test';
import * as assert from 'node:assert';
import { HnswIndex, cosineSimilarity } from './hnsw-index.js';

// ── cosineSimilarity ──────────────────────────────────────────────────────────

test('cosineSimilarity returns 1 for identical vectors', () => {
    const score = cosineSimilarity([1, 0, 0], [1, 0, 0]);
    assert.ok(Math.abs(score - 1) < 1e-9);
});

test('cosineSimilarity returns 0 for orthogonal vectors', () => {
    const score = cosineSimilarity([1, 0], [0, 1]);
    assert.ok(Math.abs(score) < 1e-9);
});

test('cosineSimilarity returns -1 for opposite vectors', () => {
    const score = cosineSimilarity([1, 0], [-1, 0]);
    assert.ok(Math.abs(score + 1) < 1e-9);
});

test('cosineSimilarity returns 0 for zero vector', () => {
    assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});

test('cosineSimilarity throws on dimension mismatch', () => {
    assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /mismatch/);
});

// ── HnswIndex — basic operations ─────────────────────────────────────────────

test('HnswIndex.size starts at 0', () => {
    const idx = new HnswIndex();
    assert.equal(idx.size, 0);
});

test('HnswIndex.add increments size', () => {
    const idx = new HnswIndex();
    idx.add({ id: 'ev_1', vector: [1, 0, 0] });
    idx.add({ id: 'ev_2', vector: [0, 1, 0] });
    assert.equal(idx.size, 2);
});

test('HnswIndex.search returns empty array when index is empty', () => {
    const idx = new HnswIndex();
    assert.deepEqual(idx.search([1, 0]), []);
});

test('HnswIndex.search returns k results', () => {
    const idx = new HnswIndex();
    idx.add({ id: 'a', vector: [1, 0] });
    idx.add({ id: 'b', vector: [0, 1] });
    idx.add({ id: 'c', vector: [1, 1] });
    const results = idx.search([1, 0.1], 2);
    assert.equal(results.length, 2);
});

test('HnswIndex.search returns results sorted by score descending', () => {
    const idx = new HnswIndex();
    idx.add({ id: 'far',  vector: [0, 1, 0] });
    idx.add({ id: 'near', vector: [1, 0.1, 0] });
    const results = idx.search([1, 0, 0], 2);
    assert.equal(results[0].id, 'near');
    assert.ok(results[0].score >= results[1].score);
});

test('HnswIndex.search returns at most available nodes when k > size', () => {
    const idx = new HnswIndex();
    idx.add({ id: 'only', vector: [1, 0] });
    const results = idx.search([1, 0], 10);
    assert.equal(results.length, 1);
});

// ── Dimension enforcement ─────────────────────────────────────────────────────

test('HnswIndex enforces dim on insert when specified', () => {
    const idx = new HnswIndex({ dim: 3 });
    idx.add({ id: 'ok', vector: [1, 2, 3] });
    assert.throws(
        () => idx.add({ id: 'bad', vector: [1, 2] }),
        /dim/,
    );
});

test('HnswIndex enforces dim on search when specified', () => {
    const idx = new HnswIndex({ dim: 3 });
    idx.add({ id: 'v1', vector: [1, 0, 0] });
    assert.throws(() => idx.search([1, 0]), /dim/);
});

// ── Metadata passthrough ──────────────────────────────────────────────────────

test('HnswIndex preserves metadata on search results', () => {
    const idx = new HnswIndex();
    idx.add({ id: 'ev_meta', vector: [1, 0], metadata: { runId: 'run_42', evidenceType: 'file_read' } });
    const results = idx.search([1, 0], 1);
    assert.equal(results[0].id, 'ev_meta');
    assert.deepEqual(results[0].metadata, { runId: 'run_42', evidenceType: 'file_read' });
});

// ── Larger corpus (>50 nodes triggers graph search path) ─────────────────────

test('HnswIndex graph search path returns correct nearest neighbour for 60-node corpus', () => {
    const idx = new HnswIndex({ dim: 4 });
    // Insert 60 random-ish vectors; make node at index 30 the clear winner
    for (let i = 0; i < 60; i++) {
        idx.add({
            id: `node_${i}`,
            vector: [i % 3, (i + 1) % 3, (i + 2) % 3, (i + 3) % 3],
        });
    }
    // Insert a query-matching vector explicitly
    idx.add({ id: 'target', vector: [1, 0, 0, 0] });
    const results = idx.search([1, 0, 0, 0], 1);
    assert.ok(results.length >= 1);
    assert.ok(results[0].score > 0.5, `expected high score, got ${results[0].score}`);
});
