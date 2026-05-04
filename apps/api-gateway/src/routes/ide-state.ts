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

// ---------------------------------------------------------------------------
// IDE State types
// ---------------------------------------------------------------------------

type BreakpointEntry = {
    file: string;
    line: number;
    condition?: string;
};

type IdeStateRecord = {
    tenantId: string;
    workspaceId: string;
    openFiles: string[];
    activeFile?: string;
    breakpoints: BreakpointEntry[];
    status: string;
    updatedAt: string;
};

type IdePath = {
    workspaceId: string;
};

type IdeStateQuery = {
    tenant_id?: string;
};

type IdeStateBody = {
    openFiles?: unknown;
    activeFile?: unknown;
    breakpoints?: unknown;
    status?: unknown;
};

// ---------------------------------------------------------------------------
// Terminal Session types
// ---------------------------------------------------------------------------

type TerminalSessionRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    shell: string;
    cwd: string;
    lastCommand?: string;
    history: string[];
    status: string;
    updatedAt: string;
    createdAt: string;
};

type TerminalPath = {
    workspaceId: string;
};

type TerminalSessionIdPath = {
    workspaceId: string;
    sessionId: string;
};

type TerminalQuery = {
    tenant_id?: string;
};

type CreateTerminalBody = {
    shell?: unknown;
    cwd?: unknown;
};

type UpdateTerminalBody = {
    lastCommand?: unknown;
    history?: unknown;
    status?: unknown;
    cwd?: unknown;
};

// ---------------------------------------------------------------------------
// In-memory stores (used in tests via injection)
// ---------------------------------------------------------------------------

type IdeStateStore = {
    ideByWorkspaceKey: Map<string, IdeStateRecord>;
    terminalSessions: Map<string, TerminalSessionRecord>;
};

const createTestStore = (): IdeStateStore => ({
    ideByWorkspaceKey: new Map(),
    terminalSessions: new Map(),
});

const toWorkspaceKey = (tenantId: string, workspaceId: string): string => `${tenantId}:${workspaceId}`;

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((v) => typeof v === 'string');

const isBreakpointArray = (value: unknown): value is BreakpointEntry[] => {
    if (!Array.isArray(value)) return false;
    return value.every(
        (v) =>
            typeof v === 'object' &&
            v !== null &&
            typeof (v as Record<string, unknown>).file === 'string' &&
            typeof (v as Record<string, unknown>).line === 'number',
    );
};

const VALID_SHELLS = new Set(['bash', 'zsh', 'sh', 'fish', 'powershell', 'cmd']);
const VALID_IDE_STATUSES = new Set(['active', 'suspended', 'restored']);
const VALID_TERMINAL_STATUSES = new Set(['active', 'closed', 'suspended']);

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

type IdeStateRepo = {
    getIdeState(input: { tenantId: string; workspaceId: string }): Promise<IdeStateRecord | null>;
    upsertIdeState(input: {
        tenantId: string;
        workspaceId: string;
        openFiles?: string[];
        activeFile?: string;
        breakpoints?: BreakpointEntry[];
        status?: string;
        nowIso: string;
    }): Promise<IdeStateRecord>;
    listTerminalSessions(input: { tenantId: string; workspaceId: string }): Promise<TerminalSessionRecord[]>;
    createTerminalSession(input: {
        tenantId: string;
        workspaceId: string;
        shell: string;
        cwd: string;
        nowIso: string;
    }): Promise<TerminalSessionRecord>;
    updateTerminalSession(input: {
        id: string;
        tenantId: string;
        workspaceId: string;
        lastCommand?: string;
        history?: string[];
        status?: string;
        cwd?: string;
        nowIso: string;
    }): Promise<TerminalSessionRecord | null>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

// ---------------------------------------------------------------------------
// In-memory repo (for tests)
// ---------------------------------------------------------------------------

const createInMemoryRepo = (store: IdeStateStore): IdeStateRepo => ({
    async getIdeState({ tenantId, workspaceId }) {
        return store.ideByWorkspaceKey.get(toWorkspaceKey(tenantId, workspaceId)) ?? null;
    },
    async upsertIdeState({ tenantId, workspaceId, openFiles, activeFile, breakpoints, status, nowIso }) {
        const key = toWorkspaceKey(tenantId, workspaceId);
        const existing = store.ideByWorkspaceKey.get(key);
        const updated: IdeStateRecord = {
            tenantId,
            workspaceId,
            openFiles: openFiles ?? existing?.openFiles ?? [],
            activeFile: activeFile !== undefined ? activeFile : existing?.activeFile,
            breakpoints: breakpoints ?? existing?.breakpoints ?? [],
            status: status ?? existing?.status ?? 'active',
            updatedAt: nowIso,
        };
        store.ideByWorkspaceKey.set(key, updated);
        return updated;
    },
    async listTerminalSessions({ tenantId, workspaceId }) {
        return Array.from(store.terminalSessions.values()).filter(
            (s) => s.tenantId === tenantId && s.workspaceId === workspaceId,
        );
    },
    async createTerminalSession({ tenantId, workspaceId, shell, cwd, nowIso }) {
        const session: TerminalSessionRecord = {
            id: randomUUID(),
            tenantId,
            workspaceId,
            shell,
            cwd,
            history: [],
            status: 'active',
            updatedAt: nowIso,
            createdAt: nowIso,
        };
        store.terminalSessions.set(session.id, session);
        return session;
    },
    async updateTerminalSession({ id, tenantId, workspaceId, lastCommand, history, status, cwd, nowIso }) {
        const existing = store.terminalSessions.get(id);
        if (!existing || existing.tenantId !== tenantId || existing.workspaceId !== workspaceId) return null;
        const updated: TerminalSessionRecord = {
            ...existing,
            lastCommand: lastCommand !== undefined ? lastCommand : existing.lastCommand,
            history: history ?? existing.history,
            status: status ?? existing.status,
            cwd: cwd ?? existing.cwd,
            updatedAt: nowIso,
        };
        store.terminalSessions.set(id, updated);
        return updated;
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// DB repo
// ---------------------------------------------------------------------------

const createDbRepo = (prismaClient: Awaited<ReturnType<typeof getPrisma>>): IdeStateRepo => ({
    async getIdeState({ tenantId, workspaceId }) {
        const row = await (prismaClient as any).ideState.findUnique({
            where: { tenantId_workspaceId: { tenantId, workspaceId } },
        });
        if (!row) return null;
        return {
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            openFiles: (row.openFiles as string[]) ?? [],
            activeFile: row.activeFile ?? undefined,
            breakpoints: (row.breakpoints as BreakpointEntry[]) ?? [],
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
        };
    },
    async upsertIdeState({ tenantId, workspaceId, openFiles, activeFile, breakpoints, status, nowIso }) {
        const row = await (prismaClient as any).ideState.upsert({
            where: { tenantId_workspaceId: { tenantId, workspaceId } },
            update: {
                ...(openFiles !== undefined && { openFiles }),
                ...(activeFile !== undefined && { activeFile }),
                ...(breakpoints !== undefined && { breakpoints }),
                ...(status !== undefined && { status }),
                updatedAt: new Date(nowIso),
            },
            create: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                openFiles: openFiles ?? [],
                activeFile: activeFile ?? null,
                breakpoints: breakpoints ?? [],
                status: status ?? 'active',
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            openFiles: (row.openFiles as string[]) ?? [],
            activeFile: row.activeFile ?? undefined,
            breakpoints: (row.breakpoints as BreakpointEntry[]) ?? [],
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
        };
    },
    async listTerminalSessions({ tenantId, workspaceId }) {
        const rows = await (prismaClient as any).terminalSession.findMany({
            where: { tenantId, workspaceId },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row: any) => ({
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            shell: row.shell,
            cwd: row.cwd,
            lastCommand: row.lastCommand ?? undefined,
            history: (row.history as string[]) ?? [],
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        }));
    },
    async createTerminalSession({ tenantId, workspaceId, shell, cwd, nowIso }) {
        const row = await (prismaClient as any).terminalSession.create({
            data: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                shell,
                cwd,
                history: [],
                status: 'active',
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            shell: row.shell,
            cwd: row.cwd,
            lastCommand: row.lastCommand ?? undefined,
            history: (row.history as string[]) ?? [],
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    },
    async updateTerminalSession({ id, tenantId, workspaceId, lastCommand, history, status, cwd, nowIso }) {
        const existing = await (prismaClient as any).terminalSession.findFirst({
            where: { id, tenantId, workspaceId },
        });
        if (!existing) return null;
        const row = await (prismaClient as any).terminalSession.update({
            where: { id },
            data: {
                ...(lastCommand !== undefined && { lastCommand }),
                ...(history !== undefined && { history }),
                ...(status !== undefined && { status }),
                ...(cwd !== undefined && { cwd }),
                updatedAt: new Date(nowIso),
            },
        });
        return {
            id: row.id,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            shell: row.shell,
            cwd: row.cwd,
            lastCommand: row.lastCommand ?? undefined,
            history: (row.history as string[]) ?? [],
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    },
    async createAuditEvent({ tenantId, workspaceId, actor, summary, correlationId }) {
        await (prismaClient as any).auditEvent.create({
            data: {
                id: randomUUID(),
                tenantId,
                workspaceId,
                actor,
                eventType: 'audit_event',
                severity: 'info',
                summary,
                correlationId,
                createdAt: new Date(),
            },
        });
    },
});

// ---------------------------------------------------------------------------
// Route registration options
// ---------------------------------------------------------------------------

type RegisterIdeStateRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: IdeStateStore;
    repo?: IdeStateRepo;
    env?: NodeJS.ProcessEnv;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveRepo = async (options: RegisterIdeStateRoutesOptions): Promise<IdeStateRepo> => {
    if (options.repo) return options.repo;
    const prismaClient = await getPrisma();
    return createDbRepo(prismaClient);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterIdeStateRoutesOptions,
    tenantId: string | undefined,
): SessionContext | null => {
    const session = options.getSession(request);
    if (session) return session;

    // Runtime service token path
    const env = options.env ?? process.env;
    const runtimeToken = request.headers['x-runtime-token'];
    const configuredToken = env.RUNTIME_SERVICE_TOKEN;
    if (configuredToken && typeof runtimeToken === 'string' && runtimeToken === configuredToken && tenantId) {
        return {
            userId: 'runtime-service',
            tenantId,
            workspaceIds: [],
            scope: 'internal',
            expiresAt: Date.now() + 60_000,
        };
    }
    return null;
};

const checkWorkspaceAccess = (session: SessionContext, workspaceId: string): boolean => {
    if (session.scope === 'internal') return true;
    return session.workspaceIds.includes(workspaceId);
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerIdeStateRoutes = async (
    app: FastifyInstance,
    options: RegisterIdeStateRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createTestStore();

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/ide-state
    // -----------------------------------------------------------------------
    app.get<{ Params: IdePath; Querystring: IdeStateQuery }>(
        '/v1/workspaces/:workspaceId/ide-state',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const tenantId = request.query.tenant_id;
            const session = resolveSession(request, options, tenantId);

            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }
            if (!checkWorkspaceAccess(session, workspaceId)) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const repo = options.repo ?? createInMemoryRepo(store);
            const ideState = await repo.getIdeState({ tenantId: session.tenantId, workspaceId });

            if (!ideState) {
                return reply.status(200).send({
                    workspaceId,
                    openFiles: [],
                    activeFile: null,
                    breakpoints: [],
                    status: 'active',
                    updatedAt: new Date(options.now ? options.now() : Date.now()).toISOString(),
                    source: 'default',
                });
            }

            return reply.status(200).send({ ...ideState, source: 'persisted' });
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/workspaces/:workspaceId/ide-state
    // -----------------------------------------------------------------------
    app.put<{ Params: IdePath; Querystring: IdeStateQuery; Body: IdeStateBody }>(
        '/v1/workspaces/:workspaceId/ide-state',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const tenantId = request.query.tenant_id;
            const session = resolveSession(request, options, tenantId);

            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }
            if (!checkWorkspaceAccess(session, workspaceId)) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const body = request.body ?? {};

            if (body.openFiles !== undefined && !isStringArray(body.openFiles)) {
                return reply.status(400).send({ error: 'openFiles must be an array of strings' });
            }
            if (body.breakpoints !== undefined && !isBreakpointArray(body.breakpoints)) {
                return reply
                    .status(400)
                    .send({ error: 'breakpoints must be an array of {file, line} objects' });
            }
            if (body.activeFile !== undefined && body.activeFile !== null && typeof body.activeFile !== 'string') {
                return reply.status(400).send({ error: 'activeFile must be a string or null' });
            }
            if (body.status !== undefined && !VALID_IDE_STATUSES.has(body.status as string)) {
                return reply
                    .status(400)
                    .send({ error: `status must be one of: ${[...VALID_IDE_STATUSES].join(', ')}` });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();

            const repo = options.repo ?? createInMemoryRepo(store);
            const ideState = await repo.upsertIdeState({
                tenantId: session.tenantId,
                workspaceId,
                openFiles: body.openFiles as string[] | undefined,
                activeFile: body.activeFile as string | undefined,
                breakpoints: body.breakpoints as BreakpointEntry[] | undefined,
                status: body.status as string | undefined,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `ide_state_updated: ${ideState.openFiles.length} open files, status=${ideState.status}`,
                correlationId,
            });

            return reply.status(200).send({ ...ideState, correlationId });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/terminal-sessions
    // -----------------------------------------------------------------------
    app.get<{ Params: TerminalPath; Querystring: TerminalQuery }>(
        '/v1/workspaces/:workspaceId/terminal-sessions',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const tenantId = request.query.tenant_id;
            const session = resolveSession(request, options, tenantId);

            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }
            if (!checkWorkspaceAccess(session, workspaceId)) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const repo = options.repo ?? createInMemoryRepo(store);
            const sessions = await repo.listTerminalSessions({ tenantId: session.tenantId, workspaceId });

            return reply.status(200).send({ workspaceId, sessions, total: sessions.length });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/terminal-sessions
    // -----------------------------------------------------------------------
    app.post<{ Params: TerminalPath; Querystring: TerminalQuery; Body: CreateTerminalBody }>(
        '/v1/workspaces/:workspaceId/terminal-sessions',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const tenantId = request.query.tenant_id;
            const session = resolveSession(request, options, tenantId);

            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }
            if (!checkWorkspaceAccess(session, workspaceId)) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const body = request.body ?? {};
            const shell = typeof body.shell === 'string' ? body.shell : 'bash';
            const cwd = typeof body.cwd === 'string' ? body.cwd : '/';

            if (!VALID_SHELLS.has(shell)) {
                return reply
                    .status(400)
                    .send({ error: `shell must be one of: ${[...VALID_SHELLS].join(', ')}` });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();

            const repo = options.repo ?? createInMemoryRepo(store);
            const terminalSession = await repo.createTerminalSession({
                tenantId: session.tenantId,
                workspaceId,
                shell,
                cwd,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `terminal_session_created: shell=${shell} cwd=${cwd}`,
                correlationId,
            });

            return reply.status(201).send({ ...terminalSession, correlationId });
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/workspaces/:workspaceId/terminal-sessions/:sessionId
    // -----------------------------------------------------------------------
    app.put<{ Params: TerminalSessionIdPath; Querystring: TerminalQuery; Body: UpdateTerminalBody }>(
        '/v1/workspaces/:workspaceId/terminal-sessions/:sessionId',
        async (request, reply) => {
            const { workspaceId, sessionId } = request.params;
            const tenantId = request.query.tenant_id;
            const session = resolveSession(request, options, tenantId);

            if (!session) {
                return reply.status(401).send({ error: 'unauthorized' });
            }
            if (!checkWorkspaceAccess(session, workspaceId)) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const body = request.body ?? {};

            if (body.history !== undefined && !isStringArray(body.history)) {
                return reply.status(400).send({ error: 'history must be an array of strings' });
            }
            if (body.status !== undefined && !VALID_TERMINAL_STATUSES.has(body.status as string)) {
                return reply
                    .status(400)
                    .send({ error: `status must be one of: ${[...VALID_TERMINAL_STATUSES].join(', ')}` });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();

            const repo = options.repo ?? createInMemoryRepo(store);
            const updated = await repo.updateTerminalSession({
                id: sessionId,
                tenantId: session.tenantId,
                workspaceId,
                lastCommand: body.lastCommand as string | undefined,
                history: body.history as string[] | undefined,
                status: body.status as string | undefined,
                cwd: body.cwd as string | undefined,
                nowIso,
            });

            if (!updated) {
                return reply.status(404).send({ error: 'terminal session not found' });
            }

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `terminal_session_updated: id=${sessionId} status=${updated.status}`,
                correlationId,
            });

            return reply.status(200).send({ ...updated, correlationId });
        },
    );
};
