import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MeetingBrain, DEFAULT_BRAIN_SYSTEM_PROMPT } from './meeting-brain.js';
import type { BrainTurn } from './meeting-brain.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fetch stub that returns the given OpenAI-compatible response body. */
function makeOpenAiFetch(content: string): typeof fetch {
    return async () =>
        ({
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content } }],
            }),
        }) as unknown as Response;
}

/** Build a fetch stub that returns the given Anthropic response body. */
function makeAnthropicFetch(text: string): typeof fetch {
    return async () =>
        ({
            ok: true,
            status: 200,
            json: async () => ({
                content: [{ text }],
            }),
        }) as unknown as Response;
}

/** Build a fetch stub that returns an HTTP error. */
function makeErrorFetch(status: number): typeof fetch {
    return async () =>
        ({
            ok: false,
            status,
            json: async () => ({}),
        }) as unknown as Response;
}

// Capture the outbound request body sent to the mock fetch.
function makeCapturingFetch(
    content: string,
): { fetchImpl: typeof fetch; getBody: () => unknown } {
    let captured: unknown;
    const fetchImpl: typeof fetch = async (_url, init) => {
        captured = JSON.parse((init?.body as string) ?? '{}');
        return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content } }] }),
        } as unknown as Response;
    };
    return { fetchImpl, getBody: () => captured };
}

// ── Constructor validation ────────────────────────────────────────────────────

describe('MeetingBrain constructor', () => {
    it('throws when apiKey is empty', () => {
        assert.throws(
            () => new MeetingBrain({ provider: 'openai', apiKey: '' }),
            /apiKey is required/u,
        );
    });

    it('accepts a minimal openai config', () => {
        assert.doesNotThrow(
            () => new MeetingBrain({ provider: 'openai', apiKey: 'sk-test' }),
        );
    });

    it('accepts a minimal anthropic config', () => {
        assert.doesNotThrow(
            () => new MeetingBrain({ provider: 'anthropic', apiKey: 'sk-ant-test' }),
        );
    });
});

// ── OpenAI path ───────────────────────────────────────────────────────────────

describe('MeetingBrain.think() — OpenAI provider', () => {
    it('returns the LLM reply when content is non-empty', async () => {
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl: makeOpenAiFetch('Hello from the agent!'),
        });
        const reply = await brain.think([{ role: 'user', text: 'Hi' }]);
        assert.equal(reply, 'Hello from the agent!');
    });

    it('returns null when LLM returns an empty string (silence)', async () => {
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl: makeOpenAiFetch(''),
        });
        const reply = await brain.think([{ role: 'user', text: 'random chatter' }]);
        assert.equal(reply, null);
    });

    it('returns null when LLM returns whitespace only', async () => {
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl: makeOpenAiFetch('   \n  '),
        });
        const reply = await brain.think([]);
        assert.equal(reply, null);
    });

    it('throws when the LLM endpoint returns an HTTP error', async () => {
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl: makeErrorFetch(500),
        });
        await assert.rejects(brain.think([{ role: 'user', text: 'test' }]), /HTTP 500/u);
    });

    it('sends the system prompt and conversation history to the LLM', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('Got it');
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl,
        });
        const history: BrainTurn[] = [
            { role: 'user', text: 'Can you summarise the agenda?', speaker: 'Alice' },
            { role: 'assistant', text: 'Sure, here is the agenda.' },
        ];
        await brain.think(history);
        const body = getBody() as {
            messages: Array<{ role: string; content: string }>;
        };
        assert.equal(body.messages[0]?.role, 'system');
        assert.ok((body.messages[0]?.content ?? '').length > 0);
        assert.equal(body.messages[1]?.role, 'user');
        assert.ok((body.messages[1]?.content ?? '').includes('Alice'));
        assert.equal(body.messages[2]?.role, 'assistant');
    });

    it('prefixes content with speaker name when speaker is set', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('reply');
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl,
        });
        await brain.think([{ role: 'user', text: 'Hello', speaker: 'Bob' }]);
        const body = getBody() as { messages: Array<{ content: string }> };
        const userMsg = body.messages.find((m: { content: string }) => m.content.includes('Bob'));
        assert.ok(userMsg, 'expected a message with speaker name Bob');
        assert.ok(userMsg!.content.startsWith('Bob: Hello'));
    });

    it('omits speaker prefix when speaker is undefined', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('reply');
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'sk-test',
            fetchImpl,
        });
        await brain.think([{ role: 'user', text: 'Just some text' }]);
        const body = getBody() as { messages: Array<{ content: string }> };
        const userMsg = body.messages.find((m: { content: string }) => m.content === 'Just some text');
        assert.ok(userMsg, 'expected raw content without speaker prefix');
    });

    it('uses gpt-4o-mini as the default model', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('ok');
        const brain = new MeetingBrain({ provider: 'openai', apiKey: 'k', fetchImpl });
        await brain.think([]);
        const body = getBody() as { model: string };
        assert.equal(body.model, 'gpt-4o-mini');
    });

    it('uses the caller-supplied model override', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('ok');
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'k',
            model: 'gpt-4o',
            fetchImpl,
        });
        await brain.think([]);
        const body = getBody() as { model: string };
        assert.equal(body.model, 'gpt-4o');
    });

    it('uses the caller-supplied system prompt override', async () => {
        const { fetchImpl, getBody } = makeCapturingFetch('ok');
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'k',
            systemPrompt: 'Custom instructions.',
            fetchImpl,
        });
        await brain.think([]);
        const body = getBody() as { messages: Array<{ role: string; content: string }> };
        const sys = body.messages.find((m) => m.role === 'system');
        assert.equal(sys?.content, 'Custom instructions.');
    });

    it('sends to the default OpenAI base URL when none supplied', async () => {
        let capturedUrl = '';
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'k',
            fetchImpl: async (url, _init) => {
                capturedUrl = url as string;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
                } as unknown as Response;
            },
        });
        await brain.think([]);
        assert.ok(capturedUrl.startsWith('https://api.openai.com/v1'), `unexpected URL: ${capturedUrl}`);
    });

    it('strips trailing slashes from a custom baseUrl', async () => {
        let capturedUrl = '';
        const brain = new MeetingBrain({
            provider: 'openai',
            apiKey: 'k',
            baseUrl: 'https://custom.example.com/v1///',
            fetchImpl: async (url, _init) => {
                capturedUrl = url as string;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
                } as unknown as Response;
            },
        });
        await brain.think([]);
        assert.ok(
            capturedUrl.startsWith('https://custom.example.com/v1/chat'),
            `unexpected URL: ${capturedUrl}`,
        );
    });
});

// ── Anthropic path ────────────────────────────────────────────────────────────

describe('MeetingBrain.think() — Anthropic provider', () => {
    it('returns the LLM reply when content is non-empty', async () => {
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'sk-ant-test',
            fetchImpl: makeAnthropicFetch('I can help with that.'),
        });
        const reply = await brain.think([{ role: 'user', text: 'Please help me.' }]);
        assert.equal(reply, 'I can help with that.');
    });

    it('returns null when Anthropic returns empty text', async () => {
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'sk-ant-test',
            fetchImpl: makeAnthropicFetch(''),
        });
        const reply = await brain.think([{ role: 'user', text: 'whatever' }]);
        assert.equal(reply, null);
    });

    it('throws when Anthropic returns an HTTP error', async () => {
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'sk-ant-test',
            fetchImpl: makeErrorFetch(401),
        });
        await assert.rejects(brain.think([]), /HTTP 401/u);
    });

    it('sends to /v1/messages endpoint with anthropic-version header', async () => {
        let capturedUrl = '';
        let capturedHeaders: Record<string, string> = {};
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'sk-ant-test',
            fetchImpl: async (url, init) => {
                capturedUrl = url as string;
                capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ content: [{ text: 'ok' }] }),
                } as unknown as Response;
            },
        });
        await brain.think([{ role: 'user', text: 'hi' }]);
        assert.ok(capturedUrl.endsWith('/v1/messages'), `unexpected URL: ${capturedUrl}`);
        assert.ok(capturedHeaders['anthropic-version'], 'anthropic-version header missing');
    });

    it('passes system prompt as a top-level field, not in messages', async () => {
        let capturedBody: unknown;
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'sk-ant-test',
            fetchImpl: async (_url, init) => {
                capturedBody = JSON.parse((init?.body as string) ?? '{}');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ content: [{ text: 'ok' }] }),
                } as unknown as Response;
            },
        });
        await brain.think([{ role: 'user', text: 'hi' }]);
        const body = capturedBody as { system: string; messages: unknown[] };
        assert.equal(body.system, DEFAULT_BRAIN_SYSTEM_PROMPT);
        const hasSystemRole = (body.messages as Array<{ role: string }>).some(
            (m) => m.role === 'system',
        );
        assert.equal(hasSystemRole, false, 'system role must not appear in Anthropic messages array');
    });

    it('uses claude-sonnet-4-6 as the default model', async () => {
        let capturedBody: unknown;
        const brain = new MeetingBrain({
            provider: 'anthropic',
            apiKey: 'k',
            fetchImpl: async (_url, init) => {
                capturedBody = JSON.parse((init?.body as string) ?? '{}');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ content: [{ text: 'ok' }] }),
                } as unknown as Response;
            },
        });
        await brain.think([]);
        assert.equal((capturedBody as { model: string }).model, 'claude-sonnet-4-6');
    });
});
