import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ReplyDispatcher } from './reply-dispatcher.js';
import type { TriggerEvent } from './types.js';
import type { DispatchResult } from './trigger-dispatcher.js';

// Skip live DNS resolution in unit tests — SSRF guard IP/hostname checks still run.
// DNS check is covered separately in ssrf-guard.test.ts with mock resolvers.
let originalSsrfDnsCheck: string | undefined;
before(() => { originalSsrfDnsCheck = process.env['SSRF_DNS_CHECK']; process.env['SSRF_DNS_CHECK'] = 'false'; });
after(() => { process.env['SSRF_DNS_CHECK'] = originalSsrfDnsCheck ?? 'false'; });

function makeSlackEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
    return {
        id: 'evt-slack-001',
        source: 'slack',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        from: 'U12345',
        body: 'run something',
        receivedAt: new Date(),
        replyContext: {
            source: 'slack',
            channelId: 'C12345',
            threadTs: '1234567890.123456',
            token: 'xoxb-test-token',
        },
        ...overrides,
    };
}

function makeWebhookEvent(callbackUrl?: string): TriggerEvent {
    return {
        id: 'evt-webhook-001',
        source: 'webhook',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        from: 'webhook',
        body: 'task body',
        receivedAt: new Date(),
        replyContext: { source: 'webhook', callbackUrl },
    };
}

const successResult: DispatchResult = {
    ok: true,
    taskRunResult: { goal: 'run something', success: true, steps_taken: 3 },
};

const failResult: DispatchResult = {
    ok: false,
    error: 'agent-runtime responded 500',
};

describe('ReplyDispatcher', () => {
    describe('Slack: replies to correct channel and thread_ts', () => {
        it('POSTs to Slack API with correct channel and thread_ts', async () => {
            let captured: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (url, init) => {
                captured = {
                    url: url as string,
                    body: JSON.parse(init?.body as string) as Record<string, unknown>,
                    headers: init?.headers as Record<string, string>,
                };
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            };

            const rd = new ReplyDispatcher();
            await rd.reply(makeSlackEvent(), successResult);

            global.fetch = originalFetch;

            assert.equal(captured?.url, 'https://slack.com/api/chat.postMessage');
            assert.equal(captured?.body['channel'], 'C12345');
            assert.equal(captured?.body['thread_ts'], '1234567890.123456');
            assert.match(captured?.headers['Authorization'] ?? '', /xoxb-test-token/);
        });
    });

    describe('Slack: failure gets ⚠️ prefix', () => {
        it('sends message starting with ⚠️ on dispatch failure', async () => {
            let sentText: string | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (_, init) => {
                const b = JSON.parse(init?.body as string) as Record<string, unknown>;
                sentText = b['text'] as string;
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            };

            const rd = new ReplyDispatcher();
            await rd.reply(makeSlackEvent(), failResult);

            global.fetch = originalFetch;

            assert.ok(sentText?.startsWith('⚠️'), `Expected ⚠️ prefix, got: ${sentText}`);
        });
    });

    describe('webhook: POSTs to callbackUrl', () => {
        it('sends POST to the provided callbackUrl', async () => {
            let capturedUrl: string | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (url) => {
                capturedUrl = url as string;
                return new Response('{}', { status: 200 });
            };

            const rd = new ReplyDispatcher();
            await rd.reply(makeWebhookEvent('https://example.com/callback'), successResult);

            global.fetch = originalFetch;

            assert.equal(capturedUrl, 'https://example.com/callback');
        });
    });

    describe('webhook: no callbackUrl skips silently', () => {
        it('does not call fetch when callbackUrl is undefined', async () => {
            let fetchCalled = false;

            const originalFetch = global.fetch;
            global.fetch = async () => {
                fetchCalled = true;
                return new Response('{}', { status: 200 });
            };

            const rd = new ReplyDispatcher();
            await rd.reply(makeWebhookEvent(), successResult);

            global.fetch = originalFetch;

            assert.equal(fetchCalled, false, 'fetch must not be called when callbackUrl is absent');
        });
    });

    describe('google_chat: POSTs to spaces messages endpoint', () => {
        it('sends message to correct space with Bearer token', async () => {
            let captured: { url: string; body: Record<string, unknown>; auth: string } | undefined;

            const originalFetch = global.fetch;
            global.fetch = async (url, init) => {
                captured = {
                    url: url as string,
                    body: JSON.parse(init?.body as string) as Record<string, unknown>,
                    auth: (init?.headers as Record<string, string>)['Authorization'] ?? '',
                };
                return new Response('{}', { status: 200 });
            };

            const event: TriggerEvent = {
                id: 'evt-gc-001', source: 'google_chat', tenantId: 'tenant-1', agentId: 'agent-1',
                from: 'user@example.com', body: 'task', receivedAt: new Date(),
                replyContext: {
                    source: 'google_chat',
                    spaceId: 'spaces/AAAA1234',
                    threadName: 'spaces/AAAA1234/threads/BBBB5678',
                    token: 'gchat-token-xyz',
                },
            };

            const rd = new ReplyDispatcher();
            await rd.reply(event, successResult);
            global.fetch = originalFetch;

            assert.ok(captured?.url.includes('spaces/AAAA1234/messages'), `Expected spaces URL, got: ${captured?.url}`);
            assert.equal(captured?.auth, 'Bearer gchat-token-xyz');
            assert.equal((captured?.body['thread'] as { name: string } | undefined)?.name, 'spaces/AAAA1234/threads/BBBB5678');
        });

        it('sends without thread when threadName is absent', async () => {
            let capturedBody: Record<string, unknown> | undefined;
            const originalFetch = global.fetch;
            global.fetch = async (_, init) => {
                capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return new Response('{}', { status: 200 });
            };

            const event: TriggerEvent = {
                id: 'evt-gc-002', source: 'google_chat', tenantId: 'tenant-1', agentId: 'agent-1',
                from: 'user@example.com', body: 'task', receivedAt: new Date(),
                replyContext: { source: 'google_chat', spaceId: 'spaces/BBBB5678', token: 'tok' },
            };

            const rd = new ReplyDispatcher();
            await rd.reply(event, successResult);
            global.fetch = originalFetch;

            assert.equal(capturedBody?.['thread'], undefined);
            assert.ok(typeof capturedBody?.['text'] === 'string');
        });
    });

    describe('reply does not throw on error', () => {
        it('catches and logs errors without rethrowing', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('network down'); };

            const rd = new ReplyDispatcher();
            // Should not throw
            await assert.doesNotReject(() => rd.reply(makeSlackEvent(), successResult));

            global.fetch = originalFetch;
        });
    });
});
