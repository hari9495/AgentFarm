import { NextResponse } from 'next/server';

type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';
type CampaignChannel = 'email' | 'social' | 'paid_search' | 'display' | 'content' | 'seo';
type Campaign = { id: string; name: string; channel: CampaignChannel; targetAudience: string; budgetUsd: number; status: CampaignStatus; impressions?: number; clicks?: number; conversions?: number; startDate?: string; endDate?: string; createdAt: string; };
// eslint-disable-next-line no-var
declare global { var __campaigns: Map<string, Campaign> | undefined; }

const TRANSITIONS: Record<string, CampaignStatus> = {
    approve: 'approved', reject: 'rejected', pause: 'paused', resume: 'active',
};

export async function POST(_req: Request, { params }: { params: Promise<{ campaignId: string; action: string }> }): Promise<Response> {
    const { campaignId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    const store = globalThis.__campaigns;
    if (!store) return NextResponse.json({ error: 'not_initialised' }, { status: 500 });
    const item = store.get(campaignId);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const updated = { ...item, status: newStatus };
    store.set(campaignId, updated);
    return NextResponse.json(updated);
}
