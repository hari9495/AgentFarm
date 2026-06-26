import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoleBaselineBlockRoutes } from './role-baseline-blocks.js';

const session = { userId: 'u1', tenantId: 't1', workspaceIds: [] as string[], expiresAt: Date.now() + 3_600_000 };
const makeApp = (sess: typeof session | null) => {
    const app = Fastify({ logger: false });
    registerRoleBaselineBlockRoutes(app, { getSession: () => sess });
    return app;
};

test('GET role-baseline-blocks — 401 without session', async () => {
    const app = makeApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/role-baseline-blocks' });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('GET role-baseline-blocks — full map', async () => {
    const app = makeApp(session);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/role-baseline-blocks' });
    await app.close();
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.ok(b.baseline.developer.includes('merge_pr'));
    assert.ok(b.baseline.devops_engineer.includes('drop_database'));
});

test('GET role-baseline-blocks?roleKey= — single role', async () => {
    const app = makeApp(session);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/role-baseline-blocks?roleKey=mobile_engineer' });
    await app.close();
    const b = res.json();
    assert.equal(b.roleKey, 'mobile_engineer');
    assert.ok(b.blockedActions.includes('revoke_signing_cert'));
});
