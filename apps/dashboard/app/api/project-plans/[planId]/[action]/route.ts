import { NextResponse } from 'next/server';

type PlanStatus = 'draft' | 'in_review' | 'approved' | 'active' | 'completed' | 'on_hold';
declare global { var __projectPlans: Map<string, { id: string; status: PlanStatus; [k: string]: unknown }> | undefined; }

const TRANSITIONS: Record<string, PlanStatus> = { approve: 'approved', reject: 'on_hold' };

export async function POST(_req: Request, { params }: { params: Promise<{ planId: string; action: string }> }): Promise<Response> {
    const { planId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    const store = globalThis.__projectPlans;
    if (!store) return NextResponse.json({ error: 'not_initialised' }, { status: 500 });
    const item = store.get(planId);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const updated = { ...item, status: newStatus };
    store.set(planId, updated);
    return NextResponse.json(updated);
}
