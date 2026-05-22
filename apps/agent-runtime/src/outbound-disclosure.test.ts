import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applyDisclosureToConnectorPayload,
    applyDisclosureToText,
    buildMeetingDisclosureAnnouncement,
} from './outbound-disclosure.js';

const persona = {
    displayName: 'Alex',
    disclosureStatement: 'This message was sent by an AI agent.',
};

describe('applyDisclosureToConnectorPayload', () => {
    it('injects disclosure into email body', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'email',
            actionType: 'send_email',
            payload: { to: 'a@b.com', subject: 'hi', body: 'Hello world.' },
            persona,
        });
        assert.deepEqual(result.modifiedFields, ['body']);
        assert.ok(String(result.payload['body']).includes('AI agent'));
        assert.ok(String(result.payload['body']).includes('Alex'));
    });

    it('injects disclosure into teams send_message text', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'teams',
            actionType: 'send_message',
            payload: { team_id: 't', channel_id: 'c', text: 'progress update' },
            persona,
        });
        assert.deepEqual(result.modifiedFields, ['text']);
        assert.ok(String(result.payload['text']).includes('AI agent'));
    });

    it('injects disclosure into jira create_comment body', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'jira',
            actionType: 'create_comment',
            payload: { issue_key: 'PROJ-1', body: 'Started working on it.' },
            persona,
        });
        assert.deepEqual(result.modifiedFields, ['body']);
        assert.ok(String(result.payload['body']).includes('AI agent'));
    });

    it('is idempotent — already-disclosed body is returned unchanged', () => {
        const seeded = `Already done. This message was sent by an AI agent.`;
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'email',
            actionType: 'send_email',
            payload: { to: 'a@b.com', body: seeded },
            persona,
        });
        assert.deepEqual(result.modifiedFields, []);
        assert.equal(result.payload['body'], seeded);
    });

    it('returns payload unchanged when persona has no disclosure', () => {
        const payload = { to: 'a@b.com', body: 'plain' };
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'email',
            actionType: 'send_email',
            payload,
            persona: null,
        });
        assert.deepEqual(result.modifiedFields, []);
        assert.equal(result.payload, payload);
    });

    it('skips status-only actions (update_status, merge_pr, list_prs)', () => {
        for (const actionType of ['update_status', 'merge_pr', 'list_prs', 'read_task']) {
            const payload = { body: 'should NOT be touched' };
            const result = applyDisclosureToConnectorPayload({
                connectorType: 'github',
                actionType,
                payload,
                persona,
            });
            assert.deepEqual(result.modifiedFields, []);
            assert.equal(result.payload['body'], 'should NOT be touched');
        }
    });

    it('uses pr formatting for github connector', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'github',
            actionType: 'create_pr',
            payload: { body: 'Implements feature X' },
            persona,
        });
        assert.ok(String(result.payload['body']).includes('AI Agent Notice'));
    });

    it('uses slack formatting for slack connector send_message', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'slack',
            actionType: 'send_message',
            payload: { channel: '#general', message: 'Done with task' },
            persona,
        });
        // Slack format uses "> _...statement..._" italic block-quote
        assert.ok(String(result.payload['message']).includes('_This message was sent'));
    });
});

describe('applyDisclosureToText', () => {
    it('appends disclosure for slack channel', () => {
        const result = applyDisclosureToText({
            text: 'Build is green',
            persona,
            channel: 'slack',
        });
        assert.equal(result.wasModified, true);
        assert.ok(result.text.includes('AI agent'));
    });

    it('returns original text when persona is null', () => {
        const result = applyDisclosureToText({
            text: 'Build is green',
            persona: null,
            channel: 'slack',
        });
        assert.equal(result.wasModified, false);
        assert.equal(result.text, 'Build is green');
    });
});

describe('buildMeetingDisclosureAnnouncement', () => {
    it('returns named announcement when persona configured', () => {
        const announcement = buildMeetingDisclosureAnnouncement(persona);
        assert.ok(announcement.includes('Alex'));
        assert.ok(announcement.includes('AI agent'));
    });

    it('returns empty string when persona has no disclosure', () => {
        assert.equal(buildMeetingDisclosureAnnouncement(null), '');
        assert.equal(buildMeetingDisclosureAnnouncement({ displayName: 'X', disclosureStatement: '' }), '');
    });
});
