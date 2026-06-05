/**
 * Support Voice Session — WebSocket route tests.
 *
 * Spins up a real Fastify instance with a mocked getSession, then
 * connects with the ws library to test the voice session protocol.
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { WebSocket } from 'ws';
import { registerSupportVoiceSessionRoutes } from './support-voice-session.js';
import { issueStore } from './support-issue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

let server: ReturnType<typeof Fastify>;
let port: number;

const VALID_SESSION: SessionContext = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: [],
    expiresAt: Date.now() + 3_600_000,
};

function connectWs(p: number): Promise<{ ws: WebSocket; frames: string[] }> {
    return new Promise((resolve, reject) => {
        const frames: string[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${p}/v1/support/voice-session`);
        ws.on('open', () => resolve({ ws, frames }));
        ws.on('message', (data) => frames.push(data.toString()));
        ws.on('error', reject);
        setTimeout(() => reject(new Error('connectWs timeout')), 3_000);
    });
}

async function waitFrames(frames: string[], count: number, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (frames.length < count && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(frames.length >= count, `Expected ≥${count} frames, got ${frames.length}`);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
    server = Fastify();

    await registerSupportVoiceSessionRoutes(server, {
        getSession: (req) => {
            const cookie = req.headers?.cookie ?? '';
            if (cookie.includes('valid')) return VALID_SESSION;
            if (cookie.includes('expired')) return { ...VALID_SESSION, expiresAt: 0 };
            return null;
        },
        sarvamApiKey: '', // disable live Sarvam calls in tests
    });

    // Minimal GET route so Fastify is happy
    server.get('/health', async () => ({ ok: true }));

    await server.listen({ port: 0, host: '127.0.0.1' });
    port = (server.server.address() as { port: number }).port;
});

after(async () => {
    await server.close();
});

beforeEach(() => {
    issueStore.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('support-voice-session: rejects upgrade without session cookie → 401', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`);
    const code = await new Promise<number>((resolve) => {
        ws.on('close', (c) => resolve(c));
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        setTimeout(() => resolve(0), 2_000);
    });
    assert.equal(code, 401);
});

test('support-voice-session: rejects upgrade with expired session → 401', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
        headers: { cookie: 'session=expired' },
    });
    const code = await new Promise<number>((resolve) => {
        ws.on('close', (c) => resolve(c));
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        setTimeout(() => resolve(0), 2_000);
    });
    assert.equal(code, 401);
});

test('support-voice-session: sends connected frame with issueId on connect', async () => {
    const { ws, frames } = await connectWs(port).catch(() => {
        // Retry with valid cookie
        return new Promise<{ ws: WebSocket; frames: string[] }>((resolve, reject) => {
            const frameList: string[] = [];
            const client = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
                headers: { cookie: 'session=valid' },
            });
            client.on('open', () => resolve({ ws: client, frames: frameList }));
            client.on('message', (d) => frameList.push(d.toString()));
            client.on('error', reject);
        });
    });

    // Actually this test needs valid cookie — rewrite inline
    ws.close();

    const frames2: string[] = [];
    const ws2 = await new Promise<WebSocket>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
            headers: { cookie: 'session=valid' },
        });
        client.on('open', () => resolve(client));
        client.on('message', (d) => frames2.push(d.toString()));
        client.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3_000);
    });

    await waitFrames(frames2, 1);
    const frame = JSON.parse(frames2[0]!) as { type: string; issueId?: string };
    assert.equal(frame.type, 'connected');
    assert.ok(typeof frame.issueId === 'string' && frame.issueId.length > 0, 'issueId should be set');
    ws2.close();
});

test('support-voice-session: creates issue in issueStore on connect', async () => {
    assert.equal(issueStore.size, 0);

    const frames: string[] = [];
    const ws = await new Promise<WebSocket>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
            headers: { cookie: 'session=valid' },
        });
        client.on('open', () => resolve(client));
        client.on('message', (d) => frames.push(d.toString()));
        client.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3_000);
    });

    await waitFrames(frames, 1);
    assert.equal(issueStore.size, 1);
    const issue = [...issueStore.values()][0]!;
    assert.equal(issue.tenantId, VALID_SESSION.tenantId);
    ws.close();
});

test('support-voice-session: rejects text frames with error', async () => {
    const frames: string[] = [];
    const ws = await new Promise<WebSocket>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
            headers: { cookie: 'session=valid' },
        });
        client.on('open', () => resolve(client));
        client.on('message', (d) => frames.push(d.toString()));
        client.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3_000);
    });

    // Wait for connected frame
    await waitFrames(frames, 1);
    // Send a text frame (not supported)
    ws.send('hello text');
    await waitFrames(frames, 2, 3_000);

    const errFrame = JSON.parse(frames[1]!) as { type: string; text?: string };
    assert.equal(errFrame.type, 'error');
    ws.close();
});

test('support-voice-session: accepts binary audio frames without error', async () => {
    const frames: string[] = [];
    const ws = await new Promise<WebSocket>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${port}/v1/support/voice-session`, {
            headers: { cookie: 'session=valid' },
        });
        client.on('open', () => resolve(client));
        client.on('message', (d) => frames.push(d.toString()));
        client.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3_000);
    });

    await waitFrames(frames, 1);
    // Send binary audio — should not trigger an error frame
    ws.send(Buffer.from([0x00, 0x01, 0x02, 0xff]));
    // Brief wait — no extra frame should arrive
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(frames.length, 1, 'No error frame expected for binary audio');
    ws.close();
});
