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

type DesktopProfileParams = {
    workspaceId: string;
};

type DesktopProfileQuery = {
    tenant_id?: string;
};

type DesktopProfileBody = {
    browser?: unknown;
    storageRef?: unknown;
    tabState?: unknown;
};

type RotateBody = {
    reason?: unknown;
};

type DesktopProfileRecord = {
    tenantId: string;
    workspaceId: string;
    profileId: string;
    browser: string;
    storageRef?: string;
    tabState: Record<string, unknown>;
    tokenVersion: number;
    updatedAt: string;
};

type WorkspaceDesktopProfileStore = {
    profileByWorkspaceKey: Map<string, DesktopProfileRecord>;
};

type RotateProfileResult = {
    previousProfileId: string | null;
    profile: DesktopProfileRecord;
};

type DesktopProfileRepo = {
    getProfile(input: { tenantId: string; workspaceId: string }): Promise<DesktopProfileRecord | null>;
    upsertProfile(input: {
        tenantId: string;
        workspaceId: string;
        browser?: string;
        storageRef?: string;
        tabState?: Record<string, unknown>;
        nowIso: string;
    }): Promise<DesktopProfileRecord>;
    rotateProfile(input: {
        tenantId: string;
        workspaceId: string;
        nowIso: string;
    }): Promise<RotateProfileResult>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

type RegisterDesktopProfileRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: WorkspaceDesktopProfileStore;
    repo?: DesktopProfileRepo;
    env?: NodeJS.ProcessEnv;
};

const SUPPORTED_BROWSERS = new Set(['chromium', 'chrome', 'edge', 'firefox']);

const createDefaultStore = (): WorkspaceDesktopProfileStore => ({
    profileByWorkspaceKey: new Map<string, DesktopProfileRecord>(),
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

const normalizeBrowser = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return SUPPORTED_BROWSERS.has(normalized) ? normalized : null;
};

const createInMemoryRepo = (store: WorkspaceDesktopProfileStore): DesktopProfileRepo => {
    return {
        async getProfile(input) {
            return store.profileByWorkspaceKey.get(toWorkspaceKey(input.tenantId, input.workspaceId)) ?? null;
        },
        async upsertProfile(input) {
            const key = toWorkspaceKey(input.tenantId, input.workspaceId);
            const existing = store.profileByWorkspaceKey.get(key);
            const profile: DesktopProfileRecord = {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                profileId: existing?.profileId ?? randomUUID(),
                browser: input.browser ?? existing?.browser ?? 'chromium',
                storageRef: input.storageRef ?? existing?.storageRef,
                tabState: input.tabState ?? existing?.tabState ?? {},
                tokenVersion: existing?.tokenVersion ?? 1,
                updatedAt: input.nowIso,
            };
            store.profileByWorkspaceKey.set(key, profile);
            return profile;
        },
        async rotateProfile(input) {
            const key = toWorkspaceKey(input.tenantId, input.workspaceId);
            const existing = store.profileByWorkspaceKey.get(key);
            const rotated: DesktopProfileRecord = {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                profileId: randomUUID(),
                browser: existing?.browser ?? 'chromium',
                storageRef: existing?.storageRef,
                tabState: existing?.tabState ?? {},
                tokenVersion: (existing?.tokenVersion ?? 0) + 1,
                updatedAt: input.nowIso,
            };
            store.profileByWorkspaceKey.set(key, rotated);
            return {
                previousProfileId: existing?.profileId ?? null,
                profile: rotated,
            };
        },
        async createAuditEvent() {
            // Test/dev in-memory repo does not persist audit events.
        },
    };
};

const createDbRepo = (): DesktopProfileRepo => {
    return {
        async getProfile(input) {
            const prisma = await getPrisma();
            const rows = await prisma.$queryRawUnsafe<Array<{
                tenantId: string;
                workspaceId: string;
                profileId: string;
                browser: string;
                storageRef: string | null;
                tabState: Record<string, unknown> | string;
                tokenVersion: number;
                updatedAt: Date;
            }>>(
                `SELECT "tenantId", "workspaceId", "profileId", "browser", "storageRef", "tabState", "tokenVersion", "updatedAt"
                 FROM "DesktopProfile"
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
                profileId: row.profileId,
                browser: row.browser,
                storageRef: row.storageRef ?? undefined,
                tabState: typeof row.tabState === 'string' ? JSON.parse(row.tabState) : row.tabState,
                tokenVersion: row.tokenVersion,
                updatedAt: row.updatedAt.toISOString(),
            };
        },
        async upsertProfile(input) {
            const prisma = await getPrisma();

            return prisma.$transaction(async (tx) => {
                const rows = await tx.$queryRawUnsafe<Array<{
                    id: string;
                    profileId: string;
                    browser: string;
                    storageRef: string | null;
                    tabState: Record<string, unknown> | string;
                    tokenVersion: number;
                }>>(
                    `SELECT "id", "profileId", "browser", "storageRef", "tabState", "tokenVersion"
                     FROM "DesktopProfile"
                     WHERE "tenantId" = $1 AND "workspaceId" = $2
                     LIMIT 1`,
                    input.tenantId,
                    input.workspaceId,
                );

                const existing = rows[0];
                if (existing) {
                    await tx.$executeRawUnsafe(
                        `UPDATE "DesktopProfile"
                         SET "browser" = $1, "storageRef" = $2, "tabState" = $3::jsonb, "updatedAt" = $4
                         WHERE "id" = $5`,
                        input.browser ?? existing.browser,
                        input.storageRef ?? existing.storageRef,
                        JSON.stringify(input.tabState ?? (typeof existing.tabState === 'string' ? JSON.parse(existing.tabState) : existing.tabState)),
                        input.nowIso,
                        existing.id,
                    );

                    return {
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        profileId: existing.profileId,
                        browser: input.browser ?? existing.browser,
                        storageRef: input.storageRef ?? existing.storageRef ?? undefined,
                        tabState: input.tabState ?? (typeof existing.tabState === 'string' ? JSON.parse(existing.tabState) : existing.tabState),
                        tokenVersion: existing.tokenVersion,
                        updatedAt: input.nowIso,
                    } satisfies DesktopProfileRecord;
                }

                const id = randomUUID();
                const profileId = randomUUID();
                const browser = input.browser ?? 'chromium';
                const tabState = input.tabState ?? {};

                await tx.$executeRawUnsafe(
                    `INSERT INTO "DesktopProfile"
                     ("id", "tenantId", "workspaceId", "profileId", "browser", "storageRef", "tabState", "tokenVersion", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 1, $8, $8)`,
                    id,
                    input.tenantId,
                    input.workspaceId,
                    profileId,
                    browser,
                    input.storageRef ?? null,
                    JSON.stringify(tabState),
                    input.nowIso,
                );

                return {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    profileId,
                    browser,
                    storageRef: input.storageRef,
                    tabState,
                    tokenVersion: 1,
                    updatedAt: input.nowIso,
                } satisfies DesktopProfileRecord;
            });
        },
        async rotateProfile(input) {
            const prisma = await getPrisma();

            return prisma.$transaction(async (tx) => {
                const rows = await tx.$queryRawUnsafe<Array<{
                    id: string;
                    profileId: string;
                    browser: string;
                    storageRef: string | null;
                    tabState: Record<string, unknown> | string;
                    tokenVersion: number;
                }>>(
                    `SELECT "id", "profileId", "browser", "storageRef", "tabState", "tokenVersion"
                     FROM "DesktopProfile"
                     WHERE "tenantId" = $1 AND "workspaceId" = $2
                     LIMIT 1`,
                    input.tenantId,
                    input.workspaceId,
                );

                const existing = rows[0];
                const nextProfileId = randomUUID();

                if (existing) {
                    const nextTokenVersion = existing.tokenVersion + 1;
                    await tx.$executeRawUnsafe(
                        `UPDATE "DesktopProfile"
                         SET "profileId" = $1, "tokenVersion" = $2, "lastRotatedAt" = $3, "updatedAt" = $3
                         WHERE "id" = $4`,
                        nextProfileId,
                        nextTokenVersion,
                        input.nowIso,
                        existing.id,
                    );

                    return {
                        previousProfileId: existing.profileId,
                        profile: {
                            tenantId: input.tenantId,
                            workspaceId: input.workspaceId,
                            profileId: nextProfileId,
                            browser: existing.browser,
                            storageRef: existing.storageRef ?? undefined,
                            tabState: typeof existing.tabState === 'string' ? JSON.parse(existing.tabState) : existing.tabState,
                            tokenVersion: nextTokenVersion,
                            updatedAt: input.nowIso,
                        },
                    } satisfies RotateProfileResult;
                }

                const id = randomUUID();
                await tx.$executeRawUnsafe(
                    `INSERT INTO "DesktopProfile"
                     ("id", "tenantId", "workspaceId", "profileId", "browser", "storageRef", "tabState", "tokenVersion", "lastRotatedAt", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, 'chromium', NULL, '{}'::jsonb, 1, $5, $5, $5)`,
                    id,
                    input.tenantId,
                    input.workspaceId,
                    nextProfileId,
                    input.nowIso,
                );

                return {
                    previousProfileId: null,
                    profile: {
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        profileId: nextProfileId,
                        browser: 'chromium',
                        storageRef: undefined,
                        tabState: {},
                        tokenVersion: 1,
                        updatedAt: input.nowIso,
                    },
                } satisfies RotateProfileResult;
            });
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
                    sourceSystem: 'api-gateway-desktop-profile',
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
};

const resolveAccessContext = (
    request: FastifyRequest<{ Params: DesktopProfileParams; Querystring: DesktopProfileQuery }>,
    options: RegisterDesktopProfileRoutesOptions,
): AccessContext | { code: number; body: { error: string; message: string } } => {
    const { workspaceId } = request.params;

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
    };
};

export const registerDesktopProfileRoutes = async (
    app: FastifyInstance,
    options: RegisterDesktopProfileRoutesOptions,
): Promise<void> => {
    const now = options.now ?? (() => Date.now());
    const store = options.store ?? DEFAULT_STORE;
    const repo = options.repo
        ?? (options.store ? createInMemoryRepo(store) : createDbRepo());

    app.get<{ Params: DesktopProfileParams; Querystring: DesktopProfileQuery }>('/v1/workspaces/:workspaceId/desktop-profile', async (request, reply) => {
        const access = resolveAccessContext(request, options);
        if ('code' in access) {
            return reply.code(access.code).send(access.body);
        }

        const record = await repo.getProfile({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
        });

        if (!record) {
            return reply.code(200).send({
                workspaceId: access.workspaceId,
                profileId: null,
                browser: 'chromium',
                storageRef: null,
                tabState: {},
                tokenVersion: 0,
                updatedAt: null,
                source: 'default',
            });
        }

        return reply.code(200).send({
            workspaceId: access.workspaceId,
            profileId: record.profileId,
            browser: record.browser,
            storageRef: record.storageRef ?? null,
            tabState: record.tabState,
            tokenVersion: record.tokenVersion,
            updatedAt: record.updatedAt,
            source: 'persisted',
        });
    });

    app.put<{ Params: DesktopProfileParams; Querystring: DesktopProfileQuery; Body: DesktopProfileBody }>('/v1/workspaces/:workspaceId/desktop-profile', async (request, reply) => {
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

        const browser = request.body.browser === undefined
            ? undefined
            : normalizeBrowser(request.body.browser);

        if (request.body.browser !== undefined && !browser) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'browser must be one of: chromium, chrome, edge, firefox.',
            });
        }

        const storageRef = request.body.storageRef === undefined
            ? undefined
            : (typeof request.body.storageRef === 'string' ? request.body.storageRef.trim() : null);

        if (request.body.storageRef !== undefined && storageRef === null) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'storageRef must be a string when provided.',
            });
        }

        const tabState = request.body.tabState === undefined
            ? undefined
            : (isRecord(request.body.tabState) ? request.body.tabState : null);

        if (request.body.tabState !== undefined && tabState === null) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tabState must be an object when provided.',
            });
        }

        const record = await repo.upsertProfile({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            browser: browser ?? undefined,
            storageRef: storageRef ?? undefined,
            tabState: tabState ?? undefined,
            nowIso: new Date(now()).toISOString(),
        });

        await repo.createAuditEvent({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            actor: access.actor,
            summary: `Desktop profile updated profileId=${record.profileId} actor=${access.actor}`,
            correlationId: randomUUID(),
        });

        return reply.code(200).send({
            workspaceId: access.workspaceId,
            profileId: record.profileId,
            browser: record.browser,
            storageRef: record.storageRef ?? null,
            tabState: record.tabState,
            tokenVersion: record.tokenVersion,
            updatedAt: record.updatedAt,
        });
    });

    app.post<{ Params: DesktopProfileParams; Querystring: DesktopProfileQuery; Body: RotateBody }>('/v1/workspaces/:workspaceId/browser-sessions/rotate', async (request, reply) => {
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

        const reason = typeof request.body.reason === 'string' ? request.body.reason.trim() : '';
        const rotation = await repo.rotateProfile({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            nowIso: new Date(now()).toISOString(),
        });

        await repo.createAuditEvent({
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            actor: access.actor,
            summary: `Desktop profile rotated oldProfileId=${rotation.previousProfileId ?? 'none'} newProfileId=${rotation.profile.profileId} reason=${reason || 'unspecified'} actor=${access.actor}`,
            correlationId: randomUUID(),
        });

        return reply.code(202).send({
            workspaceId: access.workspaceId,
            previousProfileId: rotation.previousProfileId,
            newProfileId: rotation.profile.profileId,
            tokenVersion: rotation.profile.tokenVersion,
            rotatedAt: rotation.profile.updatedAt,
        });
    });
};
