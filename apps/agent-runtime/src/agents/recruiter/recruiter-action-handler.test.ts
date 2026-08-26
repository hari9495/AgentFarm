import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleRecruiterAction, type RecruiterActionInput } from './recruiter-action-handler.js';

const BASE: Omit<RecruiterActionInput, 'actionType' | 'payload'> = {
    tenantId: 't-1',
    botId: 'b-1',
    taskId: 'task-1',
    workspaceDir: 'task-1',
};

const OUTREACH_PAYLOAD = {
    candidateName: 'Jordan Lee',
    recruiterName: 'Alex Recruiter',
    companyName: 'Acme',
    roleTitle: 'Staff Engineer',
    keyValueProp: 'building the AI-first data platform',
    channel: 'email',
};

describe('workspace_rec_send_outreach', () => {
    it('drafts only by default (no send flag) — never touches a connector', async () => {
        let called = false;
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            connectorActionExecuteClient: async () => {
                called = true;
                return { ok: true, statusCode: 200, attempts: 1 };
            },
            payload: { ...OUTREACH_PAYLOAD },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['sent'], undefined, 'draft path must not report a send');
        assert.ok(typeof parsed['body'] === 'string' && (parsed['body'] as string).length > 0);
        assert.equal(called, false, 'connector must not be called without send=true');
    });

    it('sends through the native email connector when send=true', async () => {
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
            const sent: Array<{ connectorType: string; actionType: string; to: unknown }> = [];
            const result = await handleRecruiterAction({
                ...BASE,
                actionType: 'workspace_rec_send_outreach',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                connectorActionExecuteClient: async (i) => {
                    sent.push({ connectorType: i.connectorType, actionType: i.actionType, to: i.payload['to'] });
                    return { ok: true, statusCode: 200, attempts: 1 };
                },
                payload: { ...OUTREACH_PAYLOAD, send: true, candidateEmail: 'jordan@example.com' },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['sent'], true);
            assert.equal(parsed['via'], 'gmail');
            assert.deepEqual(sent, [{ connectorType: 'gmail', actionType: 'send_email', to: 'jordan@example.com' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('requires candidateEmail when send=true', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            connectorActionExecuteClient: async () => ({ ok: true, statusCode: 200, attempts: 1 }),
            payload: { ...OUTREACH_PAYLOAD, send: true },
        });
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('candidateEmail'), `expected candidateEmail mention, got: ${result.output}`);
    });

    it('falls back to the draft (with a reason) when send=true but no connector is available', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            // no connectorActionExecuteClient, no gateway creds → dispatch cannot resolve
            payload: { ...OUTREACH_PAYLOAD, send: true, candidateEmail: 'jordan@example.com' },
        });

        assert.equal(result.ok, true, 'dispatch failure must not lose the composed draft');
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['sent'], false);
        assert.ok(typeof parsed['dispatch_reason'] === 'string');
        assert.ok(typeof parsed['body'] === 'string' && (parsed['body'] as string).length > 0);
    });
});

describe('workspace_rec_post_job — browser-fallback capability + gate', () => {
    const POST_PAYLOAD = {
        jobTitle: 'Staff Engineer',
        targetPlatform: 'LinkedIn',
        jobDescription: 'We are hiring a Staff Engineer to build the data platform.',
        location: 'Remote',
    };

    it('requires a job description (must build the JD first)', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_post_job',
            payload: { jobTitle: 'Staff Engineer' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('jobDescription'));
    });

    it('gates as HIGH risk and emits a concrete browser plan (no API path)', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_post_job',
            payload: { ...POST_PAYLOAD },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['status'], 'AWAITING_APPROVAL');
        assert.equal(parsed['riskLevel'], 'high');
        assert.equal(parsed['gateType'], 'post_job_externally');

        const cap = parsed['capability'] as { tier: string; steps: Array<Record<string, unknown>> };
        assert.equal(cap.tier, 'browser');
        const actions = cap.steps.map((s) => s['action']);
        assert.deepEqual(actions, [
            'workspace_web_navigate',
            'workspace_web_login',
            'workspace_web_fill_form',
            'workspace_web_click',
            'workspace_web_read_page',
        ]);
        // The JD content is carried into the form-fill step.
        const fill = cap.steps.find((s) => s['action'] === 'workspace_web_fill_form')!;
        assert.match(JSON.stringify(fill['fields']), /data platform/);
    });

    it('never carries credentials in the browser plan (login uses the workspace session)', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_post_job',
            payload: { ...POST_PAYLOAD, password: 'hunter2', apiKey: 'secret-key' },
        });
        assert.equal(result.ok, true);
        assert.ok(!result.output.includes('hunter2'), 'password must not leak into the plan');
        assert.ok(!result.output.includes('secret-key'), 'apiKey must not leak into the plan');
    });

    it('adds a file-upload step only when a JD file is provided', async () => {
        const withFile = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_post_job',
            payload: { ...POST_PAYLOAD, jdFilePath: '/tmp/jd.pdf' },
        });
        const cap = (JSON.parse(withFile.output) as Record<string, unknown>)['capability'] as { steps: Array<Record<string, unknown>> };
        assert.ok(cap.steps.some((s) => s['action'] === 'workspace_web_upload_file'));
    });
});

describe('workspace_rec_schedule_interview — browser booking + email send', () => {
    const SCHED_PAYLOAD = {
        candidateName: 'Jordan Lee',
        candidateEmail: 'jordan@example.com',
        jobTitle: 'Staff Engineer',
        companyName: 'Acme',
        recruiterName: 'Alex Recruiter',
        recruiterEmail: 'alex@acme.com',
        interviewers: [{ name: 'Sam Dev', title: 'EM', email: 'sam@acme.com' }],
        proposedSlots: [{ date: '2026-09-01', startTime: '10:00', endTime: '10:45', timezone: 'UTC' }],
        format: 'video_call',
    };

    it('books via the browser (no calendar connector) and returns the draft', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_schedule_interview',
            payload: { ...SCHED_PAYLOAD },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        // draft content preserved
        assert.ok(typeof parsed['confirmationEmailToCandidate'] === 'string');
        const booking = parsed['booking'] as { tier: string; steps: Array<Record<string, unknown>> };
        assert.equal(booking.tier, 'browser');
        const actions = booking.steps.map((s) => s['action']);
        assert.ok(actions.includes('workspace_web_navigate'));
        assert.ok(actions.includes('workspace_web_fill_form'));
        // video_call format adds a conferencing step
        assert.ok(booking.steps.some((s) => String(s['target'] ?? '').includes('video conferencing')));
        // no email attempted without send=true
        assert.equal(parsed['confirmationEmail'], undefined);
    });

    it('sends the candidate confirmation via the email connector when send=true', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('gmail')) {
                return new Response(JSON.stringify({ credentials: { accessToken: 'a' } }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 }); // calendar connectors: not configured → browser
        }) as typeof globalThis.fetch;

        try {
            const sent: Array<{ connectorType: string; to: unknown }> = [];
            const result = await handleRecruiterAction({
                ...BASE,
                actionType: 'workspace_rec_schedule_interview',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                connectorActionExecuteClient: async (i) => {
                    sent.push({ connectorType: i.connectorType, to: i.payload['to'] });
                    return { ok: true, statusCode: 200, attempts: 1 };
                },
                payload: { ...SCHED_PAYLOAD, send: true },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            // calendar still browser (no calendar connector), email sent via gmail
            assert.equal((parsed['booking'] as { tier: string }).tier, 'browser');
            assert.deepEqual(parsed['confirmationEmail'], { sent: true, via: 'gmail' });
            assert.deepEqual(sent, [{ connectorType: 'gmail', to: 'jordan@example.com' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
