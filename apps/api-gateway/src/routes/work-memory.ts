/**
 * Workspace Work-Memory Routes
 *
 * PUT  /v1/workspaces/:wsId/work-memory   — upsert memory entries
 * GET  /v1/workspaces/:wsId/next-actions  — derive next actions from memory
 * POST /v1/workspaces/:wsId/daily-plan    — build today's plan with approval gating
 */

import type { FastifyInstance } from 'fastify';
import type { SessionContext } from './ci-failures.js';

type MemoryEntry = {
    key: string;
    value: Record<string, unknown>;
};

export async function registerWorkMemoryRoutes(
    app: FastifyInstance,
    opts: { getSession: () => SessionContext | null },
): Promise<void> {
    // Keyed by wsId → (key → entry). Closure scope so each registered instance
    // has isolated storage (one store per Fastify app instance).
    const memoryStore = new Map<string, Map<string, MemoryEntry>>();

    function wsMemory(wsId: string): Map<string, MemoryEntry> {
        if (!memoryStore.has(wsId)) memoryStore.set(wsId, new Map());
        return memoryStore.get(wsId)!;
    }

    // ── PUT /v1/workspaces/:wsId/work-memory ─────────────────────────────────
    app.put<{
        Params: { wsId: string };
        Body: { mergeMode?: 'replace' | 'merge'; entries?: MemoryEntry[]; summary?: string };
    }>('/v1/workspaces/:wsId/work-memory', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId } = req.params;
        const { mergeMode = 'merge', entries = [] } = req.body ?? {};

        const mem = wsMemory(wsId);
        if (mergeMode === 'replace') mem.clear();
        for (const e of entries) mem.set(e.key, e);

        return reply.status(200).send({ ok: true, entryCount: mem.size });
    });

    // ── GET /v1/workspaces/:wsId/next-actions ────────────────────────────────
    app.get<{ Params: { wsId: string } }>(
        '/v1/workspaces/:wsId/next-actions',
        async (req, reply) => {
            const session = opts.getSession();
            if (!session) return reply.status(401).send({ error: 'unauthenticated' });
            if (!session.workspaceIds.includes(req.params.wsId))
                return reply.status(403).send({ error: 'forbidden' });

            const { wsId } = req.params;
            const mem = wsMemory(wsId);
            const items: Array<{
                key: string;
                requiresApproval: boolean;
                status: string;
                priority: 'high' | 'medium' | 'low';
            }> = [];

            for (const [key, entry] of mem) {
                const status = typeof entry.value['status'] === 'string'
                    ? entry.value['status']
                    : '';
                const requiresApproval = status === 'pending_approval';
                const priority: 'high' | 'medium' | 'low' =
                    requiresApproval ? 'high' : status === 'failed' ? 'high' : 'medium';
                items.push({ key, requiresApproval, status, priority });
            }

            return reply.status(200).send({ items, workspaceId: wsId });
        },
    );

    // ── POST /v1/workspaces/:wsId/daily-plan ─────────────────────────────────
    app.post<{
        Params: { wsId: string };
        Body: { objective?: string; constraints?: string[] };
    }>('/v1/workspaces/:wsId/daily-plan', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId } = req.params;
        const { objective = '', constraints = [] } = req.body ?? {};
        const mem = wsMemory(wsId);

        // Derive approvals needed from memory entries with pending_approval status
        const approvalsNeeded: Array<{ key: string; reason: string; changeRef?: string }> = [];
        const blockedItems: string[] = [];

        for (const [key, entry] of mem) {
            const status = typeof entry.value['status'] === 'string'
                ? entry.value['status']
                : '';
            if (status === 'pending_approval') {
                approvalsNeeded.push({
                    key,
                    reason: `Entry "${key}" is in pending_approval state`,
                    changeRef: typeof entry.value['change'] === 'string'
                        ? entry.value['change']
                        : undefined,
                });
            }
            if (status === 'failed') blockedItems.push(key);
        }

        // If constraints mention approval, ensure at least one approval item is surfaced
        const constraintMentionsApproval = constraints.some((c) =>
            c.toLowerCase().includes('approval'),
        );
        if (constraintMentionsApproval && approvalsNeeded.length === 0) {
            approvalsNeeded.push({
                key: 'constraint_required_approval',
                reason: 'Approval required per task constraints',
            });
        }

        return reply.status(201).send({
            objective,
            constraints,
            approvalsNeeded,
            blockedItems,
            steps: [
                approvalsNeeded.length > 0 ? 'Obtain required approvals before proceeding' : null,
                blockedItems.length > 0 ? `Resolve ${blockedItems.length} failed item(s): ${blockedItems.join(', ')}` : null,
                objective ? `Work towards objective: ${objective}` : null,
            ].filter(Boolean),
        });
    });
}
