import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    startMeetingSession,
    transcribeMeeting,
    summarizeMeeting,
    distributeMeetingSummary,
    runFullMeetingPipeline,
    type MeetingProviderExecutor,
} from './meeting-transcription.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

const fakeAudio = Buffer.from('RIFF....WAVEfmt ');

// ---------------------------------------------------------------------------
// Tests — startMeetingSession
// ---------------------------------------------------------------------------

describe('startMeetingSession', () => {
    beforeEach(() => {
        process.env['API_GATEWAY_URL'] = 'http://localhost:3000';
    });

    it('posts correct payload and returns sessionId', async (t) => {
        let capturedUrl = '';
        let capturedBody: unknown = null;
        let capturedHeaders: Record<string, string> = {};

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            capturedUrl = url;
            capturedBody = JSON.parse(opts.body as string);
            capturedHeaders = opts.headers as Record<string, string>;
            return jsonResponse({ sessionId: 'sess-abc123', id: 'sess-abc123' }, 201);
        });

        const result = await startMeetingSession({
            tenantId: 't1',
            workspaceId: 'ws1',
            agentId: 'agent1',
            meetingUrl: 'https://teams.microsoft.com/l/meeting/123',
            platform: 'teams',
        });

        assert.equal(result.sessionId, 'sess-abc123');
        assert.ok(capturedUrl.includes('/v1/meetings'), 'should POST to /v1/meetings');
        assert.deepEqual((capturedBody as Record<string, unknown>)['platform'], 'teams');
        assert.equal(capturedHeaders['x-tenant-id'], 't1');
    });
});

// ---------------------------------------------------------------------------
// Tests — transcribeMeeting
// ---------------------------------------------------------------------------

describe('transcribeMeeting', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = 'http://localhost:3000';
    });

    it('calls voicebox transcribeAudio and patches session status', async (t) => {
        const urls: string[] = [];
        const methods: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            urls.push(url);
            methods.push(opts.method ?? 'GET');

            // voicebox call
            if (url.includes('17493')) {
                return jsonResponse({ text: 'Hello from the meeting', language: 'en', confidence: 0.95 });
            }
            // gateway PATCH
            return jsonResponse({ ok: true });
        });

        const result = await transcribeMeeting('sess-1', fakeAudio, 't1');

        assert.equal(result.transcript, 'Hello from the meeting');
        assert.equal(result.language, 'en');
        assert.equal(result.confidence, 0.95);

        // voicebox + gateway PATCH were called
        assert.ok(urls.some((u) => u.includes('17493')), 'should call voicebox');
        assert.ok(urls.some((u) => u.includes('/v1/meetings/sess-1')), 'should PATCH meeting session');
        assert.ok(methods.some((m) => m === 'PATCH'), 'should use PATCH method');
    });
});

// ---------------------------------------------------------------------------
// Tests — summarizeMeeting
// ---------------------------------------------------------------------------

describe('summarizeMeeting', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = 'http://localhost:3000';
        process.env['ANTHROPIC_API_KEY'] = 'test-key';
    });

    it('calls Anthropic API, parses JSON, and patches session with summary', async (t) => {
        const anthropicResult = {
            summary: 'We decided to ship next week.',
            actionItems: ['Update docs', 'Deploy staging'],
        };

        const urls: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            urls.push(url);

            if (url.includes('anthropic.com')) {
                return jsonResponse({
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(anthropicResult),
                        },
                    ],
                });
            }
            // gateway PATCH
            return jsonResponse({ ok: true });
        });

        const result = await summarizeMeeting('sess-2', 'Full transcript text...', 'en', 't1');

        assert.equal(result.summary, 'We decided to ship next week.');
        assert.deepEqual(result.actionItems, ['Update docs', 'Deploy staging']);

        assert.ok(urls.some((u) => u.includes('anthropic.com')), 'should call Anthropic API');
        assert.ok(urls.some((u) => u.includes('/v1/meetings/sess-2')), 'should PATCH meeting session');
    });
});

// ---------------------------------------------------------------------------
// Tests — distributeMeetingSummary
// ---------------------------------------------------------------------------

describe('distributeMeetingSummary', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = 'http://localhost:3000';
    });

    it('calls ProviderExecutor with slack send_message and patches status to done', async (t) => {
        const executorCalls: Array<Record<string, unknown>> = [];

        const executor: MeetingProviderExecutor = async (input) => {
            executorCalls.push({ ...input });
            return { ok: true, resultSummary: 'sent' };
        };

        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            jsonResponse({ ok: true }),
        );

        await distributeMeetingSummary(
            'sess-3',
            'Meeting went well.',
            ['Follow up on items', 'Send notes'],
            'en',
            't1',
            executor,
        );

        assert.equal(executorCalls.length, 1);
        const call = executorCalls[0]!;
        assert.equal(call['connectorType'], 'slack');
        assert.equal(call['actionType'], 'send_message');
        assert.ok(
            (call['payload'] as Record<string, unknown>)['text']?.toString().includes('Meeting went well.'),
            'message should contain summary',
        );
        assert.ok(
            (call['payload'] as Record<string, unknown>)['text']?.toString().includes('• Follow up on items'),
            'message should contain action items',
        );
    });
});

// ---------------------------------------------------------------------------
// Tests — runFullMeetingPipeline
// ---------------------------------------------------------------------------

describe('runFullMeetingPipeline', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = 'http://localhost:3000';
        process.env['ANTHROPIC_API_KEY'] = 'test-key';
    });

    it('orchestrates all steps in order and returns sessionId + summary', async (t) => {
        const patchedStatuses: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            // POST /v1/meetings — create session
            if (url.endsWith('/v1/meetings') && opts.method === 'POST') {
                return jsonResponse({ sessionId: 'sess-pipeline', id: 'sess-pipeline' }, 201);
            }
            // Voicebox
            if (url.includes('17493')) {
                return jsonResponse({ text: 'Pipeline transcript', language: 'ja', confidence: 0.88 });
            }
            // Anthropic
            if (url.includes('anthropic.com')) {
                return jsonResponse({
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                summary: 'Pipeline summary',
                                actionItems: ['Step A', 'Step B'],
                            }),
                        },
                    ],
                });
            }
            // PATCH /v1/meetings/:id — capture statuses
            if (url.includes('/v1/meetings/') && opts.method === 'PATCH') {
                const body = JSON.parse(opts.body as string) as { status?: string };
                if (body.status) patchedStatuses.push(body.status);
                return jsonResponse({ ok: true });
            }
            return jsonResponse({ ok: true });
        });

        const executor: MeetingProviderExecutor = async () => ({ ok: true, resultSummary: 'sent' });

        const result = await runFullMeetingPipeline(
            {
                tenantId: 't1',
                workspaceId: 'ws1',
                agentId: 'agent1',
                meetingUrl: 'https://zoom.us/j/12345',
                platform: 'zoom',
                audioBuffer: fakeAudio,
            },
            executor,
        );

        assert.equal(result.sessionId, 'sess-pipeline');
        assert.equal(result.summary, 'Pipeline summary');
        assert.deepEqual(result.actionItems, ['Step A', 'Step B']);

        // Statuses must appear in pipeline order
        assert.ok(patchedStatuses.includes('transcribing'), 'should patch transcribing');
        assert.ok(patchedStatuses.includes('summarizing'), 'should patch summarizing');
        assert.ok(patchedStatuses.includes('done'), 'should patch done');

        const transcribingIdx = patchedStatuses.indexOf('transcribing');
        const summarizingIdx = patchedStatuses.indexOf('summarizing');
        const doneIdx = patchedStatuses.indexOf('done');
        assert.ok(transcribingIdx < summarizingIdx, 'transcribing before summarizing');
        assert.ok(summarizingIdx < doneIdx, 'summarizing before done');
    });

    it('patches status to error and rethrows when Anthropic fails', async (t) => {
        const patchedStatuses: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            if (url.endsWith('/v1/meetings') && opts.method === 'POST') {
                return jsonResponse({ sessionId: 'sess-err', id: 'sess-err' }, 201);
            }
            if (url.includes('17493')) {
                return jsonResponse({ text: 'Some text', language: 'en', confidence: 0.9 });
            }
            if (url.includes('anthropic.com')) {
                return new Response('Internal Server Error', { status: 500 });
            }
            if (url.includes('/v1/meetings/') && opts.method === 'PATCH') {
                const body = JSON.parse(opts.body as string) as { status?: string };
                if (body.status) patchedStatuses.push(body.status);
                return jsonResponse({ ok: true });
            }
            return jsonResponse({ ok: true });
        });

        const executor: MeetingProviderExecutor = async () => ({ ok: true, resultSummary: 'n/a' });

        await assert.rejects(
            () =>
                runFullMeetingPipeline(
                    {
                        tenantId: 't1',
                        workspaceId: 'ws1',
                        agentId: 'agent1',
                        meetingUrl: 'https://meet.google.com/abc-def',
                        platform: 'google_meet',
                        audioBuffer: fakeAudio,
                    },
                    executor,
                ),
            /Anthropic API failed with HTTP 500/,
        );

        assert.ok(patchedStatuses.includes('error'), 'should patch status to error on failure');
    });
});
