/**
 * Tests for customer-support-executive-action-handler.ts
 *
 * Pattern: node:test with describe/it. MCP-dependent cases use mock.method
 * to stub global fetch. Pure cases (reply_compose, issue_diagnose, sla_check,
 * kpi_report, trend_analysis, standup_report) need no network stubs.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

const BASE = { tenantId: 'tenant-1', botId: 'bot-1', taskId: 'task-1' };

// ---------------------------------------------------------------------------
// reply_compose — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_reply_compose', () => {
    it('returns ok:true with subject and body for billing category', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_reply_compose',
            payload: {
                issueDescription: 'I was charged twice for my subscription',
                issueCategory: 'billing',
                customerName: 'Jane Smith',
                agentName: 'Alex',
                companyName: 'Acme Corp',
                ticketId: 'TKT-001',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { subject: string; body: string; tone: string };
        assert.ok(parsed.subject.includes('Billing'), `expected billing subject, got: ${parsed.subject}`);
        assert.ok(parsed.body.includes('Jane Smith'), 'body should include customer name');
        assert.ok(parsed.body.includes('Alex'), 'body should include agent name');
    });

    it('auto-classifies billing from issue description when no category given', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_reply_compose',
            payload: { issueDescription: 'I was overcharged and need a refund for the invoice' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { category: string };
        assert.ok(['billing', 'refund'].includes(parsed.category), `unexpected category: ${parsed.category}`);
    });

    it('returns ok:false when issueDescription is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_reply_compose',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('issueDescription'));
    });
});

// ---------------------------------------------------------------------------
// issue_diagnose — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_issue_diagnose', () => {
    it('returns a checklist with steps for technical category', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_issue_diagnose',
            payload: {
                issueCategory: 'technical',
                errorMessage: 'ERR_CONNECTION_REFUSED on login page',
                accountId: 'ACC-123',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { checklist: string[]; steps: number };
        assert.ok(parsed.steps > 0, 'should have at least one step');
        assert.ok(parsed.checklist.some((s) => s.includes('ACC-123')), 'should include accountId in first step');
        assert.ok(parsed.checklist.some((s) => s.includes('ERR_CONNECTION_REFUSED')), 'should include error message');
    });

    it('defaults to general category when none specified', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_issue_diagnose',
            payload: {},
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { issueCategory: string; steps: number };
        assert.equal(parsed.issueCategory, 'general');
        assert.ok(parsed.steps > 0);
    });

    it('adds compliance note for healthcare industry', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_issue_diagnose',
            payload: { issueCategory: 'data_privacy', industry: 'healthcare' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { checklist: string[] };
        assert.ok(
            parsed.checklist.some((s) => s.toLowerCase().includes('hipaa')),
            'should include HIPAA compliance note for healthcare',
        );
    });
});

// ---------------------------------------------------------------------------
// sla_check — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_sla_check', () => {
    it('returns within_sla for a ticket just opened', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_sla_check',
            payload: {
                ticketId: 'TKT-100',
                openedAt: new Date().toISOString(),
                priority: 'medium',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { status: string };
        assert.equal(parsed.status, 'within_sla');
    });

    it('returns breached for a ticket opened 2 days ago with urgent priority', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_sla_check',
            payload: { ticketId: 'TKT-101', openedAt: twoDaysAgo, priority: 'urgent' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { status: string };
        assert.equal(parsed.status, 'breached');
    });

    it('returns ok:false when ticketId is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_sla_check',
            payload: { openedAt: new Date().toISOString() },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('ticketId'));
    });
});

// ---------------------------------------------------------------------------
// kpi_report — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_kpi_report', () => {
    const now = Date.now();
    const tickets = [
        { ticketId: 't1', openedAt: new Date(now - 7200_000).toISOString(), closedAt: new Date(now - 3600_000).toISOString(), csatScore: 5, wasEscalated: false, wasReopened: false, channel: 'email', category: 'billing' },
        { ticketId: 't2', openedAt: new Date(now - 3600_000).toISOString(), closedAt: new Date(now - 1800_000).toISOString(), csatScore: 3, wasEscalated: true,  wasReopened: false, channel: 'chat',  category: 'technical' },
        { ticketId: 't3', openedAt: new Date(now - 1800_000).toISOString(), closedAt: undefined, wasEscalated: false, wasReopened: false, channel: 'phone', category: 'billing' },
    ];

    it('computes CSAT, FCR, and escalation rate correctly', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_kpi_report',
            payload: { tickets, from: new Date(now - 86_400_000).toISOString(), to: new Date().toISOString() },
        });

        assert.equal(result.ok, true);
        const report = JSON.parse(result.output) as { csatScore: number; fcrRate: number; escalationRate: number; totalTickets: number };
        assert.equal(report.totalTickets, 3);
        assert.equal(report.csatScore, 4);        // (5+3)/2
        assert.ok(report.fcrRate >= 0 && report.fcrRate <= 1);
        assert.ok(report.escalationRate > 0);
    });

    it('returns ok:false when tickets array is empty', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_kpi_report',
            payload: { tickets: [] },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('tickets'));
    });
});

// ---------------------------------------------------------------------------
// trend_analysis — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_trend_analysis', () => {
    const now = Date.now();
    const tickets = Array.from({ length: 15 }, (_, i) => ({
        ticketId: `t${i}`,
        openedAt: new Date(now - i * 3600_000).toISOString(),
        closedAt: new Date(now - i * 1800_000).toISOString(),
        csatScore: i % 3 === 0 ? 5 : 3,
        wasEscalated: i % 4 === 0,
        wasReopened: false,
        channel: i % 2 === 0 ? 'email' : 'chat',
        category: i % 3 === 0 ? 'billing' : i % 3 === 1 ? 'technical' : 'shipping',
    }));

    it('returns top complaints and recommendations', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_trend_analysis',
            payload: { tickets },
        });

        assert.equal(result.ok, true);
        const analysis = JSON.parse(result.output) as { topComplaints: unknown[]; recommendations: string[] };
        assert.ok(analysis.topComplaints.length > 0, 'should have top complaints');
        assert.ok(analysis.recommendations.length > 0, 'should have recommendations');
    });
});

// ---------------------------------------------------------------------------
// standup_report — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_standup_report', () => {
    it('returns structured summary from memory entries', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_standup_report',
            payload: {
                recent_memory: [
                    'Resolved 12 tickets — billing and technical categories',
                    'Escalated 2 tickets to Tier 2 engineering',
                    'CSAT average this shift: 4.3/5',
                    '3 tickets still pending follow-up',
                ],
                bot_name: 'Aria CSE',
                team_name: 'APAC Support',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { summary: string; sections: Record<string, string> };
        assert.ok(parsed.summary.includes('Aria CSE'), 'summary should include bot name');
        assert.ok(parsed.summary.includes('APAC Support'), 'summary should include team name');
        assert.ok(parsed.sections.escalations.includes('Escalated'), 'escalation section should mention escalation');
        assert.ok(parsed.sections.kpiSnapshot.includes('CSAT'), 'kpi section should mention CSAT');
    });

    it('works with an empty memory array', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_standup_report',
            payload: { recent_memory: [] },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { summary: string };
        assert.ok(parsed.summary.includes('No recorded activity'));
    });
});

// ---------------------------------------------------------------------------
// escalate — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_escalate', () => {
    it('classifies a security incident correctly', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_escalate',
            payload: {
                description: 'Customer reports unauthorized access to their account — possible breach.',
                ticketId: 'TKT-999',
                customerEmail: 'victim@example.com',
                agentName: 'Priya',
            },
        });

        assert.equal(result.ok, true);
        const note = JSON.parse(result.output) as { tier: string; severity: string; requiresApproval: boolean };
        assert.equal(note.tier, 'security_incident');
        assert.equal(note.severity, 'critical');
        assert.equal(note.requiresApproval, true);
    });

    it('defaults to tier2_support for unrecognised descriptions', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_escalate',
            payload: { description: 'Customer is very unhappy and wants to speak to a manager.' },
        });

        assert.equal(result.ok, true);
        const note = JSON.parse(result.output) as { tier: string };
        assert.equal(note.tier, 'tier2_support');
    });

    it('returns ok:false when description is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_escalate',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('description'));
    });
});

// ---------------------------------------------------------------------------
// ticket_open — MCP stub
// ---------------------------------------------------------------------------

describe('workspace_cse_ticket_open', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_ZENDESK_URL: process.env['MCP_ZENDESK_URL'] };
    });

    afterEach(() => {
        process.env['MCP_ZENDESK_URL'] = savedEnv['MCP_ZENDESK_URL'];
        mock.reset();
    });

    it('returns ok:true with ticketId from MCP stub', async () => {
        process.env['MCP_ZENDESK_URL'] = 'http://localhost:9990';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ ticketId: 'ZD-001', subject: 'Login issue', status: 'open', priority: 'high', channel: 'email' }),
        }));

        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_ticket_open',
            payload: {
                subject: 'Cannot log in after password reset',
                description: 'Customer reports 401 after following reset email link.',
                priority: 'high',
                channel: 'email',
                customerEmail: 'user@example.com',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { ticketId: string };
        assert.equal(parsed.ticketId, 'ZD-001');
    });

    it('returns ok:false when subject is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_ticket_open',
            payload: { description: 'Some description' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('subject'));
    });
});

// ---------------------------------------------------------------------------
// ticket_close — MCP stub
// ---------------------------------------------------------------------------

describe('workspace_cse_ticket_close', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_ZENDESK_URL: process.env['MCP_ZENDESK_URL'] };
    });

    afterEach(() => {
        process.env['MCP_ZENDESK_URL'] = savedEnv['MCP_ZENDESK_URL'];
        mock.reset();
    });

    it('closes a ticket and returns closed:true', async () => {
        process.env['MCP_ZENDESK_URL'] = 'http://localhost:9990';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ closed: true, ticketId: 'TKT-500' }),
        }));

        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_ticket_close',
            payload: {
                ticketId: 'TKT-500',
                resolutionNote: 'Resolved by resetting 2FA. Customer confirmed working.',
                satisfactionRating: 5,
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { closed: boolean };
        assert.equal(parsed.closed, true);
    });

    it('returns ok:false when resolutionNote is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_ticket_close',
            payload: { ticketId: 'TKT-500' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('resolutionNote'));
    });
});

// ---------------------------------------------------------------------------
// refund_process — MCP stub
// ---------------------------------------------------------------------------

describe('workspace_cse_refund_process', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_STRIPE_URL: process.env['MCP_STRIPE_URL'] };
    });

    afterEach(() => {
        process.env['MCP_STRIPE_URL'] = savedEnv['MCP_STRIPE_URL'];
        mock.reset();
    });

    it('returns a refundId and status from Stripe stub', async () => {
        process.env['MCP_STRIPE_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({
                refundId: 're_001', amountRefunded: 4999, currency: 'USD', status: 'initiated',
            }),
        }));

        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_refund_process',
            payload: {
                transactionId: 'ch_001',
                amount: 4999,
                currency: 'USD',
                reason: 'duplicate_charge',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { refundId: string; status: string };
        assert.equal(parsed.refundId, 're_001');
        assert.equal(parsed.status, 'initiated');
    });

    it('returns ok:false when transactionId is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_refund_process',
            payload: { reason: 'duplicate_charge' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('transactionId'));
    });
});

// ---------------------------------------------------------------------------
// csat_send — MCP stub + email fallback
// ---------------------------------------------------------------------------

describe('workspace_cse_csat_send', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = { MCP_TYPEFORM_URL: process.env['MCP_TYPEFORM_URL'] };
    });

    afterEach(() => {
        process.env['MCP_TYPEFORM_URL'] = savedEnv['MCP_TYPEFORM_URL'];
        mock.reset();
    });

    it('returns sent:true from MCP stub', async () => {
        process.env['MCP_TYPEFORM_URL'] = 'http://localhost:9992';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ surveyId: 'sf-001', status: 'sent' }),
        }));

        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_csat_send',
            payload: {
                customerEmail: 'customer@example.com',
                customerName: 'Bob',
                ticketId: 'TKT-200',
                agentName: 'Aria',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { surveyId: string; status: string };
        assert.equal(parsed.surveyId, 'sf-001');
        assert.equal(parsed.status, 'sent');
    });

    it('falls back to email_fallback when no MCP connector', async () => {
        delete process.env['MCP_TYPEFORM_URL'];
        delete process.env['MCP_SURVEYMONKEY_URL'];
        delete process.env['MCP_ZENDESK_CSAT_URL'];
        delete process.env['MCP_SURVEY_URL'];

        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_csat_send',
            payload: { customerEmail: 'customer@example.com' },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { channel: string; previewSubject: string };
        assert.equal(parsed.channel, 'email_fallback');
        assert.ok(parsed.previewSubject.includes('survey') || parsed.previewSubject.toLowerCase().includes('how did we do'));
    });

    it('returns ok:false when customerEmail is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_csat_send',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('customerEmail'));
    });
});

// ---------------------------------------------------------------------------
// live_chat_handle — pure, no network
// ---------------------------------------------------------------------------

describe('workspace_cse_live_chat_handle', () => {
    it('composes a friendly response for a chat message', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_live_chat_handle',
            payload: {
                sessionId: 'chat-001',
                customerMessage: 'Hi, I cannot log in to my account after the password reset',
                customerName: 'Sam',
                agentName: 'Aria',
            },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { sessionId: string; response: string; tone: string };
        assert.equal(parsed.sessionId, 'chat-001');
        assert.ok(parsed.response.length > 50, 'response should be substantive');
        assert.equal(parsed.tone, 'friendly');
    });

    it('returns ok:false when sessionId is missing', async () => {
        const { handleCustomerSupportExecutiveAction } = await import('./customer-support-executive-action-handler.js');

        const result = await handleCustomerSupportExecutiveAction({
            ...BASE,
            actionType: 'workspace_cse_live_chat_handle',
            payload: { customerMessage: 'Hello?' },
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('sessionId'));
    });
});
