import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') ?? process.env.DASHBOARD_TENANT_ID ?? '';
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    if (!tenantId) {
        return NextResponse.json({
            period_start: from,
            period_end: to,
            total_tokens: 0,
            total_cost_usd: 0,
            total_invocations: 0,
            success_rate: 1.0,
            by_skill: [],
            by_provider: [],
            weekly_trend: [],
        });
    }

    const url = `${getApiBaseUrl()}/v1/billing/cost-summary?tenantId=${encodeURIComponent(tenantId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const res = await fetch(url, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
    });

    if (!res.ok) {
        return NextResponse.json(
            { error: 'upstream_error', message: 'Failed to fetch billing data.' },
            { status: res.status },
        );
    }

    const billing = await res.json() as {
        taskCount?: number;
        totalCostUsd?: number;
        totalPromptTokens?: number;
        totalCompletionTokens?: number;
    };

    return NextResponse.json({
        period_start: from,
        period_end: to,
        total_tokens: (billing.totalPromptTokens ?? 0) + (billing.totalCompletionTokens ?? 0),
        total_cost_usd: billing.totalCostUsd ?? 0,
        total_invocations: billing.taskCount ?? 0,
        success_rate: 1.0,
        by_skill: [],
        by_provider: [],
        weekly_trend: [],
    });
}
