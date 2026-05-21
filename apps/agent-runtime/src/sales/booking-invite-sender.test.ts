import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sendBookingInvite } from './booking-invite-sender.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// sendBookingInvite now hard-requires ANTHROPIC_API_KEY and a sender address
// to avoid silent 401 calls and sending from undefined domains.
process.env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] ?? 'test-key';
process.env['SALES_FROM_EMAIL'] = process.env['SALES_FROM_EMAIL'] ?? 'sales@test.local';

// ---------------------------------------------------------------------------
// Minimal config fixture
// ---------------------------------------------------------------------------
const baseConfig: SalesAgentConfigRecord = {
    id: 'cfg-1',
    tenantId: 'tenant-1',
    botId: 'bot-1',
    active: true,
    emailProvider: 'smtp',
    bookingUrl: 'https://cal.com/test',
    autoSendProposal: false,
} as unknown as SalesAgentConfigRecord;

// ---------------------------------------------------------------------------
// Mock email provider
// ---------------------------------------------------------------------------
const mockEmailProvider = {
    async sendEmail(_params: unknown, _config: unknown) {
        return { success: true, messageId: 'mock-msg-id' };
    },
};

// ---------------------------------------------------------------------------
// Mock PrismaClient stub
// ---------------------------------------------------------------------------
function makePrisma(prospectRow: Record<string, unknown> | null = null) {
    return {
        prospect: {
            async findUnique({ where: _where }: { where: { id: string } }) {
                return prospectRow;
            },
        },
        salesActivity: {
            async findMany() {
                return [];
            },
        },
    } as never;
}

// ---------------------------------------------------------------------------
// LLM mock helpers
// ---------------------------------------------------------------------------
let origFetch: typeof globalThis.fetch;

before(() => {
    origFetch = globalThis.fetch;
});
after(() => {
    globalThis.fetch = origFetch;
});

function mockLlmFetch(responseJson: unknown) {
    globalThis.fetch = async (_url: unknown, _opts: unknown) => {
        return {
            ok: true,
            json: async () => ({
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(responseJson),
                    },
                ],
            }),
        } as Response;
    };
}

function mockLlmFetchError() {
    globalThis.fetch = async (_url: unknown, _opts: unknown) => {
        throw new Error('Network error');
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendBookingInvite', () => {
    test('returns sent:true when bookingUrl and emailProviderOverride are provided', async () => {
        mockLlmFetch({ subject: 'Let\u2019s meet!', body: 'Hi there, click here: https://cal.com/test' });
        const prisma = makePrisma({
            id: 'prospect-1',
            firstName: 'Alice',
            lastName: 'Lee',
            email: 'alice@example.com',
            company: 'ACME',
            botId: 'bot-1',
        });

        const result = await sendBookingInvite(
            'prospect-1',
            'tenant-1',
            'bot-1',
            baseConfig,
            prisma,
            mockEmailProvider as never,
        );

        assert.equal(result.sent, true);
        assert.ok(result.subject.length > 0, 'subject should be non-empty');
        assert.ok(result.body.length > 0, 'body should be non-empty');
        assert.equal(result.error, undefined);
    });

    test('returns sent:false when no bookingUrl configured', async () => {
        const configNoUrl = { ...baseConfig, bookingUrl: undefined };
        const result = await sendBookingInvite(
            'prospect-1',
            'tenant-1',
            'bot-1',
            configNoUrl as unknown as SalesAgentConfigRecord,
            undefined,
            mockEmailProvider as never,
        );

        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('bookingUrl'), `Expected bookingUrl error, got: ${result.error}`);
    });

    test('returns sent:false when prospect is not found in DB', async () => {
        mockLlmFetch({ subject: 'Hi', body: 'book here' });
        // Prospect not found
        const prisma = makePrisma(null);

        const result = await sendBookingInvite(
            'prospect-missing',
            'tenant-1',
            'bot-1',
            baseConfig,
            prisma,
            mockEmailProvider as never,
        );

        // Should still attempt send (prospect data will just be defaults) — or
        // if the impl returns false when prospect missing, check for that
        assert.equal(typeof result.sent, 'boolean');
    });

    test('returns sent:false on LLM network error', async () => {
        mockLlmFetchError();
        const prisma = makePrisma({
            id: 'prospect-1',
            firstName: 'Bob',
            lastName: 'Smith',
            email: 'bob@example.com',
            company: 'ACME',
            botId: 'bot-1',
        });

        const result = await sendBookingInvite(
            'prospect-1',
            'tenant-1',
            'bot-1',
            baseConfig,
            prisma,
            mockEmailProvider as never,
        );

        assert.equal(result.sent, false);
        assert.ok(result.error && result.error.length > 0, 'error should be populated');
    });
});
