/**
 * support-ws-auth.test.ts
 *
 * Auth regression tests for the support WebSocket endpoints:
 *   - portal_session cookie accepted for both chat-session and voice-session upgrades
 *   - Missing / invalid session rejected with 401
 *   - ?issueId= query param resumes an existing issue on reconnect (chat + voice)
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { issueStore } from './support-issue.js';
import { registerSupportChatSessionRoutes } from './support-chat-session.js';
import { registerSupportVoiceSessionRoutes } from './support-voice-session.js';

// ---------------------------------------------------------------------------
// Shared session stubs
// ---------------------------------------------------------------------------

const VALID_SESSION = {
    userId: 'portal-u1',
    tenantId: 'portal-tenant-auth-test',
    workspaceIds: [],
    expiresAt: Date.now() + 3_600_000,
};

const PORTAL_TOKEN = 'test-portal-token-abc123';

/** Simulates portal_session cookie lookup — no DB required in tests. */
function makeGetPortalSession(tenantId = VALID_SESSION.tenantId) {
    return async (cookies: string) => {
        const item = cookies.split(';').map((v) => v.trim()).find((v) => v.startsWith('portal_session='));
        if (!item) return null;
        const token = decodeURIComponent(item.slice('portal_session='.length));
        if (token !== PORTAL_TOKEN) return null;
        return { userId: 'portal-u1', tenantId, workspaceIds: [], expiresAt: Date.now() + 3_600_000 };
    };
}

function waitForFrame(frames: string[], count: number, timeoutMs = 3_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const iv = setInterval(() => {
            if (frames.length >= count) { clearInterval(iv); clearTimeout(t); resolve(); }
        }, 20);
        const t = setTimeout(() => { clearInterval(iv); reject(new Error(`Timeout — got ${frames.length}/${count} frames`)); }, timeoutMs);
    });
}

// ---------------------------------------------------------------------------
// Chat-session WS auth
// ---------------------------------------------------------------------------

describe('support chat-session — portal_session auth', () => {
    let app: FastifyInstance;
    let port: number;

    before(async () => {
        app = Fastify({ logger: false });
        await registerSupportChatSessionRoutes(app, {
            getSession: () => null, // no agentfarm_session
            getPortalSession: makeGetPortalSession(),
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        });
        await app.listen({ port: 0, host: '127.0.0.1' });
        port = (app.server.address() as { port: number }).port;
        issueStore.clear();
    });

    after(async () => { await app.close(); issueStore.clear(); });

    it('accepts upgrade with valid portal_session cookie', async () => {
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/chat-session`, {
                headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
            });
            ws.on('open', () => { ws.close(); resolve(); });
            ws.on('unexpected-response', (_req, res) => reject(new Error(`Got ${res.statusCode}`)));
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });
    });

    it('rejects upgrade with missing portal_session — 401', async () => {
        const code = await new Promise<number>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/chat-session`);
            ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
            ws.on('close', (c) => resolve(c));
            setTimeout(() => resolve(0), 2_000);
        });
        assert.equal(code, 401);
    });

    it('rejects upgrade with invalid portal_session token — 401', async () => {
        const code = await new Promise<number>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/chat-session`, {
                headers: { cookie: 'portal_session=invalid-token-xyz' },
            });
            ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
            ws.on('close', (c) => resolve(c));
            setTimeout(() => resolve(0), 2_000);
        });
        assert.equal(code, 401);
    });

    it('resumes existing issue via ?issueId= query param', async () => {
        // Pre-seed an issue for this tenant
        issueStore.set('resume-chat-1', {
            id: 'resume-chat-1',
            tenantId: VALID_SESSION.tenantId,
            workspaceId: null,
            title: 'Pre-existing chat issue',
            description: 'test',
            status: 'open',
            severity: 'medium',
            source: 'operator',
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            prUrl: null, resolvedAt: null,
        });

        const frames: string[] = [];
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(
                `ws://127.0.0.1:${port}/v1/support/chat-session?issueId=resume-chat-1`,
                { headers: { cookie: `portal_session=${PORTAL_TOKEN}` } },
            );
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', async () => {
                await waitForFrame(frames, 1).catch(reject);
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        const connected = JSON.parse(frames[0]!) as { type: string; issueId?: string };
        assert.equal(connected.type, 'connected');
        assert.equal(connected.issueId, 'resume-chat-1', 'server should resume the existing issue');
    });

    it('does not resume an issue belonging to a different tenant', async () => {
        issueStore.set('other-tenant-chat', {
            id: 'other-tenant-chat',
            tenantId: 'completely-different',
            workspaceId: null,
            title: 't',
            description: 'd',
            status: 'open',
            severity: 'low',
            source: 'operator',
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            prUrl: null, resolvedAt: null,
        });

        const frames: string[] = [];
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(
                `ws://127.0.0.1:${port}/v1/support/chat-session?issueId=other-tenant-chat`,
                { headers: { cookie: `portal_session=${PORTAL_TOKEN}` } },
            );
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', async () => {
                await waitForFrame(frames, 1).catch(reject);
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        const connected = JSON.parse(frames[0]!) as { type: string; issueId?: string };
        assert.equal(connected.type, 'connected');
        // issueId must not be the other tenant's issue — server falls back to null (new issue on first msg)
        assert.notEqual(connected.issueId, 'other-tenant-chat');
    });
});

// ---------------------------------------------------------------------------
// Voice-session WS auth
// ---------------------------------------------------------------------------

describe('support voice-session — portal_session auth', () => {
    let app: FastifyInstance;
    let port: number;

    before(async () => {
        app = Fastify({ logger: false });
        await registerSupportVoiceSessionRoutes(app, {
            getSession: () => null,
            getPortalSession: makeGetPortalSession(),
            sarvamApiKey: '',
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        });
        await app.listen({ port: 0, host: '127.0.0.1' });
        port = (app.server.address() as { port: number }).port;
        issueStore.clear();
    });

    after(async () => { await app.close(); issueStore.clear(); });

    it('accepts upgrade with valid portal_session cookie', async () => {
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
                headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
            });
            ws.on('open', () => { ws.close(); resolve(); });
            ws.on('unexpected-response', (_req, res) => reject(new Error(`Got ${res.statusCode}`)));
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });
    });

    it('rejects upgrade with missing portal_session — 401', async () => {
        const code = await new Promise<number>((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`);
            ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
            ws.on('close', (c) => resolve(c));
            setTimeout(() => resolve(0), 2_000);
        });
        assert.equal(code, 401);
    });

    it('resumes existing issue via ?issueId= and sends back that issueId in connected frame', async () => {
        issueStore.set('resume-voice-1', {
            id: 'resume-voice-1',
            tenantId: VALID_SESSION.tenantId,
            workspaceId: null,
            title: 'Pre-existing voice issue',
            description: 'test',
            status: 'open',
            severity: 'medium',
            source: 'operator',
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            prUrl: null, resolvedAt: null,
        });

        const frames: string[] = [];
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(
                `ws://127.0.0.1:${port}/v1/support/voice-session?issueId=resume-voice-1`,
                { headers: { cookie: `portal_session=${PORTAL_TOKEN}` } },
            );
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', async () => {
                await waitForFrame(frames, 1).catch(reject);
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        const connected = JSON.parse(frames[0]!) as { type: string; issueId?: string };
        assert.equal(connected.type, 'connected');
        assert.equal(connected.issueId, 'resume-voice-1');
    });

    it('creates a new issue when no ?issueId= provided', async () => {
        const initialSize = issueStore.size;
        const frames: string[] = [];
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
                headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
            });
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', async () => {
                await waitForFrame(frames, 1).catch(reject);
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        const connected = JSON.parse(frames[0]!) as { type: string; issueId?: string };
        assert.equal(connected.type, 'connected');
        assert.ok(connected.issueId, 'should have created a new issue');
        assert.equal(issueStore.size, initialSize + 1, 'new issue should be in the store');

        const created = issueStore.get(connected.issueId!);
        assert.equal(created?.source, 'portal', 'issue created via portal_session should be source=portal');
    });
});

// ---------------------------------------------------------------------------
// `source` discriminator — issues created via agentfarm_session (operator)
// vs. portal_session (customer) must be tagged accordingly.
// ---------------------------------------------------------------------------

describe('support sessions — source discriminator', () => {
    let chatApp: FastifyInstance;
    let chatPort: number;
    let voiceApp: FastifyInstance;
    let voicePort: number;

    const OPERATOR_SESSION = {
        userId: 'operator-u1',
        tenantId: 'source-discriminator-tenant',
        workspaceIds: ['ws1'],
        expiresAt: Date.now() + 3_600_000,
    };

    before(async () => {
        chatApp = Fastify({ logger: false });
        await registerSupportChatSessionRoutes(chatApp, {
            getSession: () => OPERATOR_SESSION,
            getPortalSession: makeGetPortalSession(OPERATOR_SESSION.tenantId),
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        });
        await chatApp.listen({ port: 0, host: '127.0.0.1' });
        chatPort = (chatApp.server.address() as { port: number }).port;

        voiceApp = Fastify({ logger: false });
        await registerSupportVoiceSessionRoutes(voiceApp, {
            getSession: () => OPERATOR_SESSION,
            getPortalSession: makeGetPortalSession(OPERATOR_SESSION.tenantId),
            sarvamApiKey: '',
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        });
        await voiceApp.listen({ port: 0, host: '127.0.0.1' });
        voicePort = (voiceApp.server.address() as { port: number }).port;

        issueStore.clear();
    });

    after(async () => {
        await chatApp.close();
        await voiceApp.close();
        issueStore.clear();
    });

    it('tags chat issues created via agentfarm_session as source=operator', async () => {
        const frames: string[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${chatPort}/v1/support/chat-session`);
        await new Promise<void>((resolve, reject) => {
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });
        await waitForFrame(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: 'Operator-initiated ticket' }));
        await waitForFrame(frames, 2, 5_000);

        const parsed = frames.map((f) => JSON.parse(f) as { type: string; issueId?: string });
        const created = parsed.find((f) => f.type === 'connected' && f.issueId);
        assert.ok(created?.issueId, 'expected a connected frame with issueId');
        const issue = issueStore.get(created!.issueId!);
        assert.equal(issue?.source, 'operator', 'issue created via agentfarm_session should be source=operator');

        await new Promise<void>((resolve) => { ws.on('close', () => resolve()); ws.close(); });
    });

    it('tags chat issues created via portal_session as source=portal', async () => {
        const frames: string[] = [];
        // Force the portal_session fallback path by pretending agentfarm_session is absent —
        // re-register a server with getSession returning null, but reuse the same tenant.
        const portalOnlyApp = Fastify({ logger: false });
        await registerSupportChatSessionRoutes(portalOnlyApp, {
            getSession: () => null,
            getPortalSession: makeGetPortalSession(OPERATOR_SESSION.tenantId),
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        });
        await portalOnlyApp.listen({ port: 0, host: '127.0.0.1' });
        const portalPort = (portalOnlyApp.server.address() as { port: number }).port;

        const ws = new WebSocket(`ws://127.0.0.1:${portalPort}/v1/support/chat-session`, {
            headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
        });
        await new Promise<void>((resolve, reject) => {
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });
        await waitForFrame(frames, 1);

        ws.send(JSON.stringify({ type: 'message', text: 'Customer-initiated ticket' }));
        await waitForFrame(frames, 2, 5_000);

        const parsed = frames.map((f) => JSON.parse(f) as { type: string; issueId?: string });
        const created = parsed.find((f) => f.type === 'connected' && f.issueId);
        assert.ok(created?.issueId, 'expected a connected frame with issueId');
        const issue = issueStore.get(created!.issueId!);
        assert.equal(issue?.source, 'portal', 'issue created via portal_session should be source=portal');

        await new Promise<void>((resolve) => { ws.on('close', () => resolve()); ws.close(); });
        await portalOnlyApp.close();
    });

    it('tags voice issues created via agentfarm_session as source=operator', async () => {
        const frames: string[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${voicePort}/v1/support/voice-session`);
        await new Promise<void>((resolve, reject) => {
            ws.on('message', (d) => frames.push(d.toString()));
            ws.on('open', async () => {
                await waitForFrame(frames, 1).catch(reject);
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        const connected = JSON.parse(frames[0]!) as { type: string; issueId?: string };
        assert.ok(connected?.issueId, 'should have created a new issue');
        const issue = issueStore.get(connected!.issueId!);
        assert.equal(issue?.source, 'operator', 'issue created via agentfarm_session should be source=operator');
    });
});

// ---------------------------------------------------------------------------
// Duplicate registration guard — one client connection must not fan out into
// N stacked WebSocket wrappers (see CHAT_SESSION_WS_REGISTERED /
// VOICE_SESSION_WS_REGISTERED). Regression for: a single chat message
// producing dozens of `connected` frames with distinct issueIds and creating
// duplicate SupportIssue rows.
// ---------------------------------------------------------------------------

describe('support chat-session — duplicate registration guard', () => {
    let app: FastifyInstance;
    let port: number;

    before(async () => {
        app = Fastify({ logger: false });
        const registerOpts = {
            getSession: () => null,
            getPortalSession: makeGetPortalSession('dup-guard-tenant'),
            gatewayBaseUrl: 'http://127.0.0.1:1',
            serviceToken: 'test',
        };
        // Simulate the route module being registered more than once against the
        // same underlying HTTP server (e.g. duplicate plugin load / reload).
        await registerSupportChatSessionRoutes(app, registerOpts);
        await registerSupportChatSessionRoutes(app, registerOpts);
        await registerSupportChatSessionRoutes(app, registerOpts);
        await app.listen({ port: 0, host: '127.0.0.1' });
        port = (app.server.address() as { port: number }).port;
        issueStore.clear();
    });

    after(async () => { await app.close(); issueStore.clear(); });

    it('sends exactly one `connected` frame per physical connection', async () => {
        const frames: { type: string; issueId?: string }[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/chat-session`, {
            headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
        });
        await new Promise<void>((resolve, reject) => {
            ws.on('message', (d) => frames.push(JSON.parse(d.toString())));
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });

        // Give any stacked listeners a chance to fire their own `connected` frames.
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(
            frames.filter((f) => f.type === 'connected').length,
            1,
            'expected exactly one `connected` frame on connect — got duplicates from stacked listeners',
        );

        await new Promise<void>((resolve) => { ws.on('close', () => resolve()); ws.close(); });
    });

    it('creates exactly one SupportIssue for a single chat message', async () => {
        const initialSize = issueStore.size;
        const frames: { type: string; issueId?: string }[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/chat-session`, {
            headers: { cookie: `portal_session=${PORTAL_TOKEN}` },
        });
        await new Promise<void>((resolve, reject) => {
            ws.on('message', (d) => frames.push(JSON.parse(d.toString())));
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout')), 3_000);
        });
        // Wait for the initial `connected` frame before sending a message.
        await new Promise((r) => setTimeout(r, 200));

        ws.send(JSON.stringify({ type: 'message', text: 'My dashboard will not load' }));

        // Wait for the new-issue `connected` frame plus the agent reply.
        await new Promise((r) => setTimeout(r, 800));

        const connectedFrames = frames.filter((f) => f.type === 'connected' && f.issueId);
        const distinctIssueIds = new Set(connectedFrames.map((f) => f.issueId));
        assert.equal(distinctIssueIds.size, 1, `expected one distinct issueId, got: ${[...distinctIssueIds].join(', ')}`);
        assert.equal(issueStore.size, initialSize + 1, 'expected exactly one new SupportIssue to be created');

        await new Promise<void>((resolve) => { ws.on('close', () => resolve()); ws.close(); });
    });
});
