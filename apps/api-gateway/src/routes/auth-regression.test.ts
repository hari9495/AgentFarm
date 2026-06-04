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
import { registerSkillCompositionRoutes } from './runtime/skill-composition-execute.js';
import { registerLeadRoutes } from './sales/leads.js';

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
