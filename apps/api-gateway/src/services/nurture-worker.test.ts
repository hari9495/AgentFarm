import test from 'node:test';
import assert from 'node:assert/strict';
import { runNurtureSequenceSweep, NURTURE_SEQUENCE, dispatchNurtureEmail } from './nurture-worker.js';

// ---------------------------------------------------------------------------
// In-memory Prisma stub
// ---------------------------------------------------------------------------

type LeadRec = {
    id: string; firstName: string; lastName: string; email: string;
    company: string; status: string; nurtureStep: number;
    nextContactAt: Date | null; lastContactAt: Date | null;
    qualifiedAt: Date | null; updatedAt: Date;
};

type EntryRec = {
    id: string; leadId: string; step: number; subject: string; body: string;
    channel: string; sentAt: Date;
};

let leads: Record<string, LeadRec> = {};
let entries: EntryRec[] = [];
let entrySeq = 0;

function makeStub() {
    return {
        lead: {
            findMany: async ({ where }: { where?: Record<string, unknown> }) => {
                return Object.values(leads).filter((l) => {
                    if (where?.['status'] && l.status !== where['status']) return false;
                    const nc = where?.['nextContactAt'] as Record<string, Date> | undefined;
                    if (nc?.['lte'] && l.nextContactAt && l.nextContactAt > nc['lte']) return false;
                    if (nc?.['lte'] && !l.nextContactAt) return false;
                    return true;
                });
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const rec = leads[where.id];
                if (!rec) throw new Error('not found');
                Object.assign(rec, data);
                return rec;
            },
        },
        nurtureSequenceEntry: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const entry: EntryRec = {
                    id: `entry-${++entrySeq}`,
                    leadId: String(data['leadId']),
                    step: Number(data['step']),
                    subject: String(data['subject']),
                    body: String(data['body']),
                    channel: String(data['channel'] ?? 'email'),
                    sentAt: new Date(),
                };
                entries.push(entry);
                return entry;
            },
        },
    } as never;
}

function reset() {
    leads = {};
    entries = [];
    entrySeq = 0;
}

function seedLead(id: string, overrides: Partial<LeadRec> = {}): LeadRec {
    const now = new Date();
    const rec: LeadRec = {
        id,
        firstName: 'Alice',
        lastName: 'Test',
        email: `${id}@example.com`,
        company: 'Acme',
        status: 'NURTURE',
        nurtureStep: 0,
        nextContactAt: new Date(now.getTime() - 1000), // 1 second in the past → due
        lastContactAt: null,
        qualifiedAt: null,
        updatedAt: now,
        ...overrides,
    };
    leads[id] = rec;
    return rec;
}

// ---------------------------------------------------------------------------
// Test 1: No leads due → no emails, no DB writes
// ---------------------------------------------------------------------------

test('runNurtureSequenceSweep: no leads due → 0 processed, no entries created', async () => {
    reset();
    const stub = makeStub();

    let emailSent = false;
    const spyDispatch = async () => { emailSent = true; };

    // Lead with nextContactAt in the future → not due
    seedLead('lead-future', { nextContactAt: new Date(Date.now() + 60_000) });

    const result = await runNurtureSequenceSweep(stub, { dispatch: spyDispatch });
    assert.equal(result.processed, 0);
    assert.equal(entries.length, 0);
    assert.equal(emailSent, false);
});

// ---------------------------------------------------------------------------
// Test 2: Lead at step 0, due → step-0 email sent, entry created, step advanced
// ---------------------------------------------------------------------------

test('runNurtureSequenceSweep: step-0 lead due → email dispatched and step advanced to 1', async () => {
    reset();
    const stub = makeStub();

    const dispatched: { to: string; subject: string }[] = [];
    const spyDispatch = async (payload: { to: string; subject: string; body: string }) => {
        dispatched.push({ to: payload.to, subject: payload.subject });
    };

    seedLead('lead-step0', { nurtureStep: 0 });

    const result = await runNurtureSequenceSweep(stub, { dispatch: spyDispatch });

    assert.equal(result.processed, 1);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.step, 0);
    assert.equal(entries[0]!.leadId, 'lead-step0');

    const updatedLead = leads['lead-step0']!;
    assert.equal(updatedLead.nurtureStep, 1);
    assert.ok(updatedLead.lastContactAt instanceof Date, 'lastContactAt should be set');

    // nextContactAt should be set to ~3 days from now (step 0 delayDays = 3)
    if (NURTURE_SEQUENCE[0]!.delayDays > 0) {
        assert.ok(updatedLead.nextContactAt instanceof Date, 'nextContactAt should be scheduled');
        const diff = updatedLead.nextContactAt!.getTime() - Date.now();
        assert.ok(diff > 0, 'nextContactAt should be in the future');
    }
});

// ---------------------------------------------------------------------------
// Test 3: Lead at step 2 (last), due → final email sent, step becomes 3
// ---------------------------------------------------------------------------

test('runNurtureSequenceSweep: step-2 lead (final) → email sent, nurtureStep becomes 3', async () => {
    reset();
    const stub = makeStub();

    const spyDispatch = async () => { /* no-op */ };

    seedLead('lead-step2', { nurtureStep: 2 });

    const result = await runNurtureSequenceSweep(stub, { dispatch: spyDispatch });

    assert.equal(result.processed, 1);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.step, 2);

    const updatedLead = leads['lead-step2']!;
    assert.equal(updatedLead.nurtureStep, 3);
    // step 2 has delayDays 0, so nextContactAt should be null
    assert.equal(updatedLead.nextContactAt, null);
});

// ---------------------------------------------------------------------------
// Test 4: Lead at step 3 (exhausted) → skipped, no entry
// ---------------------------------------------------------------------------

test('runNurtureSequenceSweep: exhausted lead (step >= sequence length) → skipped', async () => {
    reset();
    const stub = makeStub();

    let emailSent = false;
    const spyDispatch = async () => { emailSent = true; };

    seedLead('lead-exhausted', { nurtureStep: NURTURE_SEQUENCE.length });

    const result = await runNurtureSequenceSweep(stub, { dispatch: spyDispatch });

    assert.equal(result.processed, 0);
    assert.equal(entries.length, 0);
    assert.equal(emailSent, false);
});

// ---------------------------------------------------------------------------
// Test 5: dispatchNurtureEmail throws → entry + step update still happen
// ---------------------------------------------------------------------------

test('runNurtureSequenceSweep: email dispatch throws → NurtureSequenceEntry still created and step advanced', async () => {
    reset();
    const stub = makeStub();

    const throwingDispatch = async () => { throw new Error('SMTP unavailable'); };

    seedLead('lead-email-fail', { nurtureStep: 0 });

    // Should not throw — email failure is best-effort
    const result = await runNurtureSequenceSweep(stub, { dispatch: throwingDispatch });

    assert.equal(result.processed, 1);
    assert.equal(entries.length, 1);
    const updatedLead = leads['lead-email-fail']!;
    assert.equal(updatedLead.nurtureStep, 1);
});

// ---------------------------------------------------------------------------
// Bonus: NURTURE_EMAIL_ENABLED=false → dispatchNurtureEmail does not throw
// ---------------------------------------------------------------------------

test('dispatchNurtureEmail with NURTURE_EMAIL_ENABLED unset logs but does not throw', async () => {
    delete process.env['NURTURE_EMAIL_ENABLED'];
    await assert.doesNotReject(() =>
        dispatchNurtureEmail({ to: 'test@example.com', subject: 'Hi', body: 'Hello' }),
    );
});
