import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyRagContextBudget,
    applyRagContextBudgetWithStats,
    DEFAULT_RAG_CONTEXT_MAX_CHARS,
} from './rag-context-limiter.js';

const SECTION_SEP = '\n---\n';

function makeBlock(sections: string[]): string {
    return `## Context\n\n${sections.join(SECTION_SEP + '\n')}`;
}

test('returns block unchanged when within budget', () => {
    const block = makeBlock(['short content']);
    const result = applyRagContextBudget(block);
    assert.equal(result, block);
});

test('trims at section boundary when over budget', () => {
    const sec1 = 'A'.repeat(3000);
    const sec2 = 'B'.repeat(3000);
    const sec3 = 'C'.repeat(3000);
    const block = makeBlock([sec1, sec2, sec3]);
    const result = applyRagContextBudget(block, 8000);
    assert.ok(result.length <= 8000 + 100); // allow for trim suffix
    assert.ok(result.includes('trimmed for token budget'));
    // should not cut mid-section — no partial B or C content without a preceding header
    assert.ok(!result.includes('BBB') || result.indexOf('BBB') < result.indexOf('trimmed'));
});

test('hard-truncates when no section boundary in first half', () => {
    // Single giant section with no --- separator
    const block = '## Context\n\n' + 'X'.repeat(16000);
    const result = applyRagContextBudget(block, 8000);
    assert.ok(result.length <= 8200); // 8000 + trim suffix
    assert.ok(result.includes('trimmed for token budget'));
});

test('explicit maxChars overrides default', () => {
    const block = 'A'.repeat(200);
    const result = applyRagContextBudget(block, 100);
    assert.ok(result.length <= 200);
    assert.ok(result.includes('trimmed for token budget'));
});

test('AF_RAG_CONTEXT_MAX_CHARS env var sets budget', () => {
    process.env['AF_RAG_CONTEXT_MAX_CHARS'] = '500';
    const block = 'Z'.repeat(1000);
    const result = applyRagContextBudget(block);
    assert.ok(result.includes('trimmed for token budget'));
    delete process.env['AF_RAG_CONTEXT_MAX_CHARS'];
});

test('AF_RAG_CONTEXT_MAX_CHARS env var is ignored when explicit maxChars passed', () => {
    process.env['AF_RAG_CONTEXT_MAX_CHARS'] = '100';
    const block = 'Y'.repeat(300);
    // explicit maxChars=500 should win over env var=100
    const result = applyRagContextBudget(block, 500);
    assert.equal(result, block); // 300 < 500, so unchanged
    delete process.env['AF_RAG_CONTEXT_MAX_CHARS'];
});

test('invalid AF_RAG_CONTEXT_MAX_CHARS falls back to default', () => {
    process.env['AF_RAG_CONTEXT_MAX_CHARS'] = 'not-a-number';
    const block = 'Q'.repeat(100);
    const result = applyRagContextBudget(block);
    assert.equal(result, block); // 100 < 8000 default
    delete process.env['AF_RAG_CONTEXT_MAX_CHARS'];
});

test('empty string returns empty string', () => {
    assert.equal(applyRagContextBudget(''), '');
});

test('DEFAULT_RAG_CONTEXT_MAX_CHARS is 8000', () => {
    assert.equal(DEFAULT_RAG_CONTEXT_MAX_CHARS, 8_000);
});

// applyRagContextBudgetWithStats

test('withStats: wasTrimmed=false when within budget', () => {
    const block = makeBlock(['small content']);
    const { contextBlock, wasTrimmed, originalChars, finalChars } = applyRagContextBudgetWithStats(block);
    assert.equal(wasTrimmed, false);
    assert.equal(contextBlock, block);
    assert.equal(originalChars, block.length);
    assert.equal(finalChars, block.length);
});

test('withStats: wasTrimmed=true and finalChars < originalChars when trimmed', () => {
    const block = 'X'.repeat(10000);
    const { wasTrimmed, originalChars, finalChars } = applyRagContextBudgetWithStats(block, 5000);
    assert.equal(wasTrimmed, true);
    assert.equal(originalChars, 10000);
    assert.ok(finalChars < originalChars);
});

test('withStats: contextBlock matches applyRagContextBudget output', () => {
    const block = makeBlock(['A'.repeat(4000), 'B'.repeat(4000), 'C'.repeat(4000)]);
    const plain = applyRagContextBudget(block, 8000);
    const { contextBlock } = applyRagContextBudgetWithStats(block, 8000);
    assert.equal(contextBlock, plain);
});
