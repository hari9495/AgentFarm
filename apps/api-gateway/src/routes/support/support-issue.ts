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
import { randomUUID } from 'node:crypto';

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
export type SupportIssueStatus = 'open' | 'diagnosing' | 'fixing' | 'escalated' | 'resolved';

export interface SupportIssueRecord {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    title: string;
    description: string;
    status: SupportIssueStatus;
    severity: SupportIssueSeverity;
    tierReached: number | null;
    fixApplied: boolean;
    diagnosisReport: Record<string, unknown> | null;
    resolutionNotes: string | null;
    escalatedTo: string | null;
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
// In-process store (replaced by Prisma once migration runs — see Sprint 20 notes)
// ---------------------------------------------------------------------------

export const issueStore = new Map<string, SupportIssueRecord>();
export const stepStore = new Map<string, SupportDiagnosisStepRecord[]>();

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
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerSupportIssueRoutes(
    app: FastifyInstance,
    opts: RegisterSupportIssueRoutesOptions,
): Promise<void> {
    const { getSession } = opts;

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
                tierReached: null,
                fixApplied: false,
                diagnosisReport: null,
                resolutionNotes: null,
                escalatedTo: null,
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
            return reply.send({ ...issue, steps });
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

            return reply.send(resolved);
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
