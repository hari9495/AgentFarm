import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: string;
    expiresAt: number;
};

type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'published';
type DraftType = 'blog_post' | 'social_post' | 'email_campaign' | 'technical_doc' | 'api_doc' | 'runbook' | 'release_note';

type ContentDraft = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    agentRole: string;
    draftType: DraftType;
    title: string;
    excerpt: string;
    body: string;
    wordCount: number;
    status: DraftStatus;
    targetChannel?: string;
    createdAt: string;
    updatedAt: string;
};

type RegisterContentDraftRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

const store = new Map<string, ContentDraft>();

const seed = (tenantId: string, workspaceId: string) => {
    if (store.size > 0) return;
    const now = new Date().toISOString();
    const drafts: Omit<ContentDraft, 'id'>[] = [
        { tenantId, workspaceId, botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'blog_post', title: 'How AI Agents Are Transforming DevOps', excerpt: 'AI-driven pipelines are changing how teams ship software. Here\'s what that looks like in practice.', body: '', wordCount: 1240, status: 'pending_review', targetChannel: 'company-blog', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_tw_001', agentRole: 'technical_writer', draftType: 'runbook', title: 'CI Triage Runbook v2', excerpt: 'Step-by-step guide for triaging CI failures using the AgentFarm triage panel.', body: '', wordCount: 890, status: 'pending_review', targetChannel: 'internal-docs', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'social_post', title: 'Product Launch Announcement — v2.4', excerpt: 'Excited to share our latest release featuring 11 new DevOps hub capabilities for AI agent oversight.', body: '', wordCount: 145, status: 'approved', targetChannel: 'linkedin', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_tw_001', agentRole: 'technical_writer', draftType: 'api_doc', title: 'CI Failures API Reference', excerpt: 'Complete reference for the CI triage intake and reporting endpoints.', body: '', wordCount: 2100, status: 'published', targetChannel: 'developer-portal', createdAt: now, updatedAt: now },
        { tenantId, workspaceId, botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'email_campaign', title: 'Q2 Customer Newsletter Draft', excerpt: 'This quarter we shipped major improvements to agent observability and the DevOps hub.', body: '', wordCount: 620, status: 'rejected', targetChannel: 'email', createdAt: now, updatedAt: now },
    ];
    for (const d of drafts) store.set(randomUUID(), { ...d, id: randomUUID() });
    // fix id alignment
    store.clear();
    for (const d of drafts) { const id = randomUUID(); store.set(id, { ...d, id }); }
};

export const registerContentDraftRoutes = (
    app: FastifyInstance,
    options: RegisterContentDraftRoutesOptions,
): void => {
    const getSession = (req: FastifyRequest) => options.getSession(req);
    const checkAccess = (session: SessionContext, workspaceId: string) =>
        session.scope === 'internal' || session.workspaceIds.includes(workspaceId);

    // GET /v1/content/drafts
    app.get<{ Querystring: { workspace_id?: string; status?: string; limit?: string } }>(
        '/v1/content/drafts',
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

    // POST /v1/content/drafts/:id/approve
    app.post<{ Params: { id: string } }>('/v1/content/drafts/:id/approve', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        const updated = { ...draft, status: 'approved' as DraftStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });

    // POST /v1/content/drafts/:id/reject
    app.post<{ Params: { id: string } }>('/v1/content/drafts/:id/reject', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        const updated = { ...draft, status: 'rejected' as DraftStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });

    // POST /v1/content/drafts/:id/publish
    app.post<{ Params: { id: string } }>('/v1/content/drafts/:id/publish', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const draft = store.get(request.params.id);
        if (!draft || draft.tenantId !== session.tenantId) return reply.code(404).send({ error: 'not_found' });
        if (draft.status !== 'approved') return reply.code(400).send({ error: 'must_be_approved_first' });
        const updated = { ...draft, status: 'published' as DraftStatus, updatedAt: new Date().toISOString() };
        store.set(draft.id, updated);
        return reply.send(updated);
    });
};
