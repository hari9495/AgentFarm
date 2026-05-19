import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sendContractInvite } from './contract-sender.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides?: Partial<SalesAgentConfigRecord>): SalesAgentConfigRecord =>
({
    id: 'cfg-1',
    tenantId: 't1',
    botId: 'bot-1',
    productDescription: 'AgentFarm platform',
    targetIndustries: ['SaaS'],
    targetTitles: ['CTO'],
    emailTone: 'professional',
    emailProvider: 'smtp',
    maxProspectsPerDay: 10,
    followUpIntervalDays: 3,
    maxFollowUps: 3,
    replyClassificationEnabled: true,
    bookingUrl: null,
    personalityNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    contractUrl: 'https://sign.example.com/doc/abc123',
    contractWebhookSecret: null,
    winNotificationProvider: null,
    winNotificationTarget: null,
    winNotificationSecret: null,
    reEngageDaysAfterLoss: null,
    ...overrides,
} as unknown as SalesAgentConfigRecord);

const makePrismaStub = (
    prospect: Record<string, unknown> | null,
    deal: Record<string, unknown> | null,
) => ({
    prospect: {
        findUnique: async () => prospect,
    },
    salesDeal: {
        findUnique: async () => deal,
        update: async () => ({}),
    },
    contractEvent: {
        create: async () => ({ id: 'ce-1' }),
    },
    salesActivity: {
        create: async () => ({ id: 'sa-1' }),
    },
});

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;
type FetchMockFn = (url: string, init?: RequestInit) => Promise<Response>;
let mockFetch: FetchMockFn | null = null;

before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
        if (mockFetch) return mockFetch(url, init);
        return originalFetch(url, init);
    }) as typeof globalThis.fetch;
});

after(() => {
    globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendContractInvite', () => {
    test('returns sent:false when no contractUrl configured', async () => {
        const config = makeConfig({ contractUrl: undefined });
        const result = await sendContractInvite('p1', 'd1', 't1', 'bot-1', config);
        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('contractUrl'));
    });

    test('returns sent:false when prospect not found in DB', async () => {
        const config = makeConfig();
        const db = makePrismaStub(null, { id: 'd1', prospectId: 'p1', title: 'Deal', value: 5000, currency: 'USD', createdAt: new Date() });
        const result = await sendContractInvite('p1', 'd1', 't1', 'bot-1', config, db as never);
        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('not found'));
    });

    test('returns sent:false when deal not found in DB', async () => {
        const config = makeConfig();
        const db = makePrismaStub({ id: 'p1', email: 'test@example.com', firstName: 'Jane', lastName: 'Doe', company: 'Acme' }, null);
        const result = await sendContractInvite('p1', 'd1', 't1', 'bot-1', config, db as never);
        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('not found'));
    });

    test('returns sent:false when LLM call fails', async () => {
        const config = makeConfig();
        const prospect = { id: 'p1', email: 'j@acme.com', firstName: 'Jane', lastName: 'Doe', company: 'Acme' };
        const deal = { id: 'd1', prospectId: 'p1', title: 'Deal A', value: 5000, currency: 'USD', createdAt: new Date(), botId: 'bot-1' };
        const db = makePrismaStub(prospect, deal);

        mockFetch = async () => new Response('error', { status: 500 });
        const result = await sendContractInvite('p1', 'd1', 't1', 'bot-1', config, db as never);
        mockFetch = null;

        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('LLM'));
    });

    test('calls email provider and creates DB records on success', async () => {
        const config = makeConfig();
        const prospect = { id: 'p1', email: 'j@acme.com', firstName: 'Jane', lastName: 'Doe', company: 'Acme' };
        const deal = { id: 'd1', prospectId: 'p1', title: 'Deal A', value: 5000, currency: 'USD', createdAt: new Date(), botId: 'bot-1' };

        let contractEventCreated = false;
        let dealUpdated = false;
        const db = {
            prospect: { findUnique: async () => prospect },
            salesDeal: {
                findUnique: async () => deal,
                update: async () => { dealUpdated = true; return {}; },
            },
            contractEvent: {
                create: async () => { contractEventCreated = true; return { id: 'ce-1' }; },
            },
            salesActivity: { create: async () => ({ id: 'sa-1' }) },
        };

        // LLM returns JSON subject/body
        mockFetch = async (url: string) => {
            if (String(url).includes('anthropic')) {
                return new Response(JSON.stringify({
                    content: [{ type: 'text', text: '{"subject":"Sign contract","body":"Please sign."}' }],
                }), { status: 200 });
            }
            return new Response('ok', { status: 200 });
        };

        // stub email provider
        const emailProviderOverride = {
            providerName: 'smtp' as const,
            sendEmail: async () => ({ success: true, provider: 'smtp' as const }),
        };

        const result = await sendContractInvite('p1', 'd1', 't1', 'bot-1', config, db as never, emailProviderOverride);
        mockFetch = null;

        assert.equal(result.sent, true);
        assert.equal(result.subject, 'Sign contract');
        assert.ok(contractEventCreated, 'ContractEvent should be created');
        assert.ok(dealUpdated, 'SalesDeal.contractSentAt should be updated');
    });
});
