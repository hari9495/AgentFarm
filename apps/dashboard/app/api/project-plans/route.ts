import { NextResponse } from 'next/server';

type PlanStatus = 'draft' | 'in_review' | 'approved' | 'active' | 'completed' | 'on_hold';
type PlanType = 'sprint_plan' | 'project_roadmap' | 'risk_register' | 'retrospective' | 'release_plan' | 'backlog_refinement';

type ProjectPlan = {
    id: string; botId: string; planType: PlanType; title: string;
    teamSize: number; durationDays: number; status: PlanStatus;
    riskLevel: 'low' | 'medium' | 'high'; createdAt: string;
};

declare global { var __projectPlans: Map<string, ProjectPlan> | undefined; }

function getStore(): Map<string, ProjectPlan> {
    if (!globalThis.__projectPlans) {
        const now = new Date().toISOString();
        const seed: ProjectPlan[] = [
            { id: 'pp-001', botId: 'bot_pm_001', planType: 'sprint_plan', title: 'Sprint 24 — DevOps Hub Features', teamSize: 6, durationDays: 14, status: 'in_review', riskLevel: 'medium', createdAt: now },
            { id: 'pp-002', botId: 'bot_pm_001', planType: 'project_roadmap', title: 'Q3 2026 Product Roadmap', teamSize: 12, durationDays: 90, status: 'in_review', riskLevel: 'high', createdAt: now },
            { id: 'pp-003', botId: 'bot_pm_001', planType: 'risk_register', title: 'Platform Risk Register — June 2026', teamSize: 4, durationDays: 30, status: 'approved', riskLevel: 'high', createdAt: now },
            { id: 'pp-004', botId: 'bot_pm_001', planType: 'retrospective', title: 'Sprint 23 Retrospective', teamSize: 6, durationDays: 1, status: 'completed', riskLevel: 'low', createdAt: now },
            { id: 'pp-005', botId: 'bot_pm_001', planType: 'release_plan', title: 'v2.4 Release Plan', teamSize: 8, durationDays: 21, status: 'active', riskLevel: 'medium', createdAt: now },
        ];
        globalThis.__projectPlans = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__projectPlans;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    let items = Array.from(getStore().values());
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: items.length, plans: items });
}
