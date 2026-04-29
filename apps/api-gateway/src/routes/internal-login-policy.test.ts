import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerInternalLoginPolicyRoutes } from './internal-login-policy.js';

test('internal login policy endpoint returns sanitized policy for internal session', async () => {
    const app = Fastify();

    await registerInternalLoginPolicyRoutes(app, {
        getSession: () => ({
            userId: 'user_internal_001',
            tenantId: 'tenant_internal_001',
            workspaceIds: ['ws_internal_001'],
            scope: 'internal',
            expiresAt: Date.now() + 60_000,
        }),
        getPolicyConfig: () => ({
            allowedDomains: ['agentfarm.com'],
            adminRoles: ['internal_admin'],
        }),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/auth/internal-login-policy',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            policy: {
                allowed_domains: string[];
                admin_roles: string[];
                allowed_domains_count: number;
                admin_roles_count: number;
                deny_all_mode: boolean;
            };
        };

        assert.deepEqual(body.policy.allowed_domains, ['agentfarm.com']);
        assert.deepEqual(body.policy.admin_roles, ['internal_admin']);
        assert.equal(body.policy.allowed_domains_count, 1);
        assert.equal(body.policy.admin_roles_count, 1);
        assert.equal(body.policy.deny_all_mode, false);
    } finally {
        await app.close();
    }
});

test('internal login policy endpoint rejects customer session', async () => {
    const app = Fastify();

    await registerInternalLoginPolicyRoutes(app, {
        getSession: () => ({
            userId: 'user_customer_001',
            tenantId: 'tenant_customer_001',
            workspaceIds: ['ws_customer_001'],
            scope: 'customer',
            expiresAt: Date.now() + 60_000,
        }),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/auth/internal-login-policy',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('internal login policy endpoint rejects missing session', async () => {
    const app = Fastify();

    await registerInternalLoginPolicyRoutes(app, {
        getSession: () => null,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/auth/internal-login-policy',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('internal login policy endpoint reports deny_all_mode when config is empty', async () => {
    const app = Fastify();

    await registerInternalLoginPolicyRoutes(app, {
        getSession: () => ({
            userId: 'user_internal_002',
            tenantId: 'tenant_internal_002',
            workspaceIds: ['ws_internal_002'],
            scope: 'internal',
            expiresAt: Date.now() + 60_000,
        }),
        getPolicyConfig: () => ({
            allowedDomains: [],
            adminRoles: [],
        }),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/auth/internal-login-policy',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            policy: {
                allowed_domains_count: number;
                admin_roles_count: number;
                deny_all_mode: boolean;
            };
        };

        assert.equal(body.policy.allowed_domains_count, 0);
        assert.equal(body.policy.admin_roles_count, 0);
        assert.equal(body.policy.deny_all_mode, true);
    } finally {
        await app.close();
    }
});
