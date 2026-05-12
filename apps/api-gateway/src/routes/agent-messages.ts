import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

// ── Local type definitions ────────────────────────────────────────────────────
// AgentMessageType and AgentMessageStatus are defined locally because they are
// not yet exported from @agentfarm/shared-types. Add there when promoted.

export type AgentMessageType =
    | 'QUESTION'
    | 'ANSWER'
    | 'RESULT'
    | 'STATUS_UPDATE'
    | 'HANDOFF_REQUEST'
    | 'HANDOFF_ACCEPT'
    | 'HANDOFF_REJECT'
    | 'BROADCAST';

export type AgentMessageStatus = 'PENDING' | 'DELIVERED' | 'READ' | 'REPLIED' | 'EXPIRED';

const VALID_MESSAGE_TYPES: AgentMessageType[] = [
    'QUESTION',
    'ANSWER',
    'RESULT',
    'STATUS_UPDATE',
    'HANDOFF_REQUEST',
    'HANDOFF_ACCEPT',
    'HANDOFF_REJECT',
    'BROADCAST',
];

const VALID_STATUSES: AgentMessageStatus[] = [
    'PENDING',
    'DELIVERED',
    'READ',
    'REPLIED',
    'EXPIRED',
];

// ── Prisma client shape ───────────────────────────────────────────────────────

type AgentMessageRow = {
    id: string;
    fromBotId: string;
    toBotId: string;
    threadId: string | null;
    messageType: string;
    subject: string | null;
    body: string;
    metadata: unknown;
    status: string;
    readAt: Date | null;
    repliedAt: Date | null;
    replyToId: string | null;
    createdAt: Date;
    expiresAt: Date | null;
};

type AgentMessagePrismaClient = {
    agentMessage: {
        create: (args: { data: Record<string, unknown> }) => Promise<AgentMessageRow>;
        findMany: (args: Record<string, unknown>) => Promise<AgentMessageRow[]>;
        findUnique: (args: Record<string, unknown>) => Promise<AgentMessageRow | null>;
        findFirst: (args: Record<string, unknown>) => Promise<AgentMessageRow | null>;
        update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<AgentMessageRow>;
    };
    bot: {
        findFirst: (args: Record<string, unknown>) => Promise<{ id: string; workspaceId: string } | null>;
    };
};

// ── Session type ──────────────────────────────────────────────────────────────

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

// ── Route options ─────────────────────────────────────────────────────────────

export type RegisterAgentMessageRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    getPrisma?: () => Promise<AgentMessagePrismaClient>;
};

const defaultGetPrisma = async (): Promise<AgentMessagePrismaClient> => {
    const db = await import('../lib/db.js');
    return db.prisma as unknown as AgentMessagePrismaClient;
};

// ── Helper: verify bot belongs to the session's tenant ───────────────────────

async function verifyBotInSession(
    prisma: AgentMessagePrismaClient,
    botId: string,
    workspaceIds: string[],
): Promise<boolean> {
    const bot = await prisma.bot.findFirst({
        where: { id: botId, workspaceId: { in: workspaceIds } },
    });
    return bot !== null;
}

// ── Route registration ────────────────────────────────────────────────────────

export const registerAgentMessageRoutes = (
    app: FastifyInstance,
    options: RegisterAgentMessageRoutesOptions,
): void => {
    const getPrisma = options.getPrisma ?? defaultGetPrisma;

    // -------------------------------------------------------------------------
    // POST /v1/agents/:botId/messages/send — send a message from one bot to another
    // -------------------------------------------------------------------------
    app.post<{ Params: { botId: string } }>(
        '/v1/agents/:botId/messages/send',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId } = request.params;
            const body = request.body as Record<string, unknown> | null | undefined;

            const toBotId = body?.['toBotId'];
            const messageType = body?.['messageType'];
            const bodyText = body?.['body'];
            const subject = body?.['subject'] ?? null;
            const threadId = body?.['threadId'] ?? null;
            const metadata = body?.['metadata'] ?? null;
            const expiresAt = body?.['expiresAt'] ?? null;

            if (!toBotId || typeof toBotId !== 'string') {
                return reply.code(400).send({ error: 'bad_request', message: 'toBotId is required.' });
            }
            if (!messageType || !VALID_MESSAGE_TYPES.includes(messageType as AgentMessageType)) {
                return reply.code(400).send({
                    error: 'bad_request',
                    message: `messageType must be one of: ${VALID_MESSAGE_TYPES.join(', ')}.`,
                });
            }
            if (!bodyText || typeof bodyText !== 'string' || bodyText.trim().length === 0) {
                return reply.code(400).send({ error: 'bad_request', message: 'body is required.' });
            }

            const prisma = await getPrisma();

            // Verify sender belongs to session
            const senderOk = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!senderOk) {
                return reply.code(403).send({ error: 'forbidden', message: 'fromBot does not belong to this session.' });
            }

            const id = randomUUID();
            const message = await prisma.agentMessage.create({
                data: {
                    id,
                    fromBotId: botId,
                    toBotId,
                    threadId: threadId ? String(threadId) : null,
                    messageType: String(messageType),
                    subject: subject ? String(subject) : null,
                    body: bodyText.trim(),
                    metadata: metadata ?? null,
                    status: 'PENDING',
                    expiresAt: expiresAt ? new Date(String(expiresAt)) : null,
                },
            });

            return reply.code(201).send({ message });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/agents/:botId/messages/inbox — messages received by this bot
    // -------------------------------------------------------------------------
    app.get<{ Params: { botId: string } }>(
        '/v1/agents/:botId/messages/inbox',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId } = request.params;
            const query = request.query as { status?: string; limit?: string; threadId?: string };

            const prisma = await getPrisma();
            const ok = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!ok) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            const where: Record<string, unknown> = { toBotId: botId };
            if (query.status && VALID_STATUSES.includes(query.status as AgentMessageStatus)) {
                where['status'] = query.status;
            }
            if (query.threadId) {
                where['threadId'] = query.threadId;
            }

            const take = Math.min(parseInt(query.limit ?? '50', 10), 200);

            const messages = await prisma.agentMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
            });

            return reply.send({ messages, total: messages.length });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/agents/:botId/messages/sent — messages sent by this bot
    // -------------------------------------------------------------------------
    app.get<{ Params: { botId: string } }>(
        '/v1/agents/:botId/messages/sent',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId } = request.params;
            const query = request.query as { limit?: string; threadId?: string };

            const prisma = await getPrisma();
            const ok = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!ok) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            const where: Record<string, unknown> = { fromBotId: botId };
            if (query.threadId) {
                where['threadId'] = query.threadId;
            }

            const take = Math.min(parseInt(query.limit ?? '50', 10), 200);

            const messages = await prisma.agentMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
            });

            return reply.send({ messages, total: messages.length });
        },
    );

    // -------------------------------------------------------------------------
    // PATCH /v1/agents/:botId/messages/:messageId/status — update message status
    // -------------------------------------------------------------------------
    app.patch<{ Params: { botId: string; messageId: string } }>(
        '/v1/agents/:botId/messages/:messageId/status',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId, messageId } = request.params;
            const body = request.body as Record<string, unknown> | null | undefined;
            const status = body?.['status'];

            if (!status || !VALID_STATUSES.includes(status as AgentMessageStatus)) {
                return reply.code(400).send({
                    error: 'bad_request',
                    message: `status must be one of: ${VALID_STATUSES.join(', ')}.`,
                });
            }

            const prisma = await getPrisma();
            const ok = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!ok) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            // Confirm message belongs to this bot (as recipient)
            const existing = await prisma.agentMessage.findFirst({
                where: { id: messageId, toBotId: botId },
            });
            if (!existing) {
                return reply.code(404).send({ error: 'not_found', message: 'Message not found.' });
            }

            const updateData: Record<string, unknown> = { status: String(status) };
            if (status === 'READ' && !existing.readAt) {
                updateData['readAt'] = new Date();
            }
            if (status === 'REPLIED' && !existing.repliedAt) {
                updateData['repliedAt'] = new Date();
            }

            const updated = await prisma.agentMessage.update({
                where: { id: messageId },
                data: updateData,
            });

            return reply.send({ message: updated });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/agents/:botId/messages/:messageId/reply — reply to a message
    // -------------------------------------------------------------------------
    app.post<{ Params: { botId: string; messageId: string } }>(
        '/v1/agents/:botId/messages/:messageId/reply',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId, messageId } = request.params;
            const body = request.body as Record<string, unknown> | null | undefined;
            const bodyText = body?.['body'];
            const messageType = (body?.['messageType'] ?? 'ANSWER') as string;
            const metadata = body?.['metadata'] ?? null;

            if (!bodyText || typeof bodyText !== 'string' || bodyText.trim().length === 0) {
                return reply.code(400).send({ error: 'bad_request', message: 'body is required.' });
            }
            if (!VALID_MESSAGE_TYPES.includes(messageType as AgentMessageType)) {
                return reply.code(400).send({
                    error: 'bad_request',
                    message: `messageType must be one of: ${VALID_MESSAGE_TYPES.join(', ')}.`,
                });
            }

            const prisma = await getPrisma();
            const ok = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!ok) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            // Confirm the original message exists and was sent to this bot
            const original = await prisma.agentMessage.findFirst({
                where: { id: messageId, toBotId: botId },
            });
            if (!original) {
                return reply.code(404).send({ error: 'not_found', message: 'Original message not found.' });
            }

            const id = randomUUID();
            const reply_ = await prisma.agentMessage.create({
                data: {
                    id,
                    fromBotId: botId,
                    toBotId: original.fromBotId,
                    threadId: original.threadId ?? messageId,
                    messageType,
                    subject: original.subject ? `Re: ${original.subject}` : null,
                    body: bodyText.trim(),
                    metadata: metadata ?? null,
                    status: 'PENDING',
                    replyToId: messageId,
                },
            });

            // Mark original as replied
            await prisma.agentMessage.update({
                where: { id: messageId },
                data: { status: 'REPLIED', repliedAt: new Date() },
            });

            return reply.code(201).send({ message: reply_ });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/agents/:botId/messages/thread/:threadId — get full thread
    // -------------------------------------------------------------------------
    app.get<{ Params: { botId: string; threadId: string } }>(
        '/v1/agents/:botId/messages/thread/:threadId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }

            const { botId, threadId } = request.params;
            const query = request.query as { limit?: string };

            const prisma = await getPrisma();
            const ok = await verifyBotInSession(prisma, botId, session.workspaceIds);
            if (!ok) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            const take = Math.min(parseInt(query.limit ?? '100', 10), 500);

            const messages = await prisma.agentMessage.findMany({
                where: {
                    threadId,
                    // Only return messages the bot is party to
                    OR: [{ fromBotId: botId }, { toBotId: botId }],
                },
                orderBy: { createdAt: 'asc' },
                take,
            });

            return reply.send({ threadId, messages, total: messages.length });
        },
    );
};
