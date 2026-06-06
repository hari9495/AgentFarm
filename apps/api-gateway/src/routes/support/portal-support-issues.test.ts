/**
 * portal-support-issues.test.ts
 *
 * Integration tests for GET /v1/portal/support/issues —
 * the portal-auth-scoped issue list endpoint.
 *
 * Uses mock portal session verification (no real DB) by passing a custom
 * prisma-like object, and seeds the in-memory issueStore directly.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { issueStore } from './support-issue.js';
import { registerSupportIssueRoutes, type RegisterSupportIssueRoutesOptions } from './support-issue.js';

// ---------------------------------------------------------------------------
// Mock portal session DB (replaces real Prisma for tests)
// ---------------------------------------------------------------------------

type MockSession = { tenantId: string; accountId: string; email: string; role: string; displayName: null; expiresAt: Date };

function buildMockPrisma(sessions: Map<string, MockSession>) {
    return {
        // supportIssue mock — upsert is a no-op in tests
        supportIssue: {
            findMany: async () => [],
            upsert: async () => ({}),
        },
        supportDiagnosisStep: {
            upsert: async () => ({}),
        },
        // tenantPortalSession mock used by verifyPortalSession
        tenantPortalSession: {
            findUnique: async ({ where }: { where: { token: string } }) => {
                const session = sessions.get(where.token);
                if (!session) return null;
                return {
                    id: `sess-${where.token}`,
                    accountId: session.accountId,
                    tenantId: session.tenantId,
                    expiresAt: session.expiresAt,
                    account: {
                        id: session.accountId,
                        email: session.email,
                        role: session.role,
                        displayName: session.displayName,
                    },
                };
            },
            update: async () => ({}),
            delete: async () => ({}),
        },
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'portal-test-token-valid';
const TENANT_ID = 'portal-issue-test-tenant';

function seedIssue(id: string, tenantId = TENANT_ID) {
    issueStore.set(id, {
        id, tenantId, workspaceId: null,
        title: `Issue ${id}`, description: 'test',
        status: 'open', severity: 'medium',
        tierReached: null, fixApplied: false, diagnosisReport: null,
        resolutionNotes: null, escalatedTo: null,
        createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/portal/support/issues', () => {
    let app: FastifyInstance;
    const sessions = new Map<string, MockSession>();

    before(async () => {
        sessions.set(VALID_TOKEN, {
            tenantId: TENANT_ID,
            accountId: 'acc-1',
            email: 'portal@test.io',
            role: 'member',
            displayName: null,
            expiresAt: new Date(Date.now() + 3_600_000),
        });

        app = Fastify({ logger: false });
        const opts: RegisterSupportIssueRoutesOptions = {
            getSession: () => null, // portal endpoint doesn't use agentfarm_session
            prisma: buildMockPrisma(sessions) as never,
        };
        await registerSupportIssueRoutes(app, opts);
        await app.listen({ port: 0, host: '127.0.0.1' });
    });

    after(async () => { await app.close(); });

    beforeEach(() => { issueStore.clear(); });

    it('returns issues for the authenticated tenant', async () => {
        seedIssue('pi-1');
        seedIssue('pi-2');
        seedIssue('pi-other', 'different-tenant');

        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues',
            headers: { cookie: `portal_session=${VALID_TOKEN}` },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ issues: { id: string }[] }>();
        const ids = body.issues.map((i) => i.id);
        assert.ok(ids.includes('pi-1'), 'should include own issue pi-1');
        assert.ok(ids.includes('pi-2'), 'should include own issue pi-2');
        assert.ok(!ids.includes('pi-other'), 'should NOT include other-tenant issue');
    });

    it('returns empty array when tenant has no issues', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues',
            headers: { cookie: `portal_session=${VALID_TOKEN}` },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json<{ issues: unknown[] }>().issues, []);
    });

    it('filters by status when ?status= param provided', async () => {
        seedIssue('ps-open');
        issueStore.set('ps-resolved', {
            id: 'ps-resolved', tenantId: TENANT_ID, workspaceId: null,
            title: 'resolved issue', description: 'r', status: 'resolved',
            severity: 'low', tierReached: 1, fixApplied: true, diagnosisReport: null,
            resolutionNotes: 'done', escalatedTo: null, prUrl: null,
            createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues?status=resolved',
            headers: { cookie: `portal_session=${VALID_TOKEN}` },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ issues: { id: string; status: string }[] }>();
        assert.ok(body.issues.every((i) => i.status === 'resolved'));
        assert.ok(!body.issues.some((i) => i.id === 'ps-open'));
    });

    it('returns 401 with no cookie', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/portal/support/issues' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 401 with an unknown portal_session token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues',
            headers: { cookie: 'portal_session=unknown-bogus-token' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 401 with expired portal_session', async () => {
        sessions.set('expired-portal-token', {
            tenantId: TENANT_ID, accountId: 'acc-exp',
            email: 'exp@test.io', role: 'member', displayName: null,
            expiresAt: new Date(Date.now() - 1_000), // in the past
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues',
            headers: { cookie: 'portal_session=expired-portal-token' },
        });
        assert.equal(res.statusCode, 401);

        sessions.delete('expired-portal-token');
    });

    it('issues are sorted newest-first', async () => {
        issueStore.set('old-issue', {
            id: 'old-issue', tenantId: TENANT_ID, workspaceId: null,
            title: 'old', description: 'o', status: 'open', severity: 'low',
            tierReached: null, fixApplied: false, diagnosisReport: null,
            resolutionNotes: null, escalatedTo: null,
            createdAt: new Date(Date.now() - 10_000).toISOString(), prUrl: null, resolvedAt: null,
        });
        issueStore.set('new-issue', {
            id: 'new-issue', tenantId: TENANT_ID, workspaceId: null,
            title: 'new', description: 'n', status: 'open', severity: 'low',
            tierReached: null, fixApplied: false, diagnosisReport: null,
            resolutionNotes: null, escalatedTo: null,
            createdAt: new Date().toISOString(), prUrl: null, resolvedAt: null,
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/portal/support/issues',
            headers: { cookie: `portal_session=${VALID_TOKEN}` },
        });

        assert.equal(res.statusCode, 200);
        const ids = res.json<{ issues: { id: string }[] }>().issues.map((i) => i.id);
        assert.equal(ids[0], 'new-issue', 'newest issue should be first');
        assert.equal(ids[1], 'old-issue');
    });
});
