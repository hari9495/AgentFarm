import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApprovalPacket } from './approval-packet.js';

test('parseApprovalPacket returns structured fields from formatted action summary', () => {
    const packet = parseApprovalPacket([
        'Change summary: Update connector auth flow for retry handling',
        'Impacted scope: apps/api-gateway/src/routes/connector-auth.ts',
        'Risk reason: Action create_pr is medium-risk by policy.',
        'Proposed rollback: Revert the route handler and restore previous retry logic.',
        'Lint status: passed',
        'Test status: passed',
    ].join('\n'));

    assert.equal(packet.change_summary, 'Update connector auth flow for retry handling');
    assert.equal(packet.impacted_scope, 'apps/api-gateway/src/routes/connector-auth.ts');
    assert.equal(packet.risk_reason, 'Action create_pr is medium-risk by policy.');
    assert.equal(packet.proposed_rollback, 'Revert the route handler and restore previous retry logic.');
    assert.equal(packet.lint_status, 'passed');
    assert.equal(packet.test_status, 'passed');
    assert.equal(packet.packet_complete, true);
});

test('parseApprovalPacket falls back to plain summary when packet fields are absent', () => {
    const packet = parseApprovalPacket('Merge release branch into main after manual review');

    assert.equal(packet.change_summary, 'Merge release branch into main after manual review');
    assert.equal(packet.impacted_scope, null);
    assert.equal(packet.risk_reason, null);
    assert.equal(packet.proposed_rollback, null);
    assert.equal(packet.lint_status, null);
    assert.equal(packet.test_status, null);
    assert.equal(packet.packet_complete, false);
});

test('parseApprovalPacket accepts case-insensitive labels with list prefixes', () => {
    const packet = parseApprovalPacket([
        '1. change summary: Rotate short-lived connector token handling',
        '- impacted scope: services/connector-gateway/src/index.ts',
        '* risk reason: Temporary auth churn can block sync jobs.',
        '2) proposed rollback: Re-enable prior token refresh branch.',
        'Lint status: passed',
        'TEST STATUS: passed',
    ].join('\n'));

    assert.equal(packet.change_summary, 'Rotate short-lived connector token handling');
    assert.equal(packet.impacted_scope, 'services/connector-gateway/src/index.ts');
    assert.equal(packet.risk_reason, 'Temporary auth churn can block sync jobs.');
    assert.equal(packet.proposed_rollback, 'Re-enable prior token refresh branch.');
    assert.equal(packet.lint_status, 'passed');
    assert.equal(packet.test_status, 'passed');
    assert.equal(packet.packet_complete, true);
});

test('parseApprovalPacket uses explicit fallback for empty summaries', () => {
    const packet = parseApprovalPacket('   ');

    assert.equal(packet.change_summary, 'No change summary provided');
    assert.equal(packet.packet_complete, false);
});
