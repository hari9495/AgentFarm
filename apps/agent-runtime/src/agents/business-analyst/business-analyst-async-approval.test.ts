import test from 'node:test';
import assert from 'node:assert/strict';
import {
    sendAsyncApprovalNotification,
    type AsyncApprovalNotificationRequest,
} from './business-analyst-async-approval.js';

const GATE = {
    effectiveRisk: 'medium' as const,
    baseRisk: 'medium' as const,
    wasPromoted: false,
    rationale: 'BRD finalize is medium risk.',
    promotable: true,
    documentType: 'final_brd' as const,
};

function emailReq(): AsyncApprovalNotificationRequest {
    return {
        approvalId: 'apr-12345678',
        taskId: 'task-1',
        actionType: 'workspace_ba_finalize_brd',
        actionSummary: 'Finalize the Q3 BRD',
        gateResult: GATE,
        notificationTarget: 'approver@example.com',
        channel: 'email',
        gatewayBaseUrl: 'http://gateway',
        workspaceId: 'ws-1',
    };
}

test('email approval notification dispatches send_email through the executor', async () => {
    const calls: Array<{ connectorType: string; actionType: string; to: unknown }> = [];
    const receipt = await sendAsyncApprovalNotification(emailReq(), async (i) => {
        calls.push({ connectorType: i.connectorType, actionType: i.actionType, to: i.payload['to'] });
        return { ok: true, resultSummary: 'sent' };
    });

    assert.equal(receipt.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.connectorType, 'email');
    assert.equal(calls[0]!.actionType, 'send_email');
    assert.equal(calls[0]!.to, 'approver@example.com');
});

test('a failing executor is reported on the receipt, never thrown', async () => {
    const receipt = await sendAsyncApprovalNotification(emailReq(), async () => ({
        ok: false,
        resultSummary: 'gmail rejected recipient',
    }));

    assert.equal(receipt.sent, false);
    assert.match(receipt.error ?? '', /gmail rejected recipient/);
});

test('regression: an undefined executor must not throw — it degrades to sent:false', async () => {
    // This is the exact bug the call-site wiring fixes: the handler used to run
    // with no executor, so this call hit `undefined({...})`. The function is
    // documented to always resolve, so it must survive it as a failed receipt.
    const receipt = await sendAsyncApprovalNotification(
        emailReq(),
        undefined as unknown as Parameters<typeof sendAsyncApprovalNotification>[1],
    );

    assert.equal(receipt.sent, false);
    assert.ok(receipt.error, 'a missing executor should surface an error, not sent:true');
});
