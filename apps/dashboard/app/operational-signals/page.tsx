import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import {
    OperationalSignalTimeline,
    type OperationalSignalTimelinePoint,
} from '../components/operational-signal-timeline';
import { AuditUpgradeWall } from '../components/audit-upgrade-wall';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import { fetchAuditAccess } from '../lib/plan-gate.server';

const API_BASE = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function loadSignals(
    workspaceId: string,
): Promise<{ points: OperationalSignalTimelinePoint[]; source: 'live' | 'fallback' }> {
    if (!workspaceId) return { points: [], source: 'fallback' };
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return { points: [], source: 'fallback' };
    try {
        const res = await fetch(
            `${API_BASE()}/v1/dashboard/workspace/${encodeURIComponent(workspaceId)}/historical-metrics?window=12h&bucket=1h`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        if (!res.ok) return { points: [], source: 'fallback' };

        type Sample = { at: string; signal_count: number };
        const data = (await res.json()) as {
            points?: Sample[];
            metrics?: Sample[];
            timeline?: Sample[];
        };
        const raw = data.points ?? data.metrics ?? data.timeline ?? [];
        const points = raw
            .map((s) => {
                const ts = new Date(s.at).getTime();
                if (!Number.isFinite(ts)) return null;
                return {
                    label: new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                    value: Math.max(0, Math.round(Number(s.signal_count) || 0)),
                    timestamp: ts,
                };
            })
            .filter((p): p is OperationalSignalTimelinePoint => p !== null)
            .sort((a, b) => a.timestamp - b.timestamp);
        return { points, source: 'live' };
    } catch {
        return { points: [], source: 'fallback' };
    }
}

export default async function OperationalSignalsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/operational-signals');

    const { planName, access } = await fetchAuditAccess();
    if (!access) {
        return (
            <main className="page-shell">
                <PageHeader eyebrow="Audit & Compliance" title="Operational Signal Timeline" tone="violet" />
                <AuditUpgradeWall planName={planName} />
            </main>
        );
    }

    const workspaceId = session.workspaceIds?.[0] ?? '';
    const { points, source } = await loadSignals(workspaceId);

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Audit & Compliance"
                title="Operational Signal Timeline"
                description="12-hour telemetry across approvals, runtime, and audit channels — annotated with anomaly spikes and trend forecasts."
                tone="violet"
            />
            <OperationalSignalTimeline points={points} source={source} />
        </main>
    );
}
