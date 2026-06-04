import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerOnboardingConfigRoutes } from './onboarding-config.js';

const buildApp = () => {
    const app = Fastify();
    registerOnboardingConfigRoutes(app);
    return app;
};

describe('GET /v1/onboarding/agent-roles', () => {
    it('returns a non-empty roles array', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/onboarding/agent-roles' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.roles));
        assert.ok(body.roles.length > 0);
    });

    it('each role has id and label', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/onboarding/agent-roles' });
        for (const role of res.json().roles) {
            assert.ok(role.id, 'id must be present');
            assert.ok(role.label, 'label must be present');
        }
    });
});

describe('GET /v1/onboarding/plans', () => {
    it('returns a non-empty plans array', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/onboarding/plans' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.plans));
        assert.ok(body.plans.length > 0);
    });

    it('each plan has id and label', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/onboarding/plans' });
        for (const plan of res.json().plans) {
            assert.ok(plan.id, 'id must be present');
            assert.ok(plan.label, 'label must be present');
        }
    });

    it('at least one plan is marked recommended', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/onboarding/plans' });
        const plans = res.json().plans as { recommended?: boolean }[];
        assert.ok(plans.some(p => p.recommended === true));
    });
});
