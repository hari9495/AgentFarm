import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TriggerDispatcher } from './trigger-dispatcher.js';
import type { TriggerEvent } from './types.js';

function makeEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
    return {
        id: 'evt-001',
        source: 'webhook',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        from: 'user@example.com',
        body: 'run the daily report',
        receivedAt: new Date(),
        replyContext: { source: 'webhook' },
        ...overrides,
    };
}

describe('TriggerDispatcher', () => {
    describe('correct URL and body', () => {
        it('POSTs to <agentRuntimeUrl>/run-task with correct fields', async () => {
            let captured: { url: string; body: unknown } | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (url, init) => {
                captured = { url: url as string, body: JSON.parse(init?.body as string) };
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            };

            const dispatcher = new TriggerDispatcher('http://localhost:3001');
            const result = await dispatcher.dispatch(makeEvent());

            global.fetch = originalFetch;

            assert.ok(result.ok);
            assert.equal(captured?.url, 'http://localhost:3001/run-task');
            const b = captured?.body as Record<string, unknown>;
            assert.equal(b['tenantId'], 'tenant-1');
            assert.equal(b['agentId'], 'agent-1');
            assert.match(b['task'] as string, /run the daily report/);
        });
    });

    describe('subject is prepended to task string', () => {
        it('prefixes subject when present', async () => {
            let capturedBody: Record<string, unknown> | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (_, init) => {
                capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return new Response('{}', { status: 200 });
            };

            const dispatcher = new TriggerDispatcher('http://localhost:3001');
            await dispatcher.dispatch(makeEvent({ subject: 'Monthly Report', body: 'generate it' }));

            global.fetch = originalFetch;

            assert.match(capturedBody?.['task'] as string, /\[Monthly Report\]/);
            assert.match(capturedBody?.['task'] as string, /generate it/);
        });
    });

    describe('handles HTTP 500 from agent-runtime', () => {
        it('returns ok:false with error message', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => new Response('Internal Server Error', { status: 500 });

            const dispatcher = new TriggerDispatcher('http://localhost:3001');
            const result = await dispatcher.dispatch(makeEvent());

            global.fetch = originalFetch;

            assert.equal(result.ok, false);
            assert.match(result.error ?? '', /500/);
        });
    });

    describe('handles network failure', () => {
        it('returns ok:false when fetch throws', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('ECONNREFUSED'); };

            const dispatcher = new TriggerDispatcher('http://localhost:3001');
            const result = await dispatcher.dispatch(makeEvent());

            global.fetch = originalFetch;

            assert.equal(result.ok, false);
            assert.match(result.error ?? '', /ECONNREFUSED/);
        });
    });
});
