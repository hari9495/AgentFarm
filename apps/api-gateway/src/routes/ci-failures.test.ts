import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerCiFailureRoutes } from './ci-failures.js';

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
    await registerCiFailureRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

const baseIntake = {
    provider: 'github',
    runId: 'run-001',
    repo: 'org/repo',
    branch: 'main',
    failedJobs: [{ jobName: 'unit-tests', step: 'Run tests', exitCode: 1 }],
    logRefs: ['https://logs.example.com/run-001'],
};

describe('POST /v1/workspaces/:workspaceId/ci-failures/intake', () => {
    it('creates a queued triage report and returns triageId', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(baseIntake),
        });

        assert.equal(res.statusCode, 202);
        const body = JSON.parse(res.body);
        assert.ok(body.triageId);
        assert.equal(body.status, 'queued');
        assert.ok(body.correlationId);
    });

    it('returns 400 when provider is missing', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ runId: 'r1', repo: 'org/repo', branch: 'main' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when runId is missing', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ provider: 'github', repo: 'org/repo', branch: 'main' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns existing report for duplicate runId (idempotent)', async () => {
        const app = Fastify({ logger: false });
        await registerCiFailureRoutes(app, { getSession: () => makeSession() });

        const first = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(baseIntake),
        });
        const firstId = JSON.parse(first.body).triageId;

        const second = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(baseIntake),
        });
        const secondId = JSON.parse(second.body).triageId;

        assert.equal(firstId, secondId);
        assert.equal(second.statusCode, 200);
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(baseIntake),
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(baseIntake),
        });
        assert.equal(res.statusCode, 403);
    });
});

describe('GET /v1/workspaces/:workspaceId/ci-failures/:triageId/report', () => {
    it('returns complete triage report after intake', async () => {
        const app = Fastify({ logger: false });
        await registerCiFailureRoutes(app, { getSession: () => makeSession() });

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                ...baseIntake,
                runId: 'run-002',
                failedJobs: [{ jobName: 'build', step: 'compile error found', exitCode: 2 }],
            }),
        });
        const { triageId } = JSON.parse(intakeRes.body);

        const reportRes = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-001/ci-failures/${triageId}/report`,
        });

        assert.equal(reportRes.statusCode, 200);
        const body = JSON.parse(reportRes.body);
        assert.equal(body.triageId, triageId);
        assert.ok(body.rootCauseHypothesis, 'should have hypothesis');
        assert.ok(typeof body.confidence === 'number', 'confidence should be numeric');
        assert.ok(body.blastRadius, 'should have blast radius');
        assert.ok(body.patchProposal, 'should have patch proposal');
        assert.ok(body.patchProposal.includes('requires approval'), 'patch proposal must note approval requirement');
    });

    it('correctly classifies env credential failures', async () => {
        const app = Fastify({ logger: false });
        await registerCiFailureRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                ...baseIntake,
                runId: 'run-env-001',
                failedJobs: [{ jobName: 'deploy', step: 'permission denied: access denied to secret store', exitCode: 1 }],
            }),
        });
        const reportId = (await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                ...baseIntake,
                runId: 'run-env-001',
            }),
        }));
        const { triageId } = JSON.parse(reportId.body);

        const report = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-001/ci-failures/${triageId}/report`,
        });
        const body = JSON.parse(report.body);
        assert.ok(body.rootCauseHypothesis.toLowerCase().includes('env') ||
            body.rootCauseHypothesis.toLowerCase().includes('credential'));
    });

    it('returns 404 for unknown triageId', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/ci-failures/unknown-id/report',
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/ci-failures/some-id/report',
        });
        assert.equal(res.statusCode, 401);
    });
});
