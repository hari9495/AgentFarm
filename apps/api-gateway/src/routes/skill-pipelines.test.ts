import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSkillPipelineRoutes } from './skill-pipelines.js';

const session = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const buildApp = (authed: boolean) => {
    const app = Fastify({ logger: false });
    registerSkillPipelineRoutes(app, {
        getSession: () => (authed ? session() : null),
    });
    return app;
};

describe('POST /pipelines/run — auth', () => {
    it('returns 401 without session', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/pipelines/run',
                payload: { pipeline_id: 'pr-quality-gate' },
            });
            assert.equal(res.statusCode, 401);
            assert.equal((res.json() as { error: string }).error, 'unauthorized');
        } finally {
            await app.close();
        }
    });
});

describe('GET /pipelines — open read', () => {
    it('returns 200 without auth', async () => {
        const app = buildApp(false);
        try {
            const res = await app.inject({ method: 'GET', url: '/pipelines' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { pipelines: unknown[] };
            assert.ok(Array.isArray(body.pipelines));
        } finally {
            await app.close();
        }
    });
});
