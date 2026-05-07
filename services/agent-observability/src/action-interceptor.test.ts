import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ActionInterceptor,
    type ActionCaptureAdapter,
    type ActionEvent,
    type ActionEventSink,
    type ApprovalGate,
} from './action-interceptor.js';

const capture: ActionCaptureAdapter = {
    captureBefore: async () => ({ screenshot: 'before', domSnapshot: 'dom-before' }),
    captureAfter: async () => ({ screenshot: 'after', domSnapshot: 'dom-after' }),
};

test('ActionInterceptor emits success event', async () => {
    const emitted: ActionEvent[] = [];
    const sink: ActionEventSink = {
        emit: async (event) => {
            emitted.push(event);
        },
    };
    const interceptor = new ActionInterceptor({ capture, eventSink: sink });

    await interceptor.execute(
        {
            agentId: 'agent-1',
            workspaceId: 'ws-1',
            taskId: 'task-1',
            sessionId: 'session-1',
            type: 'browser',
            action: 'click',
            target: '#save',
            payload: { selector: '#save' },
        },
        async () => undefined,
    );

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0]?.success, true);
    assert.equal(emitted[0]?.screenshotBefore, 'before');
    assert.equal(emitted[0]?.screenshotAfter, 'after');
});

test('ActionInterceptor blocks high-risk action when approval denied', async () => {
    const emitted: ActionEvent[] = [];
    const sink: ActionEventSink = {
        emit: async (event) => {
            emitted.push(event);
        },
    };
    const gate: ApprovalGate = {
        requestApproval: async () => ({ approved: false, reason: 'manual reject' }),
    };
    const interceptor = new ActionInterceptor({ capture, eventSink: sink, approvalGate: gate });

    await assert.rejects(
        interceptor.execute(
            {
                agentId: 'agent-1',
                workspaceId: 'ws-1',
                taskId: 'task-1',
                sessionId: 'session-1',
                type: 'browser',
                action: 'submit',
                target: '#payment-form',
                payload: { selector: '#payment-form' },
            },
            async () => undefined,
        ),
    );

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0]?.success, false);
    assert.match(emitted[0]?.errorMessage ?? '', /manual reject/);
});
