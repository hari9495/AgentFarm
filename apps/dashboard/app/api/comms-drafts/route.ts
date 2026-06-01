import { NextResponse } from 'next/server';

type CommsStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';

type CommsDraft = {
    id: string;
    botId: string;
    commsType: string;
    subject: string;
    recipientCount: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: CommsStatus;
    scheduledAt?: string;
    createdAt: string;
    updatedAt: string;
};

declare global {
    // eslint-disable-next-line no-var
    var __commsDrafts: Map<string, CommsDraft> | undefined;
}

function getStore(): Map<string, CommsDraft> {
    if (!globalThis.__commsDrafts) {
        const now = new Date().toISOString();
        const seed: CommsDraft[] = [
            { id: 'co-001', botId: 'bot_ca_001', commsType: 'email', subject: 'Board Update — Q2 AI Agent Deployment', recipientCount: 12, priority: 'high', status: 'pending_review', createdAt: now, updatedAt: now },
            { id: 'co-002', botId: 'bot_ca_001', commsType: 'memo', subject: 'Internal: New Approval Workflow for AI Actions', recipientCount: 45, priority: 'normal', status: 'pending_review', createdAt: now, updatedAt: now },
            { id: 'co-003', botId: 'bot_ca_001', commsType: 'meeting_summary', subject: 'DevOps Sync — Jun 1 Action Items', recipientCount: 8, priority: 'normal', status: 'approved', createdAt: now, updatedAt: now },
            { id: 'co-004', botId: 'bot_ca_001', commsType: 'announcement', subject: 'Company-wide: AI Agent Platform Launch', recipientCount: 200, priority: 'urgent', status: 'sent', createdAt: now, updatedAt: now },
            { id: 'co-005', botId: 'bot_ca_001', commsType: 'proposal', subject: 'Vendor Evaluation: LLM Provider Comparison', recipientCount: 5, priority: 'low', status: 'rejected', createdAt: now, updatedAt: now },
        ];
        globalThis.__commsDrafts = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__commsDrafts;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const store = getStore();
    let drafts = Array.from(store.values());
    if (statusFilter) drafts = drafts.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: drafts.length, drafts });
}
