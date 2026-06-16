import test from 'node:test';
import assert from 'node:assert/strict';

import {
    __setLangfuseClientForTests,
    resetLangfuseForTests,
    isLangfuseEnabled,
    startTaskTrace,
    traceGeneration,
    flushLangfuse,
    getPromptText,
    type LangfuseLike,
    type LangfuseTraceHandle,
    type LangfuseGenerationHandle,
} from './index.js';

// ─── Capturing fake client ───────────────────────────────────────────────────

type Captured = {
    traces: Array<Record<string, unknown>>;
    generations: Array<Record<string, unknown>>;
    generationEnds: Array<Record<string, unknown>>;
    flushed: number;
};

const makeFake = (): { client: LangfuseLike; captured: Captured } => {
    const captured: Captured = { traces: [], generations: [], generationEnds: [], flushed: 0 };
    const client: LangfuseLike = {
        trace(body) {
            captured.traces.push(body);
            const traceId = (body['id'] as string) ?? 'generated';
            const handle: LangfuseTraceHandle = {
                id: traceId,
                generation(genBody) {
                    captured.generations.push(genBody);
                    const gen: LangfuseGenerationHandle = {
                        end(endBody) {
                            captured.generationEnds.push(endBody ?? {});
                            return undefined;
                        },
                        update() {
                            return undefined;
                        },
                    };
                    return gen;
                },
                update() {
                    return undefined;
                },
            };
            return handle;
        },
        async flushAsync() {
            captured.flushed += 1;
        },
        async shutdownAsync() {
            return undefined;
        },
    };
    return { client, captured };
};

test('disabled when no client configured — helpers return null and never throw', () => {
    resetLangfuseForTests();
    __setLangfuseClientForTests(null);

    assert.equal(isLangfuseEnabled(), false);
    assert.equal(startTaskTrace({ taskId: 't1' }), null);
    assert.equal(traceGeneration({ taskId: 't1', model: 'gpt-4o' }), null);

    resetLangfuseForTests();
});

test('startTaskTrace creates a trace with the supplied id and metadata', () => {
    resetLangfuseForTests();
    const { client, captured } = makeFake();
    __setLangfuseClientForTests(client);

    const traceId = startTaskTrace({
        traceId: 'trace-123',
        name: 'task.execute',
        tenantId: 'tenant-a',
        agentId: 'agent-x',
        taskId: 'task-9',
        tags: ['developer'],
    });

    assert.equal(traceId, 'trace-123');
    assert.equal(captured.traces.length, 1);
    const t = captured.traces[0]!;
    assert.equal(t['id'], 'trace-123');
    assert.equal(t['name'], 'task.execute');
    assert.equal(t['userId'], 'tenant-a');
    const meta = t['metadata'] as Record<string, unknown>;
    assert.equal(meta['agentId'], 'agent-x');
    assert.equal(meta['taskId'], 'task-9');

    resetLangfuseForTests();
});

test('traceGeneration nests under an existing traceId and records token usage', () => {
    resetLangfuseForTests();
    const { client, captured } = makeFake();
    __setLangfuseClientForTests(client);

    const start = new Date('2026-06-16T10:00:00Z');
    const end = new Date('2026-06-16T10:00:02Z');

    const traceId = traceGeneration({
        traceId: 'trace-abc',
        name: 'llm.decision',
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        input: [{ role: 'user', content: 'hi' }],
        output: 'hello',
        promptTokens: 100,
        completionTokens: 40,
        costUsd: 0.0045,
        modelTier: 'opus',
        startTime: start,
        endTime: end,
    });

    assert.equal(traceId, 'trace-abc');
    assert.equal(captured.traces[0]!['id'], 'trace-abc');

    const gen = captured.generations[0]!;
    assert.equal(gen['model'], 'claude-opus-4-7');
    const genMeta = gen['metadata'] as Record<string, unknown>;
    assert.equal(genMeta['provider'], 'anthropic');
    assert.equal(genMeta['estimatedCostUsd'], 0.0045);
    assert.equal(genMeta['modelTier'], 'opus');

    const ended = captured.generationEnds[0]!;
    assert.equal(ended['output'], 'hello');
    const usage = ended['usage'] as Record<string, unknown>;
    assert.equal(usage['input'], 100);
    assert.equal(usage['output'], 40);
    assert.equal(usage['total'], 140); // derived
    assert.equal(usage['unit'], 'TOKENS');

    resetLangfuseForTests();
});

test('traceGeneration without tokens omits the usage object', () => {
    resetLangfuseForTests();
    const { client, captured } = makeFake();
    __setLangfuseClientForTests(client);

    traceGeneration({ traceId: 't', model: 'gpt-4o-mini', output: 'x' });
    const ended = captured.generationEnds[0]!;
    assert.equal(ended['usage'], undefined);

    resetLangfuseForTests();
});

test('traceGeneration mints a trace id when none supplied', () => {
    resetLangfuseForTests();
    const { client, captured } = makeFake();
    __setLangfuseClientForTests(client);

    const traceId = traceGeneration({ taskId: 'task-77', model: 'gpt-4o' });
    assert.ok(traceId && traceId.startsWith('task-77:'), `expected generated id, got ${traceId}`);
    assert.equal(captured.traces.length, 1);

    resetLangfuseForTests();
});

test('errors thrown inside the client are swallowed', () => {
    resetLangfuseForTests();
    const throwing: LangfuseLike = {
        trace() {
            throw new Error('boom');
        },
        async flushAsync() {},
        async shutdownAsync() {},
    };
    __setLangfuseClientForTests(throwing);

    assert.doesNotThrow(() => traceGeneration({ model: 'gpt-4o' }));
    assert.equal(traceGeneration({ model: 'gpt-4o' }), null);

    resetLangfuseForTests();
});

test('flushLangfuse calls flushAsync when enabled and is a no-op when disabled', async () => {
    resetLangfuseForTests();
    const { client, captured } = makeFake();
    __setLangfuseClientForTests(client);
    await flushLangfuse();
    assert.equal(captured.flushed, 1);

    __setLangfuseClientForTests(null);
    await assert.doesNotReject(flushLangfuse());

    resetLangfuseForTests();
});

// ─── getPromptText (build #5) ─────────────────────────────────────────────────

test('getPromptText returns the fallback when no client configured', async () => {
    resetLangfuseForTests();
    __setLangfuseClientForTests(null);
    const text = await getPromptText('role-system-prompt:dev', 'CODE FALLBACK');
    assert.equal(text, 'CODE FALLBACK');
    resetLangfuseForTests();
});

test('getPromptText compiles variables into the fallback when no client', async () => {
    resetLangfuseForTests();
    __setLangfuseClientForTests(null);
    const text = await getPromptText('p', 'Hello {{name}}', { variables: { name: 'Ada' } });
    assert.equal(text, 'Hello Ada');
    resetLangfuseForTests();
});

test('getPromptText returns the Langfuse-registered prompt when present', async () => {
    resetLangfuseForTests();
    let askedName = '';
    const client: LangfuseLike = {
        trace() { return { id: 't', generation() { return { end() {}, update() {} }; }, update() {} }; },
        async flushAsync() {}, async shutdownAsync() {},
        async getPrompt(name: string) {
            askedName = name;
            return { prompt: 'REGISTERED PROMPT', compile: () => 'REGISTERED PROMPT' };
        },
    };
    __setLangfuseClientForTests(client);
    const text = await getPromptText('role-system-prompt:developer', 'FALLBACK');
    assert.equal(text, 'REGISTERED PROMPT');
    assert.equal(askedName, 'role-system-prompt:developer');
    resetLangfuseForTests();
});

test('getPromptText falls back when getPrompt throws', async () => {
    resetLangfuseForTests();
    const client: LangfuseLike = {
        trace() { return { id: 't', generation() { return { end() {}, update() {} }; }, update() {} }; },
        async flushAsync() {}, async shutdownAsync() {},
        async getPrompt() { throw new Error('boom'); },
    };
    __setLangfuseClientForTests(client);
    const text = await getPromptText('p', 'SAFE FALLBACK');
    assert.equal(text, 'SAFE FALLBACK');
    resetLangfuseForTests();
});
