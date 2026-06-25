import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getWebhookDomainPolicy,
    isWebhookDomainDenied,
    type WebhookDomainPolicy,
} from './webhook-domain-policy.js';

test('D1: deny-list blocks a listed domain, allows others', () => {
    const policy: WebhookDomainPolicy = { mode: 'deny', denied: new Set(['evil.com']), allowed: new Set() };
    assert.equal(isWebhookDomainDenied(policy, 'https://evil.com/hook'), true);
    assert.equal(isWebhookDomainDenied(policy, 'https://good.com/hook'), false);
});

test('D2: allow-list blocks an unlisted domain, allows listed', () => {
    const policy: WebhookDomainPolicy = { mode: 'allow', denied: new Set(), allowed: new Set(['hooks.example.com']) };
    assert.equal(isWebhookDomainDenied(policy, 'https://hooks.example.com/x'), false);
    assert.equal(isWebhookDomainDenied(policy, 'https://other.com/x'), true);
});

test('D3: suffix match — bare domain matches subdomains', () => {
    const policy: WebhookDomainPolicy = { mode: 'deny', denied: new Set(['example.com']), allowed: new Set() };
    assert.equal(isWebhookDomainDenied(policy, 'https://a.example.com/y'), true);
    assert.equal(isWebhookDomainDenied(policy, 'https://example.com/y'), true);
    assert.equal(isWebhookDomainDenied(policy, 'https://notexample.com/y'), false);
});

test('D3b: malformed URL → denied (fail-closed)', () => {
    const policy: WebhookDomainPolicy = { mode: 'deny', denied: new Set(['evil.com']), allowed: new Set() };
    assert.equal(isWebhookDomainDenied(policy, 'not a url'), true);
});

test('D-empty: no policy (deny mode, empty sets) → nothing denied', () => {
    const policy: WebhookDomainPolicy = { mode: 'deny', denied: new Set(), allowed: new Set() };
    assert.equal(isWebhookDomainDenied(policy, 'https://anything.com/x'), false);
});

function fakePrisma(rules: unknown[] | null): any {
    return {
        governancePolicy: {
            findFirst: async ({ where }: { where: any }) => {
                if (where.scope !== 'tenant') return null;
                if (rules === null) return null;
                return { id: 'p', tenantId: where.tenantId, scope: 'tenant', scopeRef: '', version: 1, status: 'active', name: 'n', description: null, rulesJson: rules, createdBy: 'u', updatedBy: 'u', createdAt: new Date(), updatedAt: new Date() };
            },
        },
    };
}

test('D5: getWebhookDomainPolicy reads tenant active policy webhook rules; allow rules → allow mode', async () => {
    const prisma = fakePrisma([
        { actionType: '*', effect: 'allow', connector: 'webhook', domain: 'hooks.example.com' },
        { actionType: '*', effect: 'deny', connector: 'webhook', domain: 'evil.com' },
        { actionType: 'deploy_production', effect: 'deny' }, // non-webhook rule ignored
    ]);
    const policy = await getWebhookDomainPolicy(prisma, 'tenant-x');
    assert.equal(policy.mode, 'allow'); // any allow rule → allow-list mode
    assert.ok(policy.allowed.has('hooks.example.com'));
    assert.ok(policy.denied.has('evil.com'));
});

test('D5b: no active policy / DB error → empty deny-mode policy (fail-safe)', async () => {
    const policy = await getWebhookDomainPolicy(fakePrisma(null), 'tenant-x');
    assert.equal(policy.mode, 'deny');
    assert.equal(policy.denied.size, 0);
    const errPrisma: any = { governancePolicy: { findFirst: async () => { throw new Error('db'); } } };
    const policy2 = await getWebhookDomainPolicy(errPrisma, 'tenant-x');
    assert.equal(policy2.denied.size, 0);
});
