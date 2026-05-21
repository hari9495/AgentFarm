import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { MeetingEpisodicMemory } from './meeting-episodic-memory.js';
import type { PastExchange, MemoryWriteFn, MemoryReadFn } from './meeting-episodic-memory.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMemory() {
    return new MeetingEpisodicMemory();
}

// ─── constructor ─────────────────────────────────────────────────────────────

describe('MeetingEpisodicMemory — constructor', () => {
    it('constructs with no options', () => {
        assert.ok(makeMemory());
    });

    it('constructs with pg callbacks', () => {
        const mem = new MeetingEpisodicMemory({
            pgWrite: async () => { /* noop */ },
            pgRead: async () => [],
        });
        assert.ok(mem);
    });
});

// ─── record ──────────────────────────────────────────────────────────────────

describe('MeetingEpisodicMemory.record()', () => {
    it('stores an exchange and increments entryCount', () => {
        const mem = makeMemory();
        mem.record('Alice', 'Hello', 'Hi there!');
        assert.strictEqual(mem.entryCount('Alice'), 1);
    });

    it('normalises the key to lower-case', () => {
        const mem = makeMemory();
        mem.record('ALICE', 'Hey', 'Hello');
        assert.strictEqual(mem.entryCount('alice'), 1);
        assert.strictEqual(mem.entryCount('ALICE'), 1);
    });

    it('ignores blank speaker keys', () => {
        const mem = makeMemory();
        mem.record('', 'text', 'reply');
        mem.record('   ', 'text', 'reply');
        assert.strictEqual(mem.entryCount(''), 0);
    });

    it('uses provided ts', async () => {
        const mem = makeMemory();
        const ts = Date.now() - 10_000;
        mem.record('Bob', 'Hello', 'Hi', ts);
        const entries = await mem.recall('Bob');
        assert.strictEqual(entries[0]?.ts, ts);
    });

    it('rotates when exceeding 50 entries', () => {
        const mem = makeMemory();
        for (let i = 0; i < 55; i++) {
            mem.record('carol', `msg${i}`, `reply${i}`);
        }
        assert.strictEqual(mem.entryCount('carol'), 50);
    });

    it('calls pgWrite best-effort', async () => {
        const written: PastExchange[] = [];
        const pgWrite: MemoryWriteFn = async (e) => { written.push(e); };
        const mem = new MeetingEpisodicMemory({ pgWrite });
        mem.record('dave', 'question', 'answer');
        // pgWrite is async fire-and-forget; wait a tick for it to resolve
        await new Promise<void>((r) => setTimeout(r, 0));
        assert.strictEqual(written.length, 1);
        assert.strictEqual(written[0]?.participantText, 'question');
    });

    it('never throws when pgWrite rejects', () => {
        const pgWrite: MemoryWriteFn = async () => { throw new Error('db down'); };
        const mem = new MeetingEpisodicMemory({ pgWrite });
        assert.doesNotThrow(() => mem.record('eve', 'hi', 'hello'));
    });
});

// ─── recall ──────────────────────────────────────────────────────────────────

describe('MeetingEpisodicMemory.recall()', () => {
    it('returns empty array for unknown speaker', async () => {
        const mem = makeMemory();
        assert.deepStrictEqual(await mem.recall('nobody'), []);
    });

    it('returns empty array for blank key', async () => {
        const mem = makeMemory();
        assert.deepStrictEqual(await mem.recall(''), []);
    });

    it('returns entries most-recent first', async () => {
        const mem = makeMemory();
        mem.record('frank', 'first', 'a', 1_000);
        mem.record('frank', 'second', 'b', 2_000);
        mem.record('frank', 'third', 'c', 3_000);
        const entries = await mem.recall('frank');
        assert.strictEqual(entries[0]?.participantText, 'third');
        assert.strictEqual(entries[1]?.participantText, 'second');
        assert.strictEqual(entries[2]?.participantText, 'first');
    });

    it('respects the limit parameter', async () => {
        const mem = makeMemory();
        for (let i = 0; i < 10; i++) mem.record('grace', `msg${i}`, `r${i}`);
        const entries = await mem.recall('grace', 3);
        assert.strictEqual(entries.length, 3);
    });

    it('defaults to 5 entries', async () => {
        const mem = makeMemory();
        for (let i = 0; i < 10; i++) mem.record('hank', `msg${i}`, `r${i}`);
        const entries = await mem.recall('hank');
        assert.strictEqual(entries.length, 5);
    });

    it('uses pgRead when configured and results non-empty', async () => {
        const pgResult: PastExchange[] = [
            { speakerKey: 'iris', participantText: 'pg-question', agentReply: 'pg-answer', ts: 99 },
        ];
        const pgRead: MemoryReadFn = async () => pgResult;
        const mem = new MeetingEpisodicMemory({ pgRead });
        mem.record('iris', 'local-question', 'local-answer');
        const entries = await mem.recall('iris');
        assert.strictEqual(entries[0]?.participantText, 'pg-question');
    });

    it('falls back to in-process store when pgRead returns empty', async () => {
        const pgRead: MemoryReadFn = async () => [];
        const mem = new MeetingEpisodicMemory({ pgRead });
        mem.record('jack', 'local-q', 'local-a');
        const entries = await mem.recall('jack');
        assert.strictEqual(entries[0]?.participantText, 'local-q');
    });

    it('falls back to in-process store when pgRead throws', async () => {
        const pgRead: MemoryReadFn = async () => { throw new Error('db error'); };
        const mem = new MeetingEpisodicMemory({ pgRead });
        mem.record('kate', 'local-q', 'local-a');
        const entries = await mem.recall('kate');
        assert.strictEqual(entries[0]?.participantText, 'local-q');
    });
});

// ─── buildContextBlock ───────────────────────────────────────────────────────

describe('MeetingEpisodicMemory.buildContextBlock()', () => {
    it('returns empty string when no history', async () => {
        const mem = makeMemory();
        const block = await mem.buildContextBlock('nobody');
        assert.strictEqual(block, '');
    });

    it('includes header, exchanges, and footer', async () => {
        const mem = makeMemory();
        mem.record('leo', 'What is 2+2?', 'It is 4.', 1_000_000);
        const block = await mem.buildContextBlock('leo');
        assert.ok(block.startsWith('=== Past exchanges with leo'));
        assert.ok(block.includes('What is 2+2?'));
        assert.ok(block.includes('It is 4.'));
        assert.ok(block.includes('=== End past exchanges ==='));
    });

    it('truncates long participant text and agent reply', async () => {
        const mem = makeMemory();
        const longText = 'x'.repeat(200);
        const longReply = 'y'.repeat(200);
        mem.record('mia', longText, longReply);
        const block = await mem.buildContextBlock('mia');
        assert.ok(!block.includes('x'.repeat(200)), 'participant text should be truncated');
        assert.ok(!block.includes('y'.repeat(200)), 'agent reply should be truncated');
    });

    it('respects limit parameter', async () => {
        const mem = makeMemory();
        for (let i = 0; i < 8; i++) mem.record('nina', `q${i}`, `a${i}`);
        const block = await mem.buildContextBlock('nina', 3);
        const lineCount = block.split('\n').filter((l) => l.startsWith('[')).length;
        assert.strictEqual(lineCount, 3);
    });
});

// ─── clear ───────────────────────────────────────────────────────────────────

describe('MeetingEpisodicMemory.clear()', () => {
    it('removes all entries for a speaker', () => {
        const mem = makeMemory();
        mem.record('otto', 'hi', 'hello');
        mem.record('otto', 'bye', 'goodbye');
        mem.clear('otto');
        assert.strictEqual(mem.entryCount('otto'), 0);
    });

    it('does not affect other speakers', () => {
        const mem = makeMemory();
        mem.record('otto', 'hi', 'hello');
        mem.record('paul', 'hey', 'hey');
        mem.clear('otto');
        assert.strictEqual(mem.entryCount('paul'), 1);
    });

    it('is case-insensitive', () => {
        const mem = makeMemory();
        mem.record('QUINN', 'hi', 'hello');
        mem.clear('quinn');
        assert.strictEqual(mem.entryCount('QUINN'), 0);
    });

    it('tolerates clearing unknown speaker', () => {
        const mem = makeMemory();
        assert.doesNotThrow(() => mem.clear('nobody'));
    });

    it('ignores blank key', () => {
        const mem = makeMemory();
        assert.doesNotThrow(() => mem.clear(''));
    });
});
