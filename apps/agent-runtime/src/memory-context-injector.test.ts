import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryContextPrefix } from './memory-context-injector.js';
import type { EpisodicSearchResult } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(similarity: number, summary: string, pattern: string): EpisodicSearchResult {
    return {
        similarity,
        memory: {
            id: 'mem-1',
            tenantId: 't1',
            botId: 'bot1',
            workspaceId: 'ws1',
            pattern,
            summary,
            embeddingModel: 'text-embedding-3-small',
            confidence: 0.85,
            observedCount: 3,
            lastSeen: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildMemoryContextPrefix', () => {
    it('returns empty string when memories list is empty', () => {
        const result = buildMemoryContextPrefix([]);
        assert.equal(result, '');
    });

    it('includes the memory summary in output for a single result', () => {
        const memories = [makeResult(0.91, 'Refactored auth to use JWT', 'prefers JWT')];
        const prefix = buildMemoryContextPrefix(memories);

        assert.ok(prefix.includes('Refactored auth to use JWT'));
        assert.ok(prefix.includes('prefers JWT'));
    });

    it('includes similarity score in output', () => {
        const memories = [makeResult(0.91, 'Fixed failing tests', 'runs tests after changes')];
        const prefix = buildMemoryContextPrefix(memories);

        assert.ok(prefix.includes('0.91'));
    });

    it('numbers multiple memories starting from 1', () => {
        const memories = [
            makeResult(0.94, 'First task summary', 'pattern one'),
            makeResult(0.82, 'Second task summary', 'pattern two'),
            makeResult(0.75, 'Third task summary', 'pattern three'),
        ];
        const prefix = buildMemoryContextPrefix(memories);

        assert.ok(prefix.includes('1.'));
        assert.ok(prefix.includes('2.'));
        assert.ok(prefix.includes('3.'));
    });

    it('includes all memory summaries in order', () => {
        const memories = [
            makeResult(0.94, 'First task summary', 'first pattern'),
            makeResult(0.82, 'Second task summary', 'second pattern'),
        ];
        const prefix = buildMemoryContextPrefix(memories);

        const pos1 = prefix.indexOf('First task');
        const pos2 = prefix.indexOf('Second task');
        assert.ok(pos1 < pos2, 'First memory should appear before second memory');
    });

    it('includes section header in output', () => {
        const memories = [makeResult(0.9, 'summary', 'pattern')];
        const prefix = buildMemoryContextPrefix(memories);

        assert.ok(prefix.includes('### Relevant past experience'));
    });

    it('ends with separator line', () => {
        const memories = [makeResult(0.9, 'summary', 'pattern')];
        const prefix = buildMemoryContextPrefix(memories);

        assert.ok(prefix.trim().endsWith('---'));
    });
});
