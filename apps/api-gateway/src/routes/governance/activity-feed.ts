/**
 * activity-feed.ts — unified workspace activity timeline.
 *
 * Aggregates ActivityEvent, AgentDispatchRecord, and Approval into a single
 * normalised FeedItem list sorted by timestamp desc. Returned as one response
 * so the dashboard makes one request instead of three.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterActivityFeedRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

// ── Normalised item type ──────────────────────────────────────────────────────

type FeedStatus = 'success' | 'failure' | 'pending' | 'info' | 'warning';

type FeedItem = {
    id: string;
    source: 'activity_event' | 'dispatch' | 'approval';
    category: string;    // runtime | approval | ci | connector | provisioning | security | system
    title: string;
    detail?: string;
    agentId?: string;    // botId if known
    triggeredBy?: string; // userId / agentId that initiated
    status: FeedStatus;
    timestamp: string;   // ISO — used for sorting
    meta?: Record<string, unknown>;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapActivityEvent(ev: {
    id: string; category: string; title: string; body: string | null;
    payload: unknown; status: string; createdAt: Date;
}): FeedItem {
    // Try to extract agentId from payload
    let agentId: string | undefined;
    let triggeredBy: string | undefined;
    try {
        const p = ev.payload as Record<string, unknown> | null;
        if (p) {
            agentId = typeof p['botId'] === 'string' ? p['botId'] :
                      typeof p['bot_id'] === 'string' ? p['bot_id'] :
                      typeof p['agentId'] === 'string' ? p['agentId'] : undefined;
            triggeredBy = typeof p['triggeredBy'] === 'string' ? p['triggeredBy'] :
                          typeof p['requestedBy'] === 'string' ? p['requestedBy'] : undefined;
        }
    } catch { /* ignore */ }

    const statusMap: Record<string, FeedStatus> = {
        unread: 'info', read: 'info', acked: 'info',
    };
    // Infer status from category / title keywords
    const lower = ev.title.toLowerCase();
    let status: FeedStatus = statusMap[ev.status] ?? 'info';
    if (lower.includes('fail') || lower.includes('error') || lower.includes('crash')) status = 'failure';
    else if (lower.includes('complet') || lower.includes('success') || lower.includes('approv')) status = 'success';
    else if (lower.includes('pending') || lower.includes('queue')) status = 'pending';
    else if (lower.includes('warn') || lower.includes('timeout') || lower.includes('reject')) status = 'warning';
    if (ev.category === 'security') status = 'warning';

    return {
        id: `ae-${ev.id}`,
        source: 'activity_event',
        category: ev.category,
        title: ev.title,
        detail: ev.body ?? undefined,
        agentId,
        triggeredBy,
        status,
        timestamp: ev.createdAt.toISOString(),
        meta: ev.payload as Record<string, unknown> | undefined,
    };
}

function mapDispatch(d: {
    id: string; fromAgentId: string; toAgentId: string; taskDescription: string;
    status: string; queuedAt: Date; completedAt: Date | null; errorMessage: string | null;
}): FeedItem {
    const statusMap: Record<string, FeedStatus> = {
        queued: 'pending', running: 'pending',
        completed: 'success', failed: 'failure',
    };
    const desc = d.taskDescription.length > 120
        ? d.taskDescription.slice(0, 120) + '…'
        : d.taskDescription;
    return {
        id: `dispatch-${d.id}`,
        source: 'dispatch',
        category: 'runtime',
        title: `Task dispatched → ${d.toAgentId.slice(-8)}`,
        detail: desc,
        agentId: d.toAgentId,
        triggeredBy: d.fromAgentId,
        status: statusMap[d.status] ?? 'info',
        timestamp: d.completedAt?.toISOString() ?? d.queuedAt.toISOString(),
        meta: d.errorMessage ? { error: d.errorMessage } : undefined,
    };
}

function mapApproval(a: {
    id: string; botId: string; actionSummary: string; riskLevel: string;
    decision: string; requestedBy: string; approverId: string | null;
    createdAt: Date; decidedAt: Date | null; decisionReason: string | null;
}): FeedItem {
    const decisionLabel: Record<string, string> = {
        pending: 'Approval pending',
        approved: 'Approved',
        rejected: 'Rejected',
        timeout_rejected: 'Timed out',
    };
    const statusMap: Record<string, FeedStatus> = {
        pending: 'pending',
        approved: 'success',
        rejected: 'warning',
        timeout_rejected: 'warning',
    };
    const riskPrefix = a.riskLevel === 'high' ? '🔴 HIGH · ' : a.riskLevel === 'medium' ? '🟡 MED · ' : '';

    let detail: string | undefined;
    try {
        const parsed = JSON.parse(a.actionSummary) as { change_summary?: string; action?: string };
        detail = parsed.change_summary ?? parsed.action ?? undefined;
    } catch {
        detail = a.actionSummary.length > 120 ? a.actionSummary.slice(0, 120) + '…' : a.actionSummary;
    }
    if (a.decisionReason) detail = (detail ? detail + ' · ' : '') + `Reason: ${a.decisionReason}`;

    return {
        id: `approval-${a.id}`,
        source: 'approval',
        category: 'approval',
        title: `${riskPrefix}${decisionLabel[a.decision] ?? a.decision}`,
        detail,
        agentId: a.botId,
        triggeredBy: a.approverId ?? a.requestedBy,
        status: statusMap[a.decision] ?? 'info',
        timestamp: (a.decidedAt ?? a.createdAt).toISOString(),
    };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function registerActivityFeedRoutes(
    app: FastifyInstance,
    options: RegisterActivityFeedRoutesOptions,
): Promise<void> {
    const { getSession } = options;

    app.get<{
        Params: { workspaceId: string };
        Querystring: { category?: string; status?: string; limit?: string; agentId?: string };
    }>(
        '/v1/workspaces/:workspaceId/activity-feed',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const { workspaceId } = request.params;
            if (!session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'Workspace outside session scope' });
            }

            const { category, status, agentId } = request.query;
            const limit = Math.min(parseInt(request.query.limit ?? '60', 10), 200);
            const perSource = Math.max(limit, 60); // fetch more than needed before merge

            try {
                const prisma = await getPrisma();

                const [activityEvents, dispatches, approvals] = await Promise.all([
                    // ActivityEvent — primary feed source
                    prisma.activityEvent.findMany({
                        where: {
                            workspaceId,
                            ...(category ? { category } : {}),
                        },
                        orderBy: { createdAt: 'desc' },
                        take: perSource,
                        select: { id: true, category: true, title: true, body: true, payload: true, status: true, createdAt: true },
                    }),

                    // AgentDispatchRecord — task dispatches
                    prisma.agentDispatchRecord.findMany({
                        where: {
                            workspaceId,
                            ...(agentId ? { toAgentId: agentId } : {}),
                        },
                        orderBy: { queuedAt: 'desc' },
                        take: perSource,
                        select: { id: true, fromAgentId: true, toAgentId: true, taskDescription: true, status: true, queuedAt: true, completedAt: true, errorMessage: true },
                    }),

                    // Approval — approval decisions
                    prisma.approval.findMany({
                        where: {
                            workspaceId,
                            ...(agentId ? { botId: agentId } : {}),
                        },
                        orderBy: { createdAt: 'desc' },
                        take: perSource,
                        select: { id: true, botId: true, actionSummary: true, riskLevel: true, decision: true, requestedBy: true, approverId: true, createdAt: true, decidedAt: true, decisionReason: true },
                    }),
                ]);

                // Normalise all three sources into FeedItem[]
                let items: FeedItem[] = [
                    ...activityEvents.map(mapActivityEvent),
                    ...dispatches.map(mapDispatch),
                    ...approvals.map(mapApproval),
                ];

                // Apply filters
                if (category) items = items.filter(i => i.category === category);
                if (status) items = items.filter(i => i.status === status);
                if (agentId) items = items.filter(i => i.agentId === agentId || i.triggeredBy === agentId);

                // Sort newest first, deduplicate by id
                items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                const seen = new Set<string>();
                const unique = items.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

                return reply.send({ items: unique.slice(0, limit), total: unique.length });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                return reply.code(500).send({ error: 'Failed to load activity feed', detail: msg });
            }
        },
    );
}
