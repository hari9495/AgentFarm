import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerTenantBrandingRoutes } from './tenant-branding.js';

// ---------------------------------------------------------------------------
// In-memory branding store + raw-SQL stub
// ---------------------------------------------------------------------------
type BrandingRow = {
    id: string; tenantId: string;
    companyName: string | null; logoUrl: string | null;
    primaryColor: string | null; portalTitle: string | null;
    faviconUrl: string | null;
};

let brandingStore = new Map<string, BrandingRow>();

function resetStore() { brandingStore = new Map(); }

// Parse SET clause from the $executeRawUnsafe UPDATE string.
// Handles: "col" = 'value', "col" = NULL, "col" = NOW()
function applyUpdateSql(sql: string, tenantId: string): void {
    const existing = brandingStore.get(tenantId);
    if (!existing) return;
    const setMatch = sql.match(/SET (.+) WHERE/s);
    if (!setMatch) return;
    // Split only on commas that immediately precede a quoted column name
    const parts = setMatch[1].split(/,\s*(?=")/);
    for (const part of parts) {
        const m = part.trim().match(/^"(\w+)"\s*=\s*(.+)$/);
        if (!m) continue;
        const [, col, rawVal] = m;
        if (rawVal === 'NULL') {
            (existing as Record<string, unknown>)[col] = null;
        } else if (rawVal === 'NOW()') {
            (existing as Record<string, unknown>)[col] = new Date().toISOString();
        } else if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
            (existing as Record<string, unknown>)[col] = rawVal.slice(1, -1).replace(/''/g, "'");
        }
    }
}

function makePrismaStub() {
    return {
        // Tagged template — SELECT or INSERT (based on SQL text in strings[0])
        $queryRaw: async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
            const sql = strings[0] ?? '';
            if (sql.includes('SELECT') && sql.includes('TenantBranding')) {
                const tenantId = values[0] as string;
                const row = brandingStore.get(tenantId);
                return (row ? [row] : []) as unknown as T;
            }
            return [] as unknown as T;
        },
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
            const sql = strings[0] ?? '';
            if (sql.includes('INSERT INTO "TenantBranding"')) {
                // Template params: id, tenantId, companyName, logoUrl, primaryColor, portalTitle, faviconUrl, now, now
                const [id, tenantId, companyName, logoUrl, primaryColor, portalTitle, faviconUrl] = values as (string | null)[];
                brandingStore.set(tenantId!, {
                    id: id!, tenantId: tenantId!,
                    companyName: companyName ?? null,
                    logoUrl: logoUrl ?? null,
                    primaryColor: primaryColor ?? null,
                    portalTitle: portalTitle ?? null,
                    faviconUrl: faviconUrl ?? null,
                });
            } else if (sql.includes('DELETE FROM "TenantBranding"')) {
                brandingStore.delete(values[0] as string);
            }
            return 1;
        },
        $executeRawUnsafe: async (sql: string, ...params: unknown[]): Promise<number> => {
            if (/^UPDATE "TenantBranding"/.test(sql)) {
                applyUpdateSql(sql, params[0] as string);
            }
            return 1;
        },
    } as never;
}

// ---------------------------------------------------------------------------
// Session factories (ROLE_RANK: viewer=1, operator=2, admin=3, owner=4)
// ---------------------------------------------------------------------------
const session = (role = 'operator') => ({
    userId: 'user_1', tenantId: 'tenant_1',
    workspaceIds: ['ws_1'], role,
    expiresAt: Date.now() + 60_000,
});

// ===========================================================================
// GET /v1/tenant/branding
// ===========================================================================

describe('GET /v1/tenant/branding', () => {
    test('401 when no session', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 401);
        } finally { await app.close(); }
    });

    test('200 returns configured:false when no branding exists', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ branding: { configured: boolean } }>();
            assert.equal(body.branding.configured, false);
        } finally { await app.close(); }
    });

    test('200 returns configured:true with fields when branding exists', async () => {
        resetStore();
        brandingStore.set('tenant_1', {
            id: 'b1', tenantId: 'tenant_1',
            companyName: 'Acme Corp', logoUrl: 'https://example.com/logo.png',
            primaryColor: '#0052cc', portalTitle: 'Acme Portal', faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 200);
            const { branding } = res.json<{ branding: Record<string, unknown> }>();
            assert.equal(branding['configured'], true);
            assert.equal(branding['company_name'], 'Acme Corp');
            assert.equal(branding['logo_url'], 'https://example.com/logo.png');
            assert.equal(branding['primary_color'], '#0052cc');
            assert.equal(branding['portal_title'], 'Acme Portal');
            assert.equal(branding['favicon_url'], null);
        } finally { await app.close(); }
    });

    test('200 does not return another tenant branding', async () => {
        resetStore();
        brandingStore.set('tenant_other', {
            id: 'b2', tenantId: 'tenant_other',
            companyName: 'Other Corp', logoUrl: null, primaryColor: null,
            portalTitle: null, faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ branding: { configured: boolean } }>().branding.configured, false);
        } finally { await app.close(); }
    });
});

// ===========================================================================
// PUT /v1/tenant/branding
// ===========================================================================

describe('PUT /v1/tenant/branding', () => {
    test('401 when no session', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/tenant/branding', payload: { company_name: 'Acme' } });
            assert.equal(res.statusCode, 401);
        } finally { await app.close(); }
    });

    test('403 when role is viewer (below operator)', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session('viewer'), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/tenant/branding', payload: { company_name: 'Acme' } });
            assert.equal(res.statusCode, 403);
            assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
        } finally { await app.close(); }
    });

    test('400 when logo_url is not a valid URL', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/tenant/branding', payload: { logo_url: 'not-a-url' } });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /logo_url/i);
        } finally { await app.close(); }
    });

    test('400 when favicon_url is not a valid URL', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/tenant/branding', payload: { favicon_url: 'ftp://bad-scheme.com' } });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /favicon_url/i);
        } finally { await app.close(); }
    });

    test('400 when primary_color is not a valid hex color', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/tenant/branding', payload: { primary_color: 'blue' } });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /hex color/i);
        } finally { await app.close(); }
    });

    test('200 creates branding when none exists (INSERT path)', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/tenant/branding',
                payload: { company_name: 'Acme Corp', primary_color: '#0052cc' },
            });
            assert.equal(res.statusCode, 200);
            const { branding } = res.json<{ branding: Record<string, unknown> }>();
            assert.equal(branding['company_name'], 'Acme Corp');
            assert.equal(branding['primary_color'], '#0052cc');
            assert.equal(branding['configured'], true);
            assert.ok(brandingStore.has('tenant_1'), 'record must be persisted');
        } finally { await app.close(); }
    });

    test('200 updates branding when one exists (UPDATE path)', async () => {
        resetStore();
        brandingStore.set('tenant_1', {
            id: 'b1', tenantId: 'tenant_1',
            companyName: 'Old Name', logoUrl: null, primaryColor: '#aabbcc',
            portalTitle: null, faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/tenant/branding',
                payload: { company_name: 'New Name', primary_color: '#ffffff' },
            });
            assert.equal(res.statusCode, 200);
            const { branding } = res.json<{ branding: Record<string, unknown> }>();
            assert.equal(branding['company_name'], 'New Name');
            assert.equal(branding['primary_color'], '#ffffff');
        } finally { await app.close(); }
    });

    test('200 clears a field when empty string is supplied', async () => {
        resetStore();
        brandingStore.set('tenant_1', {
            id: 'b1', tenantId: 'tenant_1',
            companyName: 'Acme', logoUrl: 'https://example.com/logo.png',
            primaryColor: null, portalTitle: null, faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/tenant/branding',
                payload: { logo_url: '' },
            });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ branding: Record<string, unknown> }>().branding['logo_url'], null);
        } finally { await app.close(); }
    });

    test('200 accepts operator role', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session('operator'), prisma: makePrismaStub() });
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/tenant/branding',
                payload: { company_name: 'Op Corp' },
            });
            assert.equal(res.statusCode, 200);
        } finally { await app.close(); }
    });

    test('200 accepts valid 3-digit hex color', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/tenant/branding',
                payload: { primary_color: '#abc' },
            });
            assert.equal(res.statusCode, 200);
        } finally { await app.close(); }
    });
});

// ===========================================================================
// DELETE /v1/tenant/branding
// ===========================================================================

describe('DELETE /v1/tenant/branding', () => {
    test('401 when no session', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 401);
        } finally { await app.close(); }
    });

    test('403 when role is operator (below admin)', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session('operator'), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 403);
        } finally { await app.close(); }
    });

    test('204 deletes branding and removes from store', async () => {
        resetStore();
        brandingStore.set('tenant_1', {
            id: 'b1', tenantId: 'tenant_1',
            companyName: 'Acme', logoUrl: null, primaryColor: null,
            portalTitle: null, faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session('admin'), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 204);
            assert.equal(brandingStore.has('tenant_1'), false);
        } finally { await app.close(); }
    });

    test('204 idempotent when no branding exists', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session('admin'), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/tenant/branding' });
            assert.equal(res.statusCode, 204);
        } finally { await app.close(); }
    });
});

// ===========================================================================
// GET /portal/data/branding
// ===========================================================================

describe('GET /portal/data/branding', () => {
    test('400 when tenant_id query param is missing', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/portal/data/branding' });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /tenant_id/i);
        } finally { await app.close(); }
    });

    test('200 returns configured:false for unknown tenant', async () => {
        resetStore();
        const app = Fastify({ logger: false });
        await registerTenantBrandingRoutes(app, { getSession: () => session(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/portal/data/branding?tenant_id=unknown' });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ branding: { configured: boolean } }>().branding.configured, false);
        } finally { await app.close(); }
    });

    test('200 returns branding for known tenant without requiring auth session', async () => {
        resetStore();
        brandingStore.set('tenant_abc', {
            id: 'b3', tenantId: 'tenant_abc',
            companyName: 'Portal Co', logoUrl: 'https://portal.example.com/logo.png',
            primaryColor: '#ff0000', portalTitle: 'Portal', faviconUrl: null,
        });
        const app = Fastify({ logger: false });
        // No session provided — portal endpoint is public
        await registerTenantBrandingRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/portal/data/branding?tenant_id=tenant_abc' });
            assert.equal(res.statusCode, 200);
            const { branding } = res.json<{ branding: Record<string, unknown> }>();
            assert.equal(branding['configured'], true);
            assert.equal(branding['company_name'], 'Portal Co');
            assert.equal(branding['primary_color'], '#ff0000');
        } finally { await app.close(); }
    });
});
