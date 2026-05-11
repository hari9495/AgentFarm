import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../lib/api-key-auth.js';
import { ROLE_RANK } from '../lib/require-role.js';

const ALLOWED_ROLES = ['viewer', 'operator', 'admin'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterApiKeyRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type KeyIdParams = { keyId: string };

type CreateKeyBody = {
    name: string;
    role: string;
    scopes?: string[];
    expiresAt?: string;
};

type UpdateKeyBody = {
    name?: string;
    enabled?: boolean;
    role?: string;
    scopes?: string[];
};

const isRoleSufficient = (sessionRole: string | undefined, minimum: string): boolean => {
    const userRank = ROLE_RANK[sessionRole ?? ''] ?? 0;
    const minRank = ROLE_RANK[minimum] ?? 99;
    return userRank >= minRank;
};

// Fields safe to return — never include keyHash
const safeSelect = {
    id: true,
    name: true,
    keyPrefix: true,
    scopes: true,
    role: true,
    enabled: true,
    expiresAt: true,
    lastUsedAt: true,
    createdAt: true,
    createdBy: true,
} as const;

export const registerApiKeyRoutes = async (
    app: FastifyInstance,
    options: RegisterApiKeyRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma ? () => Promise.resolve(options.prisma!) : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/api-keys — create a new API key (operator+)
    // -----------------------------------------------------------------------
    app.post<{ Body: CreateKeyBody }>('/v1/api-keys', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (!isRoleSufficient(session.role, 'operator')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const { name, role, scopes, expiresAt } = request.body ?? ({} as CreateKeyBody);

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return reply.code(400).send({ error: 'validation_failed', field: 'name' });
        }

        if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
            return reply.code(400).send({
                error: 'invalid_role',
                message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}`,
            });
        }

        let parsedExpiresAt: Date | undefined;
        if (expiresAt !== undefined) {
            const d = new Date(expiresAt);
            if (isNaN(d.getTime())) {
                return reply.code(400).send({ error: 'validation_failed', field: 'expiresAt', message: 'Invalid ISO date.' });
            }
            parsedExpiresAt = d;
        }

        const rawKey = generateApiKey();
        const keyHash = hashApiKey(rawKey);
        const keyPrefix = getKeyPrefix(rawKey);

        const db = await resolvePrisma();
        const apiKey = await db.apiKey.create({
            data: {
                tenantId: session.tenantId,
                createdBy: session.userId,
                name: name.trim(),
                keyHash,
                keyPrefix,
                scopes: scopes ?? [],
                role: role as AllowedRole,
                expiresAt: parsedExpiresAt ?? null,
            },
            select: safeSelect,
        });

        return reply.code(201).send({
            apiKey,
            rawKey,
            warning: 'Store this key securely. It will not be shown again.',
        });
    });

    // -----------------------------------------------------------------------
    // GET /v1/api-keys — list all API keys for the tenant (viewer+)
    // -----------------------------------------------------------------------
    app.get('/v1/api-keys', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const db = await resolvePrisma();
        const keys = await db.apiKey.findMany({
            where: { tenantId: session.tenantId },
            select: safeSelect,
            orderBy: { createdAt: 'desc' },
        });

        return reply.send({ keys });
    });

    // -----------------------------------------------------------------------
    // GET /v1/api-keys/:keyId — get a single API key (viewer+)
    // -----------------------------------------------------------------------
    app.get<{ Params: KeyIdParams }>('/v1/api-keys/:keyId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const db = await resolvePrisma();
        const key = await db.apiKey.findUnique({
            where: { id: request.params.keyId },
            select: { ...safeSelect, tenantId: true },
        });

        if (!key) {
            return reply.code(404).send({ error: 'not_found' });
        }

        if (key.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden' });
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tenantId: _t, ...safeKey } = key;
        return reply.send({ apiKey: safeKey });
    });

    // -----------------------------------------------------------------------
    // PATCH /v1/api-keys/:keyId — update key metadata (operator+)
    // -----------------------------------------------------------------------
    app.patch<{ Params: KeyIdParams; Body: UpdateKeyBody }>('/v1/api-keys/:keyId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (!isRoleSufficient(session.role, 'operator')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const db = await resolvePrisma();
        const existing = await db.apiKey.findUnique({
            where: { id: request.params.keyId },
            select: { tenantId: true },
        });

        if (!existing) {
            return reply.code(404).send({ error: 'not_found' });
        }

        if (existing.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden' });
        }

        const { name, enabled, role, scopes } = request.body ?? ({} as UpdateKeyBody);

        if (role !== undefined && !(ALLOWED_ROLES as readonly string[]).includes(role)) {
            return reply.code(400).send({ error: 'invalid_role', message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
        }

        const updated = await db.apiKey.update({
            where: { id: request.params.keyId },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(enabled !== undefined && { enabled }),
                ...(role !== undefined && { role }),
                ...(scopes !== undefined && { scopes }),
            },
            select: safeSelect,
        });

        return reply.send({ apiKey: updated });
    });

    // -----------------------------------------------------------------------
    // DELETE /v1/api-keys/:keyId — hard delete (admin+)
    // -----------------------------------------------------------------------
    app.delete<{ Params: KeyIdParams }>('/v1/api-keys/:keyId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (!isRoleSufficient(session.role, 'admin')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const db = await resolvePrisma();
        const existing = await db.apiKey.findUnique({
            where: { id: request.params.keyId },
            select: { tenantId: true },
        });

        if (!existing) {
            return reply.code(404).send({ error: 'not_found' });
        }

        if (existing.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden' });
        }

        await db.apiKey.delete({ where: { id: request.params.keyId } });

        return reply.send({ deleted: true, id: request.params.keyId });
    });
};
