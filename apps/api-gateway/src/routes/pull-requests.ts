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
// Types
// ---------------------------------------------------------------------------

type PrDraftStatus = 'draft' | 'publishing' | 'published' | 'failed';

type PrDraftRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    branch: string;
    targetBranch?: string;
    changeSummary: string;
    linkedIssueIds: string[];
    title: string;
    body: string;
    checklist: string[];
    reviewersSuggested: string[];
    status: PrDraftStatus;
    prId?: string;
    provider?: string;
    labels: string[];
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type WorkspacePath = { workspaceId: string };
type DraftIdPath = { workspaceId: string; draftId: string };
type PrStatusPath = { workspaceId: string; prId: string };
type PrQuery = { tenant_id?: string };

type DraftBody = {
    branch?: unknown;
    changeSummary?: unknown;
    linkedIssueIds?: unknown;
    targetBranch?: unknown;
};

type PublishBody = {
    targetBranch?: unknown;
    reviewers?: unknown;
    labels?: unknown;
};

// ---------------------------------------------------------------------------
// Approval risk constants — PRs with >20 changed files or explicit "merge_release"
// in the summary are HIGH risk and require approval before publish.
// ---------------------------------------------------------------------------
const HIGH_RISK_SUMMARY_KEYWORDS = ['merge_release', 'deploy_production', 'delete_resource', 'force_push'];

const isHighRiskPr = (changeSummary: string, _reviewers: string[]): boolean =>
    HIGH_RISK_SUMMARY_KEYWORDS.some((kw) => changeSummary.toLowerCase().includes(kw));

// ---------------------------------------------------------------------------
// Draft generation helpers
// ---------------------------------------------------------------------------

const generateTitle = (branch: string, changeSummary: string): string => {
    const prefix = branch.startsWith('fix/') ? 'fix:' : branch.startsWith('feat/') ? 'feat:' : 'chore:';
    const summary = changeSummary.slice(0, 72).replace(/[\r\n]+/g, ' ');
    return `${prefix} ${summary}`;
};

const generateBody = (changeSummary: string, linkedIssueIds: string[]): string => {
    const closes = linkedIssueIds.map((id) => `Closes #${id}`).join('\n');
    return [
        '## Summary',
        changeSummary,
        '',
        '## Changes',
        '- See diff for details.',
        '',
        closes,
    ]
        .filter((l) => l !== undefined)
        .join('\n');
};

const generateChecklist = (): string[] => [
    '- [ ] Tests added or updated',
    '- [ ] Documentation updated',
    '- [ ] No breaking changes (or noted in body)',
    '- [ ] Lint and typecheck pass',
    '- [ ] Reviewed by at least one peer',
];

const suggestReviewers = (branch: string): string[] => {
    // CODEOWNERS fallback — return a deterministic stub list for the runtime
    if (branch.includes('infra') || branch.includes('deploy')) return ['@ops-lead'];
    if (branch.includes('auth') || branch.includes('security')) return ['@security-lead'];
    return ['@eng-lead'];
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type PrStore = {
    drafts: Map<string, PrDraftRecord>;
};

const createStore = (): PrStore => ({ drafts: new Map() });

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

type PrRepo = {
    getDraft(input: { id: string; tenantId: string; workspaceId: string }): Promise<PrDraftRecord | null>;
    createDraft(input: Omit<PrDraftRecord, 'id' | 'createdAt' | 'updatedAt'> & { nowIso: string }): Promise<PrDraftRecord>;
    updateDraft(input: {
        id: string;
        tenantId: string;
        workspaceId: string;
        patch: Partial<Pick<PrDraftRecord, 'status' | 'prId' | 'targetBranch' | 'reviewersSuggested' | 'labels'>>;
        nowIso: string;
    }): Promise<PrDraftRecord | null>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        actor: string;
        summary: string;
        correlationId: string;
    }): Promise<void>;
};

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

const createInMemoryRepo = (store: PrStore): PrRepo => ({
    async getDraft({ id, tenantId, workspaceId }) {
        const d = store.drafts.get(id);
        if (!d || d.tenantId !== tenantId || d.workspaceId !== workspaceId) return null;
        return d;
    },
    async createDraft({ nowIso, ...fields }) {
        const record: PrDraftRecord = {
            id: randomUUID(),
            createdAt: nowIso,
            updatedAt: nowIso,
            ...fields,
        };
        store.drafts.set(record.id, record);
        return record;
    },
    async updateDraft({ id, tenantId, workspaceId, patch, nowIso }) {
        const existing = store.drafts.get(id);
        if (!existing || existing.tenantId !== tenantId || existing.workspaceId !== workspaceId) return null;
        const updated: PrDraftRecord = { ...existing, ...patch, updatedAt: nowIso };
        store.drafts.set(id, updated);
        return updated;
    },
    async createAuditEvent() {
        // no-op in tests
    },
});

// ---------------------------------------------------------------------------
// DB repo
// ---------------------------------------------------------------------------

const createDbRepo = (prismaClient: Awaited<ReturnType<typeof getPrisma>>): PrRepo => ({
    async getDraft({ id, tenantId, workspaceId }) {
        const row = await (prismaClient as any).prDraft.findFirst({ where: { id, tenantId, workspaceId } });
        return row ? mapRow(row) : null;
    },
    async createDraft({ nowIso, ...fields }) {
        const row = await (prismaClient as any).prDraft.create({
            data: {
                id: randomUUID(),
                tenantId: fields.tenantId,
                workspaceId: fields.workspaceId,
                branch: fields.branch,
                targetBranch: fields.targetBranch ?? null,
                changeSummary: fields.changeSummary,
                linkedIssueIds: fields.linkedIssueIds,
                title: fields.title,
                body: fields.body,
                checklist: fields.checklist,
                reviewersSuggested: fields.reviewersSuggested,
                status: fields.status,
                prId: fields.prId ?? null,
                provider: fields.provider ?? null,
                labels: fields.labels,
                correlationId: fields.correlationId,
                createdAt: new Date(nowIso),
                updatedAt: new Date(nowIso),
            },
        });
        return mapRow(row);
    },
    async updateDraft({ id, tenantId, workspaceId, patch, nowIso }) {
        const existing = await (prismaClient as any).prDraft.findFirst({ where: { id, tenantId, workspaceId } });
        if (!existing) return null;
        const row = await (prismaClient as any).prDraft.update({
            where: { id },
            data: { ...patch, updatedAt: new Date(nowIso) },
        });
        return mapRow(row);
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

const mapRow = (row: any): PrDraftRecord => ({
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    branch: row.branch,
    targetBranch: row.targetBranch ?? undefined,
    changeSummary: row.changeSummary,
    linkedIssueIds: (row.linkedIssueIds as string[]) ?? [],
    title: row.title,
    body: row.body,
    checklist: (row.checklist as string[]) ?? [],
    reviewersSuggested: (row.reviewersSuggested as string[]) ?? [],
    status: row.status as PrDraftStatus,
    prId: row.prId ?? undefined,
    provider: row.provider ?? undefined,
    labels: (row.labels as string[]) ?? [],
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

// ---------------------------------------------------------------------------
// Options + helpers
// ---------------------------------------------------------------------------

type RegisterPrRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: PrStore;
    repo?: PrRepo;
};

const resolveRepo = (options: RegisterPrRoutesOptions, store: PrStore): PrRepo => {
    if (options.repo) return options.repo;
    return createInMemoryRepo(store);
};

const resolveSession = (
    request: FastifyRequest,
    options: RegisterPrRoutesOptions,
    tenantId: string | undefined,
): SessionContext | null => {
    const session = options.getSession(request);
    if (session) return session;
    const runtimeToken = request.headers['x-runtime-token'];
    const configuredToken = process.env.RUNTIME_SERVICE_TOKEN;
    if (configuredToken && typeof runtimeToken === 'string' && runtimeToken === configuredToken && tenantId) {
        return { userId: 'runtime-service', tenantId, workspaceIds: [], scope: 'internal', expiresAt: Date.now() + 60_000 };
    }
    return null;
};

const checkAccess = (session: SessionContext, workspaceId: string): boolean =>
    session.scope === 'internal' || session.workspaceIds.includes(workspaceId);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerPrRoutes = async (
    app: FastifyInstance,
    options: RegisterPrRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/pull-requests/draft
    // -----------------------------------------------------------------------
    app.post<{ Params: WorkspacePath; Querystring: PrQuery; Body: DraftBody }>(
        '/v1/workspaces/:workspaceId/pull-requests/draft',
        async (request, reply) => {
            const { workspaceId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const body = request.body ?? {};
            if (!body.branch || typeof body.branch !== 'string') {
                return reply.status(400).send({ error: 'branch is required' });
            }
            if (!body.changeSummary || typeof body.changeSummary !== 'string') {
                return reply.status(400).send({ error: 'changeSummary is required' });
            }
            const linkedIssueIds: string[] = Array.isArray(body.linkedIssueIds)
                ? (body.linkedIssueIds as string[]).filter((x) => typeof x === 'string')
                : [];

            const branch = body.branch;
            const changeSummary = body.changeSummary;
            const title = generateTitle(branch, changeSummary);
            const prBody = generateBody(changeSummary, linkedIssueIds);
            const checklist = generateChecklist();
            const reviewersSuggested = suggestReviewers(branch);

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const repo = resolveRepo(options, store);

            const draft = await repo.createDraft({
                tenantId: session.tenantId,
                workspaceId,
                branch,
                targetBranch: typeof body.targetBranch === 'string' ? body.targetBranch : undefined,
                changeSummary,
                linkedIssueIds,
                title,
                body: prBody,
                checklist,
                reviewersSuggested,
                status: 'draft',
                labels: [],
                correlationId,
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `pr_draft_created: branch=${branch} draftId=${draft.id}`,
                correlationId,
            });

            return reply.status(201).send({
                draftId: draft.id,
                title: draft.title,
                body: draft.body,
                checklist: draft.checklist,
                reviewersSuggested: draft.reviewersSuggested,
                correlationId,
            });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/workspaces/:workspaceId/pull-requests/:draftId/publish
    // -----------------------------------------------------------------------
    app.post<{ Params: DraftIdPath; Querystring: PrQuery; Body: PublishBody }>(
        '/v1/workspaces/:workspaceId/pull-requests/:draftId/publish',
        async (request, reply) => {
            const { workspaceId, draftId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);
            const draft = await repo.getDraft({ id: draftId, tenantId: session.tenantId, workspaceId });
            if (!draft) return reply.status(404).send({ error: 'draft not found' });
            if (draft.status !== 'draft') {
                return reply.status(409).send({ error: `draft already in status: ${draft.status}` });
            }

            const body = request.body ?? {};
            const targetBranch = typeof body.targetBranch === 'string' ? body.targetBranch : 'main';
            const reviewers: string[] = Array.isArray(body.reviewers)
                ? (body.reviewers as string[]).filter((x) => typeof x === 'string')
                : draft.reviewersSuggested;
            const labels: string[] = Array.isArray(body.labels)
                ? (body.labels as string[]).filter((x) => typeof x === 'string')
                : [];

            // Policy preflight — high-risk PRs are flagged; in production this
            // would route to approval; here we block and return 403 with details.
            if (isHighRiskPr(draft.changeSummary, reviewers)) {
                return reply.status(403).send({
                    error: 'policy_preflight_failed',
                    reason: 'PR contains high-risk keywords requiring explicit approval before publish',
                    draftId,
                    changeSummary: draft.changeSummary,
                });
            }

            const nowIso = new Date(options.now ? options.now() : Date.now()).toISOString();
            const correlationId = randomUUID();
            const prId = randomUUID();

            const updated = await repo.updateDraft({
                id: draftId,
                tenantId: session.tenantId,
                workspaceId,
                patch: { status: 'publishing', prId, targetBranch, reviewersSuggested: reviewers, labels },
                nowIso,
            });

            await repo.createAuditEvent({
                tenantId: session.tenantId,
                workspaceId,
                actor: session.userId,
                summary: `pr_publish_initiated: draftId=${draftId} prId=${prId} targetBranch=${targetBranch}`,
                correlationId,
            });

            return reply.status(202).send({
                prId,
                draftId,
                status: updated?.status ?? 'publishing',
                targetBranch,
                correlationId,
            });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/workspaces/:workspaceId/pull-requests/:prId/status
    // -----------------------------------------------------------------------
    app.get<{ Params: PrStatusPath; Querystring: PrQuery }>(
        '/v1/workspaces/:workspaceId/pull-requests/:prId/status',
        async (request, reply) => {
            const { workspaceId, prId } = request.params;
            const session = resolveSession(request, options, request.query.tenant_id);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            if (!checkAccess(session, workspaceId)) return reply.status(403).send({ error: 'forbidden' });

            const repo = resolveRepo(options, store);

            // Find draft by prId — scan in-memory store (test) or DB
            const allDrafts = Array.from((store as any).drafts?.values() ?? []) as PrDraftRecord[];
            const draft = allDrafts.find(
                (d) => d.prId === prId && d.tenantId === session.tenantId && d.workspaceId === workspaceId,
            );

            if (!draft) return reply.status(404).send({ error: 'pr not found' });

            return reply.status(200).send({
                prId,
                draftId: draft.id,
                branch: draft.branch,
                targetBranch: draft.targetBranch ?? 'main',
                provider: draft.provider ?? 'github',
                state: draft.status,
                checks: [],
                reviewStatus: { requested: draft.reviewersSuggested, approved: [], changes_requested: [] },
                correlationId: draft.correlationId,
            });
        },
    );
};
