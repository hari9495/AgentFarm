import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoleRoutes } from './roles.js';

test('role catalog returns canonical active roles', async () => {
    const app = Fastify();

    await registerRoleRoutes(app, {
        getSession: () => null,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/roles/catalog',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            roles: Array<{ roleKey: string; roleVersion: string; active: boolean }>;
        };

        assert.ok(body.roles.length >= 12);
        assert.ok(body.roles.some((role) => role.roleKey === 'developer'));
        assert.ok(body.roles.every((role) => role.roleVersion === 'v1'));
        assert.ok(body.roles.every((role) => role.active === true));
    } finally {
        await app.close();
    }
});

test('role subscriptions endpoint enforces tenant scope', async () => {
    const app = Fastify();

    await registerRoleRoutes(app, {
        getSession: () => ({
            userId: 'user_1',
            tenantId: 'tenant_1',
            workspaceIds: ['ws_1'],
            expiresAt: Date.now() + 60_000,
        }),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/tenants/tenant_2/role-subscriptions',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'tenant_scope_violation');
    } finally {
        await app.close();
    }
});
