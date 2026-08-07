import test from 'node:test';
import assert from 'node:assert/strict';
import { RetentionCleanupJob } from './retention-cleanup-job.js';

type SessionRec = {
    id: string;
    tenantId: string;
    status: string;
    retentionExpiresAt: Date | null;
    retentionPolicyId: string | null;
    recordingUrl: string;
    actions: { id: string; screenshotBeforeUrl: string | null; screenshotAfterUrl: string | null }[];
};

function fakePrisma(sessions: SessionRec[], policies: Record<string, { action: string }>, memoryRowCount = 0) {
    const remaining = new Map(sessions.map((s) => [s.id, s]));
    return {
        agentSession: {
            findMany: async ({ where }: any) => {
                const now = new Date();
                return Array.from(remaining.values()).filter((s) => {
                    if (where.tenantId && s.tenantId !== where.tenantId) return false;
                    if (!s.retentionExpiresAt || s.retentionExpiresAt >= now) return false;
                    if (!['completed', 'failed', 'error'].includes(s.status)) return false;
                    return true;
                });
            },
            delete: async ({ where }: any) => {
                remaining.delete(where.id);
                return {};
            },
        },
        retentionPolicy: {
            findUnique: async ({ where }: any) => (policies[where.id] ? { id: where.id, ...policies[where.id] } : null),
        },
        agentShortTermMemory: {
            deleteMany: async () => ({ count: memoryRowCount }),
        },
    } as any;
}

function fakeStorage() {
    const deleted: string[] = [];
    return { deleted, deleteArtifact: async (url: string) => { deleted.push(url); } };
}

const pastDate = new Date(Date.now() - 60_000);

test('run() with no storage: skips session scan, still sweeps short-term memory', async () => {
    const prisma = fakePrisma(
        [{ id: 's1', tenantId: 't1', status: 'completed', retentionExpiresAt: pastDate, retentionPolicyId: 'p1', recordingUrl: 'rec1', actions: [] }],
        { p1: { action: 'auto_delete_after_days' } },
        3,
    );
    const job = new RetentionCleanupJob(prisma, null);
    const stats = await job.run();
    assert.equal(stats.sessionsScanned, 0);
    assert.equal(stats.sessionsDeleted, 0);
});

test('run() with storage: deletes expired session whose policy allows auto_delete', async () => {
    const prisma = fakePrisma(
        [{ id: 's1', tenantId: 't1', status: 'completed', retentionExpiresAt: pastDate, retentionPolicyId: 'p1', recordingUrl: 'rec1', actions: [] }],
        { p1: { action: 'auto_delete_after_days' } },
    );
    const storage = fakeStorage();
    const job = new RetentionCleanupJob(prisma, storage as any);
    const stats = await job.run();
    assert.equal(stats.sessionsScanned, 1);
    assert.equal(stats.sessionsDeleted, 1);
    assert.deepEqual(storage.deleted, ['rec1']);
});

test('run() with storage: never_delete policy leaves the session untouched', async () => {
    const prisma = fakePrisma(
        [{ id: 's1', tenantId: 't1', status: 'completed', retentionExpiresAt: pastDate, retentionPolicyId: 'p1', recordingUrl: 'rec1', actions: [] }],
        { p1: { action: 'never_delete' } },
    );
    const storage = fakeStorage();
    const job = new RetentionCleanupJob(prisma, storage as any);
    const stats = await job.run();
    assert.equal(stats.sessionsScanned, 1);
    assert.equal(stats.sessionsDeleted, 0);
    assert.deepEqual(storage.deleted, []);
});

test('run() with storage: no policy on the session = conservative default, never deletes', async () => {
    const prisma = fakePrisma(
        [{ id: 's1', tenantId: 't1', status: 'completed', retentionExpiresAt: pastDate, retentionPolicyId: null, recordingUrl: 'rec1', actions: [] }],
        {},
    );
    const storage = fakeStorage();
    const job = new RetentionCleanupJob(prisma, storage as any);
    const stats = await job.run();
    assert.equal(stats.sessionsDeleted, 0);
});

test('triggerManualDelete() with no storage: returns an error stat instead of throwing', async () => {
    const prisma = fakePrisma([], {});
    const job = new RetentionCleanupJob(prisma, null);
    const stats = await job.triggerManualDelete('t1');
    assert.equal(stats.sessionsDeleted, 0);
    assert.ok(stats.errors.some((e) => e.includes('storage')));
});

test('triggerManualDelete() with storage: manual_delete policy is deleted when explicitly triggered', async () => {
    const prisma = fakePrisma(
        [{ id: 's1', tenantId: 't1', status: 'completed', retentionExpiresAt: pastDate, retentionPolicyId: 'p1', recordingUrl: 'rec1', actions: [] }],
        { p1: { action: 'manual_delete' } },
    );
    const storage = fakeStorage();
    const job = new RetentionCleanupJob(prisma, storage as any);
    const stats = await job.triggerManualDelete('t1');
    assert.equal(stats.sessionsDeleted, 1);
});
