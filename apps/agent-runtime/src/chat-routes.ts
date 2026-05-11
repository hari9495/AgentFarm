// Phase 13 — Agent Chat: route registrar for agent-runtime
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { getChatReply as GetChatReplyFn } from './chat-service.js';

type ChatRouteDeps = {
    prisma?: PrismaClient;
    getChatReply?: typeof GetChatReplyFn;
};

type SessionRecord = {
    id: string;
    tenantId: string;
    agentId: string | null;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
};

type MessageRecord = {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    createdAt: Date;
};

let _cachedPrisma: PrismaClient | undefined;

async function getDefaultPrisma(): Promise<PrismaClient> {
    if (_cachedPrisma) return _cachedPrisma;
    const { PrismaClient } = await import('@prisma/client');
    _cachedPrisma = new PrismaClient();
    return _cachedPrisma;
}

export function registerChatRoutes(
    app: FastifyInstance,
    deps: ChatRouteDeps = {},
): void {
    const resolvePrisma = deps.prisma
        ? () => Promise.resolve(deps.prisma!)
        : getDefaultPrisma;

    const resolveChatReply = deps.getChatReply
        ? deps.getChatReply
        : async (...args: Parameters<typeof GetChatReplyFn>) => {
            const { getChatReply } = await import('./chat-service.js');
            return getChatReply(...args);
        };

    // GET /chat/sessions?tenantId=xxx
    app.get('/chat/sessions', async (request, reply) => {
        const query = request.query as Record<string, string>;
        const tenantId = query['tenantId'];
        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId required' });
        }
        const prisma = await resolvePrisma();
        const sessions = await prisma.chatSession.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        }) as SessionRecord[];
        return reply.send({ sessions });
    });

    // POST /chat/sessions  body: { tenantId, agentId?, title? }
    app.post('/chat/sessions', async (request, reply) => {
        const body = request.body as Record<string, unknown>;
        const tenantId = body['tenantId'] as string | undefined;
        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId required' });
        }
        const prisma = await resolvePrisma();
        const session = await prisma.chatSession.create({
            data: {
                tenantId,
                agentId: (body['agentId'] as string | undefined) ?? null,
                title: (body['title'] as string | undefined) ?? null,
            },
        }) as SessionRecord;
        return reply.status(201).send({ session });
    });

    // GET /chat/sessions/:sessionId/messages?tenantId=xxx
    app.get('/chat/sessions/:sessionId/messages', async (request, reply) => {
        const params = request.params as Record<string, string>;
        const query = request.query as Record<string, string>;
        const { sessionId } = params;
        const tenantId = query['tenantId'];
        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId required' });
        }
        const prisma = await resolvePrisma();
        const session = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        }) as SessionRecord | null;
        if (!session || session.tenantId !== tenantId) {
            return reply.status(404).send({ error: 'session not found' });
        }
        const messages = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
        }) as MessageRecord[];
        return reply.send({ messages });
    });

    // POST /chat/sessions/:sessionId/messages  body: { tenantId, content }
    app.post('/chat/sessions/:sessionId/messages', async (request, reply) => {
        const params = request.params as Record<string, string>;
        const body = request.body as Record<string, unknown>;
        const { sessionId } = params;
        const tenantId = body['tenantId'] as string | undefined;
        const content = body['content'] as string | undefined;
        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId required' });
        }
        if (!content || typeof content !== 'string' || content.trim() === '') {
            return reply.status(400).send({ error: 'content required' });
        }
        const prisma = await resolvePrisma();
        const session = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        }) as SessionRecord | null;
        if (!session || session.tenantId !== tenantId) {
            return reply.status(404).send({ error: 'session not found' });
        }
        // Persist user message
        await prisma.chatMessage.create({
            data: { sessionId, role: 'user', content },
        });
        // Fetch full history for LLM context
        const history = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
        }) as MessageRecord[];
        const llmMessages = history.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
        }));
        // Generate reply
        const { content: replyContent } = await resolveChatReply({
            messages: llmMessages,
            agentId: session.agentId,
            tenantId,
        });
        // Persist assistant message
        const assistantMsg = await prisma.chatMessage.create({
            data: { sessionId, role: 'assistant', content: replyContent },
        }) as MessageRecord;
        await prisma.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
        });
        return reply.status(201).send({ message: assistantMsg });
    });

    // DELETE /chat/sessions/:sessionId?tenantId=xxx
    app.delete('/chat/sessions/:sessionId', async (request, reply) => {
        const params = request.params as Record<string, string>;
        const query = request.query as Record<string, string>;
        const { sessionId } = params;
        const tenantId = query['tenantId'];
        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId required' });
        }
        const prisma = await resolvePrisma();
        const session = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        }) as SessionRecord | null;
        if (!session || session.tenantId !== tenantId) {
            return reply.status(404).send({ error: 'session not found' });
        }
        await prisma.chatSession.delete({ where: { id: sessionId } });
        return reply.status(204).send();
    });
}
