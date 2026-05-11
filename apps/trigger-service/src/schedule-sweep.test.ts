import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduleSweep, startScheduleSweep } from './schedule-sweep.js';
import { isDue, getNextRun, parseCron } from './cron-utils.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

process.env['AGENT_RUNTIME_URL'] = 'http://test-runtime';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const makeJob = (overrides: Record<string, unknown> = {}) => ({
    id: 'job_1',
    tenantId: 'tenant_1',
    name: 'Test Job',
    cronExpr: '* * * * *',
    goal: 'Run a scheduled task',
    agentId: null,
    enabled: true,
    nextRunAt: null as Date | null,
    lastRunAt: null as Date | null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
});

const makePrisma = (
    jobs: ReturnType<typeof makeJob>[],
    updateFn?: (args: any) => Promise<any>,
) => ({
    scheduledJob: {
        findMany: async (queryArgs?: { where?: { enabled?: boolean } }) => {
            if (queryArgs?.where?.enabled !== undefined) {
                return jobs.filter((j) => j.enabled === queryArgs.where!.enabled);
            }
            return jobs;
        },
        update: updateFn ?? (async () => makeJob()),
    },
} as any);

// ---------------------------------------------------------------------------
// Tests 1–7: runScheduleSweep behaviour
// ---------------------------------------------------------------------------

// 1. Skips jobs where enabled = false
test('runScheduleSweep — skips jobs where enabled = false', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const prisma = makePrisma([makeJob({ enabled: false, nextRunAt: null })]);
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 0);
    assert.equal(fetchMock.mock.calls.length, 0);
});

// 2. Skips jobs where nextRunAt is in the future
test('runScheduleSweep — skips jobs where nextRunAt is in the future', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
    const prisma = makePrisma([makeJob({ nextRunAt: futureDate })]);
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 0);
    assert.equal(fetchMock.mock.calls.length, 0);
});

// 3. Fires job where nextRunAt is null
test('runScheduleSweep — fires job where nextRunAt is null', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const prisma = makePrisma([makeJob({ nextRunAt: null })]);
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 1);
    assert.equal(fetchMock.mock.calls.length, 1);
});

// 4. Fires job where nextRunAt <= now
test('runScheduleSweep — fires job where nextRunAt <= now', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const pastDate = new Date(Date.now() - 1000);
    const prisma = makePrisma([makeJob({ nextRunAt: pastDate })]);
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 1);
    assert.equal(fetchMock.mock.calls.length, 1);
});

// 5. Updates lastRunAt and nextRunAt after successful POST
test('runScheduleSweep — updates lastRunAt and nextRunAt after successful POST', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const updateCalls: any[] = [];
    const prisma = makePrisma(
        [makeJob({ nextRunAt: null })],
        async (args: any) => {
            updateCalls.push(args);
            return makeJob();
        },
    );

    await runScheduleSweep(prisma);

    assert.equal(updateCalls.length, 1);
    const { data } = updateCalls[0];
    assert.ok(data.lastRunAt instanceof Date, 'lastRunAt should be a Date');
    assert.ok(data.nextRunAt instanceof Date, 'nextRunAt should be a Date');
    assert.ok(data.nextRunAt > data.lastRunAt, 'nextRunAt should be after lastRunAt');
});

// 6. Still updates timestamps on non-2xx response (logs, doesn't throw)
test('runScheduleSweep — still updates timestamps on non-2xx response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
    }));

    const updateCalls: any[] = [];
    const prisma = makePrisma(
        [makeJob({ nextRunAt: null })],
        async (args: any) => {
            updateCalls.push(args);
            return makeJob();
        },
    );

    // Must not throw
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 1, 'should still count as fired');
    assert.equal(updateCalls.length, 1, 'timestamps must be updated even on error');
    assert.ok(updateCalls[0].data.nextRunAt instanceof Date);
});

// 7. Returns correct fired count for multiple due jobs
test('runScheduleSweep — returns correct fired count', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        text: async () => '',
    }));

    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    const jobs = [
        makeJob({ id: 'job_1', nextRunAt: null }),           // due
        makeJob({ id: 'job_2', nextRunAt: past }),            // due
        makeJob({ id: 'job_3', nextRunAt: future }),          // not due
        makeJob({ id: 'job_4', enabled: false, nextRunAt: null }), // disabled
    ];

    const prisma = makePrisma(jobs);
    const result = await runScheduleSweep(prisma);

    assert.equal(result.fired, 2);
});

// ---------------------------------------------------------------------------
// Tests 8–10: isDue
// ---------------------------------------------------------------------------

// 8. isDue — returns true when nextRunAt is null
test('isDue — returns true when nextRunAt is null', () => {
    const job = makeJob({ cronExpr: '* * * * *', nextRunAt: null });
    assert.equal(isDue(job, new Date()), true);
});

// 9. isDue — returns true when nextRunAt <= now
test('isDue — returns true when nextRunAt <= now', () => {
    const now = new Date();
    const job = makeJob({ cronExpr: '* * * * *', nextRunAt: new Date(now.getTime() - 1000) });
    assert.equal(isDue(job, now), true);
});

// 10. isDue — returns false when nextRunAt is in the future
test('isDue — returns false when nextRunAt is in the future', () => {
    const now = new Date();
    const job = makeJob({ cronExpr: '* * * * *', nextRunAt: new Date(now.getTime() + 60_000) });
    assert.equal(isDue(job, now), false);
});

// ---------------------------------------------------------------------------
// Test 11: getNextRun
// ---------------------------------------------------------------------------

// 11. getNextRun — returns a date on or after the given date for a valid expression
test('getNextRun — returns a future date for a valid cron expression', () => {
    const after = new Date('2026-01-01T00:00:00.000Z');
    const result = getNextRun('* * * * *', after);
    assert.ok(result instanceof Date, 'should return a Date');
    assert.ok(result >= after, 'result should be on or after the given date');
});

// ---------------------------------------------------------------------------
// Test 12: parseCron
// ---------------------------------------------------------------------------

// 12. parseCron — throws on invalid expression (wrong field count)
test('parseCron — throws on invalid expression (wrong field count)', () => {
    assert.throws(
        () => parseCron('* * * *'),
        (err: Error) => {
            assert.ok(err instanceof Error);
            assert.ok(
                err.message.includes('5 fields'),
                `Expected error about 5 fields, got: ${err.message}`,
            );
            return true;
        },
    );
});
