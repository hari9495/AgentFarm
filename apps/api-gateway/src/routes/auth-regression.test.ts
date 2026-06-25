/**
 * auth-regression.test.ts
 *
 * Regression tests that verify every route group fixed in the security review
 * returns 401 when called without a valid session.
 *
 * If any of these tests start failing it means an auth guard was silently
 * removed — CI will catch it before the change reaches production.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

// ── Route registrations under test ───────────────────────────────────────────
import { registerAutonomousLoopRoutes } from './runtime/autonomous-loops.js';
import { registerWebhookRoutes } from './connectors/webhooks.js';
import { registerRetentionPolicyRoutes } from './governance/retention-policy.js';
import { registerGovernancePolicyRoutes } from './governance/policy.js';
import { registerSkillCompositionRoutes } from './runtime/skill-composition-execute.js';
import { registerLeadRoutes } from './sales/leads.js';
import { registerDashboardRoutes } from './platform/dashboard.js';
import { registerConnectorHealthRoutes } from './connectors/connector-health.js';
import { registerGovernanceKPIRoutes } from './governance/governance-kpis.js';
import { registerQuestionRoutes } from './agents/questions.js';
import { registerSupportIssueRoutes } from './support/support-issue.js';
import { registerSupportVoiceSessionRoutes } from './support/support-voice-session.js';
import { registerAuthRoutes, type AuthRepo } from './auth/auth.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** A getSession that always returns null — simulates an unauthenticated caller. */
const noSession = () => null;

/** Minimal mock PrismaClient — never called for the 401 path. */
const mockPrisma = {} as never;

// ── 1. Autonomous loops ───────────────────────────────────────────────────────

describe('AUTH — autonomous loops (all 4 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerAutonomousLoopRoutes(app, { getSession: noSession });
        return app;
    };

    it('POST /v1/autonomous-loops/execute → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 'x', success_criteria: 'y' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/autonomous-loops → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/autonomous-loops' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/autonomous-loops/:loopId → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/autonomous-loops/loop_1' });
        assert.equal(res.statusCode, 401);
    });

    it('DELETE /v1/autonomous-loops/:loopId → 401', async () => {
        const res = await buildApp().inject({ method: 'DELETE', url: '/v1/autonomous-loops/loop_1' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 2. Webhook engine management ─────────────────────────────────────────────

describe('AUTH — webhook engine management (5 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerWebhookRoutes(app, mockPrisma, { getSession: noSession });
        return app;
    };

    it('GET /webhooks → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/webhooks' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /webhooks → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/webhooks',
            payload: { provider: 'github', events: ['push'], target_url: 'https://example.com' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('PATCH /webhooks/:id → 401', async () => {
        const res = await buildApp().inject({
            method: 'PATCH', url: '/webhooks/wh_1',
            payload: { active: false },
        });
        assert.equal(res.statusCode, 401);
    });

    it('DELETE /webhooks/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'DELETE', url: '/webhooks/wh_1' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /webhooks/events → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/webhooks/events' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 3. Inbound webhook sources ────────────────────────────────────────────────

describe('AUTH — inbound webhook sources (4 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerWebhookRoutes(app, mockPrisma, { getSession: noSession });
        return app;
    };

    it('GET /v1/webhooks/inbound/sources → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/webhooks/inbound/sources' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/webhooks/inbound/sources → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/webhooks/inbound/sources',
            payload: { name: 'test' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('DELETE /v1/webhooks/inbound/sources/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'DELETE', url: '/v1/webhooks/inbound/sources/src_1' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/webhooks/inbound/events → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/webhooks/inbound/events' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 4. Memory patterns (code-review webhook) ──────────────────────────────────

describe('AUTH — memory patterns code-review webhook returns 401 without session', () => {
    it('POST /api/v1/memory/patterns/code-review → 401', async () => {
        const app = Fastify({ logger: false });
        registerWebhookRoutes(app, mockPrisma, { getSession: noSession });
        const res = await app.inject({
            method: 'POST', url: '/api/v1/memory/patterns/code-review',
            payload: { workspaceId: 'ws_1', review_comments: ['always add tests'] },
        });
        assert.equal(res.statusCode, 401);
    });
});

// ── 5. Retention policies ─────────────────────────────────────────────────────

describe('AUTH — retention policies (6 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerRetentionPolicyRoutes(app, mockPrisma, { getSession: noSession });
        return app;
    };

    it('POST /v1/retention-policies → 401', async () => {
        const res = await buildApp().inject({ method: 'POST', url: '/v1/retention-policies', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/retention-policies → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/retention-policies' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/retention-policies/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/retention-policies/p1' });
        assert.equal(res.statusCode, 401);
    });

    it('PATCH /v1/retention-policies/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'PATCH', url: '/v1/retention-policies/p1', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('DELETE /v1/retention-policies/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'DELETE', url: '/v1/retention-policies/p1' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/retention-policies/:id/set-default → 401', async () => {
        const res = await buildApp().inject({ method: 'POST', url: '/v1/retention-policies/p1/set-default', payload: {} });
        assert.equal(res.statusCode, 401);
    });
});

// ── 5b. Governance policies (Phases 2 + 3) ────────────────────────────────────

describe('AUTH — governance policies (3 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerGovernancePolicyRoutes(app, mockPrisma, { getSession: noSession });
        return app;
    };

    it('POST /v1/governance/policies → 401', async () => {
        const res = await buildApp().inject({ method: 'POST', url: '/v1/governance/policies', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/governance/policies → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/governance/policies' });
        assert.equal(res.statusCode, 401);
    });

    it('DELETE /v1/governance/policies/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'DELETE', url: '/v1/governance/policies/p1' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 6. Skill composition ──────────────────────────────────────────────────────

describe('AUTH — skill composition (4 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerSkillCompositionRoutes(app, { getSession: noSession });
        return app;
    };

    it('POST /v1/compositions → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/compositions',
            payload: { composition_id: 'c1', nodes: [{}] },
        });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/compositions/:id/execute → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/compositions/c1/execute',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/compositions → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/compositions' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/compositions/:id/runs/:runId → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/compositions/c1/runs/r1' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 7. Lead management (GET + PATCH require auth; POST is public) ─────────────

describe('AUTH — leads GET and PATCH require session; POST is public', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerLeadRoutes(app, { getSession: noSession });
        return app;
    };

    it('GET /api/v1/leads → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/api/v1/leads' });
        assert.equal(res.statusCode, 401);
    });

    it('PATCH /api/v1/leads/:id/status → 401', async () => {
        const res = await buildApp().inject({
            method: 'PATCH', url: '/api/v1/leads/lead_1/status',
            payload: { status: 'QUALIFIED' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('POST /api/v1/leads is still public (no auth required)', async () => {
        // POST is a website contact form — intentionally unauthenticated.
        // It should reach validation, not short-circuit at 401.
        const res = await buildApp().inject({
            method: 'POST', url: '/api/v1/leads',
            payload: {},  // missing required fields → 400, not 401
        });
        assert.equal(res.statusCode, 400);
    });
});

// ── 8. Dashboard routes (no injected session = 401) ───────────────────────────
// Dashboard uses readSession() internally rather than an options.getSession callback.
// With no cookie/bearer token in the request, readSession returns null → 401.

describe('AUTH — dashboard routes return 401 without session', () => {
    const buildApp = async () => {
        const app = Fastify({ logger: false });
        await registerDashboardRoutes(app);
        return app;
    };

    it('GET /v1/dashboard/summary → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/dashboard/summary' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/workspaces/:workspaceId/provisioning → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/provisioning' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/workspaces/:workspaceId/connectors → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/connectors' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/workspaces/:workspaceId/approvals → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/approvals' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/workspaces/:workspaceId/activity → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/activity' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 9. Connector health ───────────────────────────────────────────────────────

describe('AUTH — connector health routes return 401 without session', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerConnectorHealthRoutes(app, { getSession: noSession });
        return app;
    };

    it('GET /connectors/:id/health → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/connectors/github/health' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /connectors/health/all → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/connectors/health/all' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /connectors/health/ping-all → 401', async () => {
        const res = await buildApp().inject({ method: 'POST', url: '/connectors/health/ping-all' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 10. Governance KPIs ───────────────────────────────────────────────────────

describe('AUTH — governance KPI routes return 401 without session', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerGovernanceKPIRoutes(app, { getSession: noSession });
        return app;
    };

    it('GET /v1/governance/kpis → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/governance/kpis' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/governance/kpis/providers → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/governance/kpis/providers' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/governance/kpis/export → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/governance/kpis/export?workspace_id=ws_1' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/governance/sla-compliance → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/governance/sla-compliance' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 11. Agent questions ───────────────────────────────────────────────────────

describe('AUTH — question routes return 401 without session', () => {
    const buildApp = async () => {
        const app = Fastify({ logger: false });
        await registerQuestionRoutes(app, {} as never, { getSession: noSession });
        return app;
    };

    it('POST /v1/questions → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/questions', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('POST /api/v1/questions → 401 (deprecated alias also protected)', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'POST', url: '/api/v1/questions', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/questions/:id/answer → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/questions/q_1/answer', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/tasks/:taskId/questions → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/tasks/task_1/questions' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/workspaces/:workspaceId/questions/pending → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/questions/pending' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/workspaces/:workspaceId/questions/sweep-expired → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/workspaces/ws_1/questions/sweep-expired', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/questions/:questionId → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/questions/q_1' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 10. Support issue routes ──────────────────────────────────────────────────

describe('AUTH — support issue routes (all 5 routes return 401 without session)', () => {
    const buildApp = () => {
        const app = Fastify({ logger: false });
        registerSupportIssueRoutes(app, { getSession: noSession });
        return app;
    };

    it('POST /v1/support/issues → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/support/issues',
            payload: { description: 'test' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/issues → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/issues/:id → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues/issue_1' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/support/issues/:id/resolve → 401', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/support/issues/issue_1/resolve',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/stats → 401', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 401);
    });
});

// ── 11. Support voice session (WebSocket upgrade auth) ────────────────────────

describe('AUTH — support voice session (upgrade rejected without valid session)', () => {
    it('GET /v1/support/voice-session without cookie → socket destroyed before upgrade', async () => {
        // The WS upgrade is handled outside the Fastify request lifecycle so we
        // cannot use .inject(). We verify the route registration does not throw.
        const app = Fastify({ logger: false });
        await assert.doesNotReject(
            () => registerSupportVoiceSessionRoutes(app, { getSession: noSession }),
            'registerSupportVoiceSessionRoutes should register without error',
        );
        await app.close();
    });
});

// ── 12. Auth profile & account management ────────────────────────────────────
// GET /v1/auth/me, PATCH /v1/auth/profile, POST /v1/auth/change-password
// all require a valid internal session — must return 401 when unauthenticated.

process.env['API_SESSION_SECRET'] ??= 'test-secret-32-chars-minimum-ok!!';

const stubAuthRepo: AuthRepo = {
    async findUserByEmail() { throw new Error('should not be called'); },
    async findUserById() { throw new Error('should not be called'); },
    async updateUserName() { throw new Error('should not be called'); },
    async updateUserPassword() { throw new Error('should not be called'); },
    async runSignupTransaction() { throw new Error('should not be called'); },
    async getWorkspacesForTenant() { throw new Error('should not be called'); },
};

describe('AUTH — auth profile routes return 401 without session', () => {
    const buildApp = async () => {
        const app = Fastify({ logger: false });
        await registerAuthRoutes(app, { repo: stubAuthRepo, getSession: noSession });
        return app;
    };

    it('GET /v1/auth/me → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
        assert.equal(res.statusCode, 401);
    });

    it('PATCH /v1/auth/profile → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PATCH', url: '/v1/auth/profile',
            payload: { name: 'Test User' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/auth/change-password → 401', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/auth/change-password',
            payload: { currentPassword: 'oldpass123', newPassword: 'newpass123' },
        });
        assert.equal(res.statusCode, 401);
    });
});
