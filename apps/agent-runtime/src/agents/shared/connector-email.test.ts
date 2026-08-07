import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmailViaConnector } from './connector-email.js';

const BASE = {
    workspaceId: 'ws-1',
    gatewayBaseUrl: 'http://gateway',
    serviceToken: 'tok',
    to: 'customer@example.com',
    subject: 'Re: your ticket',
    body: 'Resolved.',
};

/** Stub the gateway token lookup resolveAllConnectorTokens performs. */
function mockTokenFetch(connected: readonly string[]) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
        const href = typeof url === 'string' ? url : url.toString();
        const match = connected.find((type) => href.includes(type));
        if (!match) return new Response(null, { status: 404 });
        return new Response(JSON.stringify({ credentials: { accessToken: 'a' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof globalThis.fetch;
    return () => { globalThis.fetch = original; };
}

test('sends through the workspace connector and reports which one', async () => {
    const restore = mockTokenFetch(['outlook']);
    const calls: Array<{ connectorType: string; actionType: string }> = [];
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async (i) => {
                calls.push({ connectorType: i.connectorType, actionType: i.actionType });
                return { ok: true, statusCode: 200, attempts: 1 };
            },
        });
        assert.equal(result.sent, true);
        assert.equal(result.sent && result.connectorType, 'outlook');
        assert.deepEqual(calls, [{ connectorType: 'outlook', actionType: 'send_email' }]);
    } finally {
        restore();
    }
});

test('prefers gmail when several email connectors are live', async () => {
    const restore = mockTokenFetch(['gmail', 'outlook', 'generic_smtp']);
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async () => ({ ok: true, statusCode: 200, attempts: 1 }),
        });
        assert.equal(result.sent && result.connectorType, 'gmail');
    } finally {
        restore();
    }
});

test('no configured connector — reports it instead of sending', async () => {
    const restore = mockTokenFetch([]);
    let invoked = false;
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async () => { invoked = true; return { ok: true, statusCode: 200 }; },
        });
        assert.equal(result.sent, false);
        assert.equal(invoked, false, 'must not dispatch when nothing is configured');
        assert.match(result.sent === false ? result.reason : '', /no email connector configured/);
    } finally {
        restore();
    }
});

test('connector failure surfaces the provider error, never throws', async () => {
    const restore = mockTokenFetch(['gmail']);
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async () => ({ ok: false, statusCode: 502, errorMessage: 'upstream refused' }),
        });
        assert.equal(result.sent, false);
        assert.match(result.sent === false ? result.reason : '', /upstream refused/);
    } finally {
        restore();
    }
});

test('a failed send is never retried against a second provider (no double-send)', async () => {
    const restore = mockTokenFetch(['gmail', 'outlook']);
    const attempted: string[] = [];
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async (i) => {
                attempted.push(i.connectorType);
                return { ok: false, statusCode: 504, errorMessage: 'timeout' };
            },
        });
        assert.equal(result.sent, false);
        assert.deepEqual(attempted, ['gmail'], 'a timeout may mean delivered — must not resend via outlook');
    } finally {
        restore();
    }
});

test('missing connector client or workspace context degrades instead of throwing', async () => {
    const noClient = await sendEmailViaConnector({ ...BASE, connectorClient: undefined });
    assert.equal(noClient.sent, false);

    const noWorkspace = await sendEmailViaConnector({
        ...BASE,
        workspaceId: undefined,
        connectorClient: async () => ({ ok: true, statusCode: 200 }),
    });
    assert.equal(noWorkspace.sent, false);
});

test('token resolution failure degrades to not-sent', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof globalThis.fetch;
    try {
        const result = await sendEmailViaConnector({
            ...BASE,
            connectorClient: async () => ({ ok: true, statusCode: 200 }),
        });
        assert.equal(result.sent, false);
    } finally {
        globalThis.fetch = original;
    }
});
