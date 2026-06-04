import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerCiFailureRoutes } from './ci-failures.js';

const session = () => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const app = Fastify();
    registerCiFailureRoutes(app, { getSession: () => session() });
    return app;
};

const failedJob = () => ({ jobName: 'test', step: 'test: unit tests', exitCode: 1 });

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:wsId/ci-failures/intake
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:wsId/ci-failures/intake', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerCiFailureRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'r1', repo: 'org/repo', branch: 'main', failedJobs: [failedJob()] },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_other/ci-failures/intake',
            payload: { provider: 'github', runId: 'r1', repo: 'org/repo', branch: 'main', failedJobs: [failedJob()] },
        });
        assert.equal(res.statusCode, 403);
    });

    it('returns 202 with triageId on success', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'run123', repo: 'org/repo', branch: 'feature/x', failedJobs: [failedJob()] },
        });
        assert.equal(res.statusCode, 202);
        const body = res.json();
        assert.ok(body.triageId, 'triageId must be present');
        assert.ok(body.ingestedAt, 'ingestedAt must be present');
    });

    it('accepts empty failedJobs array', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'r1', repo: 'r', branch: 'b', failedJobs: [] },
        });
        assert.equal(res.statusCode, 202);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:wsId/ci-failures/:triageId/report
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:wsId/ci-failures/:triageId/report', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerCiFailureRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/ci-failures/triage_abc/report' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown triageId', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/ci-failures/nonexistent/report' });
        assert.equal(res.statusCode, 404);
    });

    it('returns analysis report for known triageId', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'r1', repo: 'org/repo', branch: 'main', failedJobs: [failedJob()] },
        });
        const { triageId } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/workspaces/ws_1/ci-failures/${triageId}/report` });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.triageId, triageId);
        assert.ok(body.patchProposal, 'patchProposal must be present');
        assert.ok(typeof body.confidence === 'number', 'confidence must be a number');
        assert.ok(body.rootCauseHypothesis, 'rootCauseHypothesis must be present');
    });

    it('detects test-related failures', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'r2', repo: 'org/r', branch: 'feat', failedJobs: [{ jobName: 'ci', step: 'jest: run tests', exitCode: 1 }] },
        });
        const { triageId } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/workspaces/ws_1/ci-failures/${triageId}/report` });
        const body = res.json();
        assert.ok(body.confidence >= 0.7, 'test failure confidence should be >= 0.7');
    });

    it('detects TypeScript errors', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/ci-failures/intake',
            payload: { provider: 'github', runId: 'r3', repo: 'org/r', branch: 'feat', failedJobs: [{ jobName: 'ci', step: 'TypeScript: type check', exitCode: 2 }] },
        });
        const { triageId } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/workspaces/ws_1/ci-failures/${triageId}/report` });
        assert.ok(res.json().confidence >= 0.7);
    });
});
