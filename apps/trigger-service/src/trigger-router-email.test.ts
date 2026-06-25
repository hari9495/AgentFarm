import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAgentByEmail, normalizeEmail, TriggerRouter } from './trigger-router.js';
import type { TriggerServiceConfig } from './types.js';

const tenants: TriggerServiceConfig['tenants'] = [
    {
        tenantId: 'acme',
        defaultAgentId: 'support',
        agents: [
            { agentId: 'recruiter', description: 'Hiring', email: 'recruiter@acme.com' },
            { agentId: 'support', description: 'Support', email: 'help@acme.com' },
        ],
    },
];

test('normalizeEmail strips display names and lowercases', () => {
    assert.equal(normalizeEmail('Recruiter <Recruiter@ACME.com>'), 'recruiter@acme.com');
    assert.equal(normalizeEmail('  HELP@acme.com '), 'help@acme.com');
    assert.equal(normalizeEmail(undefined), '');
});

test('matchAgentByEmail routes to the agent whose mailbox matches the recipient', () => {
    const match = matchAgentByEmail('Recruiter <recruiter@acme.com>', tenants);
    assert.equal(match?.tenantId, 'acme');
    assert.equal(match?.agentId, 'recruiter');
});

test('matchAgentByEmail returns null when no mailbox matches or no recipient', () => {
    assert.equal(matchAgentByEmail('nobody@acme.com', tenants), null);
    assert.equal(matchAgentByEmail(undefined, tenants), null);
});

test('router.route uses the deterministic email match over the single-tenant/default path', async () => {
    const router = new TriggerRouter({ tenants, agentRuntimeUrl: 'http://rt' } as TriggerServiceConfig);
    const decision = await router.route('Please screen this candidate', 'sender@x.com', 'recruiter@acme.com');
    assert.equal(decision.agentId, 'recruiter', 'should route to recruiter, not the default support agent');
});

test('router.route falls back to default when recipient does not match a mailbox', async () => {
    const router = new TriggerRouter({ tenants, agentRuntimeUrl: 'http://rt' } as TriggerServiceConfig);
    const decision = await router.route('hello', 'sender@x.com', 'unknown@acme.com');
    assert.equal(decision.agentId, 'support', 'single-tenant default');
});
