/**
 * support-chat-session.test.ts
 *
 * Unit tests for the WebSocket chat-session route helpers.
 *
 * WebSocket upgrade tests require a live HTTP server — we use Node.js net sockets
 * to send a raw upgrade request, then inspect the response.
 *
 * The heavier orchestration (handleChatMessage) is tested via mocked
 * dispatchToSupportAgent responses verified through sendFrame behavior.
 *
 * All WebSocket protocol tests use the `ws` client library to connect
 * to the test server started with app.listen().
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { issueStore } from './support-issue.js';
import { registerSupportChatSessionRoutes, type ChatFrame } from './support-chat-session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = {
    userId: 'u1',
    tenantId: 'tenant_ws_test',
    workspaceIds: ['ws1'],
    expiresAt: Date.now() + 3_600_000,
};

const EXPIRED_SESSION = {
    userId: 'u2',
    tenantId: 'tenant_ws_test',
    workspaceIds: [],
    expiresAt: Date.now() - 1_000, // already expired
};

function connectWs(port: number, path = '/v1/support/chat-session'): Promise<{ ws: WebSocket; frames: ChatFrame[] }> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
        const frames: ChatFrame[] = [];
        ws.on('error', reject);
        ws.on('message', (data) => {
            try { frames.push(JSON.parse(data.toString()) as ChatFrame); } catch { /* ignore */ }
        });
        ws.on('open', () => resolve({ ws, frames }));
    });
}

function waitFrames(frames: ChatFrame[], count: number, timeoutMs = 3_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            if (frames.length >= count) { clearInterval(interval); clearTimeout(timer); resolve(); }
        }, 20);
        const timer = setTimeout(() => { clearInterval(interval); reject(new Error(`Timeout waiting for ${count} frames, got ${frames.length}`)); }, timeoutMs);
    });
}

function closeWs(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
        ws.once('close', () => resolve());
        ws.close();
    });
}

// ---------------------------------------------------------------------------
// Server setup — one authenticated server, one with a session that checks cookie
// ---------------------------------------------------------------------------

let appAuth: FastifyInstance;
let portAuth: number;

// Mock dispatch: for tests we need predictable responses.
// We point GATEWAY_BASE_URL to a small Fastify mock server.
let mockGateway: FastifyInstance;
let mockGatewayPort: number;

before(async () => {
    // Start a mock gateway that returns canned responses for /v1/runtime/actions/internal
    mockGateway = Fastify({ logger: false });
    mockGateway.post('/v1/runtime/actions/internal', async (req) => {
        const body = req.body as { actionType: string };
        if (body.actionType === 'agentfarm_support_diagnose') {
            return {
                ok: true,
                output: JSON.stringify({
                    tenantId: 'tenant_ws_test',
                    generatedAt: new Date().toISOString(),
                    summary: ['1 connector unhealthy'],
                    taskLogs: { status: 'ok', entries: [] },
                    otelTraces: { status: 'ok', spans: [] },
                    connectorHealth: { status: 'ok', connectors: [] },
                    approvalQueue: { status: 'ok' },
                    billing: { status: 'ok' },
                    provisioning: { status: 'ok' },
                    auditLog: { status: 'ok', entries: [] },
                }),
            };
        }
        if (body.actionType === 'agentfarm_support_config_fix') {
            return {
                ok: true,
                output: JSON.stringify({ applied: false, fixes: [{ type: 'no_fix_needed', ok: true }] }),
            };
        }
        if (body.actionType === 'agentfarm_support_chat_reply') {
            return {
                ok: true,
                output: JSON.stringify({ text: 'All looks good now.' }),
            };
        }
        return { ok: false, output: '', errorOutput: 'unknown action' };
    });
    await mockGateway.listen({ port: 0, host: '127.0.0.1' });
    const mockAddr = mockGateway.server.address();
    mockGatewayPort = typeof mockAddr === 'object' && mockAddr ? mockAddr.port : 0;

    // Start the real app with authenticated session
    appAuth = Fastify({ logger: false });
    await registerSupportChatSessionRoutes(appAuth, {
        getSession: () => SESSION,
        gatewayBaseUrl: `http://127.0.0.1:${mockGatewayPort}`,
        serviceToken: 'test-token',
    });
    await appAuth.listen({ port: 0, host: '127.0.0.1' });
    const addr = appAuth.server.address();
    portAuth = typeof addr === 'object' && addr ? addr.port : 0;

    issueStore.clear();
});

after(async () => {
    await appAuth.close();
    await mockGateway.close();
    issueStore.clear();
});

// ---------------------------------------------------------------------------
// Upgrade auth
// ---------------------------------------------------------------------------

describe('SupportChatSession — upgrade auth', () => {
    it('rejects upgrade to unknown path', async () => {
        // Connect to a different path — the upgrade handler destroys the socket
        await new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${portAuth}/v1/other-path`);
            ws.on('error', () => resolve()); // error expected — socket destroyed
            ws.on('unexpected-response', () => resolve());
            ws.on('close', () => resolve());
        });
    });

    it('rejects upgrade when session is expired', async () => {
        // Start a separate app with expired session
        const appExp = Fastify({ logger: false });
        await registerSupportChatSessionRoutes(appExp, {
            getSession: () => EXPIRED_SESSION,
            gatewayBaseUrl: `http://127.0.0.1:${mockGatewayPort}`,
            serviceToken: 'test',
        });
        await appExp.listen({ port: 0, host: '127.0.0.1' });
        const expAddr = appExp.server.address();
        const expPort = typeof expAddr === 'object' && expAddr ? expAddr.port : 0;

        await new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${expPort}/v1/support/chat-session`);
            ws.on('error', () => resolve());
            ws.on('unexpected-response', (_req, res) => {
                assert.equal(res.statusCode, 401);
                resolve();
            });
            ws.on('close', () => resolve());
        });

        await appExp.close();
    });

    it('rejects upgrade when session is null', async () => {
        const appNoAuth = Fastify({ logger: false });
        await registerSupportChatSessionRoutes(appNoAuth, {
            getSession: () => null,
            gatewayBaseUrl: `http://127.0.0.1:${mockGatewayPort}`,
            serviceToken: 'test',
        });
        await appNoAuth.listen({ port: 0, host: '127.0.0.1' });
        const noAuthAddr = appNoAuth.server.address();
        const noAuthPort = typeof noAuthAddr === 'object' && noAuthAddr ? noAuthAddr.port : 0;

        await new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${noAuthPort}/v1/support/chat-session`);
            ws.on('error', () => resolve());
            ws.on('unexpected-response', (_req, res) => {
                assert.equal(res.statusCode, 401);
                resolve();
            });
            ws.on('close', () => resolve());
        });

        await appNoAuth.close();
    });
});

// ---------------------------------------------------------------------------
// Connection + issue creation
// ---------------------------------------------------------------------------

describe('SupportChatSession — connection', () => {
    it('sends connected frame on connect', async () => {
        const { ws, frames } = await connectWs(portAuth);
        // Wait for connected frame (sent immediately on connect, before any message)
        await waitFrames(frames, 1);
        assert.equal(frames[0]!.type, 'connected');
        await closeWs(ws);
    });

    it('creates a new issue on first message and sends updated connected frame', async () => {
        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1); // initial connected frame

        ws.send(JSON.stringify({ type: 'message', text: 'Agents not starting' }));

        // Wait for: connected(with issueId) + at least one step frame
        await waitFrames(frames, 3, 5_000);

        const connectedWithId = frames.find((f) => f.type === 'connected' && f.issueId);
        assert.ok(connectedWithId, 'expected a connected frame with issueId');
        assert.ok(connectedWithId.issueId);

        // Issue should be in the store
        assert.ok(issueStore.has(connectedWithId.issueId));

        await closeWs(ws);
    });
});

// ---------------------------------------------------------------------------
// Message validation
// ---------------------------------------------------------------------------

describe('SupportChatSession — message validation', () => {
    it('sends error frame for invalid JSON', async () => {
        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send('not-json{{');
        await waitFrames(frames, 2, 2_000);
        const errFrame = frames.find((f) => f.type === 'error');
        assert.ok(errFrame, 'expected an error frame');

        await closeWs(ws);
    });

    it('sends error frame for missing text', async () => {
        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: '   ' }));
        await waitFrames(frames, 2, 2_000);
        const errFrame = frames.find((f) => f.type === 'error');
        assert.ok(errFrame, 'expected error frame for blank text');

        await closeWs(ws);
    });

    it('sends error frame for wrong message type', async () => {
        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send(JSON.stringify({ type: 'ping' }));
        await waitFrames(frames, 2, 2_000);
        assert.ok(frames.some((f) => f.type === 'error'));

        await closeWs(ws);
    });
});

// ---------------------------------------------------------------------------
// Full chat flow (diagnosis + reply)
// ---------------------------------------------------------------------------

describe('SupportChatSession — full chat flow', () => {
    it('streams step frames and ends with a reply frame', async () => {
        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: 'Why is billing throttled?' }));

        // Wait for at least: connected(issueId) + 2 step frames + reply
        await waitFrames(frames, 5, 8_000);

        assert.ok(frames.some((f) => f.type === 'step'), 'expected at least one step frame');
        assert.ok(frames.some((f) => f.type === 'reply'), 'expected a reply frame');

        const reply = frames.find((f) => f.type === 'reply');
        assert.ok(reply?.text, 'reply should have text');

        await closeWs(ws);
    });

    it('reuses an existing issue when issueId is provided', async () => {
        // Pre-seed an issue for this tenant
        issueStore.set('existing-1', {
            id: 'existing-1',
            tenantId: SESSION.tenantId,
            workspaceId: null,
            title: 'Pre-existing',
            description: 'old',
            status: 'open',
            severity: 'medium',
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
        });

        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: 'Follow-up question', issueId: 'existing-1' }));
        await waitFrames(frames, 3, 8_000);

        // Should NOT create a new issue
        assert.ok(issueStore.has('existing-1'), 'original issue should still exist');

        await closeWs(ws);
    });

    it('rejects message referencing another tenant\'s issue', async () => {
        issueStore.set('other-tenant-issue', {
            id: 'other-tenant-issue',
            tenantId: 'completely_different_tenant',
            workspaceId: null,
            title: 't',
            description: 'd',
            status: 'open',
            severity: 'low',
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
        });

        const { ws, frames } = await connectWs(portAuth);
        await waitFrames(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: 'steal data', issueId: 'other-tenant-issue' }));
        await waitFrames(frames, 2, 2_000);
        assert.ok(frames.some((f) => f.type === 'error'), 'expected Forbidden error frame');

        await closeWs(ws);
    });
});
