import { NextResponse } from "next/server";
import { getPortalSessionFromRequest, extractPortalTokenFromRequest } from "@/lib/portal-api-auth";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

interface UsageData {
    totalTasks: number;
    successRate: number;
    totalCostUsd: number;
    tasksByDay: Array<{ date: string; count: number }>;
}

interface AgentUsageStat {
    botId: string;
    botRole: string;
    taskCount: number;
    successRate: number;
    totalCostUsd: number;
}

function buildTrend(tasksByDay: Array<{ date: string; count: number }>): number[] {
    const byDate = new Map(tasksByDay.map((d) => [d.date, d.count]));
    const trend: number[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0]!;
        trend.push(byDate.get(key) ?? 0);
    }
    return trend;
}

function deltaLabel(trend: number[]): { delta: string | null; positive: boolean } {
    const today = trend[trend.length - 1] ?? 0;
    const prev = trend[trend.length - 2] ?? 0;
    if (prev === 0) return { delta: null, positive: true };
    const pct = Math.round(((today - prev) / prev) * 100);
    return {
        delta: pct >= 0 ? `+${pct}%` : `${pct}%`,
        positive: pct >= 0,
    };
}

const EMPTY_STATS = {
    source: "live" as const,
    generatedAt: Date.now(),
    stats: {
        tasksCompleted:  { value: 0, label: "0",  delta: null, positive: true, trend: Array(7).fill(0) as number[], sub: "Last 30 days" },
        prsMerged:       { value: 0, label: "—",  delta: null, positive: true, trend: Array(7).fill(0) as number[], sub: "Git integration pending" },
        medianCycleTime: { value: 0, label: "—",  delta: null, positive: true, trend: Array(7).fill(0) as number[], sub: "No task data yet" },
        estimatedSavings:{ value: 0, label: "—",  delta: null, positive: true, trend: Array(7).fill(0) as number[], sub: "Based on task volume" },
    },
};

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const token = extractPortalTokenFromRequest(request);
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agent");

    try {
        const [usageRes, agentUsageRes] = await Promise.all([
            fetch(`${GATEWAY_URL}/portal/data/usage`, {
                headers: { cookie: `portal_session=${token}` },
                cache: "no-store",
            }),
            fetch(`${GATEWAY_URL}/portal/data/usage/agents`, {
                headers: { cookie: `portal_session=${token}` },
                cache: "no-store",
            }),
        ]);

        if (!usageRes.ok) {
            return NextResponse.json(EMPTY_STATS);
        }

        const usage = (await usageRes.json()) as UsageData;
        const agentUsageData = agentUsageRes.ok
            ? ((await agentUsageRes.json()) as { agents: AgentUsageStat[] })
            : null;

        // If a specific agent is selected, scope stats to that agent
        const agentStat = agentId && agentUsageData
            ? agentUsageData.agents.find((a) => a.botId === agentId) ?? null
            : null;

        const taskCount = agentStat ? agentStat.taskCount : (usage.totalTasks ?? 0);
        const successRate = agentStat ? agentStat.successRate : (usage.successRate ?? 100);
        const costUsd = agentStat ? agentStat.totalCostUsd : (usage.totalCostUsd ?? 0);
        const trend = buildTrend(usage.tasksByDay ?? []);
        const { delta, positive } = deltaLabel(trend);

        // Estimated savings: industry benchmark ~$50/hr human cost, ~0.5h saved per task
        const savingsRaw = Math.round(taskCount * 25 - costUsd);
        const savings = Math.max(0, savingsRaw);
        const savingsTrend = trend.map((t) => Math.max(0, Math.round(t * 25)));

        return NextResponse.json({
            source: "live",
            generatedAt: Date.now(),
            stats: {
                tasksCompleted: {
                    value: taskCount,
                    label: String(taskCount),
                    delta,
                    positive,
                    trend,
                    sub: "Last 30 days",
                },
                prsMerged: {
                    value: 0,
                    label: "—",
                    delta: null,
                    positive: true,
                    trend: Array(7).fill(0) as number[],
                    sub: "Git integration pending",
                },
                medianCycleTime: {
                    value: successRate,
                    label: `${Math.round(successRate)}%`,
                    delta: null,
                    positive: successRate >= 95,
                    trend: Array(7).fill(Math.round(successRate)) as number[],
                    sub: "Task success rate",
                },
                estimatedSavings: {
                    value: savings,
                    label: savings > 0 ? `$${savings.toLocaleString()}` : "—",
                    delta: null,
                    positive: true,
                    trend: savingsTrend,
                    sub: "Est. value delivered",
                },
            },
        });
    } catch {
        return NextResponse.json(EMPTY_STATS);
    }
}
