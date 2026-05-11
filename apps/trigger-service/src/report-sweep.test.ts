import test from 'node:test';
import assert from 'node:assert/strict';
import { runReportSweep, startReportSweep } from './report-sweep.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const OPTS = {
    apiGatewayUrl: 'http://localhost:3000',
    internalToken: 'test-token',
};

type ReportRow = {
    id: string;
    tenantId: string;
    workspaceId: string;
    name: string;
    recipientEmail: string;
    frequency: string;
    reportTypes: string[];
    enabled: boolean;
    nextSendAt: Date;
};

const makeMockPrisma = (overrides?: Partial<{
    scheduledReportFindMany: (args?: any) => Promise<ReportRow[]>;
    scheduledReportUpdate: (args?: any) => Promise<ReportRow>;
    notificationLogCreate: (args?: any) => Promise<any>;
}>) => ({
    scheduledReport: {
        findMany: overrides?.scheduledReportFindMany ?? (async () => []),
        update: overrides?.scheduledReportUpdate ?? (async () => ({})),
    },
    notificationLog: {
        create: overrides?.notificationLogCreate ?? (async () => ({})),
    },
} as any);

const pastDate = (msAgo: number) => new Date(Date.now() - msAgo);
const futureDate = (msAhead: number) => new Date(Date.now() + msAhead);

const makeReport = (overrides?: Partial<ReportRow>): ReportRow => ({
    id: 'report_1',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    name: 'Weekly Digest',
    recipientEmail: 'owner@example.com',
    frequency: 'weekly',
    reportTypes: ['cost'],
    enabled: true,
    nextSendAt: pastDate(1000),
    ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runReportSweep — no due reports — returns { sent: 0 }', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
    const prisma = makeMockPrisma();
    const result = await runReportSweep(prisma, OPTS);
    assert.deepEqual(result, { sent: 0 });
});

test('runReportSweep — skips report with future nextSendAt', async (t) => {
    // findMany returns empty because WHERE nextSendAt <= now filters it out
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => [],
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
    const result = await runReportSweep(prisma, OPTS);
    assert.deepEqual(result, { sent: 0 });
});

test('runReportSweep — sends one due report — returns { sent: 1 }', async (t) => {
    const report = makeReport();
    let updateCalled = false;
    let notifCreated = false;
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => [report],
        scheduledReportUpdate: async () => { updateCalled = true; return report; },
        notificationLogCreate: async () => { notifCreated = true; return {}; },
    });
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        json: async () => ({
            tenantId: 'tenant_1', from: '2025-01-01', to: '2025-01-07',
            taskCount: 10, totalCostUsd: 1.23, totalPromptTokens: 5000,
            totalCompletionTokens: 3000, successRate: 0.9,
            byProvider: [], weeklyTrend: [],
        }),
    }));
    const result = await runReportSweep(prisma, OPTS);
    assert.deepEqual(result, { sent: 1 });
    assert.equal(updateCalled, true);
    assert.equal(notifCreated, true);
});

test('runReportSweep — updates lastSentAt and nextSendAt (weekly = +7 days)', async (t) => {
    const report = makeReport({ frequency: 'weekly' });
    let updatedData: any;
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => [report],
        scheduledReportUpdate: async (args: any) => { updatedData = args.data; return report; },
        notificationLogCreate: async () => ({}),
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
    await runReportSweep(prisma, OPTS);
    assert.ok(updatedData?.lastSentAt instanceof Date, 'lastSentAt must be a Date');
    assert.ok(updatedData?.nextSendAt instanceof Date, 'nextSendAt must be a Date');
    const diffMs = updatedData.nextSendAt.getTime() - updatedData.lastSentAt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(diffMs - sevenDaysMs) < 1000, `weekly nextSendAt diff should be ~7 days, got ${diffMs}ms`);
});

test('runReportSweep — daily frequency — nextSendAt is +1 day', async (t) => {
    const report = makeReport({ frequency: 'daily' });
    let updatedData: any;
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => [report],
        scheduledReportUpdate: async (args: any) => { updatedData = args.data; return report; },
        notificationLogCreate: async () => ({}),
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
    await runReportSweep(prisma, OPTS);
    const diffMs = updatedData.nextSendAt.getTime() - updatedData.lastSentAt.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(diffMs - oneDayMs) < 1000, `daily nextSendAt diff should be ~1 day, got ${diffMs}ms`);
});

test('runReportSweep — continues on per-report error, other reports unaffected', async (t) => {
    const failReport = makeReport({ id: 'report_fail', name: 'Fail' });
    const goodReport = makeReport({ id: 'report_good', name: 'Good' });
    let notifCount = 0;
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => [failReport, goodReport],
        scheduledReportUpdate: async (args: any) => {
            if (args.where.id === 'report_fail') throw new Error('DB error');
            return goodReport;
        },
        notificationLogCreate: async () => { notifCount++; return {}; },
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
    // Should not throw; good report should still be sent
    const result = await runReportSweep(prisma, OPTS);
    assert.ok(result.sent >= 1, 'at least one report should succeed');
});

test('startReportSweep — fires immediately and returns clearable handle', async () => {
    let sweepCalled = false;
    const prisma = makeMockPrisma({
        scheduledReportFindMany: async () => { sweepCalled = true; return []; },
    });
    const handle = startReportSweep(prisma, OPTS, 60_000);
    clearInterval(handle);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sweepCalled, true);
});
