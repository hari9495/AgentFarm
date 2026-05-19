import test from 'node:test';
import assert from 'node:assert/strict';
import { runSalesSequenceSweep } from './sales-sequence-worker.js';

// ---------------------------------------------------------------------------
// Stub types
// ---------------------------------------------------------------------------

interface FakeSeqEntry {
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
}

interface FakeProspect {
    id: string;
    tenantId: string;
    botId: string;
    status: string;
    sequenceStep: number;
    lastContactedAt: Date | null;
    firstName: string;
    lastName: string;
    email: string;
    company: string | null;
}

interface FakeConfig {
    id: string;
    tenantId: string;
    botId: string;
    productDescription: string;
    icp: string;
    emailProvider: string;
    emailTone: string;
    followUpDays: number[];
    maxProspectsPerDay: number;
    active: boolean;
    [key: string]: unknown;
}

let seqEntries: Record<string, FakeSeqEntry> = {};
let prospects: Record<string, FakeProspect> = {};
let configs: FakeConfig[] = [];

function reset() {
    seqEntries = {};
    prospects = {};
    configs = [];
}

function makeStub(sendResult: { success: boolean; activityId?: string } = { success: true, activityId: 'act-1' }) {
    let sendCallCount = 0;

    const stub = {
        salesSequenceEntry: {
            findMany: async (args: {
                where?: Record<string, unknown>;
                orderBy?: unknown;
                take?: number;
            }) => {
                const w = (args.where ?? {}) as Record<string, unknown>;
                return Object.values(seqEntries).filter((e) => {
                    if (w['sentAt'] === null && e.sentAt !== null) return false;
                    if (w['skipped'] === false && e.skipped !== false) return false;
                    const sf = w['scheduledFor'] as Record<string, Date> | undefined;
                    if (sf?.['lte'] && e.scheduledFor > sf['lte']) return false;
                    // for prev-step lookup
                    if (w['prospectId'] && e.prospectId !== w['prospectId']) return false;
                    if (w['sequenceStep'] !== undefined && e.sequenceStep !== w['sequenceStep']) return false;
                    return true;
                }).sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
                    .slice(0, args.take ?? Infinity);
            },
            update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
                const e = seqEntries[args.where.id];
                if (!e) throw new Error(`entry ${args.where.id} not found`);
                Object.assign(e, args.data);
                return e;
            },
        },
        prospect: {
            findUnique: async (args: { where: { id: string } }) => {
                return prospects[args.where.id] ?? null;
            },
            update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
                const p = prospects[args.where.id];
                if (!p) throw new Error(`prospect ${args.where.id} not found`);
                Object.assign(p, args.data);
                return p;
            },
        },
        salesAgentConfig: {
            findFirst: async (args: { where: Record<string, unknown> }) => {
                return configs.find(
                    (c) =>
                        c.botId === args.where['botId'] &&
                        c.tenantId === args.where['tenantId'],
                ) ?? null;
            },
        },
    } as never;

    // Patch sendOutreachEmail at module level via dependency injection override
    (stub as unknown as Record<string, unknown>)['__sendResult'] = sendResult;
    (stub as unknown as Record<string, unknown>)['__sendCallCount'] = () => sendCallCount;

    return { db: stub, getSendCallCount: () => sendCallCount, incSendCall: () => sendCallCount++ };
}

function seedEntry(id: string, overrides: Partial<FakeSeqEntry> = {}): FakeSeqEntry {
    const now = new Date();
    const entry: FakeSeqEntry = {
        id,
        tenantId: 'tenant-a',
        botId: 'bot-1',
        prospectId: 'prospect-1',
        sequenceStep: 2,
        scheduledFor: new Date(now.getTime() - 1000), // 1 second ago → due
        sentAt: null,
        skipped: false,
        skipReason: null,
        subject: null,
        activityId: null,
        ...overrides,
    };
    seqEntries[id] = entry;
    return entry;
}

function seedProspect(id: string, overrides: Partial<FakeProspect> = {}): FakeProspect {
    const p: FakeProspect = {
        id,
        tenantId: 'tenant-a',
        botId: 'bot-1',
        status: 'contacted',
        sequenceStep: 1,
        lastContactedAt: null,
        firstName: 'Alice',
        lastName: 'Test',
        email: `${id}@example.com`,
        company: 'Acme',
        ...overrides,
    };
    prospects[id] = p;
    return p;
}

function seedConfig(overrides: Partial<FakeConfig> = {}): FakeConfig {
    const c: FakeConfig = {
        id: 'cfg-1',
        tenantId: 'tenant-a',
        botId: 'bot-1',
        productDescription: 'Test product',
        icp: 'SMB',
        emailProvider: 'smtp',
        emailTone: 'professional',
        followUpDays: [3, 7],
        maxProspectsPerDay: 50,
        active: true,
        ...overrides,
    };
    configs.push(c);
    return c;
}

// ---------------------------------------------------------------------------
// Test 1: No due entries → 0 processed, 0 skipped
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: no due entries → 0 processed, 0 skipped', async () => {
    reset();
    const { db } = makeStub();

    // Entry in the future → not due
    seedEntry('entry-future', { scheduledFor: new Date(Date.now() + 60_000) });
    seedProspect('prospect-1');
    seedConfig();

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 0);
});

// ---------------------------------------------------------------------------
// Test 2: Already sent entry → not reprocessed
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: already-sent entry is not reprocessed', async () => {
    reset();
    const { db } = makeStub();

    seedEntry('entry-sent', { sentAt: new Date() }); // already sent
    seedProspect('prospect-1');
    seedConfig();

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 0);
});

// ---------------------------------------------------------------------------
// Test 3: Prospect with terminal status is skipped
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: disqualified prospect is skipped', async () => {
    reset();
    const { db } = makeStub();

    seedEntry('entry-disq');
    seedProspect('prospect-1', { status: 'disqualified' });
    seedConfig();

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 1);

    // Entry should be marked skipped
    assert.equal(seqEntries['entry-disq']?.skipped, true);
    assert.match(seqEntries['entry-disq']?.skipReason ?? '', /prospect_status/);
});

// ---------------------------------------------------------------------------
// Test 4: Missing config → entry skipped with config_not_found
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: missing config → entry skipped with config_not_found', async () => {
    reset();
    const { db } = makeStub();

    seedEntry('entry-noconf');
    seedProspect('prospect-1');
    // no config seeded

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 1);

    assert.equal(seqEntries['entry-noconf']?.skipped, true);
    assert.equal(seqEntries['entry-noconf']?.skipReason, 'config_not_found');
});

// ---------------------------------------------------------------------------
// Test 5: Missing prospect → entry skipped with prospect_not_found
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: missing prospect → entry skipped with prospect_not_found', async () => {
    reset();
    const { db } = makeStub();

    seedEntry('entry-noprospect', { prospectId: 'no-such-prospect' });
    seedConfig();
    // no prospect seeded

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 1);

    assert.equal(seqEntries['entry-noprospect']?.skipped, true);
    assert.equal(seqEntries['entry-noprospect']?.skipReason, 'prospect_not_found');
});

// ---------------------------------------------------------------------------
// Test 6: closed_won prospect is also skipped (all terminal statuses)
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: closed_won prospect is skipped', async () => {
    reset();
    const { db } = makeStub();

    seedEntry('entry-won');
    seedProspect('prospect-1', { status: 'closed_won' });
    seedConfig();

    const result = await runSalesSequenceSweep(db);
    assert.equal(result.skipped, 1);
    assert.equal(seqEntries['entry-won']?.skipReason, 'prospect_status_closed_won');
});

// ---------------------------------------------------------------------------
// Test 7: Multiple entries — some skipped, some due
// ---------------------------------------------------------------------------

test('runSalesSequenceSweep: counts are correct with mixed due/terminal entries', async () => {
    reset();
    const { db } = makeStub();

    // One skippable entry (terminal prospect)
    seedEntry('entry-skip', { prospectId: 'prospect-skip' });
    seedProspect('prospect-skip', { status: 'disqualified' });

    // One future entry (not due)
    seedEntry('entry-future2', { scheduledFor: new Date(Date.now() + 60_000) });
    seedProspect('prospect-1');
    seedConfig();

    const result = await runSalesSequenceSweep(db);
    // entry-skip → skipped; entry-future2 → not picked up at all
    assert.equal(result.skipped, 1);
    assert.equal(result.processed, 0);
});
