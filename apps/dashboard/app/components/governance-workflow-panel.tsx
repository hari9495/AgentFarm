'use client';

import { useEffect, useMemo, useState } from 'react';

type GovernanceDiagnostics = {
    tenantId: string;
    workspaceId: string;
    generatedAt: string;
    workflowSlaSeconds: number;
    pendingWorkflows: number;
    overdueWorkflows: number;
    bottleneckStageId?: string;
    bottleneckStagePendingCount: number;
    avgStageLatencySeconds: number;
};

type Props = {
    workspaceId: string;
};

export function GovernanceWorkflowPanel({ workspaceId }: Props) {
    const [diagnostics, setDiagnostics] = useState<GovernanceDiagnostics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const run = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/approvals/governance/diagnostics?workspace_id=${encodeURIComponent(workspaceId)}`, {
                    method: 'GET',
                    cache: 'no-store',
                });

                const body = (await response.json().catch(() => ({}))) as GovernanceDiagnostics & { error?: string; message?: string };
                if (!response.ok) {
                    if (!active) return;
                    setError(body.message ?? body.error ?? 'Failed to load governance diagnostics.');
                    return;
                }

                if (active) {
                    setDiagnostics(body);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void run();
        return () => {
            active = false;
        };
    }, [workspaceId]);

    const slaHealth = useMemo(() => {
        if (!diagnostics) return 'n/a';
        if (diagnostics.overdueWorkflows === 0) return 'healthy';
        if (diagnostics.overdueWorkflows <= 2) return 'watch';
        return 'degraded';
    }, [diagnostics]);

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <h2>Governance Workflow Diagnostics</h2>
            <p style={{ margin: '-0.4rem 0 0.7rem', fontSize: '0.84rem', color: '#57534e' }}>
                Org-level approval workflow SLA and bottleneck visibility for workspace governance.
            </p>

            {loading && <p style={{ fontSize: '0.88rem' }}>Loading governance diagnostics…</p>}
            {error && <p className="message-inline">{error}</p>}

            {diagnostics && !loading && !error && (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                        <div className="card" style={{ padding: '0.7rem' }}>
                            <strong>{diagnostics.pendingWorkflows}</strong>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>Pending workflows</p>
                        </div>
                        <div className="card" style={{ padding: '0.7rem' }}>
                            <strong>{diagnostics.overdueWorkflows}</strong>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>Overdue workflows</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.86rem' }}>
                        <div>
                            SLA health: <strong>{slaHealth}</strong> (target {diagnostics.workflowSlaSeconds}s)
                        </div>
                        <div>
                            Bottleneck stage: <strong>{diagnostics.bottleneckStageId ?? 'none'}</strong> ({diagnostics.bottleneckStagePendingCount} queued)
                        </div>
                        <div>
                            Average stage latency: <strong>{diagnostics.avgStageLatencySeconds}s</strong>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
