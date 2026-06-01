import { NextResponse } from 'next/server';

type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';
type CampaignChannel = 'email' | 'social' | 'paid_search' | 'display' | 'content' | 'seo';

type Campaign = {
    id: string; name: string; channel: CampaignChannel;
    targetAudience: string; budgetUsd: number; status: CampaignStatus;
    impressions?: number; clicks?: number; conversions?: number;
    startDate?: string; endDate?: string; createdAt: string;
};

declare global { var __campaigns: Map<string, Campaign> | undefined; }

function getStore(): Map<string, Campaign> {
    if (!globalThis.__campaigns) {
        const now = new Date().toISOString();
        const seed: Campaign[] = [
            { id: 'ca-001', name: 'DevOps Hub Launch — LinkedIn', channel: 'social', targetAudience: 'Engineering Leaders, CTOs', budgetUsd: 5000, status: 'pending_approval', startDate: '2026-06-15', endDate: '2026-07-15', createdAt: now },
            { id: 'ca-002', name: 'Q3 Demand Gen — Email Series', channel: 'email', targetAudience: 'Mid-market DevOps teams', budgetUsd: 2000, status: 'pending_approval', startDate: '2026-07-01', endDate: '2026-07-31', createdAt: now },
            { id: 'ca-003', name: 'AI Agents Whitepaper — Paid Search', channel: 'paid_search', targetAudience: 'Enterprise IT Decision Makers', budgetUsd: 8000, status: 'active', impressions: 145000, clicks: 3200, conversions: 47, startDate: '2026-06-01', endDate: '2026-06-30', createdAt: now },
            { id: 'ca-004', name: 'Product Hunt Launch — Social', channel: 'social', targetAudience: 'Developers, early adopters', budgetUsd: 1500, status: 'approved', startDate: '2026-06-20', createdAt: now },
            { id: 'ca-005', name: 'Agency Partnership — Content Series', channel: 'content', targetAudience: 'Agencies, MSPs', budgetUsd: 12000, status: 'rejected', createdAt: now },
            { id: 'ca-006', name: 'May Newsletter — Customer Retention', channel: 'email', targetAudience: 'Existing customers', budgetUsd: 500, status: 'completed', impressions: 8200, clicks: 920, conversions: 61, createdAt: now },
        ];
        globalThis.__campaigns = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__campaigns;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    let items = Array.from(getStore().values());
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: items.length, campaigns: items });
}
