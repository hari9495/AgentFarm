/**
 * Tests for GET /v1/support/stats
 *
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

function buildApp(authenticated = true) {
    const app = Fastify({ logger: false });
    void registerSupportIssueRoutes(app, {
        getSession: authenticated ? () => SESSION : () => null,
    });
    return app;
}

function makeIssue(overrides: Partial<SupportIssueRecord> = {}): SupportIssueRecord {
    return {
        id: Math.random().toString(36).slice(2),
        tenantId: 'tenant_test',
        workspaceId: null,
        title: 'Test issue',
        description: 'Something broken',
        severity: 'medium',
        status: 'resolved',
        tierReached: 1,
        fixApplied: true,
        diagnosisReport: null,
        resolutionNotes: null,
        escalatedTo: null,
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    issueStore.clear();
    stepStore.clear();
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe('GET /v1/support/stats — auth', () => {
    it('returns 401 when not authenticated', async () => {
        const res = await buildApp(false).inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 401);
    });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('GET /v1/support/stats — empty store', () => {
    it('returns all zeros when no issues exist', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.thisWeek, 0);
        assert.equal(body.thisMonth, 0);
        assert.equal(body.totalResolved, 0);
        assert.equal(body.tier1AutoFixRate, 0);
        assert.deepEqual(body.tierBreakdown, { 1: 0, 2: 0, 3: 0, 4: 0 });
    });
});

// ---------------------------------------------------------------------------
// Counting resolved issues
// ---------------------------------------------------------------------------

describe('GET /v1/support/stats — resolved count', () => {
    it('counts only resolved issues in totalResolved', async () => {
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved' }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved' }));
        issueStore.set('o1', makeIssue({ id: 'o1', status: 'open' }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().totalResolved, 2);
    });

    it('counts issues created this week in thisWeek', async () => {
        const recentAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const oldAt    = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', createdAt: recentAt }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved', createdAt: oldAt }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().thisWeek, 1);
    });

    it('counts issues created this month in thisMonth', async () => {
        const recent  = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
        const old     = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', createdAt: recent }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved', createdAt: old }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().thisMonth, 1);
    });
});

// ---------------------------------------------------------------------------
// Tier breakdown
// ---------------------------------------------------------------------------

describe('GET /v1/support/stats — tier breakdown', () => {
    it('groups resolved issues by tierReached', async () => {
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', tierReached: 1 }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved', tierReached: 1 }));
        issueStore.set('r3', makeIssue({ id: 'r3', status: 'resolved', tierReached: 2 }));
        issueStore.set('r4', makeIssue({ id: 'r4', status: 'resolved', tierReached: 4 }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        const body = res.json();
        assert.equal(body.tierBreakdown['1'], 2);
        assert.equal(body.tierBreakdown['2'], 1);
        assert.equal(body.tierBreakdown['3'], 0);
        assert.equal(body.tierBreakdown['4'], 1);
    });

    it('excludes non-resolved issues from tierBreakdown', async () => {
        issueStore.set('o1', makeIssue({ id: 'o1', status: 'open', tierReached: 1 }));
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', tierReached: 1 }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().tierBreakdown['1'], 1);
    });
});

// ---------------------------------------------------------------------------
// Tier 1 auto-fix rate
// ---------------------------------------------------------------------------

describe('GET /v1/support/stats — tier1AutoFixRate', () => {
    it('is 100 when all resolved issues were tier 1', async () => {
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', tierReached: 1 }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved', tierReached: 1 }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().tier1AutoFixRate, 100);
    });

    it('is 0 when no resolved issues exist', async () => {
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().tier1AutoFixRate, 0);
    });

    it('computes partial rate correctly', async () => {
        issueStore.set('r1', makeIssue({ id: 'r1', status: 'resolved', tierReached: 1 }));
        issueStore.set('r2', makeIssue({ id: 'r2', status: 'resolved', tierReached: 2 }));
        issueStore.set('r3', makeIssue({ id: 'r3', status: 'resolved', tierReached: 2 }));
        issueStore.set('r4', makeIssue({ id: 'r4', status: 'resolved', tierReached: 2 }));
        const res = await buildApp().inject({ method: 'GET', url: '/v1/support/stats' });
        assert.equal(res.json().tier1AutoFixRate, 25);
    });
});
