import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

const voxcpm2Base = (): string =>
    (process.env['VOXCPM2_URL'] ?? 'http://localhost:8765').replace(/\/+$/, '');

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

export type RegisterMeetingRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

export async function registerMeetingRoutes(
    app: FastifyInstance,
    options: RegisterMeetingRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

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
                const ttsResponse = await fetch(`${voxcpm2Base()}/v1/synthesize`, {
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
}
