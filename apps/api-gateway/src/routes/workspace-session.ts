import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type WorkspaceSessionParams = {
    workspaceId: string;
};

type WorkspaceSessionQuery = {
    tenant_id?: string;
    mode?: string;
};

type SessionStateBody = {
    expectedVersion?: unknown;
    state?: unknown;
};

type CheckpointBody = {
    label?: unknown;
    reason?: unknown;
    stateDigest?: unknown;
};

type WorkspaceSessionStateRecord = {
    tenantId: string;
    workspaceId: string;
    version: number;
    state: Record<string, unknown>;
    updatedAt: string;
    updatedBy: string;
};

type WorkspaceSessionCheckpointRecord = {
    checkpointId: string;
    tenantId: string;
    workspaceId: string;
    label: string;
    reason?: string;
    stateDigest?: string;
    version: number;
    createdAt: string;
    actor: string;
};

type WorkspaceSessionStore = {
    stateByWorkspaceKey: Map<string, WorkspaceSessionStateRecord>;
    checkpointsByWorkspaceKey: Map<string, WorkspaceSessionCheckpointRecord[]>;
};

type UpsertSessionStateResult = {
    record?: WorkspaceSessionStateRecord;
    conflictCurrentVersion?: number;
};

type WorkspaceSessionRepo = {
    getState(input: { tenantId: string; workspaceId: string }): Promise<WorkspaceSessionStateRecord | null>;
    upsertState(input: {
        tenantId: string;
        workspaceId: string;
        expectedVersion?: number;
        state: Record<string, unknown>;
        updatedBy: string;
        nowIso: string;
    }): Promise<UpsertSessionStateResult>;
    createCheckpoint(input: {
        tenantId: string;
        workspaceId: string;
        label: string;
        reason?: string;
        stateDigest?: string;
        actor: string;
        nowIso: string;
    }): Promise<WorkspaceSessionCheckpointRecord>;
    listCheckpoints(input: { tenantId: string; workspaceId: string }): Promise<WorkspaceSessionCheckpointRecord[]>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        eventName: 'session_restore' | 'session_update' | 'session_checkpoint_created';
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

type RegisterWorkspaceSessionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: WorkspaceSessionStore;
    repo?: WorkspaceSessionRepo;
    env?: NodeJS.ProcessEnv;
};

const createDefaultStore = (): WorkspaceSessionStore => ({
    stateByWorkspaceKey: new Map<string, WorkspaceSessionStateRecord>(),
    checkpointsByWorkspaceKey: new Map<string, WorkspaceSessionCheckpointRecord[]>(),
});

const DEFAULT_STORE = createDefaultStore();

const toWorkspaceKey = (tenantId: string, workspaceId: string): string => `${tenantId}:${workspaceId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const canAccessWorkspace = (session: SessionContext, workspaceId: string): boolean => {
    if (session.scope === 'internal') {
        return true;
    }

    return session.workspaceIds.includes(workspaceId);
};

const readServiceToken = (request: FastifyRequest): string | null => {
    const direct = request.headers['x-runtime-session-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const createInMemoryRepo = (store: WorkspaceSessionStore): WorkspaceSessionRepo => {
    return {
        async getState(input) {
            return store.stateByWorkspaceKey.get(toWorkspaceKey(input.tenantId, input.workspaceId)) ?? null;
        },
        async upsertState(input) {
            const key = toWorkspaceKey(input.tenantId, input.workspaceId);
            const existing = store.stateByWorkspaceKey.get(key);
            const currentVersion = existing?.version ?? 0;
            if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
                return { conflictCurrentVersion: currentVersion };
            }

            const record: WorkspaceSessionStateRecord = {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                version: currentVersion + 1,
                state: input.state,
                updatedAt: input.nowIso,
                updatedBy: input.updatedBy,
            };
            store.stateByWorkspaceKey.set(key, record);
            return { record };
        },
        async createCheckpoint(input) {
            const key = toWorkspaceKey(input.tenantId, input.workspaceId);
            const state = store.stateByWorkspaceKey.get(key);
            const record: WorkspaceSessionCheckpointRecord = {
                checkpointId: randomUUID(),
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                label: input.label,
                reason: input.reason,
                stateDigest: input.stateDigest,
                version: state?.version ?? 0,
                createdAt: input.nowIso,
                actor: input.actor,
            };
            const existing = store.checkpointsByWorkspaceKey.get(key) ?? [];
            store.checkpointsByWorkspaceKey.set(key, [record, ...existing]);
            return record;
        },
        async listCheckpoints(input) {
            const key = toWorkspaceKey(input.tenantId, input.workspaceId);
            return store.checkpointsByWorkspaceKey.get(key) ?? [];
        },
        async createAuditEvent() {
            // Test/dev in-memory repo does not persist audit events.
        },
    };
};

const createDbRepo = (): WorkspaceSessionRepo => {
    return {
        async getState(input) {
            const prisma = await getPrisma();
            const rows = await prisma.$queryRawUnsafe<Array<{
                tenantId: string;
                workspaceId: string;
                version: number;
                state: Record<string, unknown> | string;
                updatedAt: Date;
                updatedBy: string;
            }>>(
                `SELECT "tenantId", "workspaceId", "version", "state", "updatedAt", "updatedBy"
                 FROM "WorkspaceSessionState"
                 WHERE "tenantId" = $1 AND "workspaceId" = $2
                 LIMIT 1`,
                input.tenantId,
                input.workspaceId,
            );

            if (!rows[0]) {
                return null;
            }

            const row = rows[0];
            return {
                tenantId: row.tenantId,
                workspaceId: row.workspaceId,
                version: row.version,
                state: typeof row.state === 'string' ? JSON.parse(row.state) : row.state,
                updatedAt: row.updatedAt.toISOString(),
                updatedBy: row.updatedBy,
            };
        },
        async upsertState(input) {
            const prisma = await getPrisma();

            return prisma.$transaction(async (tx) => {
                const existingRows = await tx.$queryRawUnsafe<Array<{ version: number }>>(
                    `SELECT "version" FROM "WorkspaceSessionState" WHERE "tenantId" = $1 AND "workspaceId" = $2 LIMIT 1`,
                    input.tenantId,
                    input.workspaceId,
                );

                const currentVersion = existingRows[0]?.version ?? 0;
                if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
                    return { conflictCurrentVersion: currentVersion } satisfies UpsertSessionStateResult;
                }

                const nextVersion = currentVersion + 1;
                const id = randomUUID();
                const stateJson = JSON.stringify(input.state);

                if (existingRows[0]) {
                    await tx.$executeRawUnsafe(
                        `UPDATE "WorkspaceSessionState"
                         SET "version" = $1, "state" = $2::jsonb, "updatedBy" = $3, "updatedAt" = $4
                         WHERE "tenantId" = $5 AND "workspaceId" = $6`,
                        nextVersion,
                        stateJson,
                        input.updatedBy,
                        input.nowIso,
                        input.tenantId,
                        input.workspaceId,
                    );
                } else {
                    await tx.$executeRawUnsafe(
                        `INSERT INTO "WorkspaceSessionState"
                         ("id", "tenantId", "workspaceId", "version", "state", "updatedBy", "updatedAt", "createdAt")
                         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $7)`,
                        id,
                        input.tenantId,
                        input.workspaceId,
                        nextVersion,
                        stateJson,
                        input.updatedBy,
                        input.nowIso,
                    );
                }

                return {
                    record: {
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        version: nextVersion,
                        state: input.state,
                        updatedAt: input.nowIso,
                        updatedBy: input.updatedBy,
                    },
                } satisfies UpsertSessionStateResult;
            });
        },
        async createCheckpoint(input) {
            const prisma = await getPrisma();
            const correlationId = randomUUID();
            const checkpointId = randomUUID();
            const stateRows = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
                `SELECT "version" FROM "WorkspaceSessionState" WHERE "tenantId" = $1 AND "workspaceId" = $2 LIMIT 1`,
                input.tenantId,
                input.workspaceId,
            );
            const sessionVersion = stateRows[0]?.version ?? 0;

            await prisma.$executeRawUnsafe(
                `INSERT INTO "WorkspaceCheckpoint"
                 ("id", "tenantId", "workspaceId", "sessionVersion", "label", "reason", "stateDigest", "actor", "createdAt", "correlationId")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                checkpointId,
                input.tenantId,
                input.workspaceId,
                sessionVersion,
                input.label,
                input.reason ?? null,
                input.stateDigest ?? null,
                input.actor,
                input.nowIso,
                correlationId,
            );

            return {
                checkpointId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                label: input.label,
                reason: input.reason,
                stateDigest: input.stateDigest,
                version: sessionVersion,
                createdAt: input.nowIso,
                actor: input.actor,
            };
        },
        async listCheckpoints(input) {
            const prisma = await getPrisma();
            const rows = await prisma.$queryRawUnsafe<Array<{
                id: string;
                tenantId: string;
                workspaceId: string;
                sessionVersion: number;
                label: string;
                reason: string | null;
                stateDigest: string | null;
                actor: string;
                createdAt: Date;
            }>>(
                `SELECT "id", "tenantId", "workspaceId", "sessionVersion", "label", "reason", "stateDigest", "actor", "createdAt"
                 FROM "WorkspaceCheckpoint"
                 WHERE "tenantId" = $1 AND "workspaceId" = $2
                 ORDER BY "createdAt" DESC`,
                input.tenantId,
                input.workspaceId,
            );

            return rows.map((row) => ({
                checkpointId: row.id,
                tenantId: row.tenantId,
                workspaceId: row.workspaceId,
                label: row.label,
                reason: row.reason ?? undefined,
                stateDigest: row.stateDigest ?? undefined,
                version: row.sessionVersion,
                createdAt: row.createdAt.toISOString(),
                actor: row.actor,
            }));
        },
        async createAuditEvent(input) {
            const prisma = await getPrisma();
            const workspace = await prisma.workspace.findUnique({
                where: { id: input.workspaceId },
                select: {
                    bot: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            await prisma.auditEvent.create({
                data: {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    botId: workspace?.bot?.id ?? input.workspaceId,
                    eventType: 'audit_event',
                    severity: 'info',
                    summary: input.summary,
                    sourceSystem: 'api-gateway-workspace-session',
                    correlationId: input.correlationId,
                },
            });
        },
    };
};

type AccessContext = {
    tenantId: string;
    actor: string;
    workspaceId: string;
    restoreMode: boolean;
};

const resolveAccessContext = (
    request: FastifyRequest<{ Params: WorkspaceSessionParams; Querystring: WorkspaceSessionQuery }>,
    options: RegisterWorkspaceSessionRoutesOptions,
): AccessContext | { code: number; body: { error: string; message: string } } => {
    const { workspaceId } = request.params;
    const restoreMode = request.query.mode === 'restore';

    const session = options.getSession(request);
    if (session) {
        if (!canAccessWorkspace(session, workspaceId)) {
            return {
                code: 403,
                body: {
                    error: 'forbidden',
                    message: 'Workspace access denied.',
                },
            };
        }

        return {
            tenantId: session.tenantId,
            actor: session.userId,
            workspaceId,
            restoreMode,
        };
    }

    const env = options.env ?? process.env;
    const configuredToken = env.RUNTIME_SESSION_SHARED_TOKEN;
    const presentedToken = readServiceToken(request);
    const queryTenantId = typeof request.query.tenant_id === 'string' ? request.query.tenant_id.trim() : '';

    if (!configuredToken || !presentedToken || presentedToken !== configuredToken) {
        return {
            code: 401,
            body: {
                error: 'unauthorized',
                message: 'Valid session or runtime session token required.',
            },
        };
    }

    if (!queryTenantId) {
        return {
            code: 400,
            body: {
                error: 'invalid_request',
                message: 'tenant_id is required for runtime session token access.',
            },
        };
    }

    return {
        tenantId: queryTenantId,
        actor: 'runtime_orchestrator',
        workspaceId,
        restoreMode,
    };
};

export const registerWorkspaceSessionRoutes = async (
    app: FastifyInstance,
    options: RegisterWorkspaceSessionRoutesOptions,
): Promise<void> => {
    const now = options.now ?? (() => Date.now());
    const store = options.store ?? DEFAULT_STORE;
    const repo = options.repo
        ?? (options.store ? createInMemoryRepo(store) : createDbRepo());

    app.get<{ Params: WorkspaceSessionParams; Querystring: WorkspaceSessionQuery }>('/v1/workspaces/:workspaceId/session-state', async (request, reply) => {
        const access = resolveAccessContext(request, options);
        if ('code' in access) {
            return reply.code(access.code).send(access.body);
        }

        const existing = await repo.getState({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
        });

        if (!existing) {
            return reply.code(200).send({
                workspaceId: access.workspaceId,
                version: 0,
                state: {},
                updatedAt: null,
                source: 'default',
            });
        }

        if (access.restoreMode) {
            await repo.createAuditEvent({
                tenantId: access.tenantId,
                workspaceId: access.workspaceId,
                actor: access.actor,
                eventName: 'session_restore',
                summary: `Workspace session restored version=${existing.version} actor=${access.actor}`,
                correlationId: randomUUID(),
            });
        }

        return reply.code(200).send({
            workspaceId: access.workspaceId,
            version: existing.version,
            state: existing.state,
            updatedAt: existing.updatedAt,
            source: 'persisted',
        });
    });

    app.put<{ Params: WorkspaceSessionParams; Querystring: WorkspaceSessionQuery; Body: SessionStateBody }>('/v1/workspaces/:workspaceId/session-state', async (request, reply) => {
        const access = resolveAccessContext(request, options);
        if ('code' in access) {
            return reply.code(access.code).send(access.body);
        }

        if (!isRecord(request.body)) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'Request body must be an object.',
            });
        }

        if (request.body.expectedVersion !== undefined && (!Number.isInteger(request.body.expectedVersion) || (request.body.expectedVersion as number) < 0)) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'expectedVersion must be a non-negative integer when provided.',
            });
        }

        if (!isRecord(request.body.state)) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'state must be an object.',
            });
        }

        const expectedVersion = request.body.expectedVersion as number | undefined;
        const nowIso = new Date(now()).toISOString();
        const upsertResult = await repo.upsertState({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            expectedVersion,
            state: request.body.state,
            updatedBy: access.actor,
            nowIso,
        });

        if (!upsertResult.record) {
            return reply.code(409).send({
                error: 'conflict',
                message: 'Session state version conflict.',
                currentVersion: upsertResult.conflictCurrentVersion ?? 0,
            });
        }

        await repo.createAuditEvent({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            actor: access.actor,
            eventName: 'session_update',
            summary: `Workspace session updated version=${upsertResult.record.version} actor=${access.actor}`,
            correlationId: randomUUID(),
        });

        return reply.code(200).send({
            workspaceId: access.workspaceId,
            version: upsertResult.record.version,
            state: upsertResult.record.state,
            updatedAt: upsertResult.record.updatedAt,
        });
    });

    app.post<{ Params: WorkspaceSessionParams; Querystring: WorkspaceSessionQuery; Body: CheckpointBody }>('/v1/workspaces/:workspaceId/checkpoints', async (request, reply) => {
        const access = resolveAccessContext(request, options);
        if ('code' in access) {
            return reply.code(access.code).send(access.body);
        }

        if (!isRecord(request.body)) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'Request body must be an object.',
            });
        }

        const label = typeof request.body.label === 'string' ? request.body.label.trim() : '';
        if (!label) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'label is required.',
            });
        }

        const reason = typeof request.body.reason === 'string' && request.body.reason.trim()
            ? request.body.reason.trim()
            : undefined;
        const stateDigest = typeof request.body.stateDigest === 'string' && request.body.stateDigest.trim()
            ? request.body.stateDigest.trim()
            : undefined;

        const nowIso = new Date(now()).toISOString();
        const record = await repo.createCheckpoint({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            label,
            reason,
            stateDigest,
            actor: access.actor,
            nowIso,
        });

        await repo.createAuditEvent({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            actor: access.actor,
            eventName: 'session_checkpoint_created',
            summary: `Workspace session checkpoint created id=${record.checkpointId} version=${record.version} actor=${access.actor}`,
            correlationId: randomUUID(),
        });

        return reply.code(201).send({
            checkpointId: record.checkpointId,
            workspaceId: access.workspaceId,
            version: record.version,
            createdAt: record.createdAt,
            actor: record.actor,
        });
    });

    app.get<{ Params: WorkspaceSessionParams; Querystring: WorkspaceSessionQuery }>('/v1/workspaces/:workspaceId/checkpoints', async (request, reply) => {
        const access = resolveAccessContext(request, options);
        if ('code' in access) {
            return reply.code(access.code).send(access.body);
        }

        const items = await repo.listCheckpoints({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
        });

        return reply.code(200).send({
            items,
        });
    });
};
