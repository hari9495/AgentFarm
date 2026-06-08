/**
 * support-issue.test.ts
 *
 * Tests for the SupportIssue REST routes and SSE stream.
 * Uses Fastify inject — no real HTTP needed.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import Fastify from 'fastify';
import {
    registerSupportIssueRoutes,
    issueStore,
    stepStore,
    type SupportIssueRecord,
} from './support-issue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = {
    userId: 'u1',
    tenantId: 'tenant_test',
    workspaceIds: ['ws1'],
    expiresAt: Date.now() + 3_600_000,
};

const noSession = () => null;
const withSession = () => SESSION;

function buildApp(authenticated = true) {
    const app = Fastify({ logger: false });
    void registerSupportIssueRoutes(app, {
        getSession: authenticated ? withSession : noSession,
    });
    return app;
}

// Ensure stores are reset between tests
beforeEach(() => {
    issueStore.clear();
    stepStore.clear();
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe('SupportIssue — auth', () => {
    it('POST /v1/support/issues → 401 without session', async () => {
        const res = await buildApp(false).inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { description: 'test' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/issues → 401 without session', async () => {
        const res = await buildApp(false).inject({ method: 'GET', url: '/v1/support/issues' });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/issues/:id → 401 without session', async () => {
        const res = await buildApp(false).inject({ method: 'GET', url: '/v1/support/issues/any' });
        assert.equal(res.statusCode, 401);
    });

    it('POST /v1/support/issues/:id/resolve → 401 without session', async () => {
        const res = await buildApp(false).inject({
            method: 'POST',
            url: '/v1/support/issues/any/resolve',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    });

    it('GET /v1/support/stats → 401 without session', async () => {
        const res = await buildApp(false).inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 401);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/support/issues
// ---------------------------------------------------------------------------

describe('SupportIssue — POST /v1/support/issues', () => {
    it('creates an issue with required fields', async () => {
        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { description: 'Agents are not starting' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<SupportIssueRecord>();
        assert.ok(body.id);
        assert.equal(body.tenantId, SESSION.tenantId);
        assert.equal(body.status, 'open');
        assert.equal(body.description, 'Agents are not starting');
        assert.equal(body.title, 'Untitled issue');
        assert.equal(body.severity, 'medium');
        assert.equal(body.fixApplied, false);
        assert.equal(body.tierReached, null);
        assert.equal(body.source, 'operator', 'REST-created issues are always operator-originated');
    });

    it('accepts optional title and severity', async () => {
        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { title: 'Billing stopped', description: 'Budget hit', severity: 'critical' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<SupportIssueRecord>();
        assert.equal(body.title, 'Billing stopped');
        assert.equal(body.severity, 'critical');
    });

    it('rejects invalid severity — defaults to medium', async () => {
        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { description: 'test', severity: 'bogus' },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(res.json<SupportIssueRecord>().severity, 'medium');
    });

    it('returns 400 if description missing', async () => {
        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { title: 'no description' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('stores the issue in issueStore', async () => {
        await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues',
            payload: { description: 'connector down' },
        });
        assert.equal(issueStore.size, 1);
        const [issue] = issueStore.values();
        assert.equal(issue!.tenantId, SESSION.tenantId);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/support/issues (plain JSON list)
// ---------------------------------------------------------------------------

describe('SupportIssue — GET /v1/support/issues (list)', () => {
    it('returns empty list when no issues exist', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json<{ issues: unknown[] }>().issues, []);
    });

    it('returns only issues for the authenticated tenant', async () => {
        // Seed one issue for this tenant, one for another
        issueStore.set('id1', {
            id: 'id1', tenantId: SESSION.tenantId, workspaceId: null, title: 'mine',
            description: 'a', status: 'open', severity: 'low', source: 'operator', tierReached: null,
            fixApplied: false, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });
        issueStore.set('id2', {
            id: 'id2', tenantId: 'other_tenant', workspaceId: null, title: 'theirs',
            description: 'b', status: 'open', severity: 'low', source: 'operator', tierReached: null,
            fixApplied: false, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });

        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues' });
        assert.equal(res.statusCode, 200);
        const { issues } = res.json<{ issues: SupportIssueRecord[] }>();
        assert.equal(issues.length, 1);
        assert.equal(issues[0]!.id, 'id1');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/support/issues/:id
// ---------------------------------------------------------------------------

describe('SupportIssue — GET /v1/support/issues/:id', () => {
    it('returns 404 for unknown issue', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues/nope' });
        assert.equal(res.statusCode, 404);
    });

    it('returns 403 for another tenant\'s issue', async () => {
        issueStore.set('foreign', {
            id: 'foreign', tenantId: 'other_tenant', workspaceId: null, title: 't',
            description: 'd', status: 'open', severity: 'low', source: 'operator', tierReached: null,
            fixApplied: false, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues/foreign' });
        assert.equal(res.statusCode, 403);
    });

    it('returns issue with steps array', async () => {
        issueStore.set('my1', {
            id: 'my1', tenantId: SESSION.tenantId, workspaceId: null, title: 'ok',
            description: 'desc', status: 'diagnosing', severity: 'medium', source: 'operator', tierReached: null,
            fixApplied: false, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/issues/my1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<SupportIssueRecord & { steps: unknown[] }>();
        assert.equal(body.id, 'my1');
        assert.ok(Array.isArray(body.steps));
    });
});

// ---------------------------------------------------------------------------
// POST /v1/support/issues/:id/resolve
// ---------------------------------------------------------------------------

describe('SupportIssue — POST /v1/support/issues/:id/resolve', () => {
    it('marks issue resolved', async () => {
        issueStore.set('r1', {
            id: 'r1', tenantId: SESSION.tenantId, workspaceId: null, title: 't',
            description: 'd', status: 'open', severity: 'medium', source: 'operator', tierReached: 1,
            fixApplied: true, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });

        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues/r1/resolve',
            payload: { resolutionNotes: 'Fixed by Tier 1' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<SupportIssueRecord>();
        assert.equal(body.status, 'resolved');
        assert.equal(body.resolutionNotes, 'Fixed by Tier 1');
        assert.ok(body.resolvedAt);
    });

    it('returns 409 if already resolved', async () => {
        issueStore.set('r2', {
            id: 'r2', tenantId: SESSION.tenantId, workspaceId: null, title: 't',
            description: 'd', status: 'resolved', severity: 'low', source: 'operator', tierReached: 1,
            fixApplied: true, diagnosisReport: null, resolutionNotes: 'done',
            escalatedTo: null, createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
        });

        const res = await buildApp().inject({
            method: 'POST',
            url: '/v1/support/issues/r2/resolve',
            payload: {},
        });
        assert.equal(res.statusCode, 409);
    });

    it('returns 404 for unknown issue', async () => {
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/support/issues/nope/resolve', payload: {},
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 403 for another tenant\'s issue', async () => {
        issueStore.set('r3', {
            id: 'r3', tenantId: 'other', workspaceId: null, title: 't',
            description: 'd', status: 'open', severity: 'low', source: 'operator', tierReached: null,
            fixApplied: false, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });
        const res = await buildApp().inject({
            method: 'POST', url: '/v1/support/issues/r3/resolve', payload: {},
        });
        assert.equal(res.statusCode, 403);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/support/stats
// ---------------------------------------------------------------------------

describe('SupportIssue — GET /v1/support/stats', () => {
    it('returns zero stats when no issues', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 200);
        const body = res.json<Record<string, unknown>>();
        assert.equal(body['totalResolved'], 0);
        assert.equal(body['tier1AutoFixRate'], 0);
    });

    it('counts resolved issues and computes tier breakdown', async () => {
        const base = {
            workspaceId: null, description: 'd', status: 'resolved' as const, severity: 'medium' as const,
            source: 'operator' as const,
            fixApplied: true, diagnosisReport: null, resolutionNotes: null,
            escalatedTo: null, createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
        };
        issueStore.set('s1', { ...base, id: 's1', tenantId: SESSION.tenantId, title: 'A', tierReached: 1 });
        issueStore.set('s2', { ...base, id: 's2', tenantId: SESSION.tenantId, title: 'B', tierReached: 1 });
        issueStore.set('s3', { ...base, id: 's3', tenantId: SESSION.tenantId, title: 'C', tierReached: 2 });
        // Another tenant — should not be counted
        issueStore.set('s4', { ...base, id: 's4', tenantId: 'other', title: 'D', tierReached: 1 });

        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ totalResolved: number; tier1AutoFixRate: number; tierBreakdown: Record<string, number> }>();
        assert.equal(body.totalResolved, 3);
        assert.equal(body.tier1AutoFixRate, 67); // 2/3 ≈ 67%
        assert.equal(body.tierBreakdown['1'], 2);
        assert.equal(body.tierBreakdown['2'], 1);
    });
});
