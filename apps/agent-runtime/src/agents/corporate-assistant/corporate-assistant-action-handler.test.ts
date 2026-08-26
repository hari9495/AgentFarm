/**
 * Tests for corporate-assistant-action-handler.ts
 *
 * Pattern: node:test with describe/it. MCP-dependent cases use mock.method to
 * stub global fetch (same pattern as calendar-scheduler.test.ts). Pure cases
 * (email_compose, email_classify, escalate) need no network stubs.
 *
 * Each case covers:
 *   - Happy path: valid payload → ok: true with expected shape
 *   - Validation failure: missing required field → ok: false + error text
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE = { tenantId: 'tenant-1', botId: 'bot-1', taskId: 'task-1' };

const PERSONA = {
    displayName: 'Alex Assistant',
    emailAddress: 'alex-abc123@agentfarm.io',
    disclosureStatement: 'Note: This was sent by an AI agent.',
};

// ---------------------------------------------------------------------------
// email_compose
// ---------------------------------------------------------------------------

describe('workspace_ca_email_compose', () => {
    it('returns ok:true with subject and body when persona and task are provided', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_compose',
            payload: {
                task: { subject: 'Q3 Planning', body: 'Please review the attached deck.' },
                _persona: PERSONA,
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['subject'], 'Q3 Planning');
        assert.ok(typeof parsed['body'] === 'string' && parsed['body'].includes('Please review'), 'body should contain task text');
    });

    it('returns ok:false when _persona is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_compose',
            payload: { task: { subject: 'Hello', body: 'World' } },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('_persona'), `expected _persona mention, got: ${result.errorOutput}`);
    });
});

// ---------------------------------------------------------------------------
// email_send
// ---------------------------------------------------------------------------

describe('workspace_ca_email_send', () => {
    it('returns ok:false when payload.to is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_send',
            payload: {
                subject: 'Welcome',
                body: 'Hello there.',
                providerName: 'sendgrid',
                _persona: PERSONA,
            },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.toLowerCase().includes('to'), `expected 'to' mention, got: ${result.errorOutput}`);
    });

    it('returns ok:false when _persona is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_send',
            payload: {
                to: 'user@example.com',
                subject: 'Welcome',
                body: 'Hello.',
                providerName: 'sendgrid',
            },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('_persona'), `expected _persona mention, got: ${result.errorOutput}`);
    });

    it('returns ok:false with providerName guidance when neither a connector nor providerName is available', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        // No connectorActionExecuteClient and no providerName → both paths unavailable.
        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_send',
            payload: {
                to: 'user@example.com',
                subject: 'Welcome',
                body: 'Hello.',
                _persona: PERSONA,
            },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('providerName'), `expected providerName mention, got: ${result.errorOutput}`);
    });

    it('dispatches through the native connector when one is configured — no providerName needed', async () => {
        const originalFetch = globalThis.fetch;
        // Stub the gateway token lookup so gmail resolves as configured.
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('gmail')) {
                return new Response(JSON.stringify({ credentials: { accessToken: 'a' } }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof globalThis.fetch;

        try {
            const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');
            const sent: Array<{ connectorType: string; actionType: string }> = [];

            const result = await handleCorporateAssistantAction({
                ...BASE,
                actionType: 'workspace_ca_email_send',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                connectorActionExecuteClient: async (i) => {
                    sent.push({ connectorType: i.connectorType, actionType: i.actionType });
                    return { ok: true, statusCode: 200, attempts: 1 };
                },
                payload: {
                    to: 'user@example.com',
                    subject: 'Welcome',
                    body: 'Hello.',
                    _persona: PERSONA, // note: no providerName
                },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['sent'], true);
            assert.equal(parsed['via'], 'gmail');
            assert.deepEqual(sent, [{ connectorType: 'gmail', actionType: 'send_email' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// email_classify — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_ca_email_classify', () => {
    it('classifies a reply-intent email', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_classify',
            payload: { subject: 'Re: Project Update', body: 'Thanks for the update, sounds good.' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { intent: string };
        assert.equal(parsed.intent, 'reply');
    });

    it('classifies a new_thread email', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_classify',
            payload: { subject: 'Quarterly business review', body: 'Hello team, let us schedule a sync.' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { intent: string };
        // should be new_thread or forward — never undefined
        assert.ok(['new_thread', 'forward', 'reply'].includes(parsed.intent), `unexpected intent: ${parsed.intent}`);
    });

    it('returns ok:false when both subject and body are empty', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_email_classify',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('subject') || result.errorOutput?.includes('body'));
    });
});

// ---------------------------------------------------------------------------
// calendar_check
// ---------------------------------------------------------------------------

describe('workspace_ca_calendar_check', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_GOOGLE_CALENDAR_URL: process.env['MCP_GOOGLE_CALENDAR_URL'],
            MCP_OUTLOOK_CALENDAR_URL: process.env['MCP_OUTLOOK_CALENDAR_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = savedEnv['MCP_GOOGLE_CALENDAR_URL'];
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = savedEnv['MCP_OUTLOOK_CALENDAR_URL'];
        mock.reset();
    });

    it('returns ok:false when attendeeEmails is empty', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_check',
            payload: {
                attendeeEmails: [],
                durationMinutes: 30,
                dateRangeStart: '2026-06-01T09:00:00Z',
                dateRangeEnd: '2026-06-01T17:00:00Z',
            },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('attendeeEmails'));
    });

    it('returns ok:true with slots from MCP stub', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ slots: ['2026-06-01T10:00:00Z'] }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_check',
            payload: {
                attendeeEmails: ['alice@example.com'],
                durationMinutes: 30,
                dateRangeStart: '2026-06-01T09:00:00Z',
                dateRangeEnd: '2026-06-01T17:00:00Z',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { slots: string[] };
        assert.deepEqual(parsed.slots, ['2026-06-01T10:00:00Z']);
    });
});

// ---------------------------------------------------------------------------
// calendar_schedule
// ---------------------------------------------------------------------------

describe('workspace_ca_calendar_schedule', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_GOOGLE_CALENDAR_URL: process.env['MCP_GOOGLE_CALENDAR_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = savedEnv['MCP_GOOGLE_CALENDAR_URL'];
        mock.reset();
    });

    it('returns ok:false when title is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_schedule',
            payload: {
                attendeeEmails: ['alice@example.com'],
                startTime: '2026-06-01T10:00:00Z',
                endTime: '2026-06-01T11:00:00Z',
            },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('title'));
    });

    it('creates an event and returns eventId', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ eventId: 'evt-001', joinUrl: 'https://meet.example.com/abc' }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_schedule',
            payload: {
                title: 'Q3 Kickoff',
                attendeeEmails: ['alice@example.com', 'bob@example.com'],
                startTime: '2026-06-01T10:00:00Z',
                endTime: '2026-06-01T11:00:00Z',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { eventId: string };
        assert.equal(parsed.eventId, 'evt-001');
    });
});

// ---------------------------------------------------------------------------
// calendar_cancel
// ---------------------------------------------------------------------------

describe('workspace_ca_calendar_cancel', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_GOOGLE_CALENDAR_URL: process.env['MCP_GOOGLE_CALENDAR_URL'] };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = savedEnv['MCP_GOOGLE_CALENDAR_URL'];
        mock.reset();
    });

    it('returns ok:false when eventId is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_cancel',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('eventId'));
    });

    it('cancels event and returns cancelled:true', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ cancelled: true }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_calendar_cancel',
            payload: { eventId: 'evt-001', cancellationNote: 'Rescheduling.' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { cancelled: boolean };
        assert.equal(parsed.cancelled, true);
    });
});

// ---------------------------------------------------------------------------
// document_create
// ---------------------------------------------------------------------------

describe('workspace_ca_document_create', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_GOOGLE_DRIVE_URL: process.env['MCP_GOOGLE_DRIVE_URL'] };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = savedEnv['MCP_GOOGLE_DRIVE_URL'];
        mock.reset();
    });

    it('returns ok:false when provider is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_document_create',
            payload: { title: 'Sprint Retro', body: 'What went well...' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('provider'));
    });

    it('creates a document and returns documentId', async () => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = 'http://localhost:9992';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ documentId: 'doc-001', url: 'https://drive.example.com/doc-001' }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_document_create',
            payload: { title: 'Sprint Retro', body: 'What went well...', provider: 'google_drive' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { documentId: string };
        assert.equal(parsed.documentId, 'doc-001');
    });
});

// ---------------------------------------------------------------------------
// document_update
// ---------------------------------------------------------------------------

describe('workspace_ca_document_update', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_GOOGLE_DRIVE_URL: process.env['MCP_GOOGLE_DRIVE_URL'] };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = savedEnv['MCP_GOOGLE_DRIVE_URL'];
        mock.reset();
    });

    it('returns ok:false when documentId is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_document_update',
            payload: { mode: 'append', content: 'New section.', provider: 'google_drive' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('documentId'));
    });

    it('updates a document and returns updated:true', async () => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = 'http://localhost:9992';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ updated: true }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_document_update',
            payload: { documentId: 'doc-001', mode: 'append', content: 'New section.', provider: 'google_drive' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { updated: boolean };
        assert.equal(parsed.updated, true);
    });
});

// ---------------------------------------------------------------------------
// escalate — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_ca_escalate', () => {
    it('classifies a legal escalation and returns domain + note', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_escalate',
            payload: {
                description: 'Customer is threatening legal action over contract terms.',
                urgency: 'high',
                requestedBy: 'sales@example.com',
                _persona: PERSONA,
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { domain: string; note: string };
        assert.equal(parsed.domain, 'legal');
        assert.ok(typeof parsed.note === 'string' && parsed.note.length > 0);
    });

    it('returns ok:false when description is empty', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_escalate',
            payload: { description: '' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('description'));
    });
});

// ---------------------------------------------------------------------------
// message_send
// ---------------------------------------------------------------------------

describe('workspace_ca_message_send', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_SLACK_URL: process.env['MCP_SLACK_URL'],
            MCP_TEAMS_URL: process.env['MCP_TEAMS_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_SLACK_URL'] = savedEnv['MCP_SLACK_URL'];
        process.env['MCP_TEAMS_URL'] = savedEnv['MCP_TEAMS_URL'];
        mock.reset();
    });

    it('returns ok:false when platform is invalid', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'discord', recipient: '#general', message: 'Hi' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('platform'));
    });

    it('returns ok:false when recipient is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'slack', message: 'Hello' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('recipient'));
    });

    it('returns ok:false when message is missing', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'slack', recipient: '#general' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('message'));
    });

    it('sends a Slack message and returns sent:true', async () => {
        process.env['MCP_SLACK_URL'] = 'http://localhost:9993';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ sent: true, messageId: 'slack-001' }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'slack', recipient: '#eng', message: 'Deployment done.' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { sent: boolean; messageId: string; platform: string };
        assert.equal(parsed.sent, true);
        assert.equal(parsed.messageId, 'slack-001');
        assert.equal(parsed.platform, 'slack');
    });

    it('sends a Teams message and returns sent:true', async () => {
        process.env['MCP_TEAMS_URL'] = 'http://localhost:9994';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ sent: true, message_id: 'teams-999' }),
        }));

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'teams', recipient: 'alice@corp.com', message: 'Your summary is ready.' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { sent: boolean; messageId: string; platform: string };
        assert.equal(parsed.sent, true);
        assert.equal(parsed.messageId, 'teams-999');
        assert.equal(parsed.platform, 'teams');
    });

    it('returns ok:false (errorOutput) when MCP connector is unavailable', async () => {
        delete process.env['MCP_SLACK_URL'];

        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');

        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_message_send',
            payload: { platform: 'slack', recipient: '#ops', message: 'Alert' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('slack') || result.errorOutput?.includes('MCP_SLACK_URL'));
    });
});

describe('workspace_ca_standup_report — post', () => {
    it('returns the summary as a draft by default', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');
        let called = false;
        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_standup_report',
            connectorActionExecuteClient: async () => { called = true; return { ok: true, statusCode: 200, attempts: 1 }; },
            payload: { recent_memory: ['Sent the board deck', 'Scheduled the QBR'] },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], undefined);
        assert.ok(parsed['summary']);
        assert.equal(called, false);
    });

    it('posts to Slack when post=true with a channel', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');
        const calls: Array<{ connectorType: string; actionType: string; channel: unknown }> = [];
        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_standup_report',
            connectorActionExecuteClient: async (i) => { calls.push({ connectorType: i.connectorType, actionType: i.actionType, channel: i.payload['channel'] }); return { ok: true, statusCode: 200, attempts: 1 }; },
            payload: { recent_memory: ['Sent the board deck'], post: true, channel: '#exec' },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], true);
        assert.deepEqual(calls, [{ connectorType: 'slack', actionType: 'send_message', channel: '#exec' }]);
    });

    it('returns summary with a reason when post=true without a channel', async () => {
        const { handleCorporateAssistantAction } = await import('./corporate-assistant-action-handler.js');
        const result = await handleCorporateAssistantAction({
            ...BASE,
            actionType: 'workspace_ca_standup_report',
            payload: { recent_memory: ['x'], post: true },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['posted'], false);
        assert.ok(String(parsed['reason']).includes('channel'));
    });
});
