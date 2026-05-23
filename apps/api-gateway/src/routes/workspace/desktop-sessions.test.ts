import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDesktopSessionsRoutes } from './desktop-sessions.js';

// ---------------------------------------------------------------------------
// Minimal mock upstream desktop-agent
// ---------------------------------------------------------------------------

type MockSession = { sessionId: string; status: string; streamUrl: string; createdAt: string };
type MockTask = { taskId: string; goal: string; status: string; result: null; stepCount: number; steps: never[] };

function buildMockAgent() {
    const sessions = new Map<string, MockSession>();
    const tasks = new Map<string, MockTask>();

    const app = Fastify({ logger: false });

    app.post('/v1/sessions', async (_req, reply) => {
        const id = `sid_${sessions.size + 1}`;
        const s: MockSession = {
            sessionId: id,
            status: 'idle',
            streamUrl: `http://localhost:6080/?autoconnect=1&session=${id}`,
            createdAt: new Date().toISOString(),
        };
        sessions.set(id, s);
        return reply.status(201).send(s);
    });

    app.get<{ Params: { id: string } }>('/v1/sessions/:id', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        return reply.send(s);
    });

    app.delete<{ Params: { id: string } }>('/v1/sessions/:id', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        sessions.delete(req.params.id);
        return reply.send({ deleted: true });
    });

    app.post<{ Params: { id: string }; Body: { goal: string } }>('/v1/sessions/:id/task', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        const taskId = `tid_${tasks.size + 1}`;
        const t: MockTask = {
            taskId,
            goal: req.body.goal,
            status: 'queued',
            result: null,
            stepCount: 0,
            steps: [],
        };
        tasks.set(`${req.params.id}:latest`, t);
        return reply.status(202).send(t);
    });

    app.get<{ Params: { id: string } }>('/v1/sessions/:id/task', async (req, reply) => {
        const t = tasks.get(`${req.params.id}:latest`);
        if (!t) return reply.status(404).send({ error: 'no task' });
        return reply.send(t);
    });

    return { app, sessions, tasks };
}

// A thin mock agent extension with join-meeting / speak / capture-audio handlers.
function buildMockAgentWithAudioRoutes() {
    const base = buildMockAgent();
    const { app, sessions } = base;

    // POST /v1/sessions/:id/join-meeting
    app.post<{ Params: { id: string } }>('/v1/sessions/:id/join-meeting', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        return reply.status(202).send({ joined: true });
    });

    // POST /v1/sessions/:id/speak
    app.post<{ Params: { id: string } }>('/v1/sessions/:id/speak', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        return reply.status(200).send({ played: true });
    });

    // POST /v1/sessions/:id/capture-audio
    app.post<{ Params: { id: string } }>('/v1/sessions/:id/capture-audio', async (req, reply) => {
        const s = sessions.get(req.params.id);
        if (!s) return reply.status(404).send({ error: 'not found' });
        return reply.status(200).send({ audioBase64: Buffer.from('fake-audio').toString('base64'), format: 'wav' });
    });

    return base;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSession = (tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

async function buildGateway(desktopAgentUrl: string) {
    const gw = Fastify({ logger: false });
    await registerDesktopSessionsRoutes(gw, {
        getSession: () => makeSession(),
        desktopAgentUrl,
    });
    await gw.ready();
    return gw;
}

async function buildGatewayNoAuth(desktopAgentUrl: string) {
    const gw = Fastify({ logger: false });
    await registerDesktopSessionsRoutes(gw, {
        getSession: () => null,
        desktopAgentUrl,
    });
    await gw.ready();
    return gw;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('desktop-sessions routes', () => {
    test('unauthenticated requests return 401', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGatewayNoAuth(`http://localhost:${port}`);

        const res = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions' });
        assert.equal(res.statusCode, 401);

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions creates a session (201)', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const res = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ sessionId: string; tenantId: string; status: string; streamUrl: string }>();
        assert.ok(body.sessionId.startsWith('sid_'));
        assert.equal(body.tenantId, 'tenant_1');
        assert.ok(typeof body.streamUrl === 'string');

        await mock.app.close();
        await gw.close();
    });

    test('GET /v1/desktop-sessions/:id returns session', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        // Create first
        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({ method: 'GET', url: `/v1/desktop-sessions/${sessionId}` });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ sessionId: string }>();
        assert.equal(body.sessionId, sessionId);

        await mock.app.close();
        await gw.close();
    });

    test('GET /v1/desktop-sessions/:id returns 404 for unknown session', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const res = await gw.inject({ method: 'GET', url: '/v1/desktop-sessions/nonexistent' });
        assert.equal(res.statusCode, 404);

        await mock.app.close();
        await gw.close();
    });

    test('DELETE /v1/desktop-sessions/:id terminates session', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const delRes = await gw.inject({ method: 'DELETE', url: `/v1/desktop-sessions/${sessionId}` });
        assert.equal(delRes.statusCode, 200);
        assert.deepEqual(delRes.json(), { deleted: true });

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/task submits goal (202)', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const taskRes = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/task`,
            payload: { goal: 'Open browser and navigate to github.com' },
        });
        assert.equal(taskRes.statusCode, 202);
        const body = taskRes.json<{ goal: string; status: string }>();
        assert.equal(body.goal, 'Open browser and navigate to github.com');
        assert.equal(body.status, 'queued');

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/task rejects missing goal (400)', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/task`,
            payload: {},
        });
        assert.equal(res.statusCode, 400);

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/task rejects empty goal (400)', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/task`,
            payload: { goal: '   ' },
        });
        assert.equal(res.statusCode, 400);

        await mock.app.close();
        await gw.close();
    });

    test('GET /v1/desktop-sessions/:id/task polls task status', async () => {
        const mock = buildMockAgent();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/task`,
            payload: { goal: 'Do something' },
        });

        const pollRes = await gw.inject({
            method: 'GET',
            url: `/v1/desktop-sessions/${sessionId}/task`,
        });
        assert.equal(pollRes.statusCode, 200);
        const body = pollRes.json<{ goal: string; steps: unknown[] }>();
        assert.equal(body.goal, 'Do something');
        assert.ok(Array.isArray(body.steps));

        await mock.app.close();
        await gw.close();
    });

    // -----------------------------------------------------------------------
    // join-meeting
    // -----------------------------------------------------------------------

    test('POST /v1/desktop-sessions/:id/join-meeting proxies to desktop-agent (202)', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        // Create a session first so the upstream recognises the ID
        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/join-meeting`,
            payload: { meetingUrl: 'https://meet.google.com/abc-def', platform: 'google_meet' },
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(res.json(), { joined: true });

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/join-meeting returns 400 when meetingUrl is missing', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/join-meeting`,
            payload: { platform: 'google_meet' }, // missing meetingUrl
        });
        assert.equal(res.statusCode, 400);

        await mock.app.close();
        await gw.close();
    });

    // -----------------------------------------------------------------------
    // speak
    // -----------------------------------------------------------------------

    test('POST /v1/desktop-sessions/:id/speak proxies audio to desktop-agent (200)', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/speak`,
            payload: { audioBase64: Buffer.from('wav-bytes').toString('base64'), format: 'wav' },
        });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { played: true });

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/speak returns 400 when audioBase64 is missing', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/speak`,
            payload: {}, // missing audioBase64
        });
        assert.equal(res.statusCode, 400);

        await mock.app.close();
        await gw.close();
    });

    // -----------------------------------------------------------------------
    // capture-audio
    // -----------------------------------------------------------------------

    test('POST /v1/desktop-sessions/:id/capture-audio returns audioBase64 (200)', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGateway(`http://localhost:${port}`);

        const createRes = await gw.inject({ method: 'POST', url: '/v1/desktop-sessions', payload: {} });
        const { sessionId } = createRes.json<{ sessionId: string }>();

        const res = await gw.inject({
            method: 'POST',
            url: `/v1/desktop-sessions/${sessionId}/capture-audio`,
            payload: { durationSeconds: 5 },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ audioBase64: string; format: string }>();
        assert.ok(typeof body.audioBase64 === 'string' && body.audioBase64.length > 0);
        assert.equal(body.format, 'wav');

        await mock.app.close();
        await gw.close();
    });

    test('POST /v1/desktop-sessions/:id/capture-audio is unauthenticated → 401', async () => {
        const mock = buildMockAgentWithAudioRoutes();
        await mock.app.listen({ port: 0 });
        const { port } = mock.app.server.address() as { port: number };
        const gw = await buildGatewayNoAuth(`http://localhost:${port}`);

        const res = await gw.inject({
            method: 'POST',
            url: '/v1/desktop-sessions/any-session/capture-audio',
            payload: {},
        });
        assert.equal(res.statusCode, 401);

        await mock.app.close();
        await gw.close();
    });
});
