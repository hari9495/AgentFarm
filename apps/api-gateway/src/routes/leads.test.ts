import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerLeadRoutes } from './leads.js';

// ---------------------------------------------------------------------------
// Minimal in-memory Prisma stub
// ---------------------------------------------------------------------------

let leadStore: Record<string, {
    id: string; firstName: string; lastName: string; email: string;
    company: string; message: string | null; leadSource: string;
    status: string; nurtureStep: number;
    lastContactAt: Date | null; nextContactAt: Date | null;
    qualifiedAt: Date | null; disqualifiedAt: Date | null; convertedAt: Date | null;
    sfLeadId: string | null; createdAt: Date; updatedAt: Date;
}> = {};

let idSeq = 0;

function makePrismaStub() {
    return {
        lead: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const id = `lead-${++idSeq}`;
                const now = new Date();
                const rec = {
                    id, firstName: String(data['firstName'] ?? ''),
                    lastName: String(data['lastName'] ?? ''),
                    email: String(data['email'] ?? ''),
                    company: String(data['company'] ?? ''),
                    message: (data['message'] as string | null) ?? null,
                    leadSource: String(data['leadSource'] ?? 'Web'),
                    status: String(data['status'] ?? 'NEW'),
                    nurtureStep: 0, lastContactAt: null, nextContactAt: null,
                    qualifiedAt: null, disqualifiedAt: null, convertedAt: null,
                    sfLeadId: null, createdAt: now, updatedAt: now,
                };
                leadStore[id] = rec;
                return rec;
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const rec = leadStore[where.id];
                if (!rec) throw new Error('not found');
                Object.assign(rec, data);
                return rec;
            },
            findUnique: async ({ where }: { where: { id: string } }) => {
                return leadStore[where.id] ?? null;
            },
            findMany: async ({ where, orderBy, skip, take }: {
                where?: Record<string, unknown>;
                orderBy?: Record<string, string>;
                skip?: number; take?: number;
            }) => {
                let list = Object.values(leadStore);
                if (where?.['status']) list = list.filter((l) => l.status === where['status']);
                if (orderBy?.['createdAt'] === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                return list.slice(skip ?? 0, (skip ?? 0) + (take ?? list.length));
            },
            count: async ({ where }: { where?: Record<string, unknown> }) => {
                let list = Object.values(leadStore);
                if (where?.['status']) list = list.filter((l) => l.status === where['status']);
                return list.length;
            },
        },
    } as never;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() { leadStore = {}; idSeq = 0; }

// ---------------------------------------------------------------------------
// POST /api/v1/leads — validation
// ---------------------------------------------------------------------------

test('POST /api/v1/leads returns 400 when lastName is missing', async () => {
    resetStore();
    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: { email: 'john@example.com', company: 'Acme' },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string };
        assert.match(body.error, /lastName/i);
    } finally {
        await app.close();
    }
});

test('POST /api/v1/leads returns 400 when email is missing', async () => {
    resetStore();
    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: { lastName: 'Doe', company: 'Acme' },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string };
        assert.match(body.error, /email/i);
    } finally {
        await app.close();
    }
});

test('POST /api/v1/leads returns 400 when company is missing', async () => {
    resetStore();
    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: { lastName: 'Doe', email: 'jane@example.com' },
        });
        assert.equal(res.statusCode, 400);
        const body = res.json() as { error: string };
        assert.match(body.error, /company/i);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /api/v1/leads — success without CRM (disabled by default)
// ---------------------------------------------------------------------------

test('POST /api/v1/leads returns 201 with salesforce.synced=false when lead sync disabled', async () => {
    resetStore();
    delete process.env['SALESFORCE_LEAD_SYNC_ENABLED'];

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                company: 'Acme Corp',
                description: 'Interested in enterprise plan',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { ok: boolean; lead: { email: string }; salesforce: { synced: boolean; id: string | null } };
        assert.equal(body.ok, true);
        assert.equal(body.lead.email, 'john@example.com');
        assert.equal(body.salesforce.synced, false);
        assert.equal(body.salesforce.id, null);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /api/v1/leads — Salesforce sync enabled, mock fetch success
// ---------------------------------------------------------------------------

test('POST /api/v1/leads syncs to Salesforce and returns salesforce.synced=true', async (t) => {
    resetStore();
    process.env['SALESFORCE_LEAD_SYNC_ENABLED'] = 'true';
    process.env['CRM_VENDOR'] = 'salesforce';
    process.env['CRM_ACCESS_TOKEN'] = 'test-token';
    process.env['CRM_INSTANCE_URL'] = 'https://test.salesforce.com';

    t.after(() => {
        delete process.env['SALESFORCE_LEAD_SYNC_ENABLED'];
        delete process.env['CRM_VENDOR'];
        delete process.env['CRM_ACCESS_TOKEN'];
        delete process.env['CRM_INSTANCE_URL'];
    });

    t.mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({ id: 'sf-lead-001', success: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
        }),
    );

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                company: 'Beta Ltd',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { ok: boolean; salesforce: { synced: boolean; id: string | null } };
        assert.equal(body.ok, true);
        assert.equal(body.salesforce.synced, true);
        assert.equal(body.salesforce.id, 'sf-lead-001');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /api/v1/leads — Salesforce sync enabled but fetch fails (non-fatal)
// ---------------------------------------------------------------------------

test('POST /api/v1/leads returns 201 even when Salesforce fetch throws', async (t) => {
    resetStore();
    process.env['SALESFORCE_LEAD_SYNC_ENABLED'] = 'true';
    process.env['CRM_VENDOR'] = 'salesforce';
    process.env['CRM_ACCESS_TOKEN'] = 'test-token';
    process.env['CRM_INSTANCE_URL'] = 'https://test.salesforce.com';

    t.after(() => {
        delete process.env['SALESFORCE_LEAD_SYNC_ENABLED'];
        delete process.env['CRM_VENDOR'];
        delete process.env['CRM_ACCESS_TOKEN'];
        delete process.env['CRM_INSTANCE_URL'];
    });

    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('Network error');
    });

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma: makePrismaStub() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: {
                lastName: 'Brown',
                email: 'brown@example.com',
                company: 'Gamma Inc',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { ok: boolean; salesforce: { synced: boolean } };
        assert.equal(body.ok, true);
        assert.equal(body.salesforce.synced, false);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /api/v1/leads — persists Lead record in DB
// ---------------------------------------------------------------------------

test('POST /api/v1/leads creates a Lead record in the database', async () => {
    resetStore();
    const prisma = makePrismaStub();
    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/leads',
            payload: {
                firstName: 'Alice',
                lastName: 'Chen',
                email: 'alice@example.com',
                company: 'DataCo',
                description: 'Wants a demo',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { ok: boolean; lead: { id: string; status: string } };
        assert.equal(body.ok, true);
        assert.ok(body.lead.id, 'lead.id should be set');
        assert.equal(body.lead.status, 'NEW');
        // verify it's actually in the store
        assert.ok(leadStore[body.lead.id], 'Lead should be persisted in store');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/leads/:id/status — set to NURTURE
// ---------------------------------------------------------------------------

test('PATCH /api/v1/leads/:id/status → NURTURE sets nextContactAt ~3 days out', async () => {
    resetStore();
    const prisma = makePrismaStub();
    // Seed a lead directly
    const now = new Date();
    const id = 'lead-patch-1';
    leadStore[id] = {
        id, firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com',
        company: 'Firm', message: null, leadSource: 'Web', status: 'NEW',
        nurtureStep: 0, lastContactAt: null, nextContactAt: null,
        qualifiedAt: null, disqualifiedAt: null, convertedAt: null,
        sfLeadId: null, createdAt: now, updatedAt: now,
    };

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: `/api/v1/leads/${id}/status`,
            payload: { status: 'NURTURE' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { ok: boolean; lead: { status: string; nextContactAt: string | null } };
        assert.equal(body.ok, true);
        assert.equal(body.lead.status, 'NURTURE');
        assert.ok(body.lead.nextContactAt, 'nextContactAt should be set');
        const diff = new Date(body.lead.nextContactAt!).getTime() - Date.now();
        // Should be approximately 3 days (allow ±1 minute tolerance)
        assert.ok(diff > 0, 'nextContactAt should be in the future');
        assert.ok(diff < 3 * 24 * 60 * 60 * 1000 + 60_000, 'nextContactAt should be within ~3 days');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/leads/:id/status — set to QUALIFIED
// ---------------------------------------------------------------------------

test('PATCH /api/v1/leads/:id/status → QUALIFIED sets qualifiedAt', async () => {
    resetStore();
    const prisma = makePrismaStub();
    const now = new Date();
    const id = 'lead-patch-2';
    leadStore[id] = {
        id, firstName: 'Carol', lastName: 'West', email: 'carol@example.com',
        company: 'SalesInc', message: null, leadSource: 'Web', status: 'NURTURE',
        nurtureStep: 1, lastContactAt: now, nextContactAt: null,
        qualifiedAt: null, disqualifiedAt: null, convertedAt: null,
        sfLeadId: null, createdAt: now, updatedAt: now,
    };

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: `/api/v1/leads/${id}/status`,
            payload: { status: 'QUALIFIED' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { ok: boolean; lead: { status: string; qualifiedAt: string | null } };
        assert.equal(body.ok, true);
        assert.equal(body.lead.status, 'QUALIFIED');
        assert.ok(body.lead.qualifiedAt, 'qualifiedAt should be set');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// GET /api/v1/leads — paginated list
// ---------------------------------------------------------------------------

test('GET /api/v1/leads returns paginated leads', async () => {
    resetStore();
    const prisma = makePrismaStub();
    // seed 3 leads
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
        const id = `lead-list-${i}`;
        leadStore[id] = {
            id, firstName: `User${i}`, lastName: 'Test', email: `user${i}@example.com`,
            company: 'Corp', message: null, leadSource: 'Web', status: 'NEW',
            nurtureStep: 0, lastContactAt: null, nextContactAt: null,
            qualifiedAt: null, disqualifiedAt: null, convertedAt: null,
            sfLeadId: null, createdAt: now, updatedAt: now,
        };
    }

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma });
    try {
        const res = await app.inject({ method: 'GET', url: '/api/v1/leads?page=1&limit=10' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { leads: unknown[]; total: number; page: number; limit: number };
        assert.equal(body.total, 3);
        assert.equal(body.leads.length, 3);
        assert.equal(body.page, 1);
        assert.equal(body.limit, 10);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// GET /api/v1/leads?status=NURTURE — filtered list
// ---------------------------------------------------------------------------

test('GET /api/v1/leads?status=NURTURE returns only nurture leads', async () => {
    resetStore();
    const prisma = makePrismaStub();
    const now = new Date();
    const statuses = ['NEW', 'NURTURE', 'NURTURE', 'QUALIFIED'];
    for (let i = 0; i < statuses.length; i++) {
        const id = `lead-filter-${i}`;
        leadStore[id] = {
            id, firstName: `F${i}`, lastName: 'Last', email: `f${i}@example.com`,
            company: 'Co', message: null, leadSource: 'Web', status: statuses[i]!,
            nurtureStep: 0, lastContactAt: null, nextContactAt: null,
            qualifiedAt: null, disqualifiedAt: null, convertedAt: null,
            sfLeadId: null, createdAt: now, updatedAt: now,
        };
    }

    const app = Fastify({ logger: false });
    registerLeadRoutes(app, { prisma });
    try {
        const res = await app.inject({ method: 'GET', url: '/api/v1/leads?status=NURTURE' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { leads: { status: string }[]; total: number };
        assert.equal(body.total, 2);
        assert.ok(body.leads.every((l) => l.status === 'NURTURE'), 'all leads should be NURTURE');
    } finally {
        await app.close();
    }
});
