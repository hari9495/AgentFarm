import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type RegisterLanguageRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type WorkspaceIdParams = {
    workspaceId: string;
};

type UserIdParams = {
    userId: string;
};

type PostUserBody = {
    userId?: string;
    language?: string;
    confidence?: number;
};

type PatchTenantBody = {
    defaultLanguage?: string;
    ticketLanguage?: string;
    autoDetect?: boolean;
};

export async function registerLanguageRoutes(
    app: FastifyInstance,
    options: RegisterLanguageRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma ? () => Promise.resolve(options.prisma!) : getPrisma;

    // GET /v1/language/tenant — fetch tenant-level language config
    app.get('/v1/language/tenant', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const prisma = await resolvePrisma();
        const record = await prisma.tenantLanguageConfig.findUnique({
            where: { tenantId: session.tenantId },
        });

        if (!record) {
            return reply.send({ defaultLanguage: 'en', ticketLanguage: 'en', autoDetect: true });
        }

        return reply.send(record);
    });

    // GET /v1/language/workspace/:workspaceId — fetch workspace-level language config
    app.get<{ Params: WorkspaceIdParams }>('/v1/language/workspace/:workspaceId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { workspaceId } = request.params;
        const prisma = await resolvePrisma();
        const record = await prisma.workspaceLanguageConfig.findUnique({
            where: { tenantId_workspaceId: { tenantId: session.tenantId, workspaceId } },
        });

        if (!record) {
            return reply.send({ preferredLanguage: null });
        }

        return reply.send({ preferredLanguage: record.preferredLanguage });
    });

    // GET /v1/language/user/:userId — fetch user language profile
    app.get<{ Params: UserIdParams }>('/v1/language/user/:userId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { userId } = request.params;
        const prisma = await resolvePrisma();
        const record = await prisma.userLanguageProfile.findUnique({
            where: { tenantId_userId: { tenantId: session.tenantId, userId } },
        });

        if (!record) {
            return reply.send({ detectedLanguage: null, preferredLanguage: null });
        }

        return reply.send({
            detectedLanguage: record.detectedLanguage,
            preferredLanguage: record.preferredLanguage,
            confidence: record.confidence,
            lastDetectedAt: record.lastDetectedAt,
        });
    });

    // POST /v1/language/user — upsert user detected language
    app.post<{ Body: PostUserBody }>('/v1/language/user', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const userId = typeof request.body?.userId === 'string' ? request.body.userId.trim() : '';
        if (!userId) {
            return reply.code(400).send({ error: 'invalid_request', message: 'userId is required.' });
        }

        const language = typeof request.body?.language === 'string' ? request.body.language.trim() : '';
        if (!language) {
            return reply.code(400).send({ error: 'invalid_request', message: 'language is required.' });
        }

        const confidence = typeof request.body?.confidence === 'number' ? request.body.confidence : 0.0;
        const now = new Date();
        const prisma = await resolvePrisma();

        await prisma.userLanguageProfile.upsert({
            where: { tenantId_userId: { tenantId: session.tenantId, userId } },
            update: {
                detectedLanguage: language,
                confidence,
                lastDetectedAt: now,
            },
            create: {
                tenantId: session.tenantId,
                userId,
                detectedLanguage: language,
                confidence,
                lastDetectedAt: now,
            },
        });

        return reply.send({ ok: true });
    });

    // PATCH /v1/language/tenant — upsert tenant language config (partial update)
    app.patch<{ Body: PatchTenantBody }>('/v1/language/tenant', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = request.body ?? {};
        const updateData: { defaultLanguage?: string; ticketLanguage?: string; autoDetect?: boolean } = {};

        if (typeof body.defaultLanguage === 'string') updateData.defaultLanguage = body.defaultLanguage;
        if (typeof body.ticketLanguage === 'string') updateData.ticketLanguage = body.ticketLanguage;
        if (typeof body.autoDetect === 'boolean') updateData.autoDetect = body.autoDetect;

        if (Object.keys(updateData).length === 0) {
            return reply.code(400).send({ error: 'invalid_request', message: 'At least one field must be provided.' });
        }

        const prisma = await resolvePrisma();
        const record = await prisma.tenantLanguageConfig.upsert({
            where: { tenantId: session.tenantId },
            update: updateData,
            create: {
                tenantId: session.tenantId,
                defaultLanguage: body.defaultLanguage ?? 'en',
                ticketLanguage: body.ticketLanguage ?? 'en',
                autoDetect: body.autoDetect ?? true,
            },
        });

        return reply.send(record);
    });
}
