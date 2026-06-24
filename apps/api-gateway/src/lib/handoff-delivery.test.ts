import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffDelivery } from './handoff-delivery.js';

const base = {
    tenantId: 't1',
    workspaceId: 'ws1',
    taskId: 'task-42',
    fromBotId: 'bot-sales',
    toBotId: 'bot-dev',
    reason: 'needs a feature built',
    now: 1_700_000_000_000,
};

test('builds an AgentMessage trail from sender to recipient', () => {
    const { message } = buildHandoffDelivery(base);
    assert.equal(message.fromBotId, 'bot-sales');
    assert.equal(message.toBotId, 'bot-dev');
    assert.equal(message.messageType, 'HANDOFF_REQUEST');
    assert.equal(message.status, 'PENDING');
    assert.match(message.subject, /needs a feature built/);
    assert.match(message.body, /task-42/);
});

test('builds a follow-on task targeted at the recipient bot with handoff metadata', () => {
    const { task } = buildHandoffDelivery({ ...base, handoffContext: { spec: 'X' } });
    assert.equal(task.botId, 'bot-dev');
    assert.equal(task.tenantId, 't1');
    assert.equal(task.workspaceId, 'ws1');
    assert.equal(task.priority, 'normal');
    const handoff = task.payload['_handoff'] as Record<string, unknown>;
    assert.equal(handoff['from_bot_id'], 'bot-sales');
    assert.equal(handoff['source_task_id'], 'task-42');
    assert.equal(task.payload['spec'], 'X', 'handoff context is merged into the task payload');
});

test('is deterministic given a fixed now (stable ids)', () => {
    const a = buildHandoffDelivery(base);
    const b = buildHandoffDelivery(base);
    assert.equal(a.task.id, b.task.id);
    assert.equal(a.task.enqueuedAt, base.now);
});

test('derives a correlation id when none is supplied', () => {
    const { task } = buildHandoffDelivery(base);
    assert.match(String((task.payload['_handoff'] as Record<string, unknown>)['correlation_id']), /handoff_task-42_/);
});
