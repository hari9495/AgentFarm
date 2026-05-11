import test from 'node:test';
import assert from 'node:assert/strict';
import { runSubscriptionSweep, startSubscriptionSweep, runRenewalReminderSweep } from './subscription-sweep.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const makeMockPrisma = (overrides?: Partial<{
    tenantSubscriptionFindMany: (args?: any) => Promise<any[]>;
    agentSubscriptionFindMany: (args?: any) => Promise<any[]>;
    transaction: (...args: any[]) => Promise<any>;
}>) => ({
    tenantSubscription: {
        findMany: overrides?.tenantSubscriptionFindMany ?? (async () => []),
        update: async () => ({}),
    },
    agentSubscription: {
        findMany: overrides?.agentSubscriptionFindMany ?? (async () => []),
        update: async () => ({}),
    },
    $transaction: overrides?.transaction ?? (async (ops: any[]) => Promise.all(ops)),
    subscriptionEvent: { create: async () => ({}) },
    notificationLog: { create: async () => ({}) },
} as any);

// Produce a fake past date
const pastDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// runSubscriptionSweep tests
// ---------------------------------------------------------------------------

test('runSubscriptionSweep — no subscriptions — returns { expired: 0, suspended: 0 }', async () => {
    const prisma = makeMockPrisma();
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 0, suspended: 0 });
});

test('runSubscriptionSweep — 2 active tenant subs past expiresAt — returns { expired: 2, suspended: 0 }', async () => {
    let txCalls = 0;
    const subs = [
        { id: 'ts1', tenantId: 'tenant_1', expiresAt: pastDate(1) },
        { id: 'ts2', tenantId: 'tenant_2', expiresAt: pastDate(2) },
    ];
    const prisma = makeMockPrisma({
        tenantSubscriptionFindMany: async (args?: any) => {
            if (args?.where?.status === 'active') return subs;
            return [];
        },
        transaction: async (ops: any[]) => { txCalls++; return Promise.all(ops); },
    });
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 2, suspended: 0 });
    assert.equal(txCalls, 2);
});

test('runSubscriptionSweep — 1 active agent sub past expiresAt — returns { expired: 1, suspended: 0 }', async () => {
    let txCalls = 0;
    const subs = [{ id: 'as1', tenantId: 'tenant_1', agentId: 'agent_1', expiresAt: pastDate(1) }];
    const prisma = makeMockPrisma({
        agentSubscriptionFindMany: async (args?: any) => {
            if (args?.where?.status === 'active') return subs;
            return [];
        },
        transaction: async (ops: any[]) => { txCalls++; return Promise.all(ops); },
    });
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 1, suspended: 0 });
    assert.equal(txCalls, 1);
});

test('runSubscriptionSweep — 1 expired tenant sub past grace period — returns { expired: 0, suspended: 1 }', async () => {
    let txCalls = 0;
    // For sweep 2, findMany for 'expired' returns 1 tenant sub; sweep 1 returns nothing
    const expiredSubs = [{ id: 'ts_e1', tenantId: 'tenant_1', expiresAt: pastDate(5) }];
    const prisma = makeMockPrisma({
        // sweep 1 active->expired: both return []
        // sweep 2 expired->suspended: tenant returns 1, agent returns []
        tenantSubscriptionFindMany: async (args: any) => {
            if (args?.where?.status === 'expired') return expiredSubs;
            return [];
        },
        transaction: async (ops: any[]) => { txCalls++; return Promise.all(ops); },
    });
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 0, suspended: 1 });
    assert.equal(txCalls, 1);
});

test('runSubscriptionSweep — 1 expired agent sub past grace period — returns { expired: 0, suspended: 1 }', async () => {
    let txCalls = 0;
    const expiredSubs = [{ id: 'as_e1', tenantId: 'tenant_1', agentId: 'agent_1', expiresAt: pastDate(5) }];
    const prisma = makeMockPrisma({
        agentSubscriptionFindMany: async (args: any) => {
            if (args?.where?.status === 'expired') return expiredSubs;
            return [];
        },
        transaction: async (ops: any[]) => { txCalls++; return Promise.all(ops); },
    });
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 0, suspended: 1 });
    assert.equal(txCalls, 1);
});

test('runSubscriptionSweep — mix: 2 active expired + 1 past grace — returns { expired: 2, suspended: 1 }', async () => {
    let txCalls = 0;
    const activeSubs = [
        { id: 'ts_a1', tenantId: 'tenant_1', expiresAt: pastDate(1) },
        { id: 'ts_a2', tenantId: 'tenant_2', expiresAt: pastDate(2) },
    ];
    const pastGraceSubs = [{ id: 'ts_e1', tenantId: 'tenant_3', expiresAt: pastDate(5) }];
    const prisma = makeMockPrisma({
        tenantSubscriptionFindMany: async (args: any) => {
            if (args?.where?.status === 'active') return activeSubs;
            if (args?.where?.status === 'expired') return pastGraceSubs;
            return [];
        },
        transaction: async (ops: any[]) => { txCalls++; return Promise.all(ops); },
    });
    const result = await runSubscriptionSweep(prisma);
    assert.deepEqual(result, { expired: 2, suspended: 1 });
    assert.equal(txCalls, 3); // 2 active→expired + 1 expired→suspended
});

// ---------------------------------------------------------------------------
// startSubscriptionSweep tests
// ---------------------------------------------------------------------------

test('startSubscriptionSweep — calls runSubscriptionSweep immediately on start', async () => {
    let sweepCalled = false;
    // Intercept by providing a findMany that records the call
    const prisma = makeMockPrisma({
        tenantSubscriptionFindMany: async () => { sweepCalled = true; return []; },
    });
    const handle = startSubscriptionSweep(prisma, 60_000);
    clearInterval(handle);
    // Allow the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sweepCalled, true);
});

test('startSubscriptionSweep — returns a handle that can be cleared', () => {
    const prisma = makeMockPrisma();
    const handle = startSubscriptionSweep(prisma, 60_000);
    assert.ok(handle !== undefined && handle !== null);
    // Should not throw
    clearInterval(handle);
});

// ---------------------------------------------------------------------------
// runRenewalReminderSweep tests
// ---------------------------------------------------------------------------

const makeReminderPrisma = (
    subs: any[],
    existingReminder: any | null = null,
    createCount = { n: 0 },
) => ({
    tenantSubscription: {
        findMany: async () => subs,
    },
    notificationLog: {
        findFirst: async () => existingReminder,
        create: async () => { createCount.n++; return {}; },
    },
} as any);

test('runRenewalReminderSweep — no subs expiring in window — returns { reminders: 0 }', async () => {
    const prisma = makeReminderPrisma([]);
    const result = await runRenewalReminderSweep(prisma);
    assert.deepEqual(result, { reminders: 0 });
});

test('runRenewalReminderSweep — 1 sub expiring in 7 days, no prior reminder — creates NotificationLog, returns { reminders: 1 }', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const subs = [{ id: 'ts_r1', tenantId: 'tenant_1', expiresAt }];
    const createCount = { n: 0 };
    const prisma = makeReminderPrisma(subs, null, createCount);
    const result = await runRenewalReminderSweep(prisma);
    assert.deepEqual(result, { reminders: 1 });
    assert.equal(createCount.n, 1);
});

test('runRenewalReminderSweep — 1 sub expiring in 7 days, reminder already sent today — skips, returns { reminders: 0 }', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const subs = [{ id: 'ts_r2', tenantId: 'tenant_1', expiresAt }];
    const existingReminder = { id: 'notif_1' };
    const createCount = { n: 0 };
    const prisma = makeReminderPrisma(subs, existingReminder, createCount);
    const result = await runRenewalReminderSweep(prisma);
    assert.deepEqual(result, { reminders: 0 });
    assert.equal(createCount.n, 0);
});

test('runRenewalReminderSweep — 2 subs expiring in window — returns { reminders: 2 }', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const subs = [
        { id: 'ts_r3', tenantId: 'tenant_1', expiresAt },
        { id: 'ts_r4', tenantId: 'tenant_2', expiresAt },
    ];
    const createCount = { n: 0 };
    const prisma = makeReminderPrisma(subs, null, createCount);
    const result = await runRenewalReminderSweep(prisma);
    assert.deepEqual(result, { reminders: 2 });
    assert.equal(createCount.n, 2);
});
