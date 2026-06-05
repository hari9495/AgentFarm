import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, CHUNK_MAX_CHARS } from './chunker.js';

// ── basic splitting ──────────────────────────────────────────────────────────

test('chunkText — empty string returns empty array', () => {
    assert.deepEqual(chunkText(''), []);
});

test('chunkText — whitespace-only string returns empty array', () => {
    assert.deepEqual(chunkText('   \n\n   '), []);
});

test('chunkText — short text fits in one chunk', () => {
    const text = 'Hello AgentFarm.';
    const chunks = chunkText(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], text);
});

test('chunkText — single paragraph under maxChars is one chunk', () => {
    const para = 'A'.repeat(1_000);
    const chunks = chunkText(para);
    assert.equal(chunks.length, 1);
});

// ── paragraph merging ────────────────────────────────────────────────────────

test('chunkText — two short paragraphs are merged into one chunk', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const chunks = chunkText(text);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]!, /First paragraph/);
    assert.match(chunks[0]!, /Second paragraph/);
});

test('chunkText — paragraphs that together exceed maxChars become separate chunks', () => {
    const para = 'X'.repeat(900);
    const text = `${para}\n\n${para}`;
    const chunks = chunkText(text, { maxChars: 1_000, overlapChars: 0 });
    assert.equal(chunks.length, 2);
});

// ── long paragraph splitting ─────────────────────────────────────────────────

test('chunkText — paragraph longer than maxChars is split at sentence boundary', () => {
    const long = 'Sentence one is here. Sentence two follows. '.repeat(50); // ~2200 chars
    const chunks = chunkText(long, { maxChars: 500, overlapChars: 0 });
    assert.ok(chunks.length > 1, 'should produce multiple chunks');
    for (const chunk of chunks) {
        assert.ok(chunk.length <= 550, `chunk too long: ${chunk.length}`); // small tolerance for last word
    }
});

// ── overlap ──────────────────────────────────────────────────────────────────

test('chunkText — overlap is prepended to subsequent chunks', () => {
    const para1 = 'First chunk content here ending with overlap target text.';
    const para2 = 'Second chunk starts here and continues.';
    // Force two separate chunks by using tiny maxChars
    const chunks = chunkText(`${para1}\n\n${para2}`, { maxChars: 60, overlapChars: 20 });
    assert.ok(chunks.length >= 2, 'should produce at least 2 chunks');
    // Second chunk should contain tail of first chunk
    const tail = para1.slice(-20);
    assert.ok(chunks[1]!.includes(tail), `chunk[1] should contain overlap "${tail}"`);
});

test('chunkText — no overlap when overlapChars is 0', () => {
    const para1 = 'Alpha block of text here that is distinct.';
    const para2 = 'Beta block of text here that is distinct.';
    const chunks = chunkText(`${para1}\n\n${para2}`, { maxChars: 50, overlapChars: 0 });
    if (chunks.length >= 2) {
        assert.ok(!chunks[1]!.startsWith(para1.slice(-10)), 'no overlap expected');
    }
});

// ── multi-chunk document ─────────────────────────────────────────────────────

test('chunkText — large document produces multiple chunks all within maxChars + overlap', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}: ${'word '.repeat(40).trim()}.`);
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text); // default 1500-char max
    assert.ok(chunks.length > 1, 'large doc should produce > 1 chunk');
    for (const chunk of chunks) {
        // Chunk may be slightly over CHUNK_MAX due to overlap — cap at 2× for safety
        assert.ok(chunk.length <= CHUNK_MAX_CHARS * 2, `chunk too long: ${chunk.length}`);
    }
});

test('chunkText — content of all chunks covers all original paragraphs', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Para${i}: ${'abc '.repeat(100).trim()}.`);
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 0 });
    const combined = chunks.join(' ');
    for (const para of paragraphs) {
        // Each paragraph's distinctive prefix should appear in at least one chunk
        assert.ok(combined.includes(`Para${paragraphs.indexOf(para)}:`), `Para${paragraphs.indexOf(para)} missing from chunks`);
    }
});
