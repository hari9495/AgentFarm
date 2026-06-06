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
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
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
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
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
            tierReached: null,
            fixApplied: false,
            diagnosisReport: null,
            resolutionNotes: null,
            escalatedTo: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
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
    });
});
