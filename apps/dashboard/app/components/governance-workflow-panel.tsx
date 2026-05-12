'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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

type WorkflowInstance = {
    id: string;
    templateId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionId: string;
    actionSummary: string;
    riskLevel: string;
    status: string;
    currentStageId: string;
    currentStageIndex: number;
    assignedApproverIds: string[];
    correlationId: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
};

type DecisionRecord = {
    id: string;
    workflowId: string;
    stageId: string;
    approverId: string;
    decision: string;
    reasonCode?: string;
    reasonText?: string;
    evidenceLinks?: string[];
    decidedAt: string;
};

type WorkflowDetail = {
    workflow: WorkflowInstance;
    decisions: DecisionRecord[];
};

type Props = {
    workspaceId: string;
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#854d0e' },
    in_review: { bg: '#dbeafe', color: '#1d4ed8' },
    approved: { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
    timed_out: { bg: '#f1f5f9', color: '#475569' },
};

const RISK_BADGE: Record<string, { bg: string; color: string }> = {
    low: { bg: '#dcfce7', color: '#166534' },
    medium: { bg: '#fef9c3', color: '#854d0e' },
    high: { bg: '#fee2e2', color: '#991b1b' },
};

const Badge = ({ label, style }: { label: string; style: { bg: string; color: string } }) => (
    <span
        style={{
            display: 'inline-block',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: style.bg,
            color: style.color,
            letterSpacing: '0.03em',
        }}
    >
        {label}
    </span>
);

export function GovernanceWorkflowPanel({ workspaceId }: Props) {
    const [diagnostics, setDiagnostics] = useState<GovernanceDiagnostics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
    const [workflowsLoading, setWorkflowsLoading] = useState(true);
    const [workflowsError, setWorkflowsError] = useState<string | null>(null);

    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        let active = true;

        const run = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    `/api/approvals/governance/diagnostics?workspace_id=${encodeURIComponent(workspaceId)}`,
                    { method: 'GET', cache: 'no-store' },
                );

                const body = (await response.json().catch(() => ({}))) as GovernanceDiagnostics & {
                    error?: string;
                    message?: string;
                };
                if (!response.ok) {
                    if (!active) return;
                    setError(body.message ?? body.error ?? 'Failed to load governance diagnostics.');
                    return;
                }

                if (active) setDiagnostics(body);
            } finally {
                if (active) setLoading(false);
            }
        };

        void run();
        return () => { active = false; };
    }, [workspaceId]);

    const fetchWorkflows = useCallback(async () => {
        setWorkflowsLoading(true);
        setWorkflowsError(null);
        try {
            const res = await fetch(
                `/api/governance/workflows?workspace_id=${encodeURIComponent(workspaceId)}`,
                { cache: 'no-store' },
            );
            const data = (await res.json().catch(() => ({}))) as {
                workflows?: WorkflowInstance[];
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setWorkflowsError(data.message ?? data.error ?? 'Failed to load workflows.');
            } else {
                setWorkflows(data.workflows ?? []);
            }
        } catch {
            setWorkflowsError('Network error loading workflows.');
        } finally {
            setWorkflowsLoading(false);
        }
    }, [workspaceId]);

    const fetchWorkflowDetail = useCallback(async (workflowId: string) => {
        setSelectedWorkflowId(workflowId);
        setDetailLoading(true);
        setWorkflowDetail(null);
        try {
            const res = await fetch(
                `/api/governance/workflows/${encodeURIComponent(workflowId)}`,
                { cache: 'no-store' },
            );
            const data = (await res.json().catch(() => ({}))) as WorkflowDetail & {
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setWorkflowsError(data.message ?? data.error ?? 'Failed to load workflow detail.');
            } else {
                setWorkflowDetail(data);
            }
        } catch {
            setWorkflowsError('Network error loading workflow detail.');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchWorkflows();
    }, [fetchWorkflows]);

    const slaHealth = useMemo(() => {
        if (!diagnostics) return 'n/a';
        if (diagnostics.overdueWorkflows === 0) return 'healthy';
        if (diagnostics.overdueWorkflows <= 2) return 'watch';
        return 'degraded';
    }, [diagnostics]);

    const TH: React.CSSProperties = {
        padding: '0.5rem 0.75rem',
        color: 'var(--ink-muted)',
        fontWeight: 500,
        textAlign: 'left',
        fontSize: '0.8rem',
    };
    const TD: React.CSSProperties = { padding: '0.55rem 0.75rem', fontSize: '0.85rem' };
    const TD_MUTED: React.CSSProperties = {
        padding: '0.55rem 0.75rem',
        color: 'var(--ink-muted)',
        fontSize: '0.8rem',
    };

    const selectedWorkflow = workflowDetail?.workflow ?? null;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Diagnostics panel */}
            <section className="card" style={{ marginTop: '1rem' }}>
                <h2>Governance Workflow Diagnostics</h2>
                <p style={{ margin: '-0.4rem 0 0.7rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
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
                                Bottleneck stage:{' '}
                                <strong>{diagnostics.bottleneckStageId ?? 'none'}</strong> (
                                {diagnostics.bottleneckStagePendingCount} queued)
                            </div>
                            <div>
                                Average stage latency:{' '}
                                <strong>{diagnostics.avgStageLatencySeconds}s</strong>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Workflow list panel */}
            <section className="card">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                    }}
                >
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                        Workflows
                    </h2>
                    <button
                        onClick={() => void fetchWorkflows()}
                        style={{
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.8rem',
                            border: '1px solid var(--line)',
                            borderRadius: '6px',
                            background: 'var(--bg)',
                            color: 'var(--ink)',
                            cursor: 'pointer',
                        }}
                    >
                        Refresh
                    </button>
                </div>

                {workflowsError && (
                    <div
                        style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '0.65rem 0.9rem',
                            color: '#dc2626',
                            fontSize: '0.85rem',
                            marginBottom: '0.75rem',
                        }}
                    >
                        {workflowsError}
                    </div>
                )}

                {workflowsLoading && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>Loading workflows…</p>
                )}

                {!workflowsLoading && workflows.length === 0 && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>No workflows found for this workspace.</p>
                )}

                {!workflowsLoading && workflows.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={TH}>ID</th>
                                    <th style={TH}>Risk</th>
                                    <th style={TH}>Status</th>
                                    <th style={TH}>Stage</th>
                                    <th style={TH}>Bot</th>
                                    <th style={TH}>Created</th>
                                    <th style={TH}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {workflows.map((wf) => {
                                    const isOpen = selectedWorkflowId === wf.id;
                                    const statusStyle = STATUS_BADGE[wf.status] ?? STATUS_BADGE['pending']!;
                                    const riskStyle = RISK_BADGE[wf.riskLevel] ?? RISK_BADGE['medium']!;
                                    return (
                                        <tr
                                            key={wf.id}
                                            style={{ borderBottom: '1px solid var(--line)' }}
                                        >
                                            <td style={TD_MUTED}>{wf.id.slice(0, 12)}…</td>
                                            <td style={TD}>
                                                <Badge label={wf.riskLevel} style={riskStyle} />
                                            </td>
                                            <td style={TD}>
                                                <Badge label={wf.status} style={statusStyle} />
                                            </td>
                                            <td style={TD_MUTED}>{wf.currentStageId}</td>
                                            <td style={TD_MUTED}>{wf.botId.slice(0, 12)}</td>
                                            <td style={TD_MUTED}>
                                                {new Date(wf.createdAt).toLocaleDateString()}
                                            </td>
                                            <td style={TD}>
                                                <button
                                                    onClick={() => {
                                                        if (isOpen) {
                                                            setSelectedWorkflowId(null);
                                                            setWorkflowDetail(null);
                                                        } else {
                                                            void fetchWorkflowDetail(wf.id);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--line)',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg)',
                                                        color: 'var(--ink)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {isOpen ? 'Hide' : 'View'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Detail drawer */}
                {selectedWorkflowId && (
                    <div
                        style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            background: 'var(--bg)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '0.75rem',
                            }}
                        >
                            <p
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-muted)',
                                    margin: 0,
                                }}
                            >
                                Workflow Detail
                            </p>
                            <button
                                onClick={() => {
                                    setSelectedWorkflowId(null);
                                    setWorkflowDetail(null);
                                }}
                                style={{
                                    padding: '0.2rem 0.55rem',
                                    fontSize: '0.75rem',
                                    border: '1px solid var(--line)',
                                    borderRadius: '4px',
                                    background: 'var(--bg)',
                                    color: 'var(--ink-muted)',
                                    cursor: 'pointer',
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>

                        {detailLoading && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>Loading…</p>
                        )}

                        {!detailLoading && selectedWorkflow && (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {/* Workflow fields grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                        gap: '0.5rem 1.5rem',
                                        fontSize: '0.84rem',
                                    }}
                                >
                                    {(
                                        [
                                            ['Action Summary', selectedWorkflow.actionSummary],
                                            ['Risk Level', selectedWorkflow.riskLevel],
                                            ['Status', selectedWorkflow.status],
                                            ['Current Stage', selectedWorkflow.currentStageId],
                                            [
                                                'Assigned Approvers',
                                                selectedWorkflow.assignedApproverIds.join(', ') || '—',
                                            ],
                                            ['Correlation ID', selectedWorkflow.correlationId],
                                            [
                                                'Created At',
                                                new Date(selectedWorkflow.createdAt).toLocaleString(),
                                            ],
                                            [
                                                'Completed At',
                                                selectedWorkflow.completedAt
                                                    ? new Date(selectedWorkflow.completedAt).toLocaleString()
                                                    : '—',
                                            ],
                                        ] as [string, string][]
                                    ).map(([label, value]) => (
                                        <div key={label}>
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontSize: '0.72rem',
                                                    color: 'var(--ink-muted)',
                                                    fontWeight: 600,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                }}
                                            >
                                                {label}
                                            </p>
                                            <p style={{ margin: '0.15rem 0 0', color: 'var(--ink)' }}>{value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Decision history */}
                                <div>
                                    <p
                                        style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            color: 'var(--ink-muted)',
                                            marginBottom: '0.5rem',
                                        }}
                                    >
                                        Decision History
                                    </p>
                                    {workflowDetail!.decisions.length === 0 ? (
                                        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                                            No decisions recorded yet.
                                        </p>
                                    ) : (
                                        <table
                                            style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '0.82rem',
                                            }}
                                        >
                                            <thead>
                                                <tr
                                                    style={{
                                                        borderBottom: '1px solid var(--line)',
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    <th style={TH}>Stage</th>
                                                    <th style={TH}>Approver</th>
                                                    <th style={TH}>Decision</th>
                                                    <th style={TH}>Reason</th>
                                                    <th style={TH}>Decided At</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {workflowDetail!.decisions.map((d) => {
                                                    const decisionStyle =
                                                        d.decision === 'approved'
                                                            ? STATUS_BADGE['approved']!
                                                            : STATUS_BADGE['rejected']!;
                                                    return (
                                                        <tr
                                                            key={d.id}
                                                            style={{ borderBottom: '1px solid var(--line)' }}
                                                        >
                                                            <td style={TD_MUTED}>{d.stageId}</td>
                                                            <td style={TD_MUTED}>{d.approverId}</td>
                                                            <td style={TD}>
                                                                <Badge
                                                                    label={d.decision}
                                                                    style={decisionStyle}
                                                                />
                                                            </td>
                                                            <td style={TD_MUTED}>{d.reasonText ?? '—'}</td>
                                                            <td style={TD_MUTED}>
                                                                {new Date(d.decidedAt).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

