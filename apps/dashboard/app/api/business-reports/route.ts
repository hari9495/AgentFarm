import { NextResponse } from 'next/server';

type ReportStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
type ReportType = 'brd' | 'market_analysis' | 'stakeholder_report' | 'feasibility_study' | 'gap_analysis' | 'requirements_spec';

type BusinessReport = {
    id: string; botId: string; reportType: ReportType; title: string;
    summary: string; pageCount: number; status: ReportStatus;
    requestedBy?: string; createdAt: string;
};

declare global { var __businessReports: Map<string, BusinessReport> | undefined; }

function getStore(): Map<string, BusinessReport> {
    if (!globalThis.__businessReports) {
        const now = new Date().toISOString();
        const seed: BusinessReport[] = [
            { id: 'br-001', botId: 'bot_ba_001', reportType: 'brd', title: 'AI Agent Governance Platform — BRD v1.2', summary: 'Business requirements for the enterprise agent oversight platform covering approval workflows, audit trails, and SLA enforcement.', pageCount: 28, status: 'pending_review', requestedBy: 'CTO', createdAt: now },
            { id: 'br-002', botId: 'bot_ba_001', reportType: 'market_analysis', title: 'AI DevOps Tools Market Analysis Q2 2026', summary: 'Sizing the AI-native DevOps automation market. Identifies 3 acquisition targets and 2 build-vs-buy decisions.', pageCount: 44, status: 'pending_review', requestedBy: 'VP Product', createdAt: now },
            { id: 'br-003', botId: 'bot_ba_001', reportType: 'feasibility_study', title: 'Multi-Tenant Agent Isolation — Feasibility Study', summary: 'Technical and commercial feasibility of strict per-tenant agent isolation for regulated industries.', pageCount: 19, status: 'approved', requestedBy: 'Security Lead', createdAt: now },
            { id: 'br-004', botId: 'bot_ba_001', reportType: 'stakeholder_report', title: 'Board Pack — Q2 AI Deployment Progress', summary: 'Executive summary of AI agent deployment metrics, cost savings realised, and risks for the board.', pageCount: 12, status: 'approved', requestedBy: 'CEO', createdAt: now },
            { id: 'br-005', botId: 'bot_ba_001', reportType: 'gap_analysis', title: 'Competitor Feature Gap Analysis — v3', summary: 'Detailed comparison of 7 competing platforms across 34 feature dimensions. Highlights 5 differentiators.', pageCount: 36, status: 'rejected', requestedBy: 'VP Sales', createdAt: now },
        ];
        globalThis.__businessReports = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__businessReports;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    let items = Array.from(getStore().values());
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: items.length, reports: items });
}
