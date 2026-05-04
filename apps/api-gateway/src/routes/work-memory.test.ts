import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerWorkMemoryRoutes } from './work-memory.js';

const makeSession = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user-001',
    tenantId: 'tenant-001',
    workspaceIds: ['ws-001'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
    ...overrides,
});

const buildApp = async (sessionOverride?: ReturnType<typeof makeSession> | null) => {
    const app = Fastify({ logger: false });
    await registerWorkMemoryRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

describe('GET /v1/workspaces/:workspaceId/work-memory', () => {
    it('returns empty memory when nothing stored', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/work-memory' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.memoryVersion, 0);
        assert.deepEqual(body.entries, []);
        assert.equal(body.summary, null);
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/work-memory' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/work-memory' });
        assert.equal(res.statusCode, 403);
    });
});

describe('PUT /v1/workspaces/:workspaceId/work-memory', () => {
    it('replace mode sets entries and returns memoryVersion=1', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                mergeMode: 'replace',
                entries: [
                    { key: 'current_task', value: 'build auth service' },
                    { key: 'status', value: 'in_progress' },
                ],
            }),
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.memoryVersion, 1);
        assert.ok(body.updatedAt);
    });

    it('memoryVersion increments on each PUT', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        const put = async () =>
            app.inject({
                method: 'PUT',
                url: '/v1/workspaces/ws-001/work-memory',
                headers: { 'content-type': 'application/json' },
                payload: JSON.stringify({ entries: [{ key: 'k', value: 'v' }] }),
            });

        const r1 = JSON.parse((await put()).body);
        const r2 = JSON.parse((await put()).body);
        const r3 = JSON.parse((await put()).body);

        assert.equal(r1.memoryVersion, 1);
        assert.equal(r2.memoryVersion, 2);
        assert.equal(r3.memoryVersion, 3);
    });

    it('merge mode merges entries by key', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        // First PUT: set two entries
        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                entries: [
                    { key: 'task_a', value: 'original_a' },
                    { key: 'task_b', value: 'original_b' },
                ],
            }),
        });

        // Second PUT: merge — updates task_a, adds task_c
        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                mergeMode: 'merge',
                entries: [
                    { key: 'task_a', value: 'updated_a' },
                    { key: 'task_c', value: 'new_c' },
                ],
            }),
        });

        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/work-memory' });
        const body = JSON.parse(res.body);
        const keys = body.entries.map((e: { key: string }) => e.key);
        assert.ok(keys.includes('task_a'), 'task_a should remain');
        assert.ok(keys.includes('task_b'), 'task_b should remain');
        assert.ok(keys.includes('task_c'), 'task_c should be added');
        const taskA = body.entries.find((e: { key: string }) => e.key === 'task_a');
        assert.equal(taskA.value, 'updated_a');
    });

    it('append mode preserves existing entries and only adds new keys', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ entries: [{ key: 'existing', value: 'keep_me' }] }),
        });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                mergeMode: 'append',
                entries: [
                    { key: 'existing', value: 'should_not_overwrite' },
                    { key: 'new_entry', value: 'appended' },
                ],
            }),
        });

        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/work-memory' });
        const body = JSON.parse(res.body);
        const existingEntry = body.entries.find((e: { key: string }) => e.key === 'existing');
        assert.equal(existingEntry.value, 'keep_me', 'existing key should not be overwritten');
        const newEntry = body.entries.find((e: { key: string }) => e.key === 'new_entry');
        assert.equal(newEntry.value, 'appended');
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ entries: [] }),
        });
        assert.equal(res.statusCode, 401);
    });
});

describe('GET /v1/workspaces/:workspaceId/next-actions', () => {
    it('returns default next action when memory is empty', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/next-actions' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.ok(Array.isArray(body.items));
        assert.ok(body.items.length > 0);
    });

    it('surfaces pending_approval items as high-priority', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                entries: [{ key: 'pending_approval_deploy', value: { action: 'deploy v2', status: 'pending_approval' } }],
            }),
        });

        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/next-actions' });
        const body = JSON.parse(res.body);
        const highPriority = body.items.filter((i: { priority: string; requiresApproval: boolean }) => i.priority === 'high' && i.requiresApproval);
        assert.ok(highPriority.length > 0, 'should surface pending approval as high-priority');
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/next-actions' });
        assert.equal(res.statusCode, 401);
    });
});

describe('POST /v1/workspaces/:workspaceId/daily-plan', () => {
    it('returns a structured plan with nextActions, risks, approvalsNeeded', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        // Prime memory with some context
        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                entries: [
                    { key: 'failed_tests', value: { status: 'failed', count: 3 } },
                    { key: 'pending_approval_release', value: { version: '2.0' } },
                ],
            }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/daily-plan',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                objective: 'Ship v2.0 release by end of day',
                constraints: ['no deploys before 3pm'],
            }),
        });

        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.ok(body.planId);
        assert.ok(Array.isArray(body.nextActions));
        assert.ok(body.nextActions.length > 0);
        assert.ok(Array.isArray(body.risks));
        assert.ok(Array.isArray(body.approvalsNeeded));
        assert.ok(body.correlationId);
        assert.equal(body.objective, 'Ship v2.0 release by end of day');
    });

    it('plan blocks release without approval in approvalsNeeded', async () => {
        const app = Fastify({ logger: false });
        await registerWorkMemoryRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                entries: [{ key: 'pending_approval_merge_main', value: { pr: '#42', status: 'pending_approval' } }],
            }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/daily-plan',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ objective: 'Merge PR #42' }),
        });

        const body = JSON.parse(res.body);
        assert.ok(body.approvalsNeeded.length > 0, 'approvals should be required');
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/daily-plan',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });
        assert.equal(res.statusCode, 401);
    });
});
