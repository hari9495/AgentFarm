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

describe('workspace_rec_manage_pipeline — ATS stage move (write)', () => {
    it('moves a candidate through the Greenhouse ATS when connected', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('greenhouse')) {
                return new Response(JSON.stringify({ credentials: { api_key: 'k' } }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof globalThis.fetch;

        try {
            const calls: Array<{ connectorType: string; actionType: string; payload: Record<string, unknown> }> = [];
            const result = await handleRecruiterAction({
                ...BASE,
                actionType: 'workspace_rec_manage_pipeline',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                connectorActionExecuteClient: async (i) => {
                    calls.push({ connectorType: i.connectorType, actionType: i.actionType, payload: i.payload });
                    return { ok: true, statusCode: 200, attempts: 1 };
                },
                payload: { jobTitle: 'Staff Engineer', recruiterName: 'Alex', applicationId: '98765', toStageId: 42, fromStageId: 41 },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['moved'], true);
            assert.equal(parsed['via'], 'greenhouse');
            assert.equal(calls.length, 1);
            assert.equal(calls[0]!.actionType, 'update_record');
            assert.deepEqual(calls[0]!.payload, {
                record_type: 'applications',
                record_id: '98765',
                fields: { to_stage_id: 42, from_stage_id: 41 },
            });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('falls back to a browser plan when no ATS connector is configured', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_manage_pipeline',
            // no gateway creds / connector → resolver returns browser
            payload: { jobTitle: 'Staff Engineer', recruiterName: 'Alex', applicationId: '98765', toStageId: 42 },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['moved'], false);
        const cap = parsed['capability'] as { tier: string; steps: Array<Record<string, unknown>> };
        assert.equal(cap.tier, 'browser');
        assert.ok(cap.steps.some((s) => s['action'] === 'workspace_web_navigate'));
    });

    it('still builds a pipeline report when no move is requested', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_manage_pipeline',
            payload: {
                jobTitle: 'Staff Engineer',
                recruiterName: 'Alex',
                candidates: [{ id: 'c1', fullName: 'Jordan Lee', currentStage: 'phone_screen', lastActivityDate: '2026-08-01' }],
            },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['moved'], undefined, 'report mode must not report a move');
    });
});

describe('workspace_rec_source_candidates — ATS read (search_records → data)', () => {
    it('returns candidate records read back from the ATS', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('greenhouse')) {
                return new Response(JSON.stringify({ credentials: { api_key: 'k' } }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof globalThis.fetch;

        try {
            const result = await handleRecruiterAction({
                ...BASE,
                actionType: 'workspace_rec_source_candidates',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                // The client now surfaces response bodies — simulate the ATS returning records.
                connectorActionExecuteClient: async (i) => {
                    assert.equal(i.actionType, 'search_records');
                    assert.equal(i.payload['record_type'], 'candidates');
                    return {
                        ok: true, statusCode: 200, attempts: 1,
                        data: { count: 1, records: [{ id: 55, name: 'Jordan Lee', title: 'Engineer' }] },
                    };
                },
                payload: { atsQuery: 'jordan@example.com' },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['source'], 'ats');
            assert.equal(parsed['via'], 'greenhouse');
            assert.equal(parsed['count'], 1);
            assert.deepEqual(parsed['records'], [{ id: 55, name: 'Jordan Lee', title: 'Engineer' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('falls back to a browser search plan when no ATS connector is configured', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_source_candidates',
            payload: { atsQuery: 'jordan@example.com' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['source'], 'browser');
        const cap = parsed['capability'] as { tier: string; steps: Array<Record<string, unknown>> };
        assert.equal(cap.tier, 'browser');
        assert.ok(cap.steps.some((s) => s['action'] === 'workspace_web_extract_data'));
    });
});

describe('workspace_rec_conduct_phone_screen — presence (join the call)', () => {
    const SCREEN_PAYLOAD = {
        candidateName: 'Jordan Lee',
        jobTitle: 'Staff Engineer',
        companyName: 'Acme',
        recruiterName: 'Alex',
        requiredSkills: ['Go', 'Distributed systems'],
    };

    it('drafts the guide only (no join) by default', async () => {
        let called = false;
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_conduct_phone_screen',
            meetingParticipationClient: async () => { called = true; return { meetingSessionId: 'x' }; },
            payload: { ...SCREEN_PAYLOAD },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['joined'], undefined);
        assert.equal(called, false);
    });

    it('joins and participates when join=true, returning the meeting session id', async () => {
        const seen: Record<string, unknown>[] = [];
        const result = await handleRecruiterAction({
            ...BASE,
            workspaceId: 'ws-1',
            actionType: 'workspace_rec_conduct_phone_screen',
            meetingParticipationClient: async (m) => { seen.push(m); return { meetingSessionId: 'mtg-123' }; },
            payload: { ...SCREEN_PAYLOAD, join: true, desktopSessionId: 'ds-1', meetingUrl: 'https://zoom.us/j/1', platform: 'zoom' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['joined'], true);
        assert.equal(parsed['meetingSessionId'], 'mtg-123');
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!['desktopSessionId'], 'ds-1');
        assert.equal(seen[0]!['platform'], 'zoom');
    });

    it('returns the guide with a reason when join=true but required params are missing', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            workspaceId: 'ws-1',
            actionType: 'workspace_rec_conduct_phone_screen',
            meetingParticipationClient: async () => ({ meetingSessionId: 'x' }),
            payload: { ...SCREEN_PAYLOAD, join: true }, // no desktopSessionId/meetingUrl/platform
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['joined'], false);
        assert.ok(String(parsed['reason']).includes('desktopSessionId'));
    });

    it('fails safe to the guide when the join throws', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            workspaceId: 'ws-1',
            actionType: 'workspace_rec_conduct_phone_screen',
            meetingParticipationClient: async () => { throw new Error('desktop-agent unreachable'); },
            payload: { ...SCREEN_PAYLOAD, join: true, desktopSessionId: 'ds-1', meetingUrl: 'https://zoom.us/j/1', platform: 'zoom' },
        });
        assert.equal(result.ok, true, 'join failure must not lose the guide');
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['joined'], false);
        assert.ok(String(parsed['reason']).includes('desktop-agent unreachable'));
    });

    it('exposes the runnable protocol even in the draft path', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_conduct_phone_screen',
            payload: { ...SCREEN_PAYLOAD },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const protocol = parsed['protocol'] as Array<{ id: string; question: string }>;
        assert.ok(Array.isArray(protocol) && protocol.length > 0);
        assert.ok(protocol.every((q) => typeof q.id === 'string' && typeof q.question === 'string'));
    });

    it('runs a protocol-driven interview when a protocol client is injected', async () => {
        let receivedProtocolLen = 0;
        const result = await handleRecruiterAction({
            ...BASE,
            workspaceId: 'ws-1',
            actionType: 'workspace_rec_conduct_phone_screen',
            // protocol client takes precedence over the generic one
            meetingParticipationClient: async () => { throw new Error('should not be called'); },
            protocolInterviewClient: async (i) => {
                receivedProtocolLen = i.protocol.length;
                return {
                    meetingSessionId: 'mtg-9',
                    completed: true,
                    totalTurns: i.protocol.length,
                    transcript: [{ speaker: 'agent', text: i.opening ?? '' }],
                    results: i.protocol.map((q) => ({ id: q.id, question: q.question, status: 'answered' as const, answer: 'ok', probes: 0 })),
                };
            },
            payload: { ...SCREEN_PAYLOAD, join: true, desktopSessionId: 'ds-1', meetingUrl: 'https://zoom.us/j/1', platform: 'zoom' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['joined'], true);
        assert.equal(parsed['mode'], 'protocol');
        assert.equal(parsed['meetingSessionId'], 'mtg-9');
        assert.equal(parsed['completed'], true);
        assert.ok(receivedProtocolLen > 0, 'the derived protocol was passed to the client');
        assert.ok(Array.isArray(parsed['results']));
    });
});

describe('workspace_rec_generate_offer — gated send', () => {
    const OFFER_PAYLOAD = {
        candidateName: 'Jordan Lee', jobTitle: 'Staff Engineer', companyName: 'Acme',
        hiringManagerName: 'Sam', department: 'Engineering', startDate: '2026-10-01',
        compensation: { baseSalary: 200000, currency: 'USD' },
        approvedBudgetMax: 250000,
    };

    it('returns AWAITING_APPROVAL with the critical gate and does not send without approval', async () => {
        let called = false;
        const result = await handleRecruiterAction({
            ...BASE, workspaceId: 'ws-1',
            actionType: 'workspace_rec_generate_offer',
            connectorActionExecuteClient: async () => { called = true; return { ok: true, statusCode: 200, attempts: 1 }; },
            payload: { ...OFFER_PAYLOAD, candidateEmail: 'jordan@example.com' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['status'], 'AWAITING_APPROVAL');
        assert.equal((parsed['gate'] as Record<string, unknown>)['gateType'], 'send_offer');
        assert.equal((parsed['gate'] as Record<string, unknown>)['riskLevel'], 'critical');
        assert.equal(called, false, 'must not send before approval');
    });

    it('escalates to the budget gate when over budget', async () => {
        const result = await handleRecruiterAction({
            ...BASE, workspaceId: 'ws-1',
            actionType: 'workspace_rec_generate_offer',
            payload: { ...OFFER_PAYLOAD, compensation: { baseSalary: 300000, currency: 'USD' }, approvedBudgetMax: 250000 },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal((parsed['gate'] as Record<string, unknown>)['gateType'], 'extend_offer_above_budget');
    });

    it('sends the offer via the email connector once approved', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('gmail')) return new Response(JSON.stringify({ credentials: { accessToken: 'a' } }), { status: 200, headers: { 'content-type': 'application/json' } });
            return new Response(null, { status: 404 });
        }) as typeof fetch;
        try {
            const sent: Array<{ to: unknown; actionType: string }> = [];
            const result = await handleRecruiterAction({
                ...BASE, workspaceId: 'ws-1', gatewayBaseUrl: 'http://gateway', serviceToken: 'tok',
                actionType: 'workspace_rec_generate_offer',
                connectorActionExecuteClient: async (i) => { sent.push({ to: i.payload['to'], actionType: i.actionType }); return { ok: true, statusCode: 200, attempts: 1 }; },
                payload: { ...OFFER_PAYLOAD, candidateEmail: 'jordan@example.com', approved: true },
            });
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['status'], 'SENT');
            assert.equal(parsed['sent'], true);
            assert.equal(parsed['via'], 'gmail');
            assert.deepEqual(sent, [{ to: 'jordan@example.com', actionType: 'send_email' }]);
        } finally { globalThis.fetch = originalFetch; }
    });
});

describe('workspace_rec_compose_rejection — gated send + ATS reject', () => {
    const REJ_PAYLOAD = {
        candidateName: 'Jordan Lee', jobTitle: 'Staff Engineer', companyName: 'Acme',
        recruiterName: 'Alex', stage: 'post_interview_reject',
    };

    it('returns AWAITING_APPROVAL (medium) without approval', async () => {
        const result = await handleRecruiterAction({
            ...BASE, workspaceId: 'ws-1',
            actionType: 'workspace_rec_compose_rejection',
            payload: { ...REJ_PAYLOAD, candidateEmail: 'jordan@example.com' },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['status'], 'AWAITING_APPROVAL');
        assert.equal((parsed['gate'] as Record<string, unknown>)['gateType'], 'reject_candidate');
        assert.equal((parsed['gate'] as Record<string, unknown>)['riskLevel'], 'medium');
    });

    it('sends the rejection and moves the ATS application when approved', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('gmail') || href.includes('greenhouse')) return new Response(JSON.stringify({ credentials: { accessToken: 'a', api_key: 'k' } }), { status: 200, headers: { 'content-type': 'application/json' } });
            return new Response(null, { status: 404 });
        }) as typeof fetch;
        try {
            const calls: string[] = [];
            const result = await handleRecruiterAction({
                ...BASE, workspaceId: 'ws-1', gatewayBaseUrl: 'http://gateway', serviceToken: 'tok',
                actionType: 'workspace_rec_compose_rejection',
                connectorActionExecuteClient: async (i) => { calls.push(`${i.connectorType}:${i.actionType}`); return { ok: true, statusCode: 200, attempts: 1 }; },
                payload: { ...REJ_PAYLOAD, candidateEmail: 'jordan@example.com', approved: true, applicationId: '77', rejectedStageId: 9 },
            });
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['status'], 'SENT');
            assert.equal(parsed['sent'], true);
            assert.deepEqual(parsed['atsRejected'], { moved: true, via: 'greenhouse' });
            assert.ok(calls.includes('gmail:send_email'));
            assert.ok(calls.includes('greenhouse:update_record'));
        } finally { globalThis.fetch = originalFetch; }
    });
});

describe('workspace_rec_screen_resume — ATS pull', () => {
    const GH_CANDIDATE = {
        first_name: 'Jordan', last_name: 'Lee', title: 'Senior Engineer', company: 'Globex',
        employments: [{ title: 'Senior Engineer', company_name: 'Globex', start_date: '2021', end_date: '' }],
        educations: [{ degree: 'BSc', discipline: 'Computer Science', school_name: 'State U' }],
        tags: ['Go', 'Kubernetes'],
    };

    it('screens a candidate pulled from the ATS by id (no paste)', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('greenhouse')) return new Response(JSON.stringify({ credentials: { api_key: 'k' } }), { status: 200, headers: { 'content-type': 'application/json' } });
            return new Response(null, { status: 404 });
        }) as typeof fetch;
        try {
            const result = await handleRecruiterAction({
                ...BASE, workspaceId: 'ws-1', gatewayBaseUrl: 'http://gateway', serviceToken: 'tok',
                actionType: 'workspace_rec_screen_resume',
                connectorActionExecuteClient: async (i) => {
                    assert.equal(i.actionType, 'get_record');
                    assert.equal(i.payload['record_type'], 'candidates');
                    return { ok: true, statusCode: 200, attempts: 1, data: GH_CANDIDATE };
                },
                payload: { candidateId: '123', jobTitle: 'Staff Engineer', requiredQualifications: ['Go', 'Kubernetes'] },
            });
            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['source'], 'ats');
            assert.equal(parsed['candidateName'], 'Jordan Lee');
            assert.ok(typeof parsed['overallScore'] === 'number');
        } finally { globalThis.fetch = originalFetch; }
    });

    it('reports not-screenable when the ATS record has no career data', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('greenhouse')) return new Response(JSON.stringify({ credentials: { api_key: 'k' } }), { status: 200, headers: { 'content-type': 'application/json' } });
            return new Response(null, { status: 404 });
        }) as typeof fetch;
        try {
            const result = await handleRecruiterAction({
                ...BASE, workspaceId: 'ws-1', gatewayBaseUrl: 'http://gateway', serviceToken: 'tok',
                actionType: 'workspace_rec_screen_resume',
                connectorActionExecuteClient: async () => ({ ok: true, statusCode: 200, attempts: 1, data: {} }),
                payload: { candidateId: '123', jobTitle: 'Staff Engineer', requiredQualifications: ['Go'] },
            });
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['screenable'], false);
        } finally { globalThis.fetch = originalFetch; }
    });

    it('falls back to a browser plan when no ATS connector is configured', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_screen_resume',
            payload: { candidateId: '123', jobTitle: 'Staff Engineer', requiredQualifications: ['Go'] },
        });
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['source'], 'browser');
        assert.equal((parsed['capability'] as Record<string, unknown>)['tier'], 'browser');
    });

    it('still screens pasted resume text (unchanged path)', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_screen_resume',
            payload: { candidateName: 'Jordan Lee', resumeText: 'Senior Engineer with Go and Kubernetes experience since 2019.', jobTitle: 'Staff Engineer', requiredQualifications: ['Go'] },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['source'], 'pasted');
        assert.ok(typeof parsed['overallScore'] === 'number');
    });
});

describe('workspace_rec_metrics', () => {
    it('returns computed recruiting metrics for a candidate snapshot', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_metrics',
            payload: {
                jobTitle: 'Staff Engineer',
                asOfDate: '2026-08-26',
                openedDate: '2026-07-01',
                candidates: [
                    { stage: 'sourced', source: 'linkedin' },
                    { stage: 'interview', source: 'referral' },
                    { stage: 'hired', source: 'referral', hired: true },
                ],
            },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['totalCandidates'], 3);
        assert.equal(parsed['hires'], 1);
        assert.ok(Array.isArray(parsed['funnel']));
        assert.equal(parsed['daysOpen'], 56);
    });

    it('requires a candidates array', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_metrics',
            payload: { jobTitle: 'Staff Engineer' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('candidates'));
    });
});
