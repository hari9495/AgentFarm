import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerCiFailureRoutes } from './ci-failures.js';
import { registerPrRoutes } from './pull-requests.js';
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
    const getSession = () => (sessionOverride !== undefined ? sessionOverride : makeSession());

    await registerCiFailureRoutes(app, { getSession });
    await registerPrRoutes(app, { getSession });
    await registerWorkMemoryRoutes(app, { getSession });

    return app;
};

describe('Sprint 3 integration: CI fail -> triage -> patch draft -> PR draft', () => {
    it('creates a triage report with patch suggestion and uses it to draft PR metadata', async () => {
        const app = await buildApp();

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                provider: 'github',
                runId: 'run-s3-e2e-001',
                repo: 'org/repo',
                branch: 'feat/ci-fix',
                failedJobs: [
                    {
                        jobName: 'build',
                        step: 'type error in src/routes/work-memory.ts',
                        exitCode: 2,
                    },
                ],
                logRefs: ['https://logs.example.com/run-s3-e2e-001'],
            }),
        });

        assert.equal(intakeRes.statusCode, 202);
        const intake = JSON.parse(intakeRes.body);
        assert.ok(intake.triageId);

        const reportRes = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-001/ci-failures/${intake.triageId}/report`,
        });

        assert.equal(reportRes.statusCode, 200);
        const report = JSON.parse(reportRes.body);
        assert.ok(report.patchProposal);
        assert.ok(typeof report.confidence === 'number');
        assert.ok(report.rootCauseHypothesis);

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'fix/ci-run-s3-e2e-001',
                changeSummary: `CI triage patch draft: ${report.patchProposal}`,
                linkedIssueIds: ['1234'],
            }),
        });

        assert.equal(draftRes.statusCode, 201);
        const draft = JSON.parse(draftRes.body);
        assert.ok(draft.draftId);
        assert.ok(draft.title);
        assert.ok(draft.body.includes('Closes #1234'));
        assert.ok(Array.isArray(draft.checklist));
        assert.ok(draft.reviewersSuggested.length > 0);
    });
});

describe('Sprint 3 integration: planner assists resumed sessions without policy bypass', () => {
    it('returns approval-required actions and high-risk publish remains blocked by policy preflight', async () => {
        const app = await buildApp();

        const memoryRes = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/work-memory',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                mergeMode: 'replace',
                entries: [
                    {
                        key: 'pending_approval_release_main',
                        value: { status: 'pending_approval', change: 'release cut' },
                    },
                    {
                        key: 'failed_ci_run',
                        value: { status: 'failed', runId: 'run-s3-e2e-002' },
                    },
                ],
                summary: 'Resumed session with pending approvals and failed CI run',
            }),
        });

        assert.equal(memoryRes.statusCode, 200);

        const nextActionsRes = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/next-actions',
        });

        assert.equal(nextActionsRes.statusCode, 200);
        const nextActionsBody = JSON.parse(nextActionsRes.body);
        const approvalActions = nextActionsBody.items.filter(
            (item: { requiresApproval: boolean }) => item.requiresApproval === true,
        );
        assert.ok(approvalActions.length > 0);

        const planRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/daily-plan',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                objective: 'Ship release safely after approvals',
                constraints: ['approval required for release actions'],
            }),
        });

        assert.equal(planRes.statusCode, 201);
        const plan = JSON.parse(planRes.body);
        assert.ok(Array.isArray(plan.approvalsNeeded));
        assert.ok(plan.approvalsNeeded.length > 0);

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'release/v2',
                changeSummary: 'merge_release: publish approved release candidate',
            }),
        });

        assert.equal(draftRes.statusCode, 201);
        const draft = JSON.parse(draftRes.body);

        const publishRes = await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draft.draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ targetBranch: 'main' }),
        });

        assert.equal(publishRes.statusCode, 403);
        const publish = JSON.parse(publishRes.body);
        assert.equal(publish.error, 'policy_preflight_failed');
    });
});
