import test from 'node:test';
import assert from 'node:assert/strict';
import { getChatReplyMock, getChatReply } from './chat-service.js';

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(
    status: number,
    body: unknown,
): typeof globalThis.fetch {
    return async (_url, _init) =>
        ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        }) as Response;
}

// ── getChatReplyMock ─────────────────────────────────────────────────────────

test('getChatReplyMock: echoes the last user message', () => {
    const result = getChatReplyMock([
        { role: 'user', content: 'Hello' },
    ]);
    assert.equal(result.content, 'Echo: Hello');
});

test('getChatReplyMock: returns empty echo when no user message', () => {
    const result = getChatReplyMock([
        { role: 'system', content: 'You are an assistant.' },
    ]);
    assert.equal(result.content, 'Echo: ');
});

// ── getChatReply with provider=mock ─────────────────────────────────────────

test('getChatReply: delegates to mock when provider=mock', async () => {
    const result = await getChatReply({
        messages: [{ role: 'user', content: 'Hi from mock' }],
        tenantId: 'tenant_1',
        provider: 'mock',
    });
    assert.equal(result.content, 'Echo: Hi from mock');
});

// ── getChatReply with real provider ─────────────────────────────────────────

test('getChatReply: calls LLM and returns content', async () => {
    const fakeReply = { choices: [{ message: { content: 'World' } }] };

    // Monkey-patch global fetch for this test
    const original = globalThis.fetch;
    let capturedUrl = '';
    let capturedBody: unknown;

    globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body ?? '{}'));
        return {
            ok: true,
            status: 200,
            json: async () => fakeReply,
        } as Response;
    };

    try {
        const result = await getChatReply({
            messages: [{ role: 'user', content: 'Hello' }],
            tenantId: 'tenant_1',
            provider: 'openai',
            env: {
                LLM_BASE_URL: 'http://localhost:11434',
                LLM_API_KEY: 'test-key',
                LLM_MODEL: 'test-model',
            },
        });
        assert.equal(result.content, 'World');
        assert.ok(capturedUrl.includes('/chat/completions'));
        assert.ok(Array.isArray((capturedBody as { messages: unknown[] }).messages));
        const msgs = (capturedBody as { messages: { role: string }[] }).messages;
        assert.equal(msgs[0]?.role, 'system');
    } finally {
        globalThis.fetch = original;
    }
});

test('getChatReply: throws when upstream returns non-ok status', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
        ({ ok: false, status: 500, json: async () => ({}) }) as Response;

    try {
        await assert.rejects(
            () =>
                getChatReply({
                    messages: [{ role: 'user', content: 'x' }],
                    tenantId: 'tenant_1',
                    provider: 'openai',
                    env: { LLM_BASE_URL: 'http://localhost:11434', LLM_API_KEY: 'k', LLM_MODEL: 'm' },
                }),
            /LLM request failed/,
        );
    } finally {
        globalThis.fetch = original;
    }
});
