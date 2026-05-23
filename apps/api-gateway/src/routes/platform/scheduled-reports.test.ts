import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerScheduledReportRoutes } from './scheduled-reports.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildSession = (role = 'operator', tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

type ReportRow = {
    id: string;
    tenantId: string;
    workspaceId: string;
    name: string;
    recipientEmail: string;
    frequency: string;
    reportTypes: string[];
    enabled: boolean;
    nextSendAt: Date;
    lastSentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

const makeRow = (overrides?: Partial<ReportRow>): ReportRow => ({
    id: 'report_1',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    name: 'Weekly Digest',
    recipientEmail: 'owner@example.com',
    frequency: 'weekly',
    reportTypes: ['cost'],
    enabled: true,
    nextSendAt: new Date(),
    lastSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const buildPrismaStub = (overrides: Partial<{
    create: (args: unknown) => Promise<ReportRow>;
    findMany: (args: unknown) => Promise<ReportRow[]>;
    findUnique: (args: unknown) => Promise<ReportRow | null>;
    update: (args: unknown) => Promise<ReportRow>;
    delete: (args: unknown) => Promise<ReportRow>;
}> = {}) => ({
    scheduledReport: {
        create: overrides.create ?? (async (_args: unknown) => makeRow()),
        findMany: overrides.findMany ?? (async (_args: unknown) => []),
        findUnique: overrides.findUnique ?? (async (_args: unknown) => null),
        update: overrides.update ?? (async (_args: unknown) => makeRow()),
        delete: overrides.delete ?? (async (_args: unknown) => makeRow()),
    },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('POST /v1/scheduled-reports — valid body — returns 201 with report', async () => {
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/scheduled-reports',
            payload: {
                name: 'Weekly Digest',
                workspaceId: 'ws_1',
                recipientEmail: 'owner@example.com',
                frequency: 'weekly',
                reportTypes: ['cost'],
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.report, 'response should have report field');
    } finally {
        await app.close();
    }
});

test('POST /v1/scheduled-reports — invalid frequency — returns 400', async () => {
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/scheduled-reports',
            payload: {
                name: 'Bad Freq',
                workspaceId: 'ws_1',
                recipientEmail: 'owner@example.com',
                frequency: 'hourly',
                reportTypes: ['cost'],
            },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.ok(body.error, 'should return error message');
    } finally {
        await app.close();
    }
});

test('POST /v1/scheduled-reports — invalid reportType — returns 400', async () => {
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/scheduled-reports',
            payload: {
                name: 'Bad Type',
                workspaceId: 'ws_1',
                recipientEmail: 'owner@example.com',
                frequency: 'weekly',
                reportTypes: ['unknown'],
            },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/scheduled-reports — invalid email — returns 400', async () => {
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/scheduled-reports',
            payload: {
                name: 'Bad Email',
                workspaceId: 'ws_1',
                recipientEmail: 'not-an-email',
                frequency: 'weekly',
                reportTypes: ['cost'],
            },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('GET /v1/scheduled-reports — filters by tenant — returns 200 with reports array', async () => {
    const session = buildSession('viewer', 'tenant_1');
    const row = makeRow({ tenantId: 'tenant_1' });
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findMany: async (_args) => [row],
            }) as never,
        });
        const res = await app.inject({ method: 'GET', url: '/v1/scheduled-reports' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.reports), 'reports should be an array');
        assert.equal(body.reports.length, 1);
    } finally {
        await app.close();
    }
});

test('PATCH /v1/scheduled-reports/:reportId — updates enabled field — returns 200', async () => {
    const session = buildSession('operator', 'tenant_1');
    const row = makeRow({ tenantId: 'tenant_1' });
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findUnique: async () => row,
                update: async () => ({ ...row, enabled: false }),
            }) as never,
        });
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/scheduled-reports/report_1',
            payload: { enabled: false },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(body.report, 'should return updated report');
    } finally {
        await app.close();
    }
});

test('DELETE /v1/scheduled-reports/:reportId — deletes and returns { deleted: true }', async () => {
    const session = buildSession('operator', 'tenant_1');
    const row = makeRow({ tenantId: 'tenant_1' });
    const app = Fastify({ logger: false });
    try {
        await registerScheduledReportRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findUnique: async () => row,
                delete: async () => row,
            }) as never,
        });
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/scheduled-reports/report_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.deleted, true);
    } finally {
        await app.close();
    }
});
