import assert from 'node:assert/strict';
import test from 'node:test';
import {
    proxyCreateSession,
    proxyGetSession,
    proxyJoinSession,
    proxyStopSession,
    proxyGetTranscript,
    proxySendChat,
} from './meeting-proxy-core';

const MA_URL = 'http://meeting-agent:7799';
const TOKEN = 'test-token';

const ok = (body: unknown, status = 200) =>
    ({ status, json: async () => body }) as unknown as Response;

const throws = async (): Promise<Response> => { throw new Error('network down'); };

// ── proxyCreateSession ────────────────────────────────────────────────────────

const validCreateBody = {
    tenantId: 't1', workspaceId: 'ws1', botId: 'bot1',
    platform: 'teams', mode: 'listen', meetingId: 'mtg1',
};

test('proxyCreateSession returns 403 when authHeader is null', async () => {
    const result = await proxyCreateSession({ authHeader: null, body: validCreateBody, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, { error: 'forbidden', message: 'Dashboard session required.' });
});

test('proxyCreateSession returns 400 when body is null', async () => {
    const result = await proxyCreateSession({ authHeader: 'Bearer x', body: null, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'Invalid JSON body.' });
});

test('proxyCreateSession returns 400 when a required field is missing', async () => {
    const { botId: _omit, ...bodyMissingBotId } = validCreateBody;
    const result = await proxyCreateSession({ authHeader: 'Bearer x', body: bodyMissingBotId, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'botId is required.' });
});

test('proxyCreateSession returns 400 when a required field is blank', async () => {
    const result = await proxyCreateSession({
        authHeader: 'Bearer x',
        body: { ...validCreateBody, platform: '   ' },
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
    });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'platform is required.' });
});

test('proxyCreateSession forwards to upstream with token header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const result = await proxyCreateSession({
        authHeader: 'Bearer session',
        body: validCreateBody,
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url, init) => {
            capturedUrl = String(url);
            capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
            return ok({ sessionId: 'ma-1' }, 201);
        }) as typeof fetch,
    });

    assert.equal(capturedUrl, 'http://meeting-agent:7799/v1/sessions');
    assert.equal(capturedHeaders['Authorization'], 'Bearer test-token');
    assert.equal(result.status, 201);
    assert.deepEqual(result.body, { sessionId: 'ma-1' });
});

test('proxyCreateSession omits Authorization header when token is empty', async () => {
    let capturedHeaders: Record<string, string> = {};

    await proxyCreateSession({
        authHeader: 'Bearer session',
        body: validCreateBody,
        meetingAgentUrl: MA_URL,
        meetingAgentToken: '',
        fetchImpl: (async (_url, init) => {
            capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
            return ok({});
        }) as typeof fetch,
    });

    assert.equal(capturedHeaders['Authorization'], undefined);
});

test('proxyCreateSession returns 502 when fetch throws', async () => {
    const result = await proxyCreateSession({
        authHeader: 'Bearer session',
        body: validCreateBody,
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' });
});

// ── proxyGetSession ───────────────────────────────────────────────────────────

test('proxyGetSession returns 403 when authHeader is null', async () => {
    const result = await proxyGetSession({ authHeader: null, maSessionId: 'ma-1', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
});

test('proxyGetSession returns 400 when maSessionId is blank', async () => {
    const result = await proxyGetSession({ authHeader: 'Bearer x', maSessionId: '  ', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'maSessionId is required.' });
});

test('proxyGetSession forwards to upstream and URL-encodes maSessionId', async () => {
    let capturedUrl = '';

    const result = await proxyGetSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma/session 1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url) => {
            capturedUrl = String(url);
            return ok({ state: 'active' });
        }) as typeof fetch,
    });

    assert.equal(capturedUrl, 'http://meeting-agent:7799/v1/sessions/ma%2Fsession%201');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { state: 'active' });
});

test('proxyGetSession returns 502 when fetch throws', async () => {
    const result = await proxyGetSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
});

// ── proxyJoinSession ──────────────────────────────────────────────────────────

test('proxyJoinSession returns 403 when authHeader is null', async () => {
    const result = await proxyJoinSession({ authHeader: null, maSessionId: 'ma-1', body: { meetingUrl: 'https://teams.example/m' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
});

test('proxyJoinSession returns 400 when maSessionId is blank', async () => {
    const result = await proxyJoinSession({ authHeader: 'Bearer x', maSessionId: '', body: { meetingUrl: 'https://teams.example/m' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'maSessionId is required.' });
});

test('proxyJoinSession returns 400 when meetingUrl is missing', async () => {
    const result = await proxyJoinSession({ authHeader: 'Bearer x', maSessionId: 'ma-1', body: {}, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'meetingUrl is required.' });
});

test('proxyJoinSession forwards body to upstream join endpoint', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    const result = await proxyJoinSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        body: { meetingUrl: 'https://teams.example/meeting', displayName: 'AgentBot' },
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url, init) => {
            capturedUrl = String(url);
            capturedBody = String(init?.body ?? '');
            return ok({ joined: true });
        }) as typeof fetch,
    });

    assert.equal(capturedUrl, 'http://meeting-agent:7799/v1/sessions/ma-1/join');
    assert.deepEqual(JSON.parse(capturedBody), { meetingUrl: 'https://teams.example/meeting', displayName: 'AgentBot' });
    assert.equal(result.status, 200);
});

test('proxyJoinSession returns 502 when fetch throws', async () => {
    const result = await proxyJoinSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        body: { meetingUrl: 'https://example.com' },
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
});

// ── proxyStopSession ──────────────────────────────────────────────────────────

test('proxyStopSession returns 403 when authHeader is null', async () => {
    const result = await proxyStopSession({ authHeader: null, maSessionId: 'ma-1', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
});

test('proxyStopSession returns 400 when maSessionId is blank', async () => {
    const result = await proxyStopSession({ authHeader: 'Bearer x', maSessionId: '', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
});

test('proxyStopSession posts to correct stop endpoint', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    const result = await proxyStopSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url, init) => {
            capturedUrl = String(url);
            capturedMethod = String(init?.method ?? '');
            return ok({ stopped: true });
        }) as typeof fetch,
    });

    assert.equal(capturedUrl, 'http://meeting-agent:7799/v1/sessions/ma-1/stop');
    assert.equal(capturedMethod, 'POST');
    assert.equal(result.status, 200);
});

test('proxyStopSession returns 502 when fetch throws', async () => {
    const result = await proxyStopSession({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
});

// ── proxyGetTranscript ────────────────────────────────────────────────────────

test('proxyGetTranscript returns 403 when authHeader is null', async () => {
    const result = await proxyGetTranscript({ authHeader: null, maSessionId: 'ma-1', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
});

test('proxyGetTranscript returns 400 when maSessionId is blank', async () => {
    const result = await proxyGetTranscript({ authHeader: 'Bearer x', maSessionId: '', meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
});

test('proxyGetTranscript returns transcript entries from upstream', async () => {
    const entries = [{ at: '2025-01-01T10:00:00Z', source: 'participant', speaker: 'Alice', text: 'Hello' }];

    const result = await proxyGetTranscript({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url) => {
            assert.equal(String(url), 'http://meeting-agent:7799/v1/sessions/ma-1/transcript');
            return ok(entries);
        }) as typeof fetch,
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, entries);
});

test('proxyGetTranscript returns 502 when fetch throws', async () => {
    const result = await proxyGetTranscript({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
});

// ── proxySendChat ─────────────────────────────────────────────────────────────

test('proxySendChat returns 403 when authHeader is null', async () => {
    const result = await proxySendChat({ authHeader: null, maSessionId: 'ma-1', body: { text: 'hi', handle: 'thread-1' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 403);
});

test('proxySendChat returns 400 when maSessionId is blank', async () => {
    const result = await proxySendChat({ authHeader: 'Bearer x', maSessionId: '', body: { text: 'hi', handle: 'thread-1' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'maSessionId is required.' });
});

test('proxySendChat returns 400 when text is missing', async () => {
    const result = await proxySendChat({ authHeader: 'Bearer x', maSessionId: 'ma-1', body: { handle: 'thread-1' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'text is required.' });
});

test('proxySendChat returns 400 when text is whitespace-only', async () => {
    const result = await proxySendChat({ authHeader: 'Bearer x', maSessionId: 'ma-1', body: { text: '   ', handle: 'thread-1' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'text is required.' });
});

test('proxySendChat returns 400 when handle is missing', async () => {
    const result = await proxySendChat({ authHeader: 'Bearer x', maSessionId: 'ma-1', body: { text: 'Hello' }, meetingAgentUrl: MA_URL, meetingAgentToken: TOKEN });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'invalid_request', message: 'handle is required (Teams: threadId, Zoom: meetingId).' });
});

test('proxySendChat forwards trimmed text and handle to upstream', async () => {
    let capturedBody = '';

    const result = await proxySendChat({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        body: { text: '  Hello team  ', handle: '  thread-abc  ' },
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: (async (url, init) => {
            assert.equal(String(url), 'http://meeting-agent:7799/v1/sessions/ma-1/chat');
            capturedBody = String(init?.body ?? '');
            return ok({ sent: true });
        }) as typeof fetch,
    });

    assert.deepEqual(JSON.parse(capturedBody), { text: 'Hello team', handle: 'thread-abc' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { sent: true });
});

test('proxySendChat returns 502 when fetch throws', async () => {
    const result = await proxySendChat({
        authHeader: 'Bearer session',
        maSessionId: 'ma-1',
        body: { text: 'Hello', handle: 'thread-1' },
        meetingAgentUrl: MA_URL,
        meetingAgentToken: TOKEN,
        fetchImpl: throws as typeof fetch,
    });
    assert.equal(result.status, 502);
});
