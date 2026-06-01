import { NextResponse } from 'next/server';

// In-memory store — persists across requests in dev (Next.js dev server is not serverless)
type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'published';

type ContentDraft = {
    id: string;
    botId: string;
    agentRole: string;
    draftType: string;
    title: string;
    excerpt: string;
    wordCount: number;
    status: DraftStatus;
    targetChannel: string;
    createdAt: string;
    updatedAt: string;
};

declare global {
    // eslint-disable-next-line no-var
    var __contentDrafts: Map<string, ContentDraft> | undefined;
}

function getStore(): Map<string, ContentDraft> {
    if (!globalThis.__contentDrafts) {
        const now = new Date().toISOString();
        const seed: ContentDraft[] = [
            { id: 'cd-001', botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'blog_post', title: 'How AI Agents Are Transforming DevOps', excerpt: "AI-driven pipelines are changing how teams ship software. Here's what that looks like in practice.", wordCount: 1240, status: 'pending_review', targetChannel: 'company-blog', createdAt: now, updatedAt: now },
            { id: 'cd-002', botId: 'bot_tw_001', agentRole: 'technical_writer', draftType: 'runbook', title: 'CI Triage Runbook v2', excerpt: 'Step-by-step guide for triaging CI failures using the AgentFarm triage panel.', wordCount: 890, status: 'pending_review', targetChannel: 'internal-docs', createdAt: now, updatedAt: now },
            { id: 'cd-003', botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'social_post', title: 'Product Launch — v2.4', excerpt: 'Excited to share our latest release with 11 new DevOps hub capabilities for AI agent oversight.', wordCount: 145, status: 'approved', targetChannel: 'linkedin', createdAt: now, updatedAt: now },
            { id: 'cd-004', botId: 'bot_tw_001', agentRole: 'technical_writer', draftType: 'api_doc', title: 'CI Failures API Reference', excerpt: 'Complete reference for the CI triage intake and reporting endpoints.', wordCount: 2100, status: 'published', targetChannel: 'developer-portal', createdAt: now, updatedAt: now },
            { id: 'cd-005', botId: 'bot_cw_001', agentRole: 'content_writer', draftType: 'email_campaign', title: 'Q2 Customer Newsletter Draft', excerpt: 'This quarter we shipped major improvements to agent observability and the DevOps hub.', wordCount: 620, status: 'rejected', targetChannel: 'email', createdAt: now, updatedAt: now },
        ];
        globalThis.__contentDrafts = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__contentDrafts;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const store = getStore();
    let drafts = Array.from(store.values());
    if (statusFilter) drafts = drafts.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: drafts.length, drafts });
}
