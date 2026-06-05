import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { registerContractWebhookRoutes } from './contract-webhook.js';
import type { closeDealWon, closeDealLost } from '@agentfarm/agent-runtime/sales/deal-closer.js';

const CONTRACT_SECRET = 'test-contract-secret';

function signPayload(body: unknown): string {
    return createHmac('sha256', CONTRACT_SECRET).update(JSON.stringify(body)).digest('hex');
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

interface PrismaStub {
    salesAgentConfig: {
        findFirst: (args: { where: Row }) => Promise<Row | null>;
    };
    contractEvent: {
        create: (args: { data: Row }) => Promise<{ id: string }>;
    };
    salesDeal: {
        findUnique: (args: { where: { id: string } }) => Promise<Row | null>;
        findFirst: (args: { where: Row; orderBy?: Row }) => Promise<Row | null>;
    };
    prospect: {
        findFirst: (args: { where: Row }) => Promise<Row | null>;
    };
    _events: Row[];
}

function makePrismaStub(
    config: Row | null = null,
    deal: Row | null = null,
    prospect: Row | null = null,
): PrismaStub {
    const events: Row[] = [];
    return {
        salesAgentConfig: { async findFirst() { return config; } },
        contractEvent: {
            async create({ data }: { data: Row }) {
                events.push(data);
                return { id: 'ce-1' };
            },
        },
        salesDeal: {
            async findUnique() { return deal; },
            async findFirst() { return deal; },
        },
        prospect: {
            async findFirst() { return prospect; },
        },
        _events: events,
    };
}

function makeApp(
    prisma: PrismaStub,
    closeDealWonFn?: typeof closeDealWon,
    closeDealLostFn?: typeof closeDealLost,
) {
    const app = Fastify({ logger: false });
    void registerContractWebhookRoutes(app, {
        prisma: prisma as never,
        closeDealWonFn,
        closeDealLostFn,
    });
    return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /webhooks/contract', () => {
    test('returns 400 when x-tenant-id header is missing', async () => {
        const app = makeApp(makePrismaStub());
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/contract',
            payload: { signerEmail: 'test@example.com', status: 'signed' },
        });
        assert.equal(res.statusCode, 400);
    });

    test('returns 200 received:true for missing signerEmail (graceful no-op)', async () => {
        const payload = { status: 'signed' };
        const app = makeApp(makePrismaStub({ contractWebhookSecret: CONTRACT_SECRET }));
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/contract',
            headers: { 'x-tenant-id': 't1', 'x-webhook-signature': signPayload(payload) },
            payload,
        });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body) as { received: boolean };
        assert.equal(body.received, true);
    });

    test('creates ContractEvent record on signed event', async () => {
        const deal = { id: 'deal-1', prospectId: 'p-1', botId: 'bot-1', stage: 'negotiation', tenantId: 't1' };
        const prospect = { id: 'p-1', email: 'signer@acme.com', tenantId: 't1' };
        const prisma = makePrismaStub({ contractWebhookSecret: CONTRACT_SECRET }, deal, prospect);

        let wonCalled = false;
        const closeDealWonFn = (async () => { wonCalled = true; return { closed: true, outcome: 'won' as const }; }) as typeof closeDealWon;

        const signedAt = new Date().toISOString();
        const payload = { signerEmail: 'signer@acme.com', status: 'signed', dealId: 'deal-1', signedAt };
        const app = makeApp(prisma, closeDealWonFn);
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/contract',
            headers: { 'x-tenant-id': 't1', 'x-webhook-signature': signPayload(payload) },
            payload,
        });
        assert.equal(res.statusCode, 200);
        assert.equal(prisma._events.length, 1, 'ContractEvent should be created');
        // closeDealWon is fire-and-forget — wait microtask for it to settle
        await new Promise(r => setTimeout(r, 10));
        assert.ok(wonCalled, 'closeDealWon should be called');
    });

    test('calls closeDealLost on declined event', async () => {
        const deal = { id: 'deal-1', prospectId: 'p-1', botId: 'bot-1', stage: 'negotiation', tenantId: 't1' };
        const prospect = { id: 'p-1', email: 'signer@acme.com', tenantId: 't1' };
        const prisma = makePrismaStub({ contractWebhookSecret: CONTRACT_SECRET }, deal, prospect);

        let lostCalled = false;
        const closeDealLostFn = (async () => { lostCalled = true; return { closed: true, outcome: 'lost' as const }; }) as typeof closeDealLost;

        const payload = { signerEmail: 'signer@acme.com', status: 'declined', dealId: 'deal-1' };
        const app = makeApp(prisma, undefined, closeDealLostFn);
        await app.inject({
            method: 'POST',
            url: '/webhooks/contract',
            headers: { 'x-tenant-id': 't1', 'x-webhook-signature': signPayload(payload) },
            payload,
        });
        await new Promise(r => setTimeout(r, 10));
        assert.ok(lostCalled, 'closeDealLost should be called for declined');
    });

    test('returns 401 when HMAC signature is missing but secret is configured', async () => {
        const config = { contractWebhookSecret: 'topsecret' };
        const prisma = makePrismaStub(config);
        const app = makeApp(prisma);
        const res = await app.inject({
            method: 'POST',
            url: '/webhooks/contract',
            headers: { 'x-tenant-id': 't1' },
            payload: { signerEmail: 'test@example.com', status: 'signed' },
        });
        assert.equal(res.statusCode, 401);
    });
});
