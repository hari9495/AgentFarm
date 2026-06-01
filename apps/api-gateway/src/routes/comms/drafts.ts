import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: string;
    expiresAt: number;
};

type CommsStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';
type CommsType = 'email' | 'memo' | 'meeting_summary' | 'announcement' | 'report' | 'proposal';

type CommsDraft = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    commsType: CommsType;
    subject: string;
    body: string;
    recipientCount: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: CommsStatus;
    scheduledAt?: string;
    createdAt: string;
    updatedAt: string;
};

type RegisterCommsDraftRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

const store = new Map<string, CommsDraft>();

const seed = (tenantId: string, workspaceId: string) => {
    if (store.size > 0) return;
    const now = new Date().toISOString();
    const drafts: Omit<CommsDraft, 'id'>[] = [
        { tenantId, workspaceId, botId: 'bot_ca_001', commsType: 'email', subject: 'Board Update — Q2 AI Agent Deployment', body: '', recipientCount: 12, priority: 'high', status: 'pending_review', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_ca_001', commsType: 'memo', subject: 'Internal: New Approval Workflow for AI Actions', body: '', recipientCount: 45, priority: 'normal', status: 'pending_review', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_ca_001', commsType: 'meeting_summary', subject: 'DevOps Sync — Jun 1 Action Items', body: '', recipientCount: 8, priority: 'normal', status: 'approved', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_ca_001', commsType: 'announcement', subject: 'Company-wide: AI Agent Platform Launch', body: '', recipientCount: 200, priority: 'urgent', status: 'sent', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_ca_001', commsType: 'proposal', subject: 'Vendor Evaluation: LLM Provider Comparison', body: '', recipientCount: 5, priority: 'low', status: 'rejected', createdAt: now, updatedAt: now },
    ];
    for (const d of drafts) { const id = randomUUID(); store.set(id, { ...d, id }); }
};

export const registerCommsDraftRoutes = (
    app: FastifyInstance,
    options: RegisterCommsDraftRoutesOptions,
): void => {
    const getSession = (req: FastifyRequest) => options.getSession(req);
    const checkAccess = (session: SessionContext, workspaceId: string) =>
        session.scope === 'internal' || session.workspaceIds.includes(workspaceId);

    // GET /v1/comms/drafts
    app.get<{ Querystring: { workspace_id?: string; status?: string; limit?: string } }>(
        '/v1/comms/drafts',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const workspaceId = request.query.workspace_id?.trim() ?? session.workspaceIds[0] ?? '';
            if (!checkAccess(session, workspaceId)) return reply.code(403).send({ error: 'forbidden' });

            seed(session.tenantId, workspaceId);

            let results = Array.from(store.values()).filter(
                d => d.tenantId === session.tenantId && d.workspaceId === workspaceId,
            );
            if (request.query.status) results = results.filter(d => d.status === request.query.status);
            const limit = parseInt(request.query.limit ?? '50', 10);
            return reply.send({ total: results.length, drafts: results.slice(0, limit) });
        },
    );

    // POST /v1/comms/drafts/:id/approve
    app.post<{ Params: { id: string } }>('/v1/comms/drafts/:id/approve', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        const updated = { ...draft, status: 'approved' as CommsStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });

    // POST /v1/comms/drafts/:id/reject
    app.post<{ Params: { id: string } }>('/v1/comms/drafts/:id/reject', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        const updated = { ...draft, status: 'rejected' as CommsStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });

    // POST /v1/comms/drafts/:id/send
    app.post<{ Params: { id: string } }>('/v1/comms/drafts/:id/send', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        if (draft.status !== 'approved') return reply.code(400).send({ error: 'must_be_approved_first' });
        const updated = { ...draft, status: 'sent' as CommsStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });
};
