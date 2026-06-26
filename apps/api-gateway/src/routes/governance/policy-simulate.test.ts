import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { registerPolicySimulateRoutes } from './policy-simulate.js';

const session = { userId: 'u1', tenantId: 'tenant_1', workspaceIds: [] as string[], expiresAt: Date.now() + 3_600_000 };

function makePrisma(rulesByScopeRef: Record<string, unknown[]>) {
    return {
        governancePolicy: {
            findFirst: async ({ where }: any) => {
                const key = where.scopeRef;
                const rules = rulesByScopeRef[key];
                return rules ? { rulesJson: rules } : null;
            },
        },
    } as unknown as PrismaClient;
}

function makeApp(sess: typeof session | null, prisma: PrismaClient) {
    const app = Fastify({ logger: false });
    registerPolicySimulateRoutes(app, prisma, { getSession: () => sess });
    return app;
}

test('POST policy-simulate — 401 without session', async () => {
    const app = makeApp(null, makePrisma({}));
    const res = await app.inject({ method: 'POST', url: '/v1/governance/policy-simulate', payload: { actionType: 'x' } });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('POST policy-simulate — 400 without actionType', async () => {
    const app = makeApp(session, makePrisma({}));
    const res = await app.inject({ method: 'POST', url: '/v1/governance/policy-simulate', payload: {} });
    await app.close();
    assert.equal(res.statusCode, 400);
});

test('POST policy-simulate — merges tenant + role rules, returns deny', async () => {
    const prisma = makePrisma({
        '': [{ actionType: 'send_email', effect: 'deny' }],            // tenant scope
        developer: [{ actionType: 'deploy_production', effect: 'deny' }], // role scope
    });
    const app = makeApp(session, prisma);
    const res = await app.inject({
        method: 'POST', url: '/v1/governance/policy-simulate',
        payload: { roleKey: 'developer', actionType: 'deploy_production' },
    });
    await app.close();
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.equal(b.result.effect, 'deny');
    assert.equal(b.result.matchedRule.actionType, 'deploy_production');
});

test('POST policy-simulate — allow when no rule matches', async () => {
    const prisma = makePrisma({ '': [{ actionType: 'send_email', effect: 'deny' }] });
    const app = makeApp(session, prisma);
    const res = await app.inject({
        method: 'POST', url: '/v1/governance/policy-simulate',
        payload: { actionType: 'read_task' },
    });
    await app.close();
    assert.equal(res.json().result.effect, 'allow');
});
