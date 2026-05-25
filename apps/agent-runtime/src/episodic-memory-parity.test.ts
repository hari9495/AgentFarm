/**
 * Option C: Integration tests for episodic memory parity features.
 *
 * Covers:
 *  1. buildContextBlock — codeDiff shows actual +/- lines (not just count)
 *  2. buildContextBlock — testFailureSummary surfaces when errorMessage absent
 *  3. buildContextBlock — errorMessage takes priority over testFailureSummary
 *  4. createFileEpisodicMemoryFns — write/read roundtrip via JSONL file
 *  5. createFileEpisodicMemoryFns — filters by workspaceId
 *  6. createFileEpisodicMemoryFns — malformed JSON lines skipped gracefully
 *  7. createFileEpisodicMemoryFns — most-recent-first ordering
 *  8. EpisodicMemoryStore with file backend — full record → read → contextBlock pipeline
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
    EpisodicMemoryStore,
    createFileEpisodicMemoryFns,
    type TaskMemoryEntry,
} from './episodic-memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<TaskMemoryEntry> = {}): TaskMemoryEntry {
    return {
        taskId: `task_${randomUUID().slice(0, 8)}`,
        workspaceId: 'ws-test-001',
        botId: 'bot-001',
        actionType: 'workspace_subagent_spawn',
        promptSummary: 'Fix the off-by-one in the counter loop',
        outcome: 'success',
        timestamp: Date.now(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// 1. buildContextBlock — codeDiff shows actual +/- lines
// ---------------------------------------------------------------------------

describe('buildContextBlock: codeDiff display', () => {
    test('shows actual added/removed lines instead of just a count', () => {
        const store = new EpisodicMemoryStore();
        const entry = makeEntry({
            codeDiff: [
                '--- a/src/counter.ts',
                '+++ b/src/counter.ts',
                '@@ -10,7 +10,7 @@',
                '-    for (let i = 0; i <= arr.length; i++) {',
                '+    for (let i = 0; i < arr.length; i++) {',
                '     total += arr[i];',
                ' }',
            ].join('\n'),
        });

        const block = store.buildContextBlock([entry]);

        // The +/- lines should appear in the context (up to 240 chars)
        assert.ok(
            block.includes('<= arr.length') || block.includes('< arr.length'),
            'diff preview should include the actual changed line content',
        );
        // Should NOT only show "[diff:7L]" with no content
        assert.ok(
            !block.match(/\[diff:\d+L\](?!\:)/),
            'diff hint should include content after the colon when diff is non-empty',
        );
    });

    test('diff hint shows line count and changed lines delimited by " | "', () => {
        const store = new EpisodicMemoryStore();
        const diff = [
            '--- a/src/auth.ts',
            '+++ b/src/auth.ts',
            '-const TOKEN_TTL = 3600;',
            '+const TOKEN_TTL = 7200;',
        ].join('\n');

        const entry = makeEntry({ codeDiff: diff });
        const block = store.buildContextBlock([entry]);

        // Should have a [diff:NL: ...] format
        assert.ok(block.includes('[diff:'), 'should include diff hint');
        assert.ok(
            block.includes('TOKEN_TTL'),
            'should include the actual changed symbol name',
        );
    });

    test('entry without codeDiff shows no diff hint', () => {
        const store = new EpisodicMemoryStore();
        const entry = makeEntry({ codeDiff: undefined });
        const block = store.buildContextBlock([entry]);
        assert.ok(!block.includes('[diff:'), 'no diff hint when codeDiff is absent');
    });
});

// ---------------------------------------------------------------------------
// 2. buildContextBlock — testFailureSummary shown when errorMessage absent
// ---------------------------------------------------------------------------

describe('buildContextBlock: testFailureSummary display', () => {
    test('shows testFailureSummary prefixed with "test:" when errorMessage absent', () => {
        const store = new EpisodicMemoryStore();
        const entry = makeEntry({
            outcome: 'failed',
            errorMessage: undefined,
            testFailureSummary: 'Expected 42 but received 43 at counter.test.ts:15',
        });

        const block = store.buildContextBlock([entry]);
        assert.ok(
            block.includes('test:') && block.includes('Expected 42'),
            'testFailureSummary should appear with "test:" prefix when errorMessage is absent',
        );
    });

    test('errorMessage takes priority over testFailureSummary', () => {
        const store = new EpisodicMemoryStore();
        const entry = makeEntry({
            outcome: 'failed',
            errorMessage: 'Command timed out after 60s',
            testFailureSummary: 'Expected 42 but received 43',
        });

        const block = store.buildContextBlock([entry]);
        assert.ok(
            block.includes('Command timed out'),
            'errorMessage should appear when both are present',
        );
        assert.ok(
            !block.includes('Expected 42'),
            'testFailureSummary should be suppressed when errorMessage is present',
        );
    });

    test('successful entry with no failure fields shows no error suffix', () => {
        const store = new EpisodicMemoryStore();
        const entry = makeEntry({ outcome: 'success' });
        const block = store.buildContextBlock([entry]);
        assert.ok(!block.includes(' — '), 'no error suffix for successful tasks');
    });
});

// ---------------------------------------------------------------------------
// 3-7. createFileEpisodicMemoryFns
// ---------------------------------------------------------------------------

describe('createFileEpisodicMemoryFns: file-based persistence', () => {
    let tmpDir: string;

    // Create a unique temp dir per describe block
    test('before: create temp dir', async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'af-mem-test-'));
    });

    test('write and read roundtrip — single entry', async () => {
        const filePath = join(tmpDir, 'mem-roundtrip.jsonl');
        const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);
        const entry = makeEntry({ taskId: 'roundtrip-001' });

        await pgWrite(entry);
        const results = await pgRead('ws-test-001', 10);

        assert.equal(results.length, 1, 'should read back exactly 1 entry');
        assert.equal(results[0]!.taskId, 'roundtrip-001');
        assert.equal(results[0]!.outcome, 'success');
        assert.equal(results[0]!.workspaceId, 'ws-test-001');
    });

    test('filters entries by workspaceId', async () => {
        const filePath = join(tmpDir, 'mem-filter.jsonl');
        const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);

        await pgWrite(makeEntry({ taskId: 'ws-a-task', workspaceId: 'ws-a' }));
        await pgWrite(makeEntry({ taskId: 'ws-b-task', workspaceId: 'ws-b' }));
        await pgWrite(makeEntry({ taskId: 'ws-a-task2', workspaceId: 'ws-a' }));

        const wsA = await pgRead('ws-a', 10);
        assert.equal(wsA.length, 2, 'should only return ws-a entries');
        assert.ok(wsA.every((e) => e.workspaceId === 'ws-a'), 'all returned entries must be ws-a');

        const wsB = await pgRead('ws-b', 10);
        assert.equal(wsB.length, 1);
        assert.equal(wsB[0]!.taskId, 'ws-b-task');
    });

    test('malformed JSON lines are silently skipped', async () => {
        const filePath = join(tmpDir, 'mem-malformed.jsonl');
        const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);

        // Write a good entry, then manually corrupt the file with a bad line
        await pgWrite(makeEntry({ taskId: 'good-entry' }));
        const { appendFile } = await import('node:fs/promises');
        await appendFile(filePath, 'THIS IS NOT JSON\n', 'utf-8');
        await pgWrite(makeEntry({ taskId: 'good-entry-2' }));

        const results = await pgRead('ws-test-001', 10);
        assert.equal(results.length, 2, 'should return 2 valid entries, skipping the bad line');
        assert.ok(results.every((e) => e.taskId.startsWith('good-')));
    });

    test('returns entries most-recent-first respecting the limit', async () => {
        const filePath = join(tmpDir, 'mem-ordering.jsonl');
        const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);

        for (let i = 1; i <= 5; i++) {
            await pgWrite(makeEntry({ taskId: `task-${i}`, timestamp: Date.now() + i }));
        }

        const results = await pgRead('ws-test-001', 3);
        assert.equal(results.length, 3, 'limit should be respected');
        // Most-recent-first means task-5, task-4, task-3
        assert.equal(results[0]!.taskId, 'task-5', 'first result should be newest');
        assert.equal(results[1]!.taskId, 'task-4');
        assert.equal(results[2]!.taskId, 'task-3');
    });

    test('returns empty array when file does not exist', async () => {
        const { pgRead } = createFileEpisodicMemoryFns(join(tmpDir, 'nonexistent.jsonl'));
        const results = await pgRead('ws-test-001', 10);
        assert.deepEqual(results, []);
    });

    test('persists codeDiff and testFailureSummary fields across write/read', async () => {
        const filePath = join(tmpDir, 'mem-fields.jsonl');
        const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);

        const entry = makeEntry({
            codeDiff: '+const x = 1;\n-const x = 0;',
            testFailureSummary: 'Expected 1 but got 0 at math.test.ts:8',
            filesChanged: ['src/math.ts', 'src/math.test.ts'],
        });
        await pgWrite(entry);

        const [read] = await pgRead('ws-test-001', 1);
        assert.equal(read!.codeDiff, entry.codeDiff, 'codeDiff should round-trip correctly');
        assert.equal(
            read!.testFailureSummary,
            entry.testFailureSummary,
            'testFailureSummary should round-trip correctly',
        );
        assert.deepEqual(read!.filesChanged, entry.filesChanged);
    });

    test('after: clean up temp dir', async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });
});

// ---------------------------------------------------------------------------
// 8. Full pipeline: record → readRecentForWorkspace → buildContextBlock
// ---------------------------------------------------------------------------

describe('EpisodicMemoryStore with file backend — full pipeline', () => {
    test('record, retrieve, and render a context block with all parity fields', async () => {
        const tmpDir = await mkdtemp(join(tmpdir(), 'af-mem-pipeline-'));
        try {
            const filePath = join(tmpDir, 'pipeline.jsonl');
            const { pgWrite, pgRead } = createFileEpisodicMemoryFns(filePath);
            const store = new EpisodicMemoryStore({ pgWrite, pgRead });

            // Record a successful task with a diff
            await store.record(makeEntry({
                taskId: 'pipeline-success',
                outcome: 'success',
                codeDiff: '+const MAX = 100;\n-const MAX = 50;',
                filesChanged: ['src/config.ts'],
            }));

            // Record a failed task with a test failure
            await store.record(makeEntry({
                taskId: 'pipeline-fail',
                outcome: 'failed',
                testFailureSummary: 'AssertionError: expected 100 but got 50 at config.test.ts:22',
            }));

            const entries = await store.readRecentForWorkspace('ws-test-001', 10);
            assert.equal(entries.length, 2, 'should retrieve both recorded entries');

            const block = store.buildContextBlock(entries);
            assert.ok(block.includes('✓'), 'successful task should be marked with ✓');
            assert.ok(block.includes('✗'), 'failed task should be marked with ✗');
            assert.ok(block.includes('MAX'), 'diff content should appear for successful task');
            assert.ok(block.includes('AssertionError'), 'test failure should appear for failed task');
            assert.ok(block.includes('src/config.ts'), 'files changed should appear in block');
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });
});
