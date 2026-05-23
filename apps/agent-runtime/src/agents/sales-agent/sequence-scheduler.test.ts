import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFollowUps } from './sequence-scheduler.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Stub types
// ---------------------------------------------------------------------------

interface FakeEntry {
    id: string;
    tenantId: string;
    botId: string;
    prospectId: string;
    sequenceStep: number;
    scheduledFor: Date;
    sentAt: Date | null;
    skipped: boolean;
    skipReason: string | null;
    subject: string | null;
    activityId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

let entries: FakeEntry[] = [];
let entrySeq = 0;

function makeStub(existingEntries: FakeEntry[] = []) {
    entries = [...existingEntries];

    return {
        salesSequenceEntry: {
            findMany: async (args: { where?: Record<string, unknown>; orderBy?: unknown }) => {
                const prospectId = (args.where as Record<string, unknown>)?.['prospectId'];
                const tenantId = (args.where as Record<string, unknown>)?.['tenantId'];
                return entries.filter((e) => {
                    if (prospectId && e.prospectId !== prospectId) return false;
                    if (tenantId && e.tenantId !== tenantId) return false;
                    return true;
                });
            },
            create: async (args: { data: Record<string, unknown> }) => {
                const now = new Date();
                const entry: FakeEntry = {
                    id: `seq-${++entrySeq}`,
                    tenantId: String(args.data['tenantId']),
                    botId: String(args.data['botId']),
                    prospectId: String(args.data['prospectId']),
                    sequenceStep: Number(args.data['sequenceStep']),
                    scheduledFor: args.data['scheduledFor'] as Date,
                    sentAt: null,
                    skipped: false,
                    skipReason: null,
                    subject: null,
                    activityId: null,
                    createdAt: now,
                    updatedAt: now,
                };
                entries.push(entry);
                return entry;
            },
        },
    } as never;
}

function makeConfig(followUpDays: number[]): SalesAgentConfigRecord {
    return {
        id: 'cfg-1',
        tenantId: 'tenant-a',
        botId: 'bot-1',
        productDescription: 'Test product',
        icp: 'SMB',
        emailProvider: 'smtp',
        emailTone: 'professional',
        followUpDays,
        maxProspectsPerDay: 50,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    } as unknown as SalesAgentConfigRecord;
}

// ---------------------------------------------------------------------------
// Test 1: Creates exactly N entries for N followUpDays
// ---------------------------------------------------------------------------

test('scheduleFollowUps: creates one entry per followUpDay', async () => {
    entrySeq = 0;
    const prisma = makeStub();
    const config = makeConfig([3, 7, 14]);

    const result = await scheduleFollowUps(
        {
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-1',
            config,
            startFrom: new Date('2026-05-01T00:00:00.000Z'),
        },
        prisma,
    );

    assert.equal(result.scheduled.length, 3, 'should create 3 follow-up entries');
    assert.equal(entries.length, 3);
});

// ---------------------------------------------------------------------------
// Test 2: sequenceStep starts at 2 (step 1 = initial outreach)
// ---------------------------------------------------------------------------

test('scheduleFollowUps: first entry has sequenceStep 2', async () => {
    entrySeq = 0;
    const prisma = makeStub();
    const config = makeConfig([3, 7]);

    const result = await scheduleFollowUps(
        {
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-2',
            config,
            startFrom: new Date('2026-05-01T00:00:00.000Z'),
        },
        prisma,
    );

    assert.equal(result.scheduled[0]?.sequenceStep, 2);
    assert.equal(result.scheduled[1]?.sequenceStep, 3);
});

// ---------------------------------------------------------------------------
// Test 3: scheduledFor dates match cumulative day offsets
// ---------------------------------------------------------------------------

test('scheduleFollowUps: scheduledFor dates match cumulative offsets', async () => {
    entrySeq = 0;
    const prisma = makeStub();
    const config = makeConfig([3, 7]);
    const startFrom = new Date('2026-05-01T00:00:00.000Z');

    const result = await scheduleFollowUps(
        {
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-3',
            config,
            startFrom,
        },
        prisma,
    );

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const firstExpected = new Date(startFrom.getTime() + 3 * MS_PER_DAY).toISOString();
    const secondExpected = new Date(startFrom.getTime() + 10 * MS_PER_DAY).toISOString(); // 3 + 7

    assert.equal(result.scheduled[0]?.scheduledFor, firstExpected);
    assert.equal(result.scheduled[1]?.scheduledFor, secondExpected);
});

// ---------------------------------------------------------------------------
// Test 4: Idempotent — second call returns existing entries, no new creates
// ---------------------------------------------------------------------------

test('scheduleFollowUps: idempotent — second call returns existing entries without creating new ones', async () => {
    entrySeq = 0;
    const now = new Date();
    const existing: FakeEntry[] = [
        {
            id: 'existing-1',
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-4',
            sequenceStep: 2,
            scheduledFor: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
            sentAt: null,
            skipped: false,
            skipReason: null,
            subject: null,
            activityId: null,
            createdAt: now,
            updatedAt: now,
        },
    ];

    const prisma = makeStub(existing);
    const config = makeConfig([3, 7]);

    const result = await scheduleFollowUps(
        {
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-4',
            config,
            startFrom: now,
        },
        prisma,
    );

    // Should return existing 1 entry (the one pre-seeded), not create any new ones
    assert.equal(result.scheduled.length, 1, 'should return existing entry count');
    assert.equal(result.scheduled[0]?.id, 'existing-1', 'should return existing entry id');
    // entries should still only have the 1 pre-seeded entry (no new creates)
    assert.equal(entries.length, 1, 'no new DB rows should be created');
});

// ---------------------------------------------------------------------------
// Test 5: Empty followUpDays → no entries created
// ---------------------------------------------------------------------------

test('scheduleFollowUps: empty followUpDays creates no entries', async () => {
    entrySeq = 0;
    const prisma = makeStub();
    const config = makeConfig([]);

    const result = await scheduleFollowUps(
        {
            tenantId: 'tenant-a',
            botId: 'bot-1',
            prospectId: 'prospect-5',
            config,
        },
        prisma,
    );

    assert.equal(result.scheduled.length, 0);
    assert.equal(entries.length, 0);
});
