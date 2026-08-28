import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
    createApprovalForAction,
    executeConnectorAction,
    defaultActionTypeForConnector,
    roleForConnector,
} from '../lib/meeting-action-dispatch.js';
import {
    isMeetingSlackEnabled,
    distributeMeetingSummaryToSlack,
} from '../lib/meeting-slack-notifier.js';
import { generateProposalPdf, sendProposalEmail } from '../proposal-generator.js';
import {
    createMeetingSummarizer,
    type SummarizeTranscriptFn,
    type ActionItemDraft,
} from '../lib/meeting-summarizer.js';

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

type DispatchActionBody = {
    connector: string;
    actionType?: string;
    payload?: Record<string, unknown>;
};

/** Build a sensible default connector payload from the action-item text. */
function buildDefaultPayload(actionType: string, text: string): Record<string, unknown> {
    if (actionType === 'create_task') {
        return { title: text, summary: text, description: 'Action item captured from a meeting.' };
    }
    if (actionType === 'send_email') {
        return { subject: 'Meeting action item', body: text };
    }
    return { text }; // send_message
}

type PatchActionItemBody = {
    status?: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
    priority?: string;
    dueDate?: string | null;
    linkedTaskId?: string | null;
    linkedConnector?: string | null;
};

type ActionItemContext = { meetingSessionId: string; tenantId: string; workspaceId: string };

/**
 * Replace a session's MeetingActionItem rows from structured drafts (idempotent
 * re-summarise). Each draft carries a separately-attributed owner so the
 * ownerName column is populated rather than the name being baked into the text.
 */
async function replaceActionItemRows(
    prisma: PrismaClient,
    ctx: ActionItemContext,
    drafts: ActionItemDraft[],
): Promise<void> {
    const rows = drafts
        .map((d, i) => ({ text: (d.text ?? '').trim(), ownerName: d.ownerName ?? null, i }))
        .filter((r) => r.text.length > 0)
        .map((r) => ({
            meetingSessionId: ctx.meetingSessionId,
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            text: r.text,
            ownerName: r.ownerName,
            sortOrder: r.i,
        }));

    await prisma.$transaction([
        prisma.meetingActionItem.deleteMany({ where: { meetingSessionId: ctx.meetingSessionId } }),
        ...(rows.length ? [prisma.meetingActionItem.createMany({ data: rows })] : []),
    ]);
}

/**
 * Fan the flat MeetingSession.actionItems JSON out into structured
 * MeetingActionItem rows. Accepts a JSON array of either strings or
 * `{ text, owner?/ownerName? }` objects (the Anthropic summarizeMeeting path
 * stores strings; the OpenAI analyze-transcript path uses replaceActionItemRows
 * directly). Best-effort — the caller wraps this in a catch.
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

    const drafts: ActionItemDraft[] = parsed.map((raw) => {
        if (typeof raw === 'string') return { text: raw, ownerName: null };
        const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const text = typeof obj['text'] === 'string' ? (obj['text'] as string) : '';
        const owner = obj['owner'] ?? obj['ownerName'];
        return { text, ownerName: typeof owner === 'string' && owner.trim() ? (owner as string) : null };
    });

    await replaceActionItemRows(
        prisma,
        { meetingSessionId: input.meetingSessionId, tenantId: input.tenantId, workspaceId: input.workspaceId },
        drafts,
    );
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

            // Keep the flat actionItems column human-readable (string[]) for
            // backward-compatible consumers (Slack/PDF/dashboard); the owner is
            // preserved structurally in the MeetingActionItem rows below.
            const flatActionItems = result.actionItems.map((d) =>
                d.ownerName ? `${d.ownerName}: ${d.text}` : d.text,
            );
            await prisma.meetingSession.update({
                where: { id: sessionId },
                data: {
                    transcriptRaw: transcript,
                    summaryText: result.summary,
                    actionItems: JSON.stringify(flatActionItems),
                    language,
                    status: 'summarized',
                },
            });

            // Fan out into structured, trackable rows with attributed owners.
            await replaceActionItemRows(
                prisma,
                { meetingSessionId: sessionId, tenantId: session.tenantId, workspaceId: meeting.workspaceId },
                result.actionItems,
            ).catch((err: unknown) => {
                console.warn('[meetings] replaceActionItemRows failed:', err);
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
    // POST /v1/meetings/:sessionId/action-items/:itemId/dispatch
    // Phase 2 "act": propose a connector action for this item and create an
    // Approval in the queue (medium risk). The item moves to awaiting_approval;
    // nothing runs until an operator approves and /execute is called.
    // -----------------------------------------------------------------------
    app.post<{ Params: { sessionId: string; itemId: string }; Body: DispatchActionBody }>(
        '/v1/meetings/:sessionId/action-items/:itemId/dispatch',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { sessionId, itemId } = request.params;
            const body = request.body ?? ({} as DispatchActionBody);
            const connector = typeof body.connector === 'string' ? body.connector.trim() : '';
            if (!connector) {
                return reply.code(400).send({ error: 'connector is required (e.g. jira, slack, gmail)' });
            }
            const prisma = await resolvePrisma();
            const item = await prisma.meetingActionItem.findFirst({
                where: { id: itemId, meetingSessionId: sessionId, tenantId: session.tenantId },
            });
            if (!item) {
                return reply.code(404).send({ error: 'Action item not found' });
            }
            const meeting = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!meeting) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            const actionType = body.actionType?.trim() || defaultActionTypeForConnector(connector);
            const payload = body.payload ?? buildDefaultPayload(actionType, item.text);
            const actionId = `mtg-ai:${itemId}`;
            const actionSummary = `${connector}/${actionType}: ${item.text}`.slice(0, 480);

            const intake = await createApprovalForAction({
                tenantId: session.tenantId,
                workspaceId: meeting.workspaceId,
                botId: meeting.agentId,
                actionId,
                actionSummary,
                riskLevel: 'medium',
                requestedBy: session.userId,
            });
            if (!intake.ok) {
                return reply.code(502).send({ error: 'approval_intake_failed', detail: intake.error });
            }

            const updated = await prisma.meetingActionItem.update({
                where: { id: itemId },
                data: {
                    status: 'awaiting_approval',
                    approvalId: intake.approvalId ?? null,
                    dispatchConnector: connector,
                    dispatchActionType: actionType,
                    dispatchPayload: payload as Prisma.InputJsonValue,
                    linkedConnector: connector,
                    dispatchError: null,
                },
            });
            return reply.send({
                status: 'awaiting_approval',
                approvalId: intake.approvalId,
                approvalStatus: intake.status,
                item: updated,
            });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/meetings/:sessionId/action-items/:itemId/execute
    // Run the dispatched connector action. The connector-execute endpoint's
    // approval gate blocks this until the Approval is granted (409); on success
    // the item becomes done with the external id recorded in linkedTaskId.
    // -----------------------------------------------------------------------
    app.post<{ Params: { sessionId: string; itemId: string } }>(
        '/v1/meetings/:sessionId/action-items/:itemId/execute',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { sessionId, itemId } = request.params;
            const prisma = await resolvePrisma();
            const item = await prisma.meetingActionItem.findFirst({
                where: { id: itemId, meetingSessionId: sessionId, tenantId: session.tenantId },
            });
            if (!item) {
                return reply.code(404).send({ error: 'Action item not found' });
            }
            if (!item.dispatchConnector || !item.dispatchActionType || !item.approvalId) {
                return reply.code(409).send({ error: 'not_dispatched', message: 'Dispatch this item first.' });
            }
            const meeting = await prisma.meetingSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!meeting) {
                return reply.code(404).send({ error: 'Meeting session not found' });
            }

            // Enforce the human gate in the meeting flow: require the linked
            // Approval to be granted before the connector action runs. (The
            // global connector-execute gate is optional and may be unwired.)
            const approval = await prisma.approval.findFirst({
                where: { id: item.approvalId, tenantId: session.tenantId },
                select: { decision: true },
            });
            if (!approval) {
                return reply.code(409).send({ error: 'approval_missing', message: 'No approval found for this item.' });
            }
            if (approval.decision !== 'approved') {
                return reply.code(409).send({
                    error: 'awaiting_approval',
                    message: `Approval is "${approval.decision}", not approved.`,
                    decision: approval.decision,
                });
            }

            const exec = await executeConnectorAction({
                tenantId: session.tenantId,
                workspaceId: meeting.workspaceId,
                botId: meeting.agentId,
                roleKey: roleForConnector(item.dispatchConnector),
                connectorType: item.dispatchConnector,
                actionType: item.dispatchActionType,
                payload: (item.dispatchPayload ?? {}) as Record<string, unknown>,
                approvalActionId: `mtg-ai:${itemId}`,
            });

            if (exec.blocked) {
                return reply.code(409).send({
                    error: 'awaiting_approval',
                    message: 'Approval has not been granted for this action yet.',
                });
            }
            if (!exec.ok) {
                await prisma.meetingActionItem.update({
                    where: { id: itemId },
                    data: { status: 'failed', dispatchError: exec.error ?? 'execution_failed' },
                });
                return reply.code(502).send({ error: 'execution_failed', detail: exec.error });
            }

            const updated = await prisma.meetingActionItem.update({
                where: { id: itemId },
                data: { status: 'done', linkedTaskId: exec.externalId ?? null, dispatchError: null },
            });
            return reply.send({
                status: 'done',
                linkedTaskId: exec.externalId,
                resultSummary: exec.resultSummary,
                item: updated,
            });
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
