import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Patch global fetch before importing the module under test
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init: RequestInit };

let fetchCalls: FetchCall[] = [];
let fetchShouldThrow = false;

// @ts-expect-error — replacing global fetch with a test double
globalThis.fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (fetchShouldThrow) throw new Error('network error');
    fetchCalls.push({ url, init });
    return new Response('{}', { status: 200 });
};

// Import after patching fetch so the module captures our mock
const { emitBudgetAlert } = await import('../budget-alert-emitter.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastBody(): Record<string, unknown> {
    const last = fetchCalls[fetchCalls.length - 1];
    assert.ok(last, 'No fetch call was made');
    return JSON.parse(last.init.body as string) as Record<string, unknown>;
}

function reset(): void {
    fetchCalls = [];
    fetchShouldThrow = false;
    delete process.env['API_GATEWAY_URL'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('emitBudgetAlert posts to /v1/notifications/log with correct body', async () => {
    reset();
    process.env['API_GATEWAY_URL'] = 'http://test-gateway:4000';

    await emitBudgetAlert({
        scope: 'tenant-a:ws-1:bot-1',
        level: 'warning',
        consumed: 800,
        limit: 1000,
        tenantId: 'tenant-a',
        workspaceId: 'ws-1',
    });

    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.startsWith('http://test-gateway:4000'));
    assert.ok(fetchCalls[0].url.endsWith('/v1/notifications/log'));

    const body = lastBody();
    assert.equal(body.tenantId, 'tenant-a');
    assert.equal(body.workspaceId, 'ws-1');
    assert.equal(body.channel, 'internal');
    assert.equal(body.status, 'sent');

    const payload = body.payload as Record<string, unknown>;
    assert.equal(payload.scope, 'tenant-a:ws-1:bot-1');
    assert.equal(payload.consumed, 800);
    assert.equal(payload.limit, 1000);
    assert.equal(payload.percentUsed, 80);
});

test("level 'exhausted' sets eventTrigger to 'token_budget_exhausted'", async () => {
    reset();

    await emitBudgetAlert({
        scope: 'tenant-b:ws-2:bot-2',
        level: 'exhausted',
        consumed: 1000,
        limit: 1000,
    });

    assert.equal(lastBody().eventTrigger, 'token_budget_exhausted');
});

test("level 'warning' sets eventTrigger to 'token_budget_warning'", async () => {
    reset();

    await emitBudgetAlert({
        scope: 'tenant-c:ws-3:bot-3',
        level: 'warning',
        consumed: 800,
        limit: 1000,
    });

    assert.equal(lastBody().eventTrigger, 'token_budget_warning');
});

test('percentUsed is calculated correctly (consumed / limit * 100 rounded)', async () => {
    reset();

    await emitBudgetAlert({
        scope: 'x:y:z',
        level: 'warning',
        consumed: 333,
        limit: 1000,
    });

    const payload = lastBody().payload as Record<string, unknown>;
    assert.equal(payload.percentUsed, 33); // Math.round(33.3) = 33
});

test('percentUsed rounds correctly for non-integer results', async () => {
    reset();

    await emitBudgetAlert({
        scope: 'x:y:z',
        level: 'warning',
        consumed: 667,
        limit: 1000,
    });

    const payload = lastBody().payload as Record<string, unknown>;
    assert.equal(payload.percentUsed, 67); // Math.round(66.7) = 67
});

test('fetch errors are swallowed without throwing', async () => {
    reset();
    fetchShouldThrow = true;

    await assert.doesNotReject(() =>
        emitBudgetAlert({
            scope: 'tenant-x:ws-x:bot-x',
            level: 'warning',
            consumed: 900,
            limit: 1000,
        }),
    );
});

test('missing tenantId defaults to "system"', async () => {
    reset();

    await emitBudgetAlert({
        scope: 'tenant-d:ws-4:bot-4',
        level: 'warning',
        consumed: 400,
        limit: 1000,
        // tenantId intentionally omitted
    });

    assert.equal(lastBody().tenantId, 'system');
});

test('missing workspaceId sends null in body', async () => {
    reset();

    await emitBudgetAlert({
        scope: 'tenant-e:ws-5:bot-5',
        level: 'exhausted',
        consumed: 1000,
        limit: 1000,
        tenantId: 'tenant-e',
        // workspaceId intentionally omitted
    });

    assert.equal(lastBody().workspaceId, null);
});
