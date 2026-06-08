/**
 * Support Issue Routes
 *
 * REST CRUD for SupportIssue records. All routes are scoped to the session's
 * tenantId — clients never pass tenantId in the body.
 *
 * Routes:
 *   POST   /v1/support/issues            — create new issue
 *   GET    /v1/support/issues            — list issues (SSE stream)
 *   GET    /v1/support/issues/:id        — get issue with full diagnosis trace
 *   POST   /v1/support/issues/:id/resolve — mark resolved, trigger lesson ingest
 *   GET    /v1/support/stats             — resolution stats
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// CSAT model helper — dynamic accessor so it degrades gracefully before migration
// ---------------------------------------------------------------------------

type CsatRow = {
    id: string; issueId: string; token: string;
    rating: number | null; comment: string | null; respondedAt: Date | null;
    issue?: { title: string };
};
type CsatModel = {
    create: (a: { data: unknown }) => Promise<unknown>;
    findUnique: (a: { where: Record<string, unknown>; include?: Record<string, unknown> }) => Promise<CsatRow | null>;
    update: (a: { where: Record<string, unknown>; data: unknown }) => Promise<unknown>;
    findMany: (a: { where: Record<string, unknown> }) => Promise<Array<{ issueId: string; token: string; rating: number | null }>>;
};

function getCsatModel(prisma: PrismaClient): CsatModel | null {
    return ((prisma as unknown as Record<string, unknown>)['supportCsatResponse'] as CsatModel | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type SupportIssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type SupportIssueSource = 'portal' | 'operator';
export type SupportIssueStatus = 'open' | 'diagnosing' | 'fixing' | 'escalated' | 'resolved';

export interface SupportIssueRecord {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    title: string;
    description: string;
    status: SupportIssueStatus;
    severity: SupportIssueSeverity;
    source: SupportIssueSource;
    tierReached: number | null;
    fixApplied: boolean;
    diagnosisReport: Record<string, unknown> | null;
    resolutionNotes: string | null;
    escalatedTo: string | null;
    prUrl?: string | null;
    createdAt: string;
    resolvedAt: string | null;
    steps?: SupportDiagnosisStepRecord[];
}

export interface SupportDiagnosisStepRecord {
    id: string;
    issueId: string;
    stepType: string;
    description: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    metadata: Record<string, unknown>;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Write-through store — in-memory Map backed by Prisma for persistence.
// Synchronous get/set keep all WS-route callsites unchanged; Prisma writes
// are fire-and-forget so they never block the hot path.
// ---------------------------------------------------------------------------

let _prisma: PrismaClient | null = null;

function prismaIssueToRecord(raw: {
    id: string; tenantId: string; workspaceId: string | null; title: string; description: string;
    status: string; severity: string; source?: string; tierReached: number | null; fixApplied: boolean;
    diagnosisReport: unknown; resolutionNotes: string | null; escalatedTo: string | null;
    createdAt: Date; resolvedAt: Date | null;
}): SupportIssueRecord {
    return {
        id: raw.id, tenantId: raw.tenantId, workspaceId: raw.workspaceId,
        title: raw.title, description: raw.description,
        status: raw.status as SupportIssueStatus, severity: raw.severity as SupportIssueSeverity,
        source: (raw.source as SupportIssueSource | undefined) ?? 'operator',
        tierReached: raw.tierReached, fixApplied: raw.fixApplied,
        diagnosisReport: raw.diagnosisReport as Record<string, unknown> | null,
        resolutionNotes: raw.resolutionNotes, escalatedTo: raw.escalatedTo,
        prUrl: (raw as Record<string, unknown>)['prUrl'] as string | null ?? null,
        createdAt: raw.createdAt.toISOString(),
        resolvedAt: raw.resolvedAt ? raw.resolvedAt.toISOString() : null,
    };
}

class WriteThroughIssueStore {
    private mem = new Map<string, SupportIssueRecord>();

    get(id: string): SupportIssueRecord | undefined { return this.mem.get(id); }
    has(id: string): boolean { return this.mem.has(id); }
    get size(): number { return this.mem.size; }
    values(): IterableIterator<SupportIssueRecord> { return this.mem.values(); }
    clear(): void { this.mem.clear(); }
    delete(id: string): boolean { return this.mem.delete(id); }

    set(id: string, issue: SupportIssueRecord): this {
        this.mem.set(id, issue);
        if (_prisma) {
            void this._persist(issue).catch((err: unknown) =>
                console.warn('[issueStore] Prisma write failed:', err instanceof Error ? err.message : String(err))
            );
        }
        return this;
    }

    private async _persist(issue: SupportIssueRecord): Promise<void> {
        if (!_prisma) return;
        const diagnosisReport = issue.diagnosisReport
            ? (JSON.parse(JSON.stringify(issue.diagnosisReport)) as Prisma.InputJsonValue)
            : Prisma.JsonNull;
        const data = {
            tenantId: issue.tenantId,
            workspaceId: issue.workspaceId ?? undefined,
            title: issue.title,
            description: issue.description,
            status: issue.status as never,
            severity: issue.severity as never,
            source: issue.source as never,
            tierReached: issue.tierReached ?? undefined,
            fixApplied: issue.fixApplied,
            diagnosisReport,
            resolutionNotes: issue.resolutionNotes ?? undefined,
            escalatedTo: issue.escalatedTo ?? undefined,
            resolvedAt: issue.resolvedAt ? new Date(issue.resolvedAt) : undefined,
        };
        await _prisma.supportIssue.upsert({
            where: { id: issue.id },
            create: { id: issue.id, createdAt: new Date(issue.createdAt), ...data },
            update: data,
        });
    }

    async loadFromDb(): Promise<void> {
        if (!_prisma) return;
        try {
            const rows = await _prisma.supportIssue.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
            for (const row of rows) { this.mem.set(row.id, prismaIssueToRecord(row)); }
        } catch (err) {
            console.warn('[issueStore] loadFromDb failed:', err instanceof Error ? err.message : String(err));
        }
    }
}

class WriteThroughStepStore {
    private mem = new Map<string, SupportDiagnosisStepRecord[]>();

    get(id: string): SupportDiagnosisStepRecord[] | undefined { return this.mem.get(id); }
    clear(): void { this.mem.clear(); }

    set(id: string, steps: SupportDiagnosisStepRecord[]): this {
        this.mem.set(id, steps);
        if (_prisma && steps.length > 0) {
            const last = steps[steps.length - 1]!;
            void this._persistStep(last).catch(() => {/* best-effort */});
        }
        return this;
    }

    private async _persistStep(step: SupportDiagnosisStepRecord): Promise<void> {
        if (!_prisma) return;
        const metadata = JSON.parse(JSON.stringify(step.metadata)) as Prisma.InputJsonValue;
        await _prisma.supportDiagnosisStep.upsert({
            where: { id: step.id },
            create: {
                id: step.id, issueId: step.issueId, stepType: step.stepType,
                description: step.description, status: step.status as never,
                metadata, createdAt: new Date(step.createdAt),
            },
            update: { status: step.status as never, metadata },
        });
    }
}

export const issueStore = new WriteThroughIssueStore();
export const stepStore = new WriteThroughStepStore();

// ---------------------------------------------------------------------------
// Chat message store — write-through to Prisma (graceful if table not yet migrated)
// ---------------------------------------------------------------------------

export interface SupportChatMessageRecord {
    id: string;
    issueId: string;
    role: 'user' | 'agent' | 'step' | 'fix' | 'error';
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

class WriteThroughMessageStore {
    private mem = new Map<string, SupportChatMessageRecord[]>(); // key: issueId

    /** Append a message and fire-and-forget persist. */
    push(msg: SupportChatMessageRecord): void {
        const list = this.mem.get(msg.issueId) ?? [];
        list.push(msg);
        this.mem.set(msg.issueId, list);
        if (_prisma) void this._persist(msg).catch(() => {/* table may not exist yet */});
    }

    get(issueId: string): SupportChatMessageRecord[] {
        return this.mem.get(issueId) ?? [];
    }

    clear(): void { this.mem.clear(); }

    private async _persist(msg: SupportChatMessageRecord): Promise<void> {
        if (!_prisma) return;
        // Access via dynamic key — gracefully absent before migration is applied
        const model = (_prisma as unknown as Record<string, unknown>)['supportChatMessage'] as
            { create: (args: { data: unknown }) => Promise<unknown> } | undefined;
        if (!model) return;
        await model.create({
            data: {
                id: msg.id,
                issueId: msg.issueId,
                role: msg.role,
                content: msg.content,
                metadata: JSON.parse(JSON.stringify(msg.metadata)) as Prisma.InputJsonValue,
                createdAt: new Date(msg.createdAt),
            },
        });
    }
}

export const messageStore = new WriteThroughMessageStore();

// ---------------------------------------------------------------------------
// SSE helpers — push issue-list updates to connected clients
// ---------------------------------------------------------------------------

type SseClient = { tenantId: string; write: (data: string) => void; close: () => void };
const sseClients: SseClient[] = [];

export function pushIssueUpdate(issue: SupportIssueRecord): void {
    const line = `data: ${JSON.stringify(issue)}\n\n`;
    for (const client of sseClients) {
        if (client.tenantId === issue.tenantId) {
            try { client.write(line); } catch { /* ignore closed connections */ }
        }
    }
}

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

export interface RegisterSupportIssueRoutesOptions {
    getSession: (req: FastifyRequest) => SessionContext | null;
    /** Optional Prisma client — enables write-through persistence and startup load. */
    prisma?: PrismaClient;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerSupportIssueRoutes(
    app: FastifyInstance,
    opts: RegisterSupportIssueRoutesOptions,
): Promise<void> {
    const { getSession } = opts;

    // Wire up Prisma if provided, then load existing issues into the memory cache
    if (opts.prisma) {
        _prisma = opts.prisma;
        await issueStore.loadFromDb();
    }

    // ── POST /v1/support/issues ────────────────────────────────────────────
    app.post<{ Body: { title?: unknown; description?: unknown; severity?: unknown; workspaceId?: unknown } }>(
        '/v1/support/issues',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const { title, description, severity, workspaceId } = req.body ?? {};
            if (typeof description !== 'string' || !description.trim()) {
                return reply.code(400).send({ error: 'description is required' });
            }

            const issue: SupportIssueRecord = {
                id: randomUUID(),
                tenantId: session.tenantId,
                workspaceId: typeof workspaceId === 'string' ? workspaceId : null,
                title: typeof title === 'string' ? title.trim() : 'Untitled issue',
                description: description.trim(),
                status: 'open',
                severity: (['critical', 'high', 'medium', 'low'].includes(String(severity))
                    ? String(severity) : 'medium') as SupportIssueSeverity,
                source: 'operator',
                tierReached: null,
                fixApplied: false,
                diagnosisReport: null,
                resolutionNotes: null,
                escalatedTo: null,
                prUrl: null,
                createdAt: new Date().toISOString(),
                resolvedAt: null,
            };

            issueStore.set(issue.id, issue);
            pushIssueUpdate(issue);

            return reply.code(201).send(issue);
        },
    );

    // ── GET /v1/support/issues — SSE stream ───────────────────────────────
    app.get('/v1/support/issues', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const acceptHeader = req.headers['accept'] ?? '';
        const isSSE = acceptHeader.includes('text/event-stream');

        if (!isSSE) {
            // Plain list for non-SSE callers
            const issues = [...issueStore.values()].filter((i) => i.tenantId === session.tenantId);
            return reply.send({ issues });
        }

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders();

        // Send current state immediately
        const issues = [...issueStore.values()].filter((i) => i.tenantId === session.tenantId);
        for (const issue of issues) {
            reply.raw.write(`data: ${JSON.stringify(issue)}\n\n`);
        }

        const client: SseClient = {
            tenantId: session.tenantId,
            write: (data) => reply.raw.write(data),
            close: () => reply.raw.end(),
        };
        sseClients.push(client);

        const heartbeat = setInterval(() => {
            try { reply.raw.write(': heartbeat\n\n'); } catch { /* ignore */ }
        }, 25_000);

        req.socket.on('close', () => {
            clearInterval(heartbeat);
            const idx = sseClients.indexOf(client);
            if (idx !== -1) sseClients.splice(idx, 1);
        });

        await new Promise<void>((resolve) => req.socket.on('close', resolve));
    });

    // ── GET /v1/support/issues/:id ────────────────────────────────────────
    app.get<{ Params: { id: string } }>(
        '/v1/support/issues/:id',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const issue = issueStore.get(req.params.id);
            if (!issue) return reply.code(404).send({ error: 'not_found' });
            if (issue.tenantId !== session.tenantId) return reply.code(403).send({ error: 'forbidden' });

            const steps = stepStore.get(issue.id) ?? [];
            const messages = messageStore.get(issue.id);
            return reply.send({ ...issue, steps, messages });
        },
    );

    // ── POST /v1/support/issues/:id/resolve ───────────────────────────────
    app.post<{
        Params: { id: string };
        Body: { resolutionNotes?: unknown };
    }>(
        '/v1/support/issues/:id/resolve',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const issue = issueStore.get(req.params.id);
            if (!issue) return reply.code(404).send({ error: 'not_found' });
            if (issue.tenantId !== session.tenantId) return reply.code(403).send({ error: 'forbidden' });
            if (issue.status === 'resolved') return reply.code(409).send({ error: 'already_resolved' });

            const notes = typeof req.body?.resolutionNotes === 'string' ? req.body.resolutionNotes : null;
            const resolved: SupportIssueRecord = {
                ...issue,
                status: 'resolved',
                resolutionNotes: notes,
                resolvedAt: new Date().toISOString(),
            };
            issueStore.set(resolved.id, resolved);
            pushIssueUpdate(resolved);

            // Generate CSAT token so the portal history page can show "Rate Support"
            if (opts.prisma) {
                const csatModel = getCsatModel(opts.prisma);
                if (csatModel) {
                    void csatModel.create({ data: { id: randomUUID(), issueId: resolved.id, token: randomUUID() } })
                        .catch(() => {/* best-effort — table may not exist yet */});
                }
            }

            // Fire-and-forget lesson ingestion — dispatch to agent-runtime so the
            // support agent learns from every manually resolved issue.
            if (notes && notes.length > 20) {
                const gatewayBaseUrl = process.env['GATEWAY_BASE_URL'] ?? 'http://localhost:3000';
                const serviceToken = process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
                void fetch(`${gatewayBaseUrl.replace(/\/+$/, '')}/v1/runtime/actions/internal`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
                    body: JSON.stringify({
                        actionType: 'agentfarm_support_resolve',
                        payload: { issueId: resolved.id, resolutionNotes: notes, tenantId: resolved.tenantId },
                    }),
                    signal: AbortSignal.timeout(10_000),
                }).catch(() => {/* best-effort */});
            }

            return reply.send(resolved);
        },
    );

    // ── PATCH /v1/support/issues/:id — partial update (prUrl, resolutionNotes, escalatedTo) ──
    // Used internally by code-fix-dispatcher (notifyCustomerPrRaised) and by operators.
    app.patch<{
        Params: { id: string };
        Body: { prUrl?: unknown; resolutionNotes?: unknown; escalatedTo?: unknown; tierReached?: unknown };
    }>(
        '/v1/support/issues/:id',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const issue = issueStore.get(req.params.id);
            if (!issue) return reply.code(404).send({ error: 'not_found' });
            if (issue.tenantId !== session.tenantId) return reply.code(403).send({ error: 'forbidden' });

            const { prUrl, resolutionNotes, escalatedTo, tierReached } = req.body ?? {};
            const updated: SupportIssueRecord = {
                ...issue,
                ...(typeof prUrl === 'string' ? { prUrl } : {}),
                ...(typeof resolutionNotes === 'string' ? { resolutionNotes } : {}),
                ...(typeof escalatedTo === 'string' ? { escalatedTo } : {}),
                ...(typeof tierReached === 'number' ? { tierReached } : {}),
            };
            issueStore.set(updated.id, updated);
            pushIssueUpdate(updated);

            return reply.send(updated);
        },
    );

    // ── GET /v1/support/stats ─────────────────────────────────────────────
    app.get('/v1/support/stats', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const issues = [...issueStore.values()].filter((i) => i.tenantId === session.tenantId);
        const now = Date.now();
        const weekMs = 7 * 24 * 3_600_000;
        const monthMs = 30 * 24 * 3_600_000;

        const thisWeek = issues.filter((i) => now - new Date(i.createdAt).getTime() < weekMs).length;
        const thisMonth = issues.filter((i) => now - new Date(i.createdAt).getTime() < monthMs).length;

        const tierBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const resolved = issues.filter((i) => i.status === 'resolved');
        for (const i of resolved) {
            const tier = (i.tierReached ?? 1) as 1 | 2 | 3 | 4;
            tierBreakdown[tier] = (tierBreakdown[tier] ?? 0) + 1;
        }

        const tier1Rate = resolved.length > 0
            ? Math.round(((tierBreakdown[1] ?? 0) / resolved.length) * 100)
            : 0;

        return reply.send({
            thisWeek,
            thisMonth,
            totalResolved: resolved.length,
            tierBreakdown,
            tier1AutoFixRate: tier1Rate,
        });
    });

    // ── GET /v1/portal/support/issues — portal-scoped issue list ─────────────
    // Auth: portal_session cookie verified against DB (via opts.prisma).
    // Falls back to an empty list if prisma is not configured.
    app.get('/v1/portal/support/issues', async (req, reply) => {
        const rawCookie = req.headers['cookie'];
        if (typeof rawCookie !== 'string') return reply.code(401).send({ error: 'unauthorized' });

        const item = rawCookie.split(';').map((v) => v.trim()).find((v) => v.startsWith('portal_session='));
        if (!item) return reply.code(401).send({ error: 'unauthorized' });

        const token = decodeURIComponent(item.slice('portal_session='.length));

        if (!opts.prisma) return reply.code(503).send({ error: 'not_configured' });

        const { verifyPortalSession } = await import('../../lib/portal-session.js');
        const portalSession = await verifyPortalSession(token, opts.prisma);
        if (!portalSession) return reply.code(401).send({ error: 'unauthorized' });

        const { searchParams } = new URL(req.url, 'http://localhost');
        const status = searchParams.get('status') ?? undefined;

        let issues = [...issueStore.values()].filter((i) => i.tenantId === portalSession.tenantId);
        if (status) issues = issues.filter((i) => i.status === status);
        issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Attach CSAT state per issue (token for linking, rated flag for UI)
        const csatModel = getCsatModel(opts.prisma);
        const csatMap = new Map<string, { token: string; rating: number | null }>();
        if (csatModel && issues.length > 0) {
            try {
                const rows = await csatModel.findMany({ where: { issueId: { in: issues.map((i) => i.id) } } });
                for (const row of rows) csatMap.set(row.issueId, { token: row.token, rating: row.rating });
            } catch { /* graceful — table may not exist yet */ }
        }

        return reply.send({
            issues: issues.map((i) => ({
                ...i,
                csatToken: csatMap.get(i.id)?.token ?? null,
                csatRated: (csatMap.get(i.id)?.rating ?? null) !== null,
            })),
        });
    });

    // ── GET /v1/portal/csat/:token — get CSAT request info (public) ──────────
    app.get<{ Params: { token: string } }>('/v1/portal/csat/:token', async (req, reply) => {
        if (!opts.prisma) return reply.code(503).send({ error: 'not_configured' });
        const csatModel = getCsatModel(opts.prisma);
        if (!csatModel) return reply.code(503).send({ error: 'not_configured' });

        try {
            const csat = await csatModel.findUnique({
                where: { token: req.params.token },
                include: { issue: true },
            });
            if (!csat) return reply.code(404).send({ error: 'not_found' });

            return reply.send({
                issueId: csat.issueId,
                issueTitle: csat.issue?.title ?? 'Support ticket',
                responded: csat.respondedAt != null,
                rating: csat.rating,
            });
        } catch { return reply.code(503).send({ error: 'not_configured' }); }
    });

    // ── POST /v1/portal/csat/respond — submit CSAT rating (public) ───────────
    app.post<{ Body: { token?: unknown; rating?: unknown; comment?: unknown } }>(
        '/v1/portal/csat/respond',
        async (req, reply) => {
            if (!opts.prisma) return reply.code(503).send({ error: 'not_configured' });
            const csatModel = getCsatModel(opts.prisma);
            if (!csatModel) return reply.code(503).send({ error: 'not_configured' });

            const { token, rating, comment } = req.body ?? {};
            if (!token || typeof token !== 'string') {
                return reply.code(400).send({ error: 'token_required' });
            }
            if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
                return reply.code(400).send({ error: 'invalid_rating', message: 'rating must be an integer 1–5' });
            }

            try {
                const csat = await csatModel.findUnique({ where: { token } });
                if (!csat) return reply.code(404).send({ error: 'not_found' });
                if (csat.respondedAt) return reply.code(409).send({ error: 'already_responded' });

                await csatModel.update({
                    where: { token },
                    data: {
                        rating,
                        comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
                        respondedAt: new Date(),
                    },
                });
                return reply.send({ ok: true });
            } catch { return reply.code(503).send({ error: 'not_configured' }); }
        },
    );
}

// ---------------------------------------------------------------------------
// Step helpers (used by action-handler and chat-session)
// ---------------------------------------------------------------------------

export function addDiagnosisStep(
    issueId: string,
    step: Omit<SupportDiagnosisStepRecord, 'id' | 'createdAt'>,
): SupportDiagnosisStepRecord {
    const record: SupportDiagnosisStepRecord = {
        ...step,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
    };
    const existing = stepStore.get(issueId) ?? [];
    existing.push(record);
    stepStore.set(issueId, existing);
    return record;
}

export function updateIssueStatus(
    issueId: string,
    update: Partial<Pick<SupportIssueRecord, 'status' | 'tierReached' | 'fixApplied' | 'diagnosisReport' | 'escalatedTo'>>,
): void {
    const issue = issueStore.get(issueId);
    if (!issue) return;
    const updated = { ...issue, ...update };
    issueStore.set(issueId, updated);
    pushIssueUpdate(updated);
}
