import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskProgressEvent } from '@agentfarm/shared-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEvent = (overrides: Partial<TaskProgressEvent> = {}): TaskProgressEvent => ({
    id: 'evt-1',
    contractVersion: '1.0.0',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    taskId: 'task-1',
    botId: 'bot-1',
    milestone: 'task_received',
    detail: 'Starting close-out for task',
    occurredAt: '2026-05-10T00:00:00.000Z',
    correlationId: 'corr-1',
    ...overrides,
});

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchShouldThrow = false;

// Replace global fetch with a controllable mock
const originalFetch = globalThis.fetch;

beforeEach(() => {
    fetchCalls = [];
    fetchShouldThrow = false;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
        if (fetchShouldThrow) throw new Error('network error');
        fetchCalls.push({ url, init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    delete process.env['SSE_PUSH_URL'];
    delete process.env['SSE_INTERNAL_TOKEN'];
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('publishTaskProgress calls fetch with correct URL and body', async () => {
    const { publishTaskProgress } = await import('../task-progress-publisher.js');
    const event = makeEvent();

    await publishTaskProgress('ws-1', event);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]!.url, 'http://localhost:3000/sse/tasks/push');

    const body = JSON.parse(fetchCalls[0]!.init?.body as string) as {
        workspaceId: string;
        event: TaskProgressEvent;
    };
    assert.equal(body.workspaceId, 'ws-1');
    assert.equal(body.event.taskId, 'task-1');
    assert.equal(body.event.milestone, 'task_received');
});

test('publishTaskProgress uses SSE_PUSH_URL env var when set', async () => {
    process.env['SSE_PUSH_URL'] = 'http://internal-gateway:4000/sse/tasks/push';
    const { publishTaskProgress } = await import('../task-progress-publisher.js');

    await publishTaskProgress('ws-2', makeEvent({ taskId: 'task-2' }));

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]!.url, 'http://internal-gateway:4000/sse/tasks/push');
});

test('publishTaskProgress swallows fetch errors without throwing', async () => {
    fetchShouldThrow = true;
    const { publishTaskProgress } = await import('../task-progress-publisher.js');

    // Must resolve, never reject
    await assert.doesNotReject(async () => {
        await publishTaskProgress('ws-1', makeEvent());
    });
    // No successful fetch calls
    assert.equal(fetchCalls.length, 0);
});

test('publishTaskProgress skips fetch when SSE_PUSH_URL is empty string', async () => {
    process.env['SSE_PUSH_URL'] = '';
    const { publishTaskProgress } = await import('../task-progress-publisher.js');

    await publishTaskProgress('ws-1', makeEvent());

    assert.equal(fetchCalls.length, 0);
});

test('published body contains workspaceId and event fields', async () => {
    const { publishTaskProgress } = await import('../task-progress-publisher.js');
    const event = makeEvent({ milestone: 'completed', detail: 'Task done' });

    await publishTaskProgress('ws-42', event);

    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0]!.init?.body as string) as {
        workspaceId: string;
        event: TaskProgressEvent;
    };
    assert.equal(body.workspaceId, 'ws-42');
    assert.equal(body.event.milestone, 'completed');
    assert.equal(body.event.detail, 'Task done');
    assert.equal(body.event.contractVersion, '1.0.0');
});

test('publishTaskProgress includes x-internal-token header when SSE_INTERNAL_TOKEN is set', async () => {
    process.env['SSE_INTERNAL_TOKEN'] = 'secret-token';
    const { publishTaskProgress } = await import('../task-progress-publisher.js');

    await publishTaskProgress('ws-1', makeEvent());

    assert.equal(fetchCalls.length, 1);
    const headers = fetchCalls[0]!.init?.headers as Record<string, string>;
    assert.equal(headers['x-internal-token'], 'secret-token');
});
