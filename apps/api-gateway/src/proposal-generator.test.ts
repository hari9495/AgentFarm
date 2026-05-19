import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateProposalPdf, sendProposalEmail } from './proposal-generator.js';

// ---------------------------------------------------------------------------
// Minimal Prisma stub factories
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeSession(overrides: Partial<Row> = {}): Row {
    return {
        id: 'session-1',
        tenantId: 'tenant-1',
        summaryText: 'Great meeting. Discussed pricing and integration.',
        actionItems: '1. Send proposal\n2. Schedule follow-up',
        proposalPath: null,
        slackDistributed: false,
        botId: 'bot-1',
        ...overrides,
    };
}

function makeBookingEvent(overrides: Partial<Row> = {}): Row {
    return {
        id: 'booking-1',
        tenantId: 'tenant-1',
        meetingSessionId: 'session-1',
        prospectId: 'prospect-1',
        botId: 'bot-1',
        guestEmail: 'alice@example.com',
        ...overrides,
    };
}

function makeProspect(): Row {
    return {
        id: 'prospect-1',
        tenantId: 'tenant-1',
        firstName: 'Alice',
        lastName: 'Lee',
        email: 'alice@example.com',
        company: 'ACME',
        botId: 'bot-1',
    };
}

function makeConfig(): Row {
    return {
        id: 'cfg-1',
        tenantId: 'tenant-1',
        botId: 'bot-1',
        productDescription: 'AgentFarm Sales Automation',
        emailProvider: 'smtp',
        active: true,
    };
}

function makePrismaForPdf(
    sessionRow: Row | null = makeSession(),
    bookingRow: Row | null = makeBookingEvent(),
    configRow: Row | null = makeConfig(),
    prospectRow: Row | null = makeProspect(),
) {
    const updated: Row[] = [];
    return {
        meetingSession: {
            async findFirst() { return sessionRow; },
            async update({ data }: { where: unknown; data: Record<string, unknown> }) {
                updated.push(data);
                return { ...sessionRow, ...data };
            },
        },
        bookingEvent: {
            async findFirst() { return bookingRow; },
        },
        salesAgentConfig: {
            async findFirst() { return configRow; },
        },
        prospect: {
            async findFirst() { return prospectRow; },
        },
        salesActivity: {
            async create({ data }: { data: Record<string, unknown> }) {
                return { id: 'act-1', ...data };
            },
        },
        _updated: updated,
    } as never;
}

// ---------------------------------------------------------------------------
// Tests: generateProposalPdf
// ---------------------------------------------------------------------------

describe('generateProposalPdf', () => {
    test('creates a PDF file and returns file path', async () => {
        const prisma = makePrismaForPdf();
        const result = await generateProposalPdf('session-1', 'tenant-1', prisma);
        assert.ok(result !== null, 'should return a file path');
        assert.ok(typeof result === 'string');
        assert.ok(result.endsWith('.pdf'), `expected .pdf extension, got: ${result}`);
    });

    test('returns null when session is not found', async () => {
        const prisma = makePrismaForPdf(null);
        const result = await generateProposalPdf('session-missing', 'tenant-1', prisma);
        assert.equal(result, null);
    });

    test('generates PDF even when no booking event exists', async () => {
        const prisma = makePrismaForPdf(makeSession(), null, null, null);
        const result = await generateProposalPdf('session-1', 'tenant-1', prisma);
        assert.ok(result !== null, 'should still generate without booking/prospect');
    });
});

// ---------------------------------------------------------------------------
// Tests: sendProposalEmail
// ---------------------------------------------------------------------------

describe('sendProposalEmail', () => {
    test('returns false when session has no proposalPath', async () => {
        const prisma = makePrismaForPdf(makeSession({ proposalPath: null }));
        const result = await sendProposalEmail('session-1', 'tenant-1', prisma);
        assert.equal(result, false);
    });

    test('returns false when no booking event for session', async () => {
        const prisma = makePrismaForPdf(makeSession({ proposalPath: '/tmp/proposals/tenant-1/session-1.pdf' }), null);
        const result = await sendProposalEmail('session-1', 'tenant-1', prisma);
        assert.equal(result, false);
    });

    test('returns false when no prospect email', async () => {
        const prisma = makePrismaForPdf(
            makeSession({ proposalPath: '/tmp/proposals/tenant-1/session-1.pdf' }),
            makeBookingEvent(),
            makeConfig(),
            { ...makeProspect(), email: undefined },
        );
        const result = await sendProposalEmail('session-1', 'tenant-1', prisma);
        assert.equal(result, false);
    });
});
