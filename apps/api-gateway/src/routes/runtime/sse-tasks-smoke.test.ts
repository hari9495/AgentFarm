/**
 * SSE smoke test — exercises the full GET /sse/tasks stream round-trip.
 *
 * Strategy: push an event into the buffer via POST /sse/tasks/push, then open
 * a real HTTP SSE connection. The route replays all buffered events immediately
 * on connect, so the event arrives without needing the 25-second heartbeat.
 *
 * app.inject() cannot be used for the streaming GET because the handler awaits
 * socket close, keeping the connection open indefinitely. A real HTTP connection
 * using node:http is used instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Fastify from 'fastify';
import {
    SseTaskQueue,
    channelKey,
    registerSseTaskRoutes,
    sseQueues,
} from './sse-tasks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildSmokeApp() {
    sseQueues.clear();
    const testQueues = new Map<string, SseTaskQueue>();

    const app = Fastify({ logger: false });
    await registerSseTaskRoutes(app, {
        // Return a fresh session on every call so expiresAt is always in the future.
        getSession: () => ({
            userId: 'user_smoke',
            tenantId: 'tenant_smoke',
            workspaceIds: ['ws_smoke'],
            scope: 'internal' as const,
            expiresAt: Date.now() + 60_000,
        }),
        getQueue: (tenantId: string, workspaceId: string) => {
            const key = channelKey(tenantId, workspaceId);
            let q = testQueues.get(key);
            if (!q) {
                q = new SseTaskQueue();
                testQueues.set(key, q);
            }
            return q;
        },
    });
    return app;
}

/**
 * Open a real HTTP SSE connection and collect data until:
 *   - at least one complete SSE event block is received (data contains '\n\n'), OR
 *   - the timeout fires.
 *
 * Resolves with the accumulated raw SSE bytes.
 * Rejects on timeout or unexpected connection error.
 */
function collectSseEvents(
    port: number,
    path: string,
    timeoutMs: number,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let settled = false;
        let data = '';

        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutHandle);
            if (err) reject(err);
            else resolve(data);
        };

        const timeoutHandle = setTimeout(() => {
            req.destroy();
            finish(new Error(`SSE: no complete event received within ${timeoutMs}ms`));
        }, timeoutMs);

        const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            res.on('data', (chunk: Buffer) => {
                data += chunk.toString();
                // A blank line separates SSE events; stop once the first one arrives.
                if (data.includes('\n\n')) {
                    req.destroy();
                    finish();
                }
            });

            res.on('error', (err: NodeJS.ErrnoException) => {
                // ECONNRESET is expected when we call req.destroy()
                if (err.code !== 'ECONNRESET') {
                    finish(err);
                }
            });
        });

        req.on('error', (err: NodeJS.ErrnoException) => {
            // ECONNRESET is expected after req.destroy(); silence it if already settled.
            if (err.code !== 'ECONNRESET') {
                finish(err);
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SSE smoke: buffered event is replayed to a new SSE connection within 5 seconds', async (t) => {
    const app = await buildSmokeApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };

    t.after(async () => {
        await app.close();
    });

    // ── Step 1: push an event into the buffer ────────────────────────────────
    // app.inject works fine for the non-streaming POST endpoint.
    const pushRes = await app.inject({
        method: 'POST',
        url: '/sse/tasks/push',
        payload: {
            tenantId: 'tenant_smoke',
            workspaceId: 'ws_smoke',
            type: 'task_queued',
            taskId: 'smoke_task_1',
        },
    });
    assert.equal(pushRes.statusCode, 200, 'push should return 200');

    const pushBody = JSON.parse(pushRes.body) as { eventId: string };
    assert.equal(pushBody.eventId, '1', 'first pushed event should have eventId "1"');

    // ── Step 2: open a real HTTP SSE connection ───────────────────────────────
    // The GET handler replays all buffered events immediately on connect, so
    // the pushed event arrives without waiting for the 25-second heartbeat.
    const rawSse = await collectSseEvents(
        port,
        '/sse/tasks?workspaceId=ws_smoke',
        5_000,
    );

    // ── Step 3: assert SSE event content ─────────────────────────────────────
    assert.ok(
        rawSse.includes('event: task_queued'),
        `Expected "event: task_queued" in SSE stream.\nActual:\n${rawSse}`,
    );
    assert.ok(
        rawSse.includes('"taskId":"smoke_task_1"'),
        `Expected taskId in event payload.\nActual:\n${rawSse}`,
    );
    assert.ok(
        rawSse.includes('id: 1'),
        `Expected "id: 1" (eventId) in SSE frame.\nActual:\n${rawSse}`,
    );
});

test('SSE smoke: GET /sse/tasks returns 401 when no session', async (t) => {
    sseQueues.clear();
    const app = Fastify({ logger: false });
    await registerSseTaskRoutes(app, {
        getSession: () => null,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };

    t.after(async () => {
        await app.close();
    });

    const statusCode = await new Promise<number>((resolve, reject) => {
        const req = http.get(
            `http://127.0.0.1:${port}/sse/tasks?workspaceId=ws_smoke`,
            (res) => resolve(res.statusCode ?? 0),
        );
        req.on('error', reject);
    });

    assert.equal(statusCode, 401, 'should return 401 for unauthenticated request');
});

test('SSE smoke: multiple pushed events are all replayed in order', async (t) => {
    const app = await buildSmokeApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };

    t.after(async () => {
        await app.close();
    });

    const types: Array<'task_queued' | 'task_started' | 'task_completed'> = [
        'task_queued',
        'task_started',
        'task_completed',
    ];

    for (const type of types) {
        await app.inject({
            method: 'POST',
            url: '/sse/tasks/push',
            payload: { tenantId: 'tenant_smoke', workspaceId: 'ws_smoke', type },
        });
    }

    // Increase timeout slightly to accommodate 3 replayed events
    let rawSse = '';
    rawSse = await new Promise<string>((resolve, reject) => {
        let settled = false;
        let data = '';
        const chunks: number[] = [];

        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutHandle);
            if (err) reject(err);
            else resolve(data);
        };

        const timeoutHandle = setTimeout(() => {
            req.destroy();
            finish(new Error('SSE: timed out waiting for 3 events'));
        }, 5_000);

        const req = http.get(
            `http://127.0.0.1:${port}/sse/tasks?workspaceId=ws_smoke`,
            (res) => {
                res.on('data', (chunk: Buffer) => {
                    data += chunk.toString();
                    // Count complete SSE event blocks
                    chunks.push(...(data.match(/\n\n/g) ?? []).map(() => 1));
                    const eventCount = (data.match(/^event:/gm) ?? []).length;
                    if (eventCount >= 3) {
                        req.destroy();
                        finish();
                    }
                });
                res.on('error', (err: NodeJS.ErrnoException) => {
                    if (err.code !== 'ECONNRESET') finish(err);
                });
            },
        );

        req.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'ECONNRESET') finish(err);
        });
    });

    assert.ok(rawSse.includes('event: task_queued'), 'should contain task_queued');
    assert.ok(rawSse.includes('event: task_started'), 'should contain task_started');
    assert.ok(rawSse.includes('event: task_completed'), 'should contain task_completed');

    // Events should arrive in order: queued before started before completed
    const queuedPos = rawSse.indexOf('event: task_queued');
    const startedPos = rawSse.indexOf('event: task_started');
    const completedPos = rawSse.indexOf('event: task_completed');
    assert.ok(queuedPos < startedPos, 'task_queued should precede task_started');
    assert.ok(startedPos < completedPos, 'task_started should precede task_completed');
});
