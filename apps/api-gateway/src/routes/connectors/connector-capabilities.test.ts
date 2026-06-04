import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerConnectorCapabilitiesRoutes } from './connector-capabilities.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeBot = (role: string) => ({ role });

const makePrismaStub = (botRoles: string[] = []) => ({
    bot: {
        findMany: async () => botRoles.map(makeBot),
    },
} as never);

const session = (tenantId = 'tenant_1') => ({
    userId: 'u1', tenantId, workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = (botRoles: string[] = []) => {
    const app = Fastify();
    registerConnectorCapabilitiesRoutes(app, {
        getSession: () => session(),
        prisma: makePrismaStub(botRoles),
    });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/connectors/capabilities
// ---------------------------------------------------------------------------

describe('GET /v1/connectors/capabilities', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerConnectorCapabilitiesRoutes(app, {
            getSession: () => null,
            prisma: makePrismaStub(),
        });
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        assert.equal(res.statusCode, 401);
    });

    it('returns all 13 role sections', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.sections.length, 13);
        assert.equal(body.totalAvailable, 13);
    });

    it('all sections are unpurchased when no bots exist', async () => {
        const app = buildApp([]);
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        assert.equal(body.totalPurchased, 0);
        assert.ok(body.sections.every((s: { purchased: boolean }) => !s.purchased));
    });

    it('marks purchased sections for bot roles that exist', async () => {
        const app = buildApp(['developer', 'sales_rep']);
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        assert.equal(body.totalPurchased, 2);
        assert.ok(body.purchasedRoleKeys.includes('developer'));
        assert.ok(body.purchasedRoleKeys.includes('sales_rep'));
    });

    it('purchased sections are listed first', async () => {
        const app = buildApp(['tester']);
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        const sections = body.sections as { purchased: boolean }[];
        const firstUnpurchasedIdx = sections.findIndex(s => !s.purchased);
        const lastPurchasedIdx = sections.map(s => s.purchased).lastIndexOf(true);
        assert.ok(lastPurchasedIdx < firstUnpurchasedIdx || firstUnpurchasedIdx === -1);
    });

    it('purchased sections include connector list', async () => {
        const app = buildApp(['developer']);
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        const devSection = body.sections.find((s: { roleKey: string }) => s.roleKey === 'developer');
        assert.ok(devSection);
        assert.equal(devSection.purchased, true);
        assert.ok(Array.isArray(devSection.connectors));
        assert.ok(devSection.connectors.length > 0);
    });

    it('unpurchased sections have empty connectors list', async () => {
        const app = buildApp(['developer']);
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        const unpurchasedSection = body.sections.find((s: { purchased: boolean }) => !s.purchased);
        assert.ok(unpurchasedSection);
        assert.deepEqual(unpurchasedSection.connectors, []);
    });

    it('each section has required metadata fields', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/connectors/capabilities' });
        const body = res.json();
        for (const section of body.sections) {
            assert.ok(section.roleKey, 'roleKey must be present');
            assert.ok(section.displayName, 'displayName must be present');
            assert.ok(section.tagline, 'tagline must be present');
            assert.ok(section.group, 'group must be present');
            assert.ok(section.groupLabel, 'groupLabel must be present');
            assert.ok(Array.isArray(section.featureHighlights), 'featureHighlights must be array');
            assert.ok(typeof section.botCount === 'number', 'botCount must be number');
        }
    });
});
