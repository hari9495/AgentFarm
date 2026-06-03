import { getInternalSessionAuthHeader, getSessionPayload } from '../lib/internal-session';

type TaskRecord = {
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    modelProfile: string;
    executedAt: string;
};

type Insights = {
    taskCount: number;
    successCount: number;
    failedCount: number;
    approvalQueuedCount: number;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    topModelProfile: string | null;
    successRate: number | null;
};

const getApiBaseUrl = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function fetchInsights(botId: string, tenantId: string): Promise<Insights | null> {
    const auth = await getInternalSessionAuthHeader();
    if (!auth) return null;

    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date().toISOString();
    const url =
        `${getApiBaseUrl()}/v1/analytics/tasks` +
        `?botId=${encodeURIComponent(botId)}` +
        `&tenantId=${encodeURIComponent(tenantId)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}` +
        `&limit=100`;

    try {
        const res = await fetch(url, { headers: { Authorization: auth }, cache: 'no-store' });
        if (!res.ok) return null;
        const body = (await res.json()) as { tasks?: TaskRecord[]; total?: number };
        const tasks = body.tasks ?? [];

        const taskCount = body.total ?? tasks.length;
        const successCount = tasks.filter((t) => t.outcome === 'success').length;
        const failedCount = tasks.filter((t) => t.outcome === 'failed').length;
        const approvalQueuedCount = tasks.filter((t) => t.outcome === 'approval_queued').length;
        const totalCostUsd = tasks.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0);
        const avgLatencyMs = tasks.length > 0
            ? Math.round(tasks.reduce((s, t) => s + t.latencyMs, 0) / tasks.length)
            : null;

        const profileCounts: Record<string, number> = {};
        for (const t of tasks) {
            profileCounts[t.modelProfile] = (profileCounts[t.modelProfile] ?? 0) + 1;
        }
        const topModelProfile = Object.entries(profileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
            taskCount,
            successCount,
            failedCount,
            approvalQueuedCount,
            avgLatencyMs,
            totalCostUsd,
            topModelProfile,
            successRate: taskCount > 0 ? successCount / taskCount : null,
        };
    } catch {
        return null;
    }
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div style={{ display: 'grid', gap: '0.15rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: color ?? '#1d1d1f', lineHeight: 1 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: '0.72rem', color: '#78716c' }}>{sub}</div>}
        </div>
    );
}

export default async function AgentInsightsCard({ botId }: { botId: string }) {
    const session = await getSessionPayload();
    const tenantId = session?.tenantId;
    if (!tenantId) return null;

    const data = await fetchInsights(botId, tenantId);
    if (!data) {
        return (
            <section className="card">
                <h2>Insights — Last 30 Days</h2>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#78716c' }}>
                    No task data available yet for this agent.
                </p>
            </section>
        );
    }

    const fmtLatency = data.avgLatencyMs !== null
        ? data.avgLatencyMs >= 60_000
            ? `${(data.avgLatencyMs / 60_000).toFixed(1)} min`
            : `${(data.avgLatencyMs / 1000).toFixed(1)} s`
        : '—';

    const successPct = data.successRate !== null
        ? `${(data.successRate * 100).toFixed(1)}%`
        : '—';

    const successColor = data.successRate === null ? '#57534e'
        : data.successRate >= 0.9 ? '#1a7a4a'
        : data.successRate >= 0.7 ? '#b45309'
        : '#c4161c';

    return (
        <section className="card">
            <h2>Insights — Last 30 Days</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '0.85rem' }}>
                <Kpi label="Tasks run" value={data.taskCount.toLocaleString()} />
                <Kpi label="Success rate" value={successPct} color={successColor} />
                <Kpi label="Avg duration" value={fmtLatency} />
                <Kpi
                    label="Cost (30d)"
                    value={data.totalCostUsd < 0.01 ? '<$0.01' : `$${data.totalCostUsd.toFixed(2)}`}
                    color="#b45309"
                />
                <Kpi label="Failures" value={data.failedCount.toString()} color={data.failedCount > 0 ? '#c4161c' : '#1a7a4a'} />
                <Kpi label="Pending approval" value={data.approvalQueuedCount.toString()} sub="in queue" />
            </div>

            {/* Success bar */}
            {data.taskCount > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#78716c', marginBottom: '0.25rem' }}>
                        <span>{data.successCount} succeeded</span>
                        <span>{data.failedCount} failed · {data.approvalQueuedCount} queued</span>
                    </div>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ height: '100%', width: `${((data.successCount / data.taskCount) * 100).toFixed(1)}%`, background: '#1a7a4a', transition: 'width 0.4s' }} />
                        <div style={{ height: '100%', width: `${((data.approvalQueuedCount / data.taskCount) * 100).toFixed(1)}%`, background: '#b45309' }} />
                        <div style={{ height: '100%', width: `${((data.failedCount / data.taskCount) * 100).toFixed(1)}%`, background: '#c4161c' }} />
                    </div>
                </div>
            )}

            {data.topModelProfile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#57534e' }}>
                    <span style={{ fontWeight: 600 }}>Most-used model:</span>
                    <code style={{ fontFamily: 'ui-monospace, monospace', background: '#f3f4f6', padding: '0.1rem 0.35rem', borderRadius: '0.2rem' }}>
                        {data.topModelProfile}
                    </code>
                </div>
            )}
        </section>
    );
}
