import { describe, it, expect } from 'vitest';
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
        expect(result.modifiedFields).toEqual(['body']);
        expect(String(result.payload['body'])).toContain('AI agent');
        expect(String(result.payload['body'])).toContain('Alex');
    });

    it('injects disclosure into teams send_message text', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'teams',
            actionType: 'send_message',
            payload: { team_id: 't', channel_id: 'c', text: 'progress update' },
            persona,
        });
        expect(result.modifiedFields).toEqual(['text']);
        expect(String(result.payload['text'])).toContain('AI agent');
    });

    it('injects disclosure into jira create_comment body', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'jira',
            actionType: 'create_comment',
            payload: { issue_key: 'PROJ-1', body: 'Started working on it.' },
            persona,
        });
        expect(result.modifiedFields).toEqual(['body']);
        expect(String(result.payload['body'])).toContain('AI agent');
    });

    it('is idempotent — already-disclosed body is returned unchanged', () => {
        const seeded = `Already done. This message was sent by an AI agent.`;
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'email',
            actionType: 'send_email',
            payload: { to: 'a@b.com', body: seeded },
            persona,
        });
        expect(result.modifiedFields).toEqual([]);
        expect(result.payload['body']).toBe(seeded);
    });

    it('returns payload unchanged when persona has no disclosure', () => {
        const payload = { to: 'a@b.com', body: 'plain' };
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'email',
            actionType: 'send_email',
            payload,
            persona: null,
        });
        expect(result.modifiedFields).toEqual([]);
        expect(result.payload).toBe(payload);
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
            expect(result.modifiedFields).toEqual([]);
            expect(result.payload['body']).toBe('should NOT be touched');
        }
    });

    it('uses pr formatting for github connector', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'github',
            actionType: 'create_pr',
            payload: { body: 'Implements feature X' },
            persona,
        });
        expect(String(result.payload['body'])).toContain('AI Agent Notice');
    });

    it('uses slack formatting for slack connector send_message', () => {
        const result = applyDisclosureToConnectorPayload({
            connectorType: 'slack',
            actionType: 'send_message',
            payload: { channel: '#general', message: 'Done with task' },
            persona,
        });
        // Slack format uses "> _...statement..._" italic block-quote
        expect(String(result.payload['message'])).toContain('_This message was sent');
    });
});

describe('applyDisclosureToText', () => {
    it('appends disclosure for slack channel', () => {
        const result = applyDisclosureToText({
            text: 'Build is green',
            persona,
            channel: 'slack',
        });
        expect(result.wasModified).toBe(true);
        expect(result.text).toContain('AI agent');
    });

    it('returns original text when persona is null', () => {
        const result = applyDisclosureToText({
            text: 'Build is green',
            persona: null,
            channel: 'slack',
        });
        expect(result.wasModified).toBe(false);
        expect(result.text).toBe('Build is green');
    });
});

describe('buildMeetingDisclosureAnnouncement', () => {
    it('returns named announcement when persona configured', () => {
        const announcement = buildMeetingDisclosureAnnouncement(persona);
        expect(announcement).toContain('Alex');
        expect(announcement).toContain('AI agent');
    });

    it('returns empty string when persona has no disclosure', () => {
        expect(buildMeetingDisclosureAnnouncement(null)).toBe('');
        expect(buildMeetingDisclosureAnnouncement({ displayName: 'X', disclosureStatement: '' })).toBe('');
    });
});
