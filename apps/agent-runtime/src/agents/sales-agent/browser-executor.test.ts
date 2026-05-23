/**
 * browser-executor.test.ts — unit tests using node:test + node:assert/strict
 *
 * Strategy:
 *  - Mock globalThis.fetch to control browser-agent HTTP responses
 *  - Inject PrismaStub via the optional prisma argument
 *  - Verify: disabled gate, happy-path, fetch-throws path, no-DB path
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// ---- isolate env ----------------------------------------------------------
process.env['BROWSER_AGENT_URL'] = 'http://test-browser-agent:5002';

// Dynamic import after env is set
const { runBrowserTask } = await import('./browser-executor.js');

// ---- helpers ----------------------------------------------------------------

interface PrismaStub {
    browserTask: {
        created: unknown[];
        updated: unknown[];
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>;
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        created: unknown[];
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesAgentConfig: {
        findFirst: () => Promise<null>;
    };
}

function makePrismaStub(taskId = 'bt-abc123'): PrismaStub {
    const stub: PrismaStub = {
        browserTask: {
            created: [],
            updated: [],
            create: async (args) => {
                stub.browserTask.created.push(args);
                return { id: taskId };
            },
            update: async (args) => {
                stub.browserTask.updated.push(args);
                return { id: taskId };
            },
            findUnique: async () => null,
        },
        salesActivity: {
            created: [],
            create: async (args) => {
                stub.salesActivity.created.push(args);
                return { id: 'act-1' };
            },
        },
        salesAgentConfig: {
            findFirst: async () => null,
        },
    };
    return stub;
}

const baseRequest = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    goal: 'Find the pricing page of example.com',
    prospectId: 'prospect-1',
};

const enabledConfig = {
    id: 'cfg-1',
    tenantId: 'tenant-1',
    botId: 'bot-1',
    browserEnabled: true,
    browserAllowedDomains: 'example.com',
} as unknown as import('@agentfarm/shared-types').SalesAgentConfigRecord;

const disabledConfig = {
    ...enabledConfig,
    browserEnabled: false,
} as unknown as import('@agentfarm/shared-types').SalesAgentConfigRecord;

const successAgentResponse = {
    task_id: 'bt-abc123',
    status: 'completed',
    steps: [
        { action: 'navigate', target: 'https://example.com', ok: true, timestamp: new Date().toISOString(), durationMs: 340 },
        { action: 'extract', target: 'body', ok: true, timestamp: new Date().toISOString(), durationMs: 120 },
    ],
    result: 'Pricing starts at $99/month.',
    error: null,
    duration_ms: 460,
};

// Save and restore original fetch
const _originalFetch = globalThis.fetch;

after(() => {
    globalThis.fetch = _originalFetch;
});

// ---- tests ------------------------------------------------------------------

test('returns failed record immediately when browserEnabled=false', async () => {
    const result = await runBrowserTask(baseRequest, disabledConfig, undefined);

    assert.equal(result.status, 'failed');
    assert.ok(result.errorMessage?.includes('browser_disabled'), `expected browser_disabled in errorMessage, got: ${result.errorMessage}`);
    assert.equal(result.steps.length, 0);
    assert.equal(result.tenantId, 'tenant-1');
    assert.equal(result.botId, 'bot-1');
    assert.equal(result.goal, baseRequest.goal);
});

test('does NOT call fetch when browserEnabled=false', async () => {
    let fetchCalled = false;
    (globalThis as Record<string, unknown>)['fetch'] = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => successAgentResponse } as unknown as Response;
    };

    await runBrowserTask(baseRequest, disabledConfig, undefined);
    assert.equal(fetchCalled, false, 'fetch should not be called when browserEnabled=false');

    globalThis.fetch = _originalFetch;
});

test('happy path: completed task returned with steps and result', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = async () => ({
        ok: true,
        json: async () => successAgentResponse,
    } as unknown as Response);

    const prisma = makePrismaStub('bt-abc123');
    const result = await runBrowserTask(baseRequest, enabledConfig, prisma as unknown as import('@prisma/client').PrismaClient);

    assert.equal(result.status, 'completed');
    assert.equal(result.steps.length, 2);
    assert.equal(result.result, 'Pricing starts at $99/month.');
    assert.equal(result.errorMessage, null);
    assert.equal(result.tenantId, 'tenant-1');

    // DB record created
    assert.equal(prisma.browserTask.created.length, 1);
    // DB record updated with final status
    assert.equal(prisma.browserTask.updated.length, 1);
    const update = prisma.browserTask.updated[0] as { data: Record<string, unknown> };
    assert.equal(update.data['status'], 'completed');

    globalThis.fetch = _originalFetch;
});

test('logs SalesActivity when prospectId is set', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = async () => ({
        ok: true,
        json: async () => successAgentResponse,
    } as unknown as Response);

    const prisma = makePrismaStub('bt-abc123');
    await runBrowserTask(baseRequest, enabledConfig, prisma as unknown as import('@prisma/client').PrismaClient);

    assert.equal(prisma.salesActivity.created.length, 1);
    const activity = prisma.salesActivity.created[0] as { data: Record<string, unknown> };
    assert.equal(activity.data['activityType'], 'browser_task');
    assert.equal(activity.data['prospectId'], 'prospect-1');

    globalThis.fetch = _originalFetch;
});

test('returns failed record when fetch throws (never throws)', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = async () => {
        throw new Error('connection refused');
    };

    const prisma = makePrismaStub();
    const result = await runBrowserTask(baseRequest, enabledConfig, prisma as unknown as import('@prisma/client').PrismaClient);

    assert.equal(result.status, 'failed');
    assert.ok(result.errorMessage?.includes('connection refused'), `expected connection refused in errorMessage, got: ${result.errorMessage}`);
    // Still attempted DB create
    assert.equal(prisma.browserTask.created.length, 1);

    globalThis.fetch = _originalFetch;
});

test('returns failed record when browser-agent returns HTTP 500 (never throws)', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = async () => ({
        ok: false,
        status: 500,
        text: async () => 'internal server error',
    } as unknown as Response);

    const prisma = makePrismaStub();
    const result = await runBrowserTask(baseRequest, enabledConfig, prisma as unknown as import('@prisma/client').PrismaClient);

    assert.equal(result.status, 'failed');
    assert.ok(result.errorMessage !== null);

    globalThis.fetch = _originalFetch;
});

test('works without prisma — returns result record with generated id', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = async () => ({
        ok: true,
        json: async () => successAgentResponse,
    } as unknown as Response);

    const result = await runBrowserTask(baseRequest, enabledConfig, undefined);

    assert.equal(result.status, 'completed');
    assert.ok(result.id.startsWith('bt-'), `expected id to start with bt-, got: ${result.id}`);

    globalThis.fetch = _originalFetch;
});
