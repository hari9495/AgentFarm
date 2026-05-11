import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader, getSessionPayload } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type UpstreamCostSummary = {
    taskCount: number;
    totalCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    successRate: number | null;
    byProvider: Array<{ provider: string; taskCount: number; totalCostUsd: number; avgLatencyMs: number }>;
    weeklyTrend: Array<{ weekStart: string; taskCount: number; successCount: number; totalCostUsd: number }>;
    from: string;
    to: string;
};

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) {
        return NextResponse.json(
            { error: 'bad_request', message: 'tenantId required.' },
            { status: 400 },
        );
    }

    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') ?? new Date().toISOString();
    const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let res: Response;
    try {
        res = await fetch(
            `${getApiBaseUrl()}/v1/analytics/cost-summary?tenantId=${encodeURIComponent(tenantId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
    } catch {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to reach analytics service.' },
            { status: 502 },
        );
    }

    if (!res.ok) {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to fetch analytics data.' },
            { status: 502 },
        );
    }

    const upstream = await res.json() as UpstreamCostSummary;

    return NextResponse.json({
        period_start: upstream.from,
        period_end: upstream.to,
        total_tokens: upstream.totalPromptTokens + upstream.totalCompletionTokens,
        total_cost_usd: upstream.totalCostUsd,
        total_invocations: upstream.taskCount,
        success_rate: upstream.successRate ?? 0,
        by_skill: [],
        by_provider: upstream.byProvider.map((p) => ({
            provider: p.provider,
            tokens_used: 0,
            estimated_cost_usd: p.totalCostUsd,
        })),
        weekly_trend: upstream.weeklyTrend.map((w) => ({
            week: w.weekStart,
            tokens_used: 0,
            invocations: w.taskCount,
            cost_usd: w.totalCostUsd,
        })),
    });
}
