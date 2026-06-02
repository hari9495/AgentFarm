import { NextResponse } from 'next/server';

type PlanStatus = 'draft' | 'in_review' | 'approved' | 'active' | 'completed' | 'on_hold';
type PlanType = 'sprint_plan' | 'project_roadmap' | 'risk_register' | 'retrospective' | 'release_plan' | 'backlog_refinement';
type ProjectPlan = { id: string; botId: string; planType: PlanType; title: string; teamSize: number; durationDays: number; status: PlanStatus; riskLevel: 'low' | 'medium' | 'high'; createdAt: string; };
// eslint-disable-next-line no-var
declare global { var __projectPlans: Map<string, ProjectPlan> | undefined; }

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
