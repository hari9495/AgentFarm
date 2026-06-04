import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSsoRoutes } from './sso.js';

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
type SsoConfig = {
    tenantId: string; entryPoint: string; issuer: string; cert: string;
    spEntityId: string; callbackUrl: string; signatureAlgo: string;
    enabled: boolean; provider?: string;
    tenant?: { id: string; name: string };
};

let ssoStore: Map<string, SsoConfig> = new Map();
let userStore: Map<string, Record<string, unknown>> = new Map();
let userSeq = 0;

function resetStores() {
    ssoStore = new Map();
    userStore = new Map();
    userSeq = 0;
}

function makePrismaStub() {
    return {
        tenantSsoConfig: {
            findUnique: async ({ where, include }: { where: { tenantId: string }; include?: unknown }) => {
                const cfg = ssoStore.get(where.tenantId);
                if (!cfg) return null;
                if (include && (include as Record<string, unknown>)['tenant']) {
                    return { ...cfg, tenant: cfg.tenant ?? { id: where.tenantId, name: 'Test Tenant' } };
                }
                return { ...cfg };
            },
            upsert: async ({ where, update, create }: {
                where: { tenantId: string };
                update: Record<string, unknown>;
                create: SsoConfig;
            }) => {
                const existing = ssoStore.get(where.tenantId);
                const result = existing ? { ...existing, ...update } : { ...create };
                ssoStore.set(where.tenantId, result as SsoConfig);
                return result;
            },
            deleteMany: async ({ where }: { where: { tenantId: string } }) => {
                ssoStore.delete(where.tenantId);
                return { count: 1 };
            },
        },
        tenantUser: {
            findFirst: async ({ where }: { where: Record<string, unknown> }) => {
                const tenantId = where['tenantId'] as string;
                const orConds = where['OR'] as Array<Record<string, string>> | undefined;
                for (const user of userStore.values()) {
                    if (user['tenantId'] !== tenantId) continue;
                    if (!orConds) return user;
                    if (orConds.some((cond) => Object.entries(cond).every(([k, v]) => user[k] === v))) return user;
                }
                return null;
            },
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const id = `user-${++userSeq}`;
                const user = { id, ...data };
                userStore.set(id, user);
                return user;
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const user = userStore.get(where.id);
                if (!user) throw new Error('user not found');
                const updated = { ...user, ...data };
                userStore.set(where.id, updated);
                return updated;
            },
        },
        workspace: {
            findMany: async ({ where }: { where: { tenantId: string } }) =>
                [{ id: `ws-${where.tenantId}` }],
        },
    } as never;
}

// ---------------------------------------------------------------------------
// Session factories
// ---------------------------------------------------------------------------
const adminSession = () => ({ userId: 'user_1', tenantId: 'tenant_1', role: 'admin' });
const viewerSession = () => ({ userId: 'user_2', tenantId: 'tenant_1', role: 'viewer' });

function buildApp(getSession = () => adminSession() as ReturnType<typeof adminSession> | null) {
    const app = Fastify({ logger: false });
    registerSsoRoutes(app, { getSession, prisma: makePrismaStub() });
    return app;
}

// ===========================================================================
// Public: GET /v1/auth/sso/:tenantId/metadata
// ===========================================================================

describe('GET /v1/auth/sso/:tenantId/metadata', () => {
    test('404 when no SSO config exists', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/auth/sso/tenant_1/metadata' });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });

    test('404 when SSO config exists but is disabled', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: false,
            entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com',
            cert: 'fake-cert', spEntityId: 'https://sp.example.com',
            callbackUrl: 'https://sp.example.com/acs', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/auth/sso/tenant_1/metadata' });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Public: GET /v1/auth/sso/:tenantId/login
// ===========================================================================

describe('GET /v1/auth/sso/:tenantId/login', () => {
    test('404 when no SSO config exists', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/auth/sso/tenant_1/login' });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });

    test('404 when SSO config is disabled', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: false,
            entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com',
            cert: 'fake-cert', spEntityId: 'https://sp.example.com',
            callbackUrl: 'https://sp.example.com/acs', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/auth/sso/tenant_1/login' });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Public: POST /v1/auth/sso/:tenantId/acs
// ===========================================================================

describe('POST /v1/auth/sso/:tenantId/acs', () => {
    test('400 when SSO not configured for tenant', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/sso/tenant_1/acs',
                payload: { SAMLResponse: 'something' },
            });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /not configured/i);
        } finally {
            await app.close();
        }
    });

    test('400 when SSO configured but SAML response is invalid', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: true,
            entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com',
            cert: 'fake-cert-data', spEntityId: 'https://sp.example.com',
            callbackUrl: 'https://sp.example.com/acs', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/sso/tenant_1/acs',
                payload: { SAMLResponse: 'not-valid-base64-saml' },
            });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json<{ error: string }>().error, 'invalid_saml_response');
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Admin: GET /v1/admin/sso/config
// ===========================================================================

describe('GET /v1/admin/sso/config', () => {
    test('401 when no session', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 401);
        } finally {
            await app.close();
        }
    });

    test('200 returns not-configured defaults when no SSO config exists', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ configured: boolean; enabled: boolean; spEntityId: string; metadataUrl: string }>();
            assert.equal(body.configured, false);
            assert.equal(body.enabled, false);
            assert.ok(body.spEntityId.includes('tenant_1'), 'spEntityId should include tenantId');
            assert.ok(body.metadataUrl.includes('tenant_1'), 'metadataUrl should include tenantId');
        } finally {
            await app.close();
        }
    });

    test('200 returns configured state with cert masked', async () => {
        resetStores();
        // Cert: 20 known prefix chars + 10 middle + 20 known suffix chars
        const TEST_CERT = 'A'.repeat(20) + 'M'.repeat(10) + 'Z'.repeat(20);
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: true, provider: 'okta',
            entryPoint: 'https://okta.example.com/sso',
            issuer: 'https://okta.example.com',
            cert: TEST_CERT,
            spEntityId: 'https://app.agentfarm.io/saml/tenant_1',
            callbackUrl: 'https://app.agentfarm.io/v1/auth/sso/tenant_1/acs',
            signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ configured: boolean; enabled: boolean; certPreview: string; provider: string }>();
            assert.equal(body.configured, true);
            assert.equal(body.enabled, true);
            assert.equal(body.provider, 'okta');
            // First 20 + ellipsis + last 20
            assert.equal(body.certPreview, `${'A'.repeat(20)}…${'Z'.repeat(20)}`);
        } finally {
            await app.close();
        }
    });

    test('200 includes login and metadata URLs', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: true,
            entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com',
            cert: 'cert', spEntityId: 'sp-entity',
            callbackUrl: 'https://app.example.com/acs', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'GET', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ loginUrl: string; metadataUrl: string }>();
            assert.ok(body.loginUrl.includes('/login'), 'loginUrl should contain /login');
            assert.ok(body.metadataUrl.includes('/metadata'), 'metadataUrl should contain /metadata');
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Admin: PUT /v1/admin/sso/config
// ===========================================================================

describe('PUT /v1/admin/sso/config', () => {
    const validBody = {
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://idp.example.com',
        cert: 'valid-cert-data',
        signatureAlgo: 'sha256',
    };

    test('401 when no session', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/admin/sso/config', payload: validBody });
            assert.equal(res.statusCode, 401);
        } finally {
            await app.close();
        }
    });

    test('403 when session role is not admin', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => viewerSession(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/admin/sso/config', payload: validBody });
            assert.equal(res.statusCode, 403);
            assert.equal(res.json<{ error: string }>().error, 'admin_required');
        } finally {
            await app.close();
        }
    });

    test('400 when entryPoint is missing', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/admin/sso/config',
                payload: { issuer: 'https://idp.example.com', cert: 'cert' },
            });
            assert.equal(res.statusCode, 400);
            assert.match(res.json<{ error: string }>().error, /entryPoint/i);
        } finally {
            await app.close();
        }
    });

    test('400 when issuer is missing', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/admin/sso/config',
                payload: { entryPoint: 'https://idp.example.com/sso', cert: 'cert' },
            });
            assert.equal(res.statusCode, 400);
        } finally {
            await app.close();
        }
    });

    test('400 when cert is missing', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/admin/sso/config',
                payload: { entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com' },
            });
            assert.equal(res.statusCode, 400);
        } finally {
            await app.close();
        }
    });

    test('200 creates SSO config and returns spEntityId + callbackUrl', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/admin/sso/config', payload: validBody });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ configured: boolean; enabled: boolean; spEntityId: string; callbackUrl: string }>();
            assert.equal(body.configured, true);
            assert.equal(body.enabled, true);
            assert.ok(body.spEntityId.includes('tenant_1'), 'spEntityId must include tenantId');
            assert.ok(body.callbackUrl.includes('tenant_1'), 'callbackUrl must include tenantId');
        } finally {
            await app.close();
        }
    });

    test('200 updates existing SSO config', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: true,
            entryPoint: 'https://old-idp.example.com/sso', issuer: 'https://old-idp.example.com',
            cert: 'old-cert', spEntityId: 'old-entity',
            callbackUrl: 'old-callback', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({
                method: 'PUT', url: '/v1/admin/sso/config',
                payload: { entryPoint: 'https://new-idp.example.com/sso', issuer: 'https://new-idp.example.com', cert: 'new-cert' },
            });
            assert.equal(res.statusCode, 200);
            // Verify store was updated
            assert.equal(ssoStore.get('tenant_1')?.entryPoint, 'https://new-idp.example.com/sso');
        } finally {
            await app.close();
        }
    });

    test('200 defaults enabled=true when not specified', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'PUT', url: '/v1/admin/sso/config', payload: validBody });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ enabled: boolean }>().enabled, true);
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Admin: POST /v1/admin/sso/config/test
// ===========================================================================

describe('POST /v1/admin/sso/config/test', () => {
    test('401 when no session', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/admin/sso/config/test' });
            assert.equal(res.statusCode, 401);
        } finally {
            await app.close();
        }
    });

    test('200 returns testUrl pointing to tenant login', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/admin/sso/config/test' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ testUrl: string; message: string }>();
            assert.ok(body.testUrl.includes('/login'), 'testUrl must contain /login');
            assert.ok(body.testUrl.includes('tenant_1'), 'testUrl must include tenantId');
            assert.ok(body.message.length > 0, 'message must be non-empty');
        } finally {
            await app.close();
        }
    });
});

// ===========================================================================
// Admin: DELETE /v1/admin/sso/config
// ===========================================================================

describe('DELETE /v1/admin/sso/config', () => {
    test('401 when no session', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => null, prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 401);
        } finally {
            await app.close();
        }
    });

    test('403 when session role is not admin', async () => {
        resetStores();
        const app = Fastify({ logger: false });
        registerSsoRoutes(app, { getSession: () => viewerSession(), prisma: makePrismaStub() });
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 403);
            assert.equal(res.json<{ error: string }>().error, 'admin_required');
        } finally {
            await app.close();
        }
    });

    test('200 deletes SSO config from store', async () => {
        resetStores();
        ssoStore.set('tenant_1', {
            tenantId: 'tenant_1', enabled: true,
            entryPoint: 'https://idp.example.com/sso', issuer: 'https://idp.example.com',
            cert: 'cert-data', spEntityId: 'sp-entity',
            callbackUrl: 'https://sp.example.com/acs', signatureAlgo: 'sha256',
        });
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ deleted: boolean }>().deleted, true);
            assert.equal(ssoStore.has('tenant_1'), false, 'config must be removed from store');
        } finally {
            await app.close();
        }
    });

    test('200 deleting nonexistent config is idempotent', async () => {
        resetStores();
        const app = buildApp();
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/admin/sso/config' });
            assert.equal(res.statusCode, 200);
            assert.equal(res.json<{ deleted: boolean }>().deleted, true);
        } finally {
            await app.close();
        }
    });
});
