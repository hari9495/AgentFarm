import test from 'node:test';
import assert from 'node:assert/strict';

type FetchCall = { url: string; body: string };
const fetchCalls: FetchCall[] = [];
let fetchShouldThrow = false;

// @ts-expect-error — replace global fetch with test double
globalThis.fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (fetchShouldThrow) throw new Error('network error');
    fetchCalls.push({ url: url as string, body: init.body as string });
    return { ok: true } as Response;
};

const { trackApprovalOutcomes, emitApprovalRejectionAlert, resetApprovalWindow } =
    await import('./approval-alert-emitter.js');

const APPROVED = [{ decision: 'approved' as const }];
const REJECTED = [{ decision: 'rejected' as const }];
const MIXED = [{ decision: 'approved' as const }, { decision: 'rejected' as const }];

function resetAll(): void {
    resetApprovalWindow();
    fetchCalls.length = 0;
    fetchShouldThrow = false;
}

await test('trackApprovalOutcomes: rate=0 for all-approved history', () => {
    resetAll();
    for (let i = 0; i < 10; i++) trackApprovalOutcomes(APPROVED);
    const { currentRate, shouldAlert } = trackApprovalOutcomes(APPROVED);
    assert.equal(currentRate, 0);
    assert.equal(shouldAlert, false);
});

await test('trackApprovalOutcomes: alerts when rejection rate reaches 40%', () => {
    resetAll();
    for (let i = 0; i < 8; i++) trackApprovalOutcomes(APPROVED);
    // 2 rejections = 2/10 = 20% — no alert
    assert.equal(trackApprovalOutcomes(REJECTED).shouldAlert, false);
    assert.equal(trackApprovalOutcomes(REJECTED).shouldAlert, false);
    // Keep adding rejections
    trackApprovalOutcomes(REJECTED); // 3/11
    trackApprovalOutcomes(REJECTED); // 4/12
    assert.equal(trackApprovalOutcomes(REJECTED).shouldAlert, false); // 5/13 ≈ 38%
    assert.equal(trackApprovalOutcomes(REJECTED).shouldAlert, true);  // 6/14 ≈ 43%
});

await test('trackApprovalOutcomes: mixed outcomes count as rejected', () => {
    resetAll();
    for (let i = 0; i < 5; i++) trackApprovalOutcomes(APPROVED);
    for (let i = 0; i < 3; i++) trackApprovalOutcomes(MIXED);
    // 3/8 = 37.5% — still under
    assert.equal(trackApprovalOutcomes(APPROVED).shouldAlert, false); // 3/9
    assert.equal(trackApprovalOutcomes(REJECTED).shouldAlert, true);  // 4/10 = 40%
});

await test('trackApprovalOutcomes: slides window after 20 tasks', () => {
    resetAll();
    for (let i = 0; i < 20; i++) trackApprovalOutcomes(REJECTED);
    for (let i = 0; i < 20; i++) trackApprovalOutcomes(APPROVED);
    const { currentRate, shouldAlert } = trackApprovalOutcomes(APPROVED);
    assert.equal(currentRate, 0);
    assert.equal(shouldAlert, false);
});

await test('emitApprovalRejectionAlert: posts correct payload', async () => {
    resetAll();
    await emitApprovalRejectionAlert({
        tenantId: 't1', workspaceId: 'w1', botId: 'bot-1', taskId: 'task-99', currentRate: 0.5,
    });
    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0]!.body);
    assert.equal(body.eventTrigger, 'approval_rejection_high');
    assert.equal(body.payload.rejectionPct, 50);
    assert.equal(body.payload.botId, 'bot-1');
});

await test('emitApprovalRejectionAlert: swallows fetch errors', async () => {
    resetAll();
    fetchShouldThrow = true;
    await assert.doesNotReject(
        emitApprovalRejectionAlert({ tenantId: 't1', workspaceId: 'w1', botId: 'bot-1', taskId: 't', currentRate: 0.5 }),
    );
});
