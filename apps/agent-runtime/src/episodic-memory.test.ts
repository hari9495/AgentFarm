import { describe, expect, it } from 'vitest';

import { EpisodicMemoryStore, type TaskMemoryEntry } from './episodic-memory.js';

const baseEntry = (overrides: Partial<TaskMemoryEntry> = {}): TaskMemoryEntry => ({
    taskId: 'task-1',
    workspaceId: 'ws-1',
    botId: 'bot-1',
    actionType: 'send_email',
    promptSummary: 'Reply to candidate about interview slot',
    outcome: 'success',
    timestamp: Date.now(),
    ...overrides,
});

describe('EpisodicMemoryStore per-person index', () => {
    it('returns empty when no entries recorded for the person', async () => {
        const store = new EpisodicMemoryStore();
        const result = await store.readRecentForPerson('jane@acme.com');
        expect(result).toEqual([]);
    });

    it('records and recalls per-person entries case-insensitively', async () => {
        const store = new EpisodicMemoryStore();
        await store.record(baseEntry({ personKey: 'Jane@ACME.com', personLabel: 'Jane <Jane@ACME.com>' }));
        const result = await store.readRecentForPerson('JANE@acme.com');
        expect(result).toHaveLength(1);
        expect(result[0]?.personLabel).toBe('Jane <Jane@ACME.com>');
    });

    it('returns most-recent first and respects limit', async () => {
        const store = new EpisodicMemoryStore();
        for (let i = 0; i < 5; i++) {
            await store.record(baseEntry({ taskId: `t-${i}`, timestamp: 1000 + i, personKey: 'p1' }));
        }
        const result = await store.readRecentForPerson('p1', 3);
        expect(result.map((e) => e.taskId)).toEqual(['t-4', 't-3', 't-2']);
    });

    it('does not index entries without a personKey', async () => {
        const store = new EpisodicMemoryStore();
        await store.record(baseEntry({ personKey: undefined }));
        expect(store.personEntryCount('anything')).toBe(0);
    });

    it('still records into workspace bucket when personKey present (dual-indexed)', async () => {
        const store = new EpisodicMemoryStore();
        await store.record(baseEntry({ personKey: 'p1' }));
        expect(store.entryCount('ws-1')).toBe(1);
        expect(store.personEntryCount('p1')).toBe(1);
    });

    it('clearPerson removes only that person bucket', async () => {
        const store = new EpisodicMemoryStore();
        await store.record(baseEntry({ taskId: 'a', personKey: 'p1' }));
        await store.record(baseEntry({ taskId: 'b', personKey: 'p2' }));
        store.clearPerson('p1');
        expect(store.personEntryCount('p1')).toBe(0);
        expect(store.personEntryCount('p2')).toBe(1);
    });

    it('buildContextBlock includes the person label when provided', async () => {
        const store = new EpisodicMemoryStore();
        const entries = [baseEntry({ personKey: 'p1', personLabel: 'Jane <jane@acme.com>' })];
        const block = store.buildContextBlock(entries, { label: 'Jane <jane@acme.com>' });
        expect(block).toContain('with Jane <jane@acme.com>');
    });

    it('buildContextBlock works without a label (workspace history)', async () => {
        const store = new EpisodicMemoryStore();
        const block = store.buildContextBlock([baseEntry()]);
        expect(block).toContain('Recent task history');
        expect(block).not.toContain('with ');
    });

    it('ignores empty/whitespace personKey on record', async () => {
        const store = new EpisodicMemoryStore();
        await store.record(baseEntry({ personKey: '   ' }));
        expect(store.personEntryCount('   ')).toBe(0);
    });
});
