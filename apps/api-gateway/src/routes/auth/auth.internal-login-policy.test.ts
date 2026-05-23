import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { hashPassword } from '../lib/password.js';
import { verifySessionToken } from '../lib/session-auth.js';
import { registerAuthRoutes, type AuthRepo } from './auth.js';

type StoredUser = {
    id: string;
    tenantId: string;
    passwordHash: string;
    role: string;
};

const restoreEnv = (key: string, previousValue: string | undefined) => {
    if (previousValue === undefined) {
        delete process.env[key];
        return;
    }
    process.env[key] = previousValue;
};

const createRepo = (): { repo: AuthRepo; users: Map<string, StoredUser> } => {
    const users = new Map<string, StoredUser>();

    const repo: AuthRepo = {
        async findUserByEmail(email) {
            return users.get(email) ?? null;
        },
        async runSignupTransaction() {
            throw new Error('runSignupTransaction is not used in this policy-focused test suite');
        },
        async getWorkspacesForTenant() {
            return [{ id: 'ws_policy_001' }];
        },
    };

    return { repo, users };
};

const seedUser = async (
    users: Map<string, StoredUser>,
    input: { email: string; password: string; role: string },
): Promise<void> => {
    users.set(input.email, {
        id: `user_${input.email}`,
        tenantId: 'tenant_policy_001',
        passwordHash: await hashPassword(input.password),
        role: input.role,
    });
};

const buildApp = async (repo: AuthRepo) => {
    const app = Fastify();
    await registerAuthRoutes(app, { repo });
    return app;
};

test('internal-login policy smoke: allowed domain can obtain internal scope token', async () => {
    const previousDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    const previousRoles = process.env.API_INTERNAL_LOGIN_ADMIN_ROLES;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = 'agentfarm.com';
    process.env.API_INTERNAL_LOGIN_ADMIN_ROLES = '';

    const { repo, users } = createRepo();
    await seedUser(users, { email: 'ops@agentfarm.com', password: 'policyPass123', role: 'member' });
    const app = await buildApp(repo);

    const response = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'ops@agentfarm.com', password: 'policyPass123' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json<{ token: string; scope: string }>();
    assert.equal(body.scope, 'internal');
    assert.equal(verifySessionToken(body.token)?.scope, 'internal');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousDomains);
    restoreEnv('API_INTERNAL_LOGIN_ADMIN_ROLES', previousRoles);
});

test('internal-login policy smoke: allowed admin role can obtain internal scope token', async () => {
    const previousDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    const previousRoles = process.env.API_INTERNAL_LOGIN_ADMIN_ROLES;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = '';
    process.env.API_INTERNAL_LOGIN_ADMIN_ROLES = 'internal_admin,platform_admin';

    const { repo, users } = createRepo();
    await seedUser(users, { email: 'owner@customer.com', password: 'policyPass123', role: 'internal_admin' });
    const app = await buildApp(repo);

    const response = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'owner@customer.com', password: 'policyPass123' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json<{ token: string; scope: string }>();
    assert.equal(body.scope, 'internal');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousDomains);
    restoreEnv('API_INTERNAL_LOGIN_ADMIN_ROLES', previousRoles);
});

test('internal-login policy smoke: non-matching customer account is denied', async () => {
    const previousDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    const previousRoles = process.env.API_INTERNAL_LOGIN_ADMIN_ROLES;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = 'agentfarm.com';
    process.env.API_INTERNAL_LOGIN_ADMIN_ROLES = 'internal_admin';

    const { repo, users } = createRepo();
    await seedUser(users, { email: 'user@customer.com', password: 'policyPass123', role: 'member' });
    const app = await buildApp(repo);

    const response = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'user@customer.com', password: 'policyPass123' },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json<{ error: string }>();
    assert.equal(body.error, 'internal_access_denied');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousDomains);
    restoreEnv('API_INTERNAL_LOGIN_ADMIN_ROLES', previousRoles);
});
