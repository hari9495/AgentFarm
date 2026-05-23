import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generatePreMeetingBrief, scheduleMeetingResearch } from './pre-meeting-research.js';

// ---------------------------------------------------------------------------
// Mock PrismaClient stub
// ---------------------------------------------------------------------------
function makePrisma(
    prospectRow: Record<string, unknown> | null = null,
    activities: Record<string, unknown>[] = [],
    deal: Record<string, unknown> | null = null,
) {
    return {
        prospect: {
            async findUnique({ where: _where }: { where: { id: string } }) {
                return prospectRow;
            },
        },
        salesActivity: {
            async findMany() {
                return activities;
            },
            async create({ data }: { data: Record<string, unknown> }) {
                return { id: 'activity-1', ...data };
            },
        },
        salesDeal: {
            async findFirst() {
                return deal;
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
                    { type: 'text', text: JSON.stringify(responseJson) },
                ],
            }),
        } as Response;
    };
}

function mockLlmFetchError() {
    globalThis.fetch = async (_url: unknown, _opts: unknown) => {
        throw new Error('LLM unreachable');
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePreMeetingBrief', () => {
    test('returns PreMeetingBrief with suggestedTopics from LLM', async () => {
        mockLlmFetch({
            suggestedTopics: ['Pain points', 'Pricing', 'Integration timeline'],
            riskSignals: ['Competitor evaluation ongoing'],
        });

        const prisma = makePrisma(
            { id: 'p-1', firstName: 'Alice', lastName: 'Chen', company: 'ACME', title: 'VP Eng', botId: 'bot-1', tenantId: 'tenant-1' },
            [
                { activityType: 'email', subject: 'Introduction', outcome: 'opened', completedAt: new Date().toISOString() },
                { activityType: 'email_replied', subject: 'Re: Introduction', outcome: 'interested', completedAt: new Date().toISOString() },
            ],
            null,
        );

        const brief = await generatePreMeetingBrief('p-1', 'tenant-1', prisma);

        assert.equal(brief.prospectId, 'p-1');
        assert.equal(brief.tenantId, 'tenant-1');
        assert.ok(Array.isArray(brief.suggestedTopics));
        assert.ok(brief.suggestedTopics.length > 0, 'should have at least one topic');
        assert.ok(Array.isArray(brief.riskSignals));
        assert.ok(typeof brief.generatedAt === 'string');
    });

    test('works when prisma is not provided (uses defaults)', async () => {
        mockLlmFetch({ suggestedTopics: ['General discussion'], riskSignals: [] });

        const brief = await generatePreMeetingBrief('p-2', 'tenant-1');

        assert.equal(brief.prospectId, 'p-2');
        assert.equal(brief.tenantId, 'tenant-1');
        assert.ok(Array.isArray(brief.suggestedTopics));
    });

    test('LLM failure is non-fatal — falls back to defaults', async () => {
        mockLlmFetchError();

        const prisma = makePrisma(
            { id: 'p-3', firstName: 'Bob', lastName: 'Kim', company: 'TechCo', botId: 'bot-1', tenantId: 'tenant-1' },
            [],
            null,
        );

        // Should not throw even though LLM fails
        const brief = await generatePreMeetingBrief('p-3', 'tenant-1', prisma);

        assert.equal(brief.prospectId, 'p-3');
        assert.ok(Array.isArray(brief.suggestedTopics));
        assert.ok(Array.isArray(brief.riskSignals));
    });

    test('persists brief as SalesActivity with activityType note', async () => {
        mockLlmFetch({ suggestedTopics: ['ROI'], riskSignals: [] });

        const created: Record<string, unknown>[] = [];
        const prisma = {
            prospect: {
                async findUnique(_args: unknown) {
                    return { id: 'p-4', firstName: 'Cara', lastName: 'Jones', company: 'Startup', botId: 'bot-1', tenantId: 'tenant-1' };
                },
            },
            salesActivity: {
                async findMany() { return []; },
                async create({ data }: { data: Record<string, unknown> }) {
                    created.push(data);
                    return { id: 'act-new' };
                },
            },
            salesDeal: {
                async findFirst() { return null; },
            },
        } as never;

        await generatePreMeetingBrief('p-4', 'tenant-1', prisma);

        assert.ok(created.length >= 1, 'should have created at least one activity');
        const noteActivity = created.find((a) => a['activityType'] === 'note');
        assert.ok(noteActivity, 'should persist as activityType: note');
        assert.equal(noteActivity['subject'], 'Pre-meeting research brief');
    });
});

describe('scheduleMeetingResearch', () => {
    test('returns void and does not throw', () => {
        // 100ms in the future — just test it doesn't throw synchronously
        const soon = new Date(Date.now() + 100);
        const result = scheduleMeetingResearch('p-1', 'tenant-1', 'bot-1', soon);
        assert.equal(result, undefined);
    });
});
