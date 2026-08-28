import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    isMeetingSlackEnabled,
    distributeMeetingSummaryToSlack,
} from '../lib/meeting-slack-notifier.js';
import { generateProposalPdf, sendProposalEmail } from '../proposal-generator.js';
import { createMeetingSummarizer, type SummarizeTranscriptFn } from '../lib/meeting-summarizer.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

const voiceboxBase = (): string =>
    (process.env['VOICEBOX_URL'] ?? 'http://localhost:17493').replace(/\/+$/, '');

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type SessionIdParams = {
    sessionId: string;
};

type CreateMeetingBody = {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    meetingUrl: string;
    platform: string;
};

type PatchMeetingBody = {
    status?: string;
    language?: string;
    transcriptRaw?: string;
    summaryText?: string;
    actionItems?: string;
    endedAt?: string;
};

type PostMeetingAuditEventBody = {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    platform: string;
    eventType: string;
    severity?: string;
    summary: string;
    payload?: Record<string, unknown>;
    durationMs?: number;
};

type PatchSpeakingAgentBody = {
    speakingEnabled?: boolean;
    agentVoiceId?: string;
    resolvedLanguage?: string;
};

type PostSpeakingAgentBody = {
    text: string;
    language?: string;
    voiceId?: string;
};

type AnalyzeTranscriptBody = {
    transcript: string;
    language?: string;
};

type PatchActionItemBody = {
    status?: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
    priority?: string;
    dueDate?: string | null;
    linkedTaskId?: string | null;
    linkedConnector?: string | null;
};

/**
 * Fan the flat MeetingSession.actionItems JSON out into structured
 * MeetingActionItem rows so each item can be tracked and later acted on
 * (Jira/Slack/email via the approval flow). Accepts a JSON array of either
 * strings or `{ text, ownerName?, ownerEmail?, priority? }` objects. Replaces
 * the session's existing item set (idempotent re-summarise). Best-effort —
 * the caller wraps this in a catch so it never fails the PATCH.
 */
async function syncActionItemRows(
    prisma: PrismaClient,
    input: { meetingSessionId: string; tenantId: string; workspaceId: string; actionItemsJson: string },
): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(input.actionItemsJson);
    } catch {
        return; // not JSON — leave structured rows untouched
    }
    if (!Array.isArray(parsed)) return;

    const rows = parsed
        .map((raw, i) => {
            const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
            const text =
                typeof raw === 'string'
                    ? raw
                    : typeof obj['text'] === 'string'
                      ? (obj['text'] as string)
                      : '';
            if (!text.trim()) return null;
            return {
                meetingSessionId: input.meetingSessionId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                text: text.trim(),
                ownerName: typeof obj['ownerName'] === 'string' ? (obj['ownerName'] as string) : null,
                ownerEmail: typeof obj['ownerEmail'] === 'string' ? (obj['ownerEmail'] as string) : null,
                priority: typeof obj['priority'] === 'string' ? (obj['priority'] as string) : 'medium',
                sortOrder: i,
            };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

    await prisma.$transaction([
        prisma.meetingActionItem.deleteMany({ where: { meetingSessionId: input.meetingSessionId } }),
        ...(rows.length ? [prisma.meetingActionItem.createMany({ data: rows })] : []),
    ]);
}

export type RegisterMeetingRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    /** Overrides generateProposalPdf — used in tests. */
    generateProposalFn?: typeof generateProposalPdf;
    /** Overrides the transcript summarizer — used in tests. */
    summarizeFn?: SummarizeTranscriptFn;
};

export async function registerMeetingRoutes(
    app: FastifyInstance,
    options: RegisterMeetingRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doGenerateProposal = options.generateProposalFn ?? generateProposalPdf;
    const summarizeTranscript = options.summarizeFn ?? createMeetingSummarizer();

    // -----------------------------------------------------------------------
    // GET /v1/meetings/:sessionId
    // -----------------------------------------------------------------------
    app.get<{ Params: SessionIdParams }>(
        '/v1/meetings/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const prisma = await resolvePrisma();

            const record = await prisma.meetingSession.findFirst({
                where: {
                    id: sessionId,
                    tenantId: session.tenantId,
                },
            });

            if (!record) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            return reply.send(record);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings
    // -----------------------------------------------------------------------
    app.post<{ Body: CreateMeetingBody }>(
        '/v1/meetings',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { tenantId, workspaceId, agentId, meetingUrl, platform } =
                request.body ?? ({} as CreateMeetingBody);

            if (!tenantId || !workspaceId || !agentId || !meetingUrl || !platform) {
                return reply.code(400).send({
                    error: 'Missing required fields: tenantId, workspaceId, agentId, meetingUrl, platform',
                });
            }

            const prisma = await resolvePrisma();
            const record = await prisma.meetingSession.create({
                data: {
                    tenantId,
                    workspaceId,
                    agentId,
                    meetingUrl,
                    platform,
                    status: 'joining',
                },
            });

            return reply.code(201).send({ sessionId: record.id, ...record });
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/meetings/:sessionId
    // -----------------------------------------------------------------------
    app.patch<{ Params: SessionIdParams; Body: PatchMeetingBody }>(
        '/v1/meetings/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const body = request.body ?? ({} as PatchMeetingBody);

            const updateData: Record<string, unknown> = {};
            if (body.status !== undefined) updateData['status'] = body.status;
            if (body.language !== undefined) updateData['language'] = body.language;
            if (body.transcriptRaw !== undefined) updateData['transcriptRaw'] = body.transcriptRaw;
            if (body.summaryText !== undefined) updateData['summaryText'] = body.summaryText;
            if (body.actionItems !== undefined) updateData['actionItems'] = body.actionItems;
            if (body.endedAt !== undefined) updateData['endedAt'] = new Date(body.endedAt);

            if (Object.keys(updateData).length === 0) {
                return reply.code(400).send({ error: 'No updatable fields provided' });
            }

            const prisma = await resolvePrisma();

            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const updated = await prisma.meetingSession.update({
                where: { id: sessionId },
                data: updateData,
            });

            // Fan the flat actionItems JSON out into structured MeetingActionItem
            // rows so each item can be tracked and acted on individually. Non-fatal.
            if (body.actionItems !== undefined) {
                await syncActionItemRows(prisma, {
                    meetingSessionId: sessionId,
                    tenantId: session.tenantId,
                    workspaceId: existing.workspaceId,
                    actionItemsJson: body.actionItems,
                }).catch((err: unknown) => {
                    console.warn('[meetings] syncActionItemRows failed:', err);
                });
            }

            // Distribute meeting summary to Slack when summaryText was just set
            // and has not already been distributed. Failure is non-fatal.
            if (
                body.summaryText !== undefined &&
                body.summaryText.trim().length > 0 &&
                !existing.slackDistributed &&
                isMeetingSlackEnabled()
            ) {
                const sent = await distributeMeetingSummaryToSlack({
                    sessionId,
                    tenantId: session.tenantId,
                    workspaceId: existing.workspaceId,
                    platform: existing.platform,
                    summaryText: body.summaryText,
                    actionItems: body.actionItems ?? existing.actionItems,
                });

                if (sent) {
                    await prisma.meetingSession.update({
                        where: { id: sessionId },
                        data: { slackDistributed: true },
                    }).catch((err: unknown) => {
                        console.warn('[meeting-slack] Failed to set slackDistributed:', err);
                    });
                }
            }

            // Generate proposal PDF when summary is newly set
            if (
                body.summaryText !== undefined &&
                body.summaryText.trim().length > 0 &&
                !existing.proposalPath
            ) {
                doGenerateProposal(sessionId, session.tenantId, prisma)
                    .then(async (path) => {
                        if (path) {
                            // Auto-send proposal if configured
                            await sendProposalEmail(sessionId, session.tenantId, prisma)
                                .catch((err: unknown) => {
                                    console.warn('[meetings] sendProposalEmail failed:', err);
                                });
                        }
                    })
                    .catch((err: unknown) => {
                        console.warn('[meetings] generateProposalPdf failed:', err);
                    });
            }

            return reply.send(updated);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings/:sessionId/analyze-transcript
    // Async meeting intelligence: accept a raw transcript, summarise it via the
    // LLM, store summary + action items on the session (which fans out into
    // structured MeetingActionItem rows), and return the result.
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams; Body: AnalyzeTranscriptBody }>(
        '/v1/meetings/:sessionId/analyze-transcript',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { sessionId } = request.params;
            const body = request.body ?? ({} as AnalyzeTranscriptBody);
            const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
            if (!transcript) {
                return reply.code(400).send({ error: 'transcript is required' });
            }

            const prisma = await resolvePrisma();
            const meeting = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!meeting) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const language = body.language ?? meeting.language ?? 'en';
            const result = await summarizeTranscript(transcript, language);
            if (!result) {
                return reply.code(503).send({
                    error: 'summarizer_unavailable',
                    message:
                        'Transcript summarizer is not configured or the LLM call failed. Set AF_OPENAI_API_KEY / OPENAI_API_KEY.',
                });
            }

            const actionItemsJson = JSON.stringify(result.actionItems);
            await prisma.meetingSession.update({
                where: { id: sessionId },
                data: {
                    transcriptRaw: transcript,
                    summaryText: result.summary,
                    actionItems: actionItemsJson,
                    language,
                    status: 'summarized',
                },
            });

            // Fan out into structured, trackable rows (best-effort).
            await syncActionItemRows(prisma, {
                meetingSessionId: sessionId,
                tenantId: session.tenantId,
                workspaceId: meeting.workspaceId,
                actionItemsJson,
            }).catch((err: unknown) => {
                console.warn('[meetings] syncActionItemRows failed:', err);
            });

            const items = await prisma.meetingActionItem.findMany({
                where: { meetingSessionId: sessionId, tenantId: session.tenantId },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });

            return reply.send({
                sessionId,
                summary: result.summary,
                actionItems: result.actionItems,
                items,
            });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/meetings/:sessionId/action-items — structured action items
    // -----------------------------------------------------------------------
    app.get<{ Params: SessionIdParams }>(
        '/v1/meetings/:sessionId/action-items',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { sessionId } = request.params;
            const prisma = await resolvePrisma();
            const meeting = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!meeting) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }
            const items = await prisma.meetingActionItem.findMany({
                where: { meetingSessionId: sessionId, tenantId: session.tenantId },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });
            return reply.send({ items });
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/meetings/:sessionId/action-items/:itemId — update one item
    // (status/owner/dueDate/linkedTaskId — foundation for the "act" phase)
    // -----------------------------------------------------------------------
    app.patch<{ Params: { sessionId: string; itemId: string }; Body: PatchActionItemBody }>(
        '/v1/meetings/:sessionId/action-items/:itemId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { sessionId, itemId } = request.params;
            const body = request.body ?? ({} as PatchActionItemBody);
            const prisma = await resolvePrisma();
            const item = await prisma.meetingActionItem.findFirst({
                where: { id: itemId, meetingSessionId: sessionId, tenantId: session.tenantId },
            });
            if (!item) {
                return reply.code(404).send({ error: 'Action item not found' });
            }
            const data: Record<string, unknown> = {};
            if (body.status !== undefined) data['status'] = body.status;
            if (body.ownerName !== undefined) data['ownerName'] = body.ownerName;
            if (body.ownerEmail !== undefined) data['ownerEmail'] = body.ownerEmail;
            if (body.priority !== undefined) data['priority'] = body.priority;
            if (body.dueDate !== undefined) data['dueDate'] = body.dueDate ? new Date(body.dueDate) : null;
            if (body.linkedTaskId !== undefined) data['linkedTaskId'] = body.linkedTaskId;
            if (body.linkedConnector !== undefined) data['linkedConnector'] = body.linkedConnector;
            if (Object.keys(data).length === 0) {
                return reply.code(400).send({ error: 'No updatable fields provided' });
            }
            const updated = await prisma.meetingActionItem.update({ where: { id: itemId }, data });
            return reply.send(updated);
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/meetings/:sessionId/speaking-agent
    // -----------------------------------------------------------------------
    app.patch<{ Params: SessionIdParams; Body: PatchSpeakingAgentBody }>(
        '/v1/meetings/:sessionId/speaking-agent',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const body = request.body ?? ({} as PatchSpeakingAgentBody);

            const updateData: Record<string, unknown> = {};
            if (body.speakingEnabled !== undefined) updateData['speakingEnabled'] = body.speakingEnabled;
            if (body.agentVoiceId !== undefined) updateData['agentVoiceId'] = body.agentVoiceId;
            if (body.resolvedLanguage !== undefined) updateData['resolvedLanguage'] = body.resolvedLanguage;

            if (Object.keys(updateData).length === 0) {
                return reply.code(400).send({ error: 'No updatable fields provided' });
            }

            const prisma = await resolvePrisma();

            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const updated = await prisma.meetingSession.update({
                where: { id: sessionId },
                data: updateData,
            });

            return reply.send(updated);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings/:sessionId/speaking-agent
    // Synthesize speech for a meeting session via VoxCPM2.
    // Returns { ok: true, durationMs } on success or { ok: false, error } on
    // TTS failure (never 500 — TTS errors are non-fatal from the caller's view).
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams; Body: PostSpeakingAgentBody }>(
        '/v1/meetings/:sessionId/speaking-agent',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const { text, language, voiceId } = request.body ?? ({} as PostSpeakingAgentBody);

            if (!text || text.trim().length === 0) {
                return reply.code(400).send({ error: 'text is required' });
            }

            const prisma = await resolvePrisma();
            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            // Resolve language and voiceId from session if not provided in body
            const resolvedLanguage = language ?? existing.resolvedLanguage ?? 'en';
            const resolvedVoiceId = voiceId ?? existing.agentVoiceId ?? undefined;

            const synthesizeBody: {
                text: string;
                language: string;
                voice_id?: string;
            } = { text: text.trim(), language: resolvedLanguage };
            if (resolvedVoiceId) {
                synthesizeBody.voice_id = resolvedVoiceId;
            }

            try {
                const ttsResponse = await fetch(`${voiceboxBase()}/v1/synthesize`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(synthesizeBody),
                    signal: AbortSignal.timeout(30_000),
                });

                if (!ttsResponse.ok) {
                    const errText = await ttsResponse.text().catch(() => '');
                    return reply.send({
                        ok: false,
                        error: `VoxCPM2 returned HTTP ${ttsResponse.status}: ${errText}`,
                    });
                }

                const audioBytes = await ttsResponse.arrayBuffer();
                // Estimate duration: WAV 48kHz 16-bit mono = 96000 bytes/second
                const durationMs = Math.round((audioBytes.byteLength / 96_000) * 1_000);

                return reply.send({ ok: true, durationMs });
            } catch (err: unknown) {
                return reply.send({ ok: false, error: String(err) });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings/:sessionId/send-proposal
    // Manually triggers proposal PDF generation and sends it to the prospect.
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/meetings/:sessionId/send-proposal',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const prisma = await resolvePrisma();

            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            // Generate PDF if not already generated
            let proposalPath = existing.proposalPath;
            if (!proposalPath) {
                proposalPath = await doGenerateProposal(sessionId, session.tenantId, prisma);
            }

            if (!proposalPath) {
                return reply.code(422).send({ error: 'Failed to generate proposal PDF' });
            }

            const sent = await sendProposalEmail(sessionId, session.tenantId, prisma);
            return reply.send({ ok: true, sent, proposalPath });
        },
    );

    // -----------------------------------------------------------------------
    // DELETE /v1/meetings/:sessionId  (soft delete)
    // -----------------------------------------------------------------------
    app.delete<{ Params: SessionIdParams }>(
        '/v1/meetings/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const prisma = await resolvePrisma();

            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            await prisma.meetingSession.update({
                where: { id: sessionId },
                data: { status: 'deleted' },
            });

            return reply.send({ ok: true });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings/:sessionId/audit-events
    // Called by agent-runtime to write a per-event audit trail entry.
    // Does not require a valid session cookie — uses x-tenant-id header.
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams; Body: PostMeetingAuditEventBody }>(
        '/v1/meetings/:sessionId/audit-events',
        async (request, reply) => {
            const tenantIdHeader =
                (request.headers['x-tenant-id'] as string | undefined) ??
                options.getSession(request)?.tenantId;

            if (!tenantIdHeader) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const body = request.body ?? ({} as PostMeetingAuditEventBody);

            if (!body.eventType || !body.summary) {
                return reply.code(400).send({ error: 'eventType and summary are required' });
            }

            const prisma = await resolvePrisma();

            const existing = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: tenantIdHeader },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const event = await prisma.meetingAuditEvent.create({
                data: {
                    meetingSessionId: sessionId,
                    tenantId: tenantIdHeader,
                    workspaceId: body.workspaceId ?? existing.workspaceId,
                    agentId: body.agentId ?? existing.agentId,
                    platform: body.platform ?? existing.platform,
                    eventType: body.eventType,
                    severity: body.severity ?? 'info',
                    summary: body.summary,
                    payload: body.payload !== undefined ? (body.payload as import('@prisma/client').Prisma.InputJsonValue) : undefined,
                    durationMs: body.durationMs ?? null,
                },
            });

            return reply.code(201).send(event);
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/meetings/:sessionId/audit-events
    // Returns all audit events for a meeting session in ascending time order.
    // -----------------------------------------------------------------------
    app.get<{ Params: SessionIdParams }>(
        '/v1/meetings/:sessionId/audit-events',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            const prisma = await resolvePrisma();

            const meeting = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!meeting) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const events = await prisma.meetingAuditEvent.findMany({
                where: { meetingSessionId: sessionId, tenantId: session.tenantId },
                orderBy: { createdAt: 'asc' },
            });

            return reply.send({ sessionId, meetingUrl: meeting.meetingUrl, platform: meeting.platform, events });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/meetings  (list sessions for tenant, newest first)
    // -----------------------------------------------------------------------
    app.get(
        '/v1/meetings',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const query = request.query as Record<string, string>;
            const limit = Math.min(parseInt(query['limit'] ?? '20', 10), 100);
            const cursor = query['cursor'];
            const platform = query['platform'];
            const status = query['status'];

            const prisma = await resolvePrisma();

            const where: Record<string, unknown> = { tenantId: session.tenantId };
            if (platform) where['platform'] = platform;
            if (status) where['status'] = status;
            if (cursor) where['id'] = { lt: cursor };

            const sessions = await prisma.meetingSession.findMany({
                where,
                orderBy: { startedAt: 'desc' },
                take: limit + 1,
                select: {
                    id: true,
                    tenantId: true,
                    workspaceId: true,
                    agentId: true,
                    meetingUrl: true,
                    platform: true,
                    status: true,
                    language: true,
                    summaryText: true,
                    startedAt: true,
                    endedAt: true,
                    videoEnabled: true,
                    speakingEnabled: true,
                },
            });

            const hasNext = sessions.length > limit;
            const items = hasNext ? sessions.slice(0, limit) : sessions;
            const nextCursor = hasNext ? items[items.length - 1]?.id : null;

            return reply.send({ items, nextCursor });
        },
    );
}
