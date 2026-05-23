import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDealWon, closeDealLost } from './deal-closer.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides?: Partial<SalesAgentConfigRecord>): SalesAgentConfigRecord =>
({
    id: 'cfg-1',
    tenantId: 't1',
    botId: 'bot-1',
    productDescription: 'AgentFarm',
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
    contractUrl: null,
    contractWebhookSecret: null,
    winNotificationProvider: null,
    winNotificationTarget: null,
    winNotificationSecret: null,
    reEngageDaysAfterLoss: null,
    ...overrides,
} as unknown as SalesAgentConfigRecord);

const makeDeal = (overrides?: Record<string, unknown>): Record<string, unknown> => ({
    id: 'deal-1',
    tenantId: 't1',
    botId: 'bot-1',
    prospectId: 'p-1',
    title: 'Big Deal',
    stage: 'negotiation',
    value: 10000,
    currency: 'USD',
    createdAt: new Date(Date.now() - 7 * 86400 * 1000),
    ...overrides,
});

const makeProspect = (): Record<string, unknown> => ({
    id: 'p-1',
    firstName: 'Alice',
    lastName: 'Smith',
    company: 'Acme Corp',
    email: 'alice@acme.com',
    status: 'negotiation',
});

const makePrismaStub = (deal: Record<string, unknown> | null, prospect: Record<string, unknown> | null) => {
    const updates: string[] = [];
    return {
        _updates: updates,
        salesDeal: {
            findUnique: async () => deal,
            update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
                updates.push(`deal:${String(args.data['stage'] ?? 'updated')}`);
                return { ...deal, ...args.data };
            },
        },
        prospect: {
            findUnique: async () => prospect,
            update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
                updates.push(`prospect:${String(args.data['status'] ?? 'updated')}`);
                return {};
            },
        },
        winLossEvent: {
            create: async () => ({ id: 'wl-1' }),
        },
        salesActivity: {
            create: async () => ({ id: 'sa-1' }),
        },
    };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('closeDealWon', () => {
    test('returns closed:false when deal not found', async () => {
        const db = makePrismaStub(null, makeProspect());
        const result = await closeDealWon('deal-1', 't1', 'bot-1', 'signer@test.com', new Date(), makeConfig(), db as never);
        assert.equal(result.closed, false);
        assert.equal(result.outcome, 'won');
        assert.ok(result.error?.includes('not found'));
    });

    test('updates deal and prospect on win', async () => {
        const db = makePrismaStub(makeDeal(), makeProspect());
        const result = await closeDealWon('deal-1', 't1', 'bot-1', 'signer@test.com', new Date(), makeConfig(), db as never);
        assert.equal(result.closed, true);
        assert.equal(result.outcome, 'won');
        assert.ok(db._updates.includes('deal:closed_won'), 'deal stage should be closed_won');
        assert.ok(db._updates.includes('prospect:closed_won'), 'prospect status should be closed_won');
    });

    test('returns closed:true with no prisma (no-op)', async () => {
        const result = await closeDealWon('deal-1', 't1', 'bot-1', 'signer@test.com', new Date(), makeConfig());
        assert.equal(result.closed, true);
        assert.equal(result.outcome, 'won');
    });
});

describe('closeDealLost', () => {
    test('returns closed:false when deal not found', async () => {
        const db = makePrismaStub(null, makeProspect());
        const result = await closeDealLost('deal-1', 't1', 'bot-1', 'no response', makeConfig(), db as never);
        assert.equal(result.closed, false);
        assert.equal(result.outcome, 'lost');
    });

    test('sets deal stage to closed_lost and prospect to disqualified', async () => {
        const db = makePrismaStub(makeDeal(), makeProspect());
        const result = await closeDealLost('deal-1', 't1', 'bot-1', 'budget cut', makeConfig(), db as never);
        assert.equal(result.closed, true);
        assert.equal(result.outcome, 'lost');
        assert.ok(db._updates.includes('deal:closed_lost'));
        assert.ok(db._updates.includes('prospect:disqualified'));
    });
});
