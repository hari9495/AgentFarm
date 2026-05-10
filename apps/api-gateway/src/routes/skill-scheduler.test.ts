import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSkillSchedulerRoutes } from './skill-scheduler.js';

const session = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const buildApp = (authed: boolean) => {
    const app = Fastify({ logger: false });
    registerSkillSchedulerRoutes(app, {
        getSession: () => (authed ? session() : null),
    });
    return app;
};

describe('POST /scheduler/jobs — auth', () => {
    it('returns 401 without session', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/scheduler/jobs',
                payload: { name: 'my-job', target: { kind: 'skill', skill_id: 'code-review-summarizer' }, frequency: { type: 'interval_ms', interval_ms: 3_600_000 } },
            });
            assert.equal(res.statusCode, 401);
            assert.equal((res.json() as { error: string }).error, 'unauthorized');
        } finally {
            await app.close();
        }
    });

    it('creates a job with valid session', async () => {
        const app = buildApp(true);
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/scheduler/jobs',
                payload: {
                    name: 'my-job',
                    target: { kind: 'skill', skill_id: 'code-review-summarizer' },
                    frequency: { type: 'interval_ms', interval_ms: 3_600_000 },
                },
            });
            assert.equal(res.statusCode, 201);
        } finally {
            await app.close();
        }
    });
});

describe('DELETE /scheduler/jobs/:id — auth', () => {
    it('returns 401 without session', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({ method: 'DELETE', url: '/scheduler/jobs/job-1' });
            assert.equal(res.statusCode, 401);
            assert.equal((res.json() as { error: string }).error, 'unauthorized');
        } finally {
            await app.close();
        }
    });
});

describe('GET /scheduler/jobs — open read', () => {
    it('returns 200 without auth', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({ method: 'GET', url: '/scheduler/jobs' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { jobs: unknown[] };
            assert.ok(Array.isArray(body.jobs));
        } finally {
            await app.close();
        }
    });
});

describe('POST /scheduler/jobs/:id/pause — auth', () => {
    it('returns 401 without session', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({ method: 'POST', url: '/scheduler/jobs/job-1/pause' });
            assert.equal(res.statusCode, 401);
            assert.equal((res.json() as { error: string }).error, 'unauthorized');
        } finally {
            await app.close();
        }
    });
});
