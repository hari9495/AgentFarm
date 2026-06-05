/**
 * Meeting Agent — end-to-end integration test
 *
 * Tests the full meeting-agent pipeline in a single shot:
 *   1. RAG context retrieval (buildMeetingRagContext)
 *   2. Full meeting pipeline (startSession → transcribe → summarize → distribute)
 *   3. Lesson ingestion (ingestApprovedMeetingSummary via meeting-agent-lesson-pipeline)
 *   4. Feedback classification and lesson storage
 *
 * All HTTP calls are mocked — no real services required.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildMeetingRagContext,
    ingestMeetingSummary,
    type MeetingRagQuery,
} from './meeting-agent-rag-retriever.js';

import {
    startMeetingSession,
    transcribeMeeting,
    summarizeMeeting,
    distributeMeetingSummary,
    runFullMeetingPipeline,
    type MeetingProviderExecutor,
} from './meeting-transcription.js';

import {
    classifyMeetingFeedback,
    buildMeetingEpisodicPattern,
    buildMeetingEpisodicSummary,
    ingestMeetingFeedback,
    InMemoryMeetingLessonStore,
    type MeetingFeedbackContext,
    type MeetingFeedbackItem,
} from './meeting-agent-lesson-pipeline.js';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const GATEWAY_URL   = 'http://gateway.test';
const SERVICE_TOKEN = 'svc-tok-test';
const TENANT_ID     = 'tenant-e2e';
const WORKSPACE_ID  = 'ws-e2e';
const AGENT_ID      = 'agent-e2e';
const FAKE_AUDIO    = Buffer.from('RIFF....WAVEfmt ');

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

// ---------------------------------------------------------------------------
// 1. RAG context retrieval — e2e
// ---------------------------------------------------------------------------

describe('Meeting Agent e2e — RAG context retrieval', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = GATEWAY_URL;
    });

    it('builds a full context block from similar meetings + templates + lessons', async (t) => {
        const urls: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string) => {
            urls.push(url as string);

            // Knowledge-base search (similar meetings and templates)
            if ((url as string).includes('/v1/knowledge-base/search')) {
                return jsonResponse({
                    results: [
                        {
                            id: 'kb-1',
                            content: 'Q1 planning meeting: decided to ship v2 by March.',
                            sourceType: 'meeting_approved_summary',
                            similarity: 0.82,
                        },
                        {
                            id: 'kb-2',
                            content: 'Template: ## Summary\n## Action Items\n## Decisions',
                            sourceType: 'meeting_summary_template',
                            similarity: 0.71,
                        },
                    ],
                });
            }

            // Patterns endpoint (lessons)
            if ((url as string).includes('/v1/workspaces/')) {
                return jsonResponse({
                    patterns: [
                        { pattern: 'meeting:lesson:action_item_clarity:ws-e2e:l1', summary: 'Always assign owners to action items.', confidence: 0.9 },
                    ],
                });
            }

            return jsonResponse({});
        });

        const query: MeetingRagQuery = {
            tenantId:     TENANT_ID,
            meetingTitle: 'Q2 Planning',
            meetingDescription: 'Review Q2 roadmap and assign owners',
            documentType: 'meeting_summary',
            meetingType:  'sprint_planning',
        };

        const ctx = await buildMeetingRagContext(query, GATEWAY_URL, SERVICE_TOKEN, WORKSPACE_ID);

        assert.ok(ctx.contextBlock.length > 0, 'context block should be non-empty');
        assert.ok(ctx.contextBlock.includes('## Meeting Context'), 'should have context heading');
        assert.ok(ctx.similarMeetingCount > 0, 'should retrieve similar meetings');
        assert.ok(ctx.templateChunkCount  > 0, 'should retrieve templates');
        assert.ok(ctx.lessonCount         > 0, 'should retrieve lessons');
        assert.ok(typeof ctx.retrievedAt === 'string', 'retrievedAt should be a string');

        // Knowledge-base was queried at least twice (similar + template)
        const kbCalls = urls.filter((u) => u.includes('/v1/knowledge-base/search'));
        assert.ok(kbCalls.length >= 2, 'should call knowledge-base for similar meetings and templates');
    });

    it('returns empty context block when no results match', async (t) => {
        t.mock.method(globalThis, 'fetch', async () => jsonResponse({ results: [], patterns: [] }));

        const query: MeetingRagQuery = {
            tenantId:     TENANT_ID,
            meetingTitle: 'Obscure internal meeting',
            meetingDescription: 'No prior context exists',
            documentType: 'transcript_summary',
        };

        const ctx = await buildMeetingRagContext(query, GATEWAY_URL, SERVICE_TOKEN, WORKSPACE_ID);
        assert.equal(ctx.contextBlock, '', 'should return empty string when nothing retrieved');
        assert.equal(ctx.similarMeetingCount, 0);
        assert.equal(ctx.templateChunkCount,  0);
        assert.equal(ctx.lessonCount,         0);
    });
});

// ---------------------------------------------------------------------------
// 2. Full meeting pipeline — e2e
// ---------------------------------------------------------------------------

describe('Meeting Agent e2e — full pipeline', () => {
    before(() => {
        process.env['API_GATEWAY_URL'] = GATEWAY_URL;
        process.env['ANTHROPIC_API_KEY'] = 'test-key';
    });

    it('orchestrates create → transcribe → summarize → distribute in the correct order', async (t) => {
        const events: string[] = [];
        const patchedStatuses: string[] = [];
        const executorCalls: Array<{ connectorType: string; actionType: string }> = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            const u = url as string;

            // POST /v1/meetings — session creation
            if (u.endsWith('/v1/meetings') && opts.method === 'POST') {
                events.push('session_created');
                return jsonResponse({ sessionId: 'sess-e2e', id: 'sess-e2e' }, 201);
            }

            // Voicebox STT — only /v1/transcribe pushes to events
            if (u.includes('/v1/transcribe')) {
                events.push('transcription_done');
                return jsonResponse({ text: 'We agreed to ship v3 next sprint.', language: 'en', confidence: 0.96 });
            }

            // Voicebox TTS — speakResponse fire-and-forget; return silence bytes
            if (u.includes('/v1/synthesize')) {
                return new Response(new Uint8Array(4).buffer, { status: 200 });
            }

            // Anthropic summarization
            if (u.includes('anthropic.com')) {
                events.push('summarization_done');
                return jsonResponse({
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            summary: 'Team agreed to ship v3 in the next sprint.',
                            actionItems: ['Hari to cut release branch', 'QA to sign off'],
                        }),
                    }],
                });
            }

            // PATCH /v1/meetings/:id — status updates
            if (u.includes('/v1/meetings/') && opts.method === 'PATCH') {
                const body = JSON.parse(opts.body as string) as { status?: string };
                if (body.status) patchedStatuses.push(body.status);
                return jsonResponse({ ok: true });
            }

            return jsonResponse({ ok: true });
        });

        const executor: MeetingProviderExecutor = async (input) => {
            executorCalls.push({ connectorType: input.connectorType, actionType: input.actionType });
            return { ok: true, resultSummary: 'delivered' };
        };

        const result = await runFullMeetingPipeline(
            {
                tenantId:    TENANT_ID,
                workspaceId: WORKSPACE_ID,
                agentId:     AGENT_ID,
                meetingUrl:  'https://teams.microsoft.com/l/meeting/e2e',
                platform:    'teams',
                audioBuffer: FAKE_AUDIO,
            },
            executor,
        );

        // Result structure
        assert.equal(result.sessionId, 'sess-e2e');
        assert.ok(result.summary.includes('v3'));
        assert.deepEqual(result.actionItems, ['Hari to cut release branch', 'QA to sign off']);

        // Statuses in order
        assert.ok(patchedStatuses.includes('transcribing'), 'transcribing status set');
        assert.ok(patchedStatuses.includes('summarizing'),  'summarizing status set');
        assert.ok(patchedStatuses.includes('done'),         'done status set');
        const tIdx = patchedStatuses.indexOf('transcribing');
        const sIdx = patchedStatuses.indexOf('summarizing');
        const dIdx = patchedStatuses.indexOf('done');
        assert.ok(tIdx < sIdx && sIdx < dIdx, 'statuses appear in pipeline order');

        // Slack distribution triggered
        assert.ok(executorCalls.some((c) => c.connectorType === 'slack'), 'distributed via slack');

        // High-level event ordering
        assert.deepEqual(events, ['session_created', 'transcription_done', 'summarization_done']);
    });

    it('patches status to error and rethrows when summarization fails', async (t) => {
        const patchedStatuses: string[] = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            const u = url as string;
            if (u.endsWith('/v1/meetings') && opts.method === 'POST') {
                return jsonResponse({ sessionId: 'sess-err-e2e', id: 'sess-err-e2e' }, 201);
            }
            if (u.includes('/v1/transcribe')) {
                return jsonResponse({ text: 'Some transcript', language: 'en', confidence: 0.9 });
            }
            if (u.includes('/v1/synthesize')) {
                return new Response(new Uint8Array(4).buffer, { status: 200 });
            }
            if (u.includes('anthropic.com')) {
                return new Response('Service Unavailable', { status: 503 });
            }
            if (u.includes('/v1/meetings/') && opts.method === 'PATCH') {
                const body = JSON.parse(opts.body as string) as { status?: string };
                if (body.status) patchedStatuses.push(body.status);
                return jsonResponse({ ok: true });
            }
            return jsonResponse({ ok: true });
        });

        const executor: MeetingProviderExecutor = async () => ({ ok: true, resultSummary: 'n/a' });

        await assert.rejects(
            () => runFullMeetingPipeline(
                {
                    tenantId:    TENANT_ID,
                    workspaceId: WORKSPACE_ID,
                    agentId:     AGENT_ID,
                    meetingUrl:  'https://meet.google.com/err',
                    platform:    'google_meet',
                    audioBuffer: FAKE_AUDIO,
                },
                executor,
            ),
            /anthropic_request_failed/,
            'should rethrow summarization error',
        );

        assert.ok(patchedStatuses.includes('error'), 'error status must be set on failure');
    });
});

// ---------------------------------------------------------------------------
// 3. Summary ingestion into knowledge base — e2e
// ---------------------------------------------------------------------------

describe('Meeting Agent e2e — knowledge base ingestion', () => {
    it('posts a well-formed chunk to the knowledge-base write endpoint', async (t) => {
        let capturedBody: Record<string, unknown> = {};
        let capturedUrl = '';

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            capturedUrl = url as string;
            capturedBody = JSON.parse(opts.body as string);
            return jsonResponse({ ok: true }, 200);
        });

        const ok = await ingestMeetingSummary({
            tenantId:    TENANT_ID,
            meetingTitle: 'Sprint 12 Retro',
            documentType: 'meeting_summary',
            content:     'Key decision: adopt trunk-based dev. Action: Hari to update CONTRIBUTING.md.',
            sourceUrl:   'urn:agentfarm:meeting:sprint12-retro',
            meetingType: 'retrospective',
            gatewayBaseUrl: GATEWAY_URL,
            serviceToken:   SERVICE_TOKEN,
        });

        assert.ok(ok, 'ingestMeetingSummary should return true');
        assert.ok(capturedUrl.includes('/v1/knowledge-base/write'), 'should POST to knowledge-base write');
        assert.equal(capturedBody['sourceType'], 'meeting_approved_summary');
        assert.ok(typeof capturedBody['content'] === 'string' && (capturedBody['content'] as string).includes('Sprint 12 Retro'));
        assert.ok((capturedBody['content'] as string).includes('retrospective'));
    });

    it('returns false gracefully when the gateway is unavailable', async (t) => {
        t.mock.method(globalThis, 'fetch', async () => { throw new Error('ECONNREFUSED'); });

        const ok = await ingestMeetingSummary({
            tenantId:    TENANT_ID,
            meetingTitle: 'Test meeting',
            documentType: 'action_items',
            content:     'action items here',
            gatewayBaseUrl: GATEWAY_URL,
            serviceToken:   SERVICE_TOKEN,
        });

        assert.equal(ok, false, 'should return false when network fails');
    });
});

// ---------------------------------------------------------------------------
// 4. Lesson pipeline — feedback classification, ingestion, and retrieval
// ---------------------------------------------------------------------------

describe('Meeting Agent e2e — lesson pipeline', () => {
    it('classifyMeetingFeedback maps feedback text to the correct category', () => {
        assert.equal(classifyMeetingFeedback('no owner assigned to the action item'), 'action_item_clarity');
        assert.equal(classifyMeetingFeedback('the decision was not captured in notes'), 'decision_capture');
        assert.equal(classifyMeetingFeedback('summary was inaccurate and missed key points'), 'summary_accuracy');
        assert.equal(classifyMeetingFeedback('follow up from last meeting was ignored'), 'follow_up_tracking');
        assert.equal(classifyMeetingFeedback('ran over time and agenda not finished'), 'time_management');
        assert.equal(classifyMeetingFeedback('generic complaint'), 'summary_accuracy'); // default
    });

    it('ingestMeetingFeedback classifies and persists lessons', async () => {
        const store = new InMemoryMeetingLessonStore();
        const ctx: MeetingFeedbackContext = {
            tenantId:     TENANT_ID,
            workspaceId:  WORKSPACE_ID,
            taskId:       'task-e2e-feedback',
            documentType: 'meeting_summary',
            actionType:   'workspace_meeting_summarize',
            correlationId: 'corr-e2e-1',
        };
        const feedbackItems: MeetingFeedbackItem[] = [
            { body: 'No owner assigned to the action item — who will do this?' },
            { body: 'The key decision was not captured in the summary.' },
            { body: 'ok' }, // should be skipped (< 10 chars)
        ];

        const lessons = await ingestMeetingFeedback(ctx, feedbackItems, store);

        assert.equal(lessons.length, 2, 'short feedback items should be skipped');
        assert.equal(lessons[0]!.category, 'action_item_clarity');
        assert.equal(lessons[1]!.category, 'decision_capture');
        assert.equal(lessons[0]!.workspaceId, WORKSPACE_ID);

        const retrieved = await store.findByWorkspace(WORKSPACE_ID);
        assert.equal(retrieved.length, 2, 'both lessons should be stored and retrievable');
    });

    it('buildMeetingEpisodicPattern encodes action type and outcome', () => {
        const task = {
            payload: { meetingTitle: 'Sprint 12' },
        } as unknown as TaskEnvelope;

        const successResult = {
            status: 'success',
            decision: { actionType: 'workspace_meeting_summarize' },
        } as unknown as ProcessedTaskResult;

        const failResult = {
            status: 'failure',
            decision: { actionType: 'workspace_meeting_transcribe' },
        } as unknown as ProcessedTaskResult;

        const successPattern = buildMeetingEpisodicPattern(task, successResult);
        const failPattern    = buildMeetingEpisodicPattern(task, failResult);

        assert.ok(successPattern.startsWith('meeting:'), 'pattern should start with meeting:');
        assert.ok(successPattern.includes('success'), 'success pattern should contain "success"');
        assert.ok(failPattern.includes('fail'), 'fail pattern should contain "fail"');
    });

    it('buildMeetingEpisodicSummary produces human-readable text for all action types', () => {
        const task = { payload: { meetingTitle: 'Q2 Planning' } } as unknown as TaskEnvelope;

        const summarizeResult = {
            status: 'success',
            decision: { actionType: 'workspace_meeting_summarize' },
        } as unknown as ProcessedTaskResult;

        const summary = buildMeetingEpisodicSummary(task, summarizeResult);
        assert.ok(typeof summary === 'string' && summary.length > 10, 'summary should be a non-trivial string');
        assert.ok(summary.includes('Q2 Planning') || summary.includes('summar') || summary.includes('success'));
    });
});
