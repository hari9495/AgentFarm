import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerLeadRoutes } from './leads.js';

// ---------------------------------------------------------------------------
// POST /api/v1/leads — validation
// ---------------------------------------------------------------------------

test('POST /api/v1/leads returns 400 when lastName is missing', async () => {
    const app = Fastify({ logger: false });
    registerLeadRoutes(app);
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
    const app = Fastify({ logger: false });
    registerLeadRoutes(app);
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
    const app = Fastify({ logger: false });
    registerLeadRoutes(app);
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
    // Ensure feature flag is off
    delete process.env['SALESFORCE_LEAD_SYNC_ENABLED'];

    const app = Fastify({ logger: false });
    registerLeadRoutes(app);
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
    registerLeadRoutes(app);
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
    registerLeadRoutes(app);
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
        // Should still succeed — Salesforce failure is non-fatal
        assert.equal(res.statusCode, 201);
        const body = res.json() as { ok: boolean; salesforce: { synced: boolean } };
        assert.equal(body.ok, true);
        assert.equal(body.salesforce.synced, false);
    } finally {
        await app.close();
    }
});
