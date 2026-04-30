'use client';

import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CopyLinkButton } from './copy-link-button';
import { buildDashboardHref } from './dashboard-navigation';

type ApprovalItem = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
    risk_level: 'low' | 'medium' | 'high';
    decision_status: string;
    requested_at: string;
    decided_at: string | null;
    decision_reason: string | null;
};

type Props = {
    workspaceId: string;
    initialPending: ApprovalItem[];
    initialRecent: ApprovalItem[];
    focusedApprovalId?: string;
    initialMetrics: {
        pending_count: number;
        decision_count: number;
        p95_decision_latency_seconds: number | null;
    };
};

type DecisionValue = 'approved' | 'rejected' | 'timeout_rejected';
type SortValue = 'requested_desc' | 'requested_asc' | 'risk_desc';
type SavedView = 'all' | 'pending_high_risk' | 'aging_15m' | 'my_team';

const REASON_TEMPLATES = [
    'Approved after policy review and scope verification',
    'Rejected due to insufficient mitigation plan',
    'Timeout rejection due to missing human response in SLA window',
    'Rejected due to missing evidence artifact linkage',
] as const;

const riskBadgeClass = (risk: ApprovalItem['risk_level']): string => {
    if (risk === 'high') {
        return 'badge high';
    }
    if (risk === 'medium') {
        return 'badge medium';
    }
    return 'badge low';
};

export function ApprovalQueuePanel({ workspaceId, initialPending, initialRecent, focusedApprovalId, initialMetrics }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pending, setPending] = useState<ApprovalItem[]>(initialPending);
    const [recent, setRecent] = useState<ApprovalItem[]>(initialRecent);
    const [metrics, setMetrics] = useState(initialMetrics);
    const [reasonByApproval, setReasonByApproval] = useState<Record<string, string>>({});
    const [busyByApproval, setBusyByApproval] = useState<Record<string, boolean>>({});
    const [escalationBusy, setEscalationBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
    const [search, setSearch] = useState('');
    const [pendingPage, setPendingPage] = useState(1);
    const [recentPage, setRecentPage] = useState(1);
    const [pendingSort, setPendingSort] = useState<SortValue>('risk_desc');
    const [savedView, setSavedView] = useState<SavedView>('all');
    const [selectedApprovals, setSelectedApprovals] = useState<Record<string, boolean>>({});
    const [bulkDecision, setBulkDecision] = useState<DecisionValue | null>(null);
    const [bulkReason, setBulkReason] = useState('Bulk decision confirmed by operations triage run.');
    const [bulkBusy, setBulkBusy] = useState(false);

    const PAGE_SIZE = 5;

    const computedP95Latency = useMemo(() => {
        const decidedLatencies = [...recent]
            .map((item) => {
                if (!item.decided_at) {
                    return null;
                }
                const requested = new Date(item.requested_at).getTime();
                const decided = new Date(item.decided_at).getTime();
                if (!Number.isFinite(requested) || !Number.isFinite(decided) || decided < requested) {
                    return null;
                }
                return Math.floor((decided - requested) / 1000);
            })
            .filter((item): item is number => item !== null)
            .sort((a, b) => a - b);

        if (decidedLatencies.length === 0) {
            return null;
        }

        const idx = Math.max(0, Math.ceil(decidedLatencies.length * 0.95) - 1);
        return decidedLatencies[idx] ?? decidedLatencies[decidedLatencies.length - 1];
    }, [recent]);

    const p95Latency = metrics.p95_decision_latency_seconds ?? computedP95Latency;

    const filteredPending = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = pending.filter((item) => {
            if (riskFilter !== 'all' && item.risk_level !== riskFilter) {
                return false;
            }
            if (!query) {
                if (savedView === 'all') {
                    return true;
                }

                if (savedView === 'pending_high_risk') {
                    return item.risk_level === 'high';
                }

                if (savedView === 'aging_15m') {
                    return Date.now() - new Date(item.requested_at).getTime() > 15 * 60_000;
                }

                if (savedView === 'my_team') {
                    return item.risk_level === 'high' || item.risk_level === 'medium';
                }

                return true;
            }
            return (
                item.action_summary.toLowerCase().includes(query)
                || item.approval_id.toLowerCase().includes(query)
                || (item.task_id ?? '').toLowerCase().includes(query)
            );
        });

        const sortByRequestedDesc = (a: ApprovalItem, b: ApprovalItem) => (
            new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        );

        if (pendingSort === 'requested_asc') {
            return [...filtered].sort((a, b) => -sortByRequestedDesc(a, b));
        }
        if (pendingSort === 'requested_desc') {
            return [...filtered].sort(sortByRequestedDesc);
        }

        const riskWeight: Record<ApprovalItem['risk_level'], number> = {
            high: 3,
            medium: 2,
            low: 1,
        };

        return [...filtered].sort((a, b) => {
            const riskDelta = riskWeight[b.risk_level] - riskWeight[a.risk_level];
            if (riskDelta !== 0) {
                return riskDelta;
            }
            return sortByRequestedDesc(a, b);
        });
    }, [pending, pendingSort, riskFilter, savedView, search]);

    const filteredRecent = useMemo(() => {
        const query = search.trim().toLowerCase();
        return recent.filter((item) => {
            if (riskFilter !== 'all' && item.risk_level !== riskFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            return (
                item.action_summary.toLowerCase().includes(query)
                || item.approval_id.toLowerCase().includes(query)
                || (item.task_id ?? '').toLowerCase().includes(query)
            );
        });
    }, [recent, riskFilter, search]);

    const pendingPageCount = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
    const recentPageCount = Math.max(1, Math.ceil(filteredRecent.length / PAGE_SIZE));

    const pagedPending = useMemo(() => {
        const start = (pendingPage - 1) * PAGE_SIZE;
        return filteredPending.slice(start, start + PAGE_SIZE);
    }, [filteredPending, pendingPage]);

    const pagedRecent = useMemo(() => {
        const start = (recentPage - 1) * PAGE_SIZE;
        return filteredRecent.slice(start, start + PAGE_SIZE);
    }, [filteredRecent, recentPage]);

    const submitDecision = async (approval: ApprovalItem, decision: DecisionValue) => {
        const reason = (reasonByApproval[approval.approval_id] ?? '').trim();
        if ((decision === 'rejected' || decision === 'timeout_rejected') && !reason) {
            setMessage('Reason is required for rejected and timeout decisions.');
            return;
        }

        setBusyByApproval((prev) => ({ ...prev, [approval.approval_id]: true }));
        setMessage(null);

        try {
            const response = await fetch('/api/approvals/decision', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    approval_id: approval.approval_id,
                    workspace_id: workspaceId,
                    decision,
                    reason,
                }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                decided_at?: string;
                decision_reason?: string | null;
                decision?: string;
            };

            if (!response.ok) {
                setMessage(body.message ?? body.error ?? 'Failed to submit decision.');
                return;
            }

            const moved: ApprovalItem = {
                ...approval,
                decision_status: body.decision ?? decision,
                decided_at: body.decided_at ?? new Date().toISOString(),
                decision_reason: body.decision_reason ?? (reason || null),
            };

            setPending((prev) => prev.filter((item) => item.approval_id !== approval.approval_id));
            setRecent((prev) => [moved, ...prev].slice(0, 50));
            setMetrics((prev) => ({
                ...prev,
                pending_count: Math.max(0, prev.pending_count - 1),
                decision_count: prev.decision_count + 1,
                p95_decision_latency_seconds: computedP95Latency,
            }));
            setReasonByApproval((prev) => ({ ...prev, [approval.approval_id]: '' }));
            setMessage(`Decision recorded for ${approval.approval_id}.`);
        } finally {
            setBusyByApproval((prev) => ({ ...prev, [approval.approval_id]: false }));
        }
    };

    const runBulkDecision = async () => {
        if (!bulkDecision) {
            return;
        }

        const selected = pending.filter((item) => selectedApprovals[item.approval_id]);
        if (selected.length === 0) {
            setMessage('Select at least one approval before running bulk decision.');
            return;
        }

        if ((bulkDecision === 'rejected' || bulkDecision === 'timeout_rejected') && !bulkReason.trim()) {
            setMessage('Bulk reason is required for reject and timeout reject decisions.');
            return;
        }

        setBulkBusy(true);
        setMessage(null);

        let processed = 0;
        for (const approval of selected) {
            const response = await fetch('/api/approvals/decision', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    approval_id: approval.approval_id,
                    workspace_id: workspaceId,
                    decision: bulkDecision,
                    reason: bulkReason.trim(),
                }),
            });

            if (!response.ok) {
                continue;
            }

            const body = (await response.json().catch(() => ({}))) as {
                decided_at?: string;
                decision_reason?: string | null;
                decision?: string;
            };

            const moved: ApprovalItem = {
                ...approval,
                decision_status: body.decision ?? bulkDecision,
                decided_at: body.decided_at ?? new Date().toISOString(),
                decision_reason: body.decision_reason ?? bulkReason.trim(),
            };

            processed += 1;
            setPending((prev) => prev.filter((item) => item.approval_id !== approval.approval_id));
            setRecent((prev) => [moved, ...prev].slice(0, 50));
        }

        setMetrics((prev) => ({
            ...prev,
            pending_count: Math.max(0, prev.pending_count - processed),
            decision_count: prev.decision_count + processed,
            p95_decision_latency_seconds: computedP95Latency,
        }));
        setSelectedApprovals({});
        setBulkDecision(null);
        setBulkBusy(false);
        setMessage(`Bulk decision completed for ${processed} approvals.`);
    };

    const applyReasonTemplate = (approvalId: string, value: string) => {
        if (!value) {
            return;
        }
        setReasonByApproval((prev) => ({
            ...prev,
            [approvalId]: value,
        }));
    };

    const runEscalation = async () => {
        setEscalationBusy(true);
        setMessage(null);

        try {
            const response = await fetch('/api/approvals/escalate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ workspace_id: workspaceId }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                escalated_count?: number;
                error?: string;
                message?: string;
            };

            if (!response.ok) {
                setMessage(body.message ?? body.error ?? 'Failed to run escalation.');
                return;
            }

            setMessage(`Escalation sweep completed. ${body.escalated_count ?? 0} approvals escalated.`);
        } finally {
            setEscalationBusy(false);
        }
    };

    const onChangeRisk = (next: 'all' | 'low' | 'medium' | 'high') => {
        setRiskFilter(next);
        setPendingPage(1);
        setRecentPage(1);
    };

    const onChangeSearch = (value: string) => {
        setSearch(value);
        setPendingPage(1);
        setRecentPage(1);
    };

    return (
        <article className="card">
            <h2>Approval Queue Workflow</h2>
            <p style={{ margin: '-0.45rem 0 0.7rem', fontSize: '0.82rem', color: '#57534e' }}>
                Pending: <strong>{metrics.pending_count}</strong> | Recent: <strong>{metrics.decision_count}</strong> | P95 latency:{' '}
                <strong>{p95Latency === null ? 'N/A' : `${p95Latency}s`}</strong>
                {p95Latency !== null && p95Latency > 300 && (
                    <span className="badge high" style={{ marginLeft: '0.45rem' }}>
                        SLA attention
                    </span>
                )}
            </p>

            <div className="approval-toolbar">
                <input
                    type="text"
                    placeholder="Search approval/action/task"
                    value={search}
                    onChange={(event) => onChangeSearch(event.target.value)}
                    className="approval-input"
                />
                <select
                    value={pendingSort}
                    onChange={(event) => setPendingSort(event.target.value as SortValue)}
                    className="approval-select"
                    aria-label="Sort pending approvals"
                >
                    <option value="risk_desc">Sort: Risk priority</option>
                    <option value="requested_desc">Sort: Newest first</option>
                    <option value="requested_asc">Sort: Oldest first</option>
                </select>
                {(['all', 'low', 'medium', 'high'] as const).map((risk) => (
                    <button
                        key={risk}
                        type="button"
                        onClick={() => onChangeRisk(risk)}
                        className={`chip-button ${riskFilter === risk ? 'active' : ''}`}
                    >
                        {risk}
                    </button>
                ))}
                <select
                    value={savedView}
                    onChange={(event) => setSavedView(event.target.value as SavedView)}
                    className="approval-select"
                    aria-label="Saved approval views"
                >
                    <option value="all">View: all</option>
                    <option value="pending_high_risk">View: pending-high-risk</option>
                    <option value="aging_15m">View: aging {`>`} 15m</option>
                    <option value="my_team">View: my-team</option>
                </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                <span style={{ fontSize: '0.82rem', color: '#57534e' }}>Capture decisions with reasons, latency, and escalation control.</span>
                <button
                    type="button"
                    onClick={runEscalation}
                    disabled={escalationBusy}
                    className="primary-action"
                >
                    {escalationBusy ? 'Running…' : 'Run Escalation Sweep'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setBulkDecision('approved')}
                    disabled={bulkBusy}
                >
                    Bulk Approve
                </button>
                <button
                    type="button"
                    className="danger-action"
                    onClick={() => setBulkDecision('rejected')}
                    disabled={bulkBusy}
                >
                    Bulk Reject
                </button>
                <button
                    type="button"
                    className="warn-action"
                    onClick={() => setBulkDecision('timeout_rejected')}
                    disabled={bulkBusy}
                >
                    Bulk Timeout Reject
                </button>
                <span style={{ fontSize: '0.8rem', color: '#57534e' }}>
                    Selected: {Object.values(selectedApprovals).filter(Boolean).length}
                </span>
            </div>

            {bulkDecision && (
                <div className="message-inline" style={{ marginBottom: '0.8rem' }}>
                    <p style={{ margin: '0 0 0.35rem' }}>
                        Confirm bulk <strong>{bulkDecision}</strong> for selected approvals.
                    </p>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={bulkReason}
                            onChange={(event) => setBulkReason(event.target.value)}
                            className="approval-input"
                            placeholder="Bulk decision reason"
                        />
                        <button type="button" className="primary-action" disabled={bulkBusy} onClick={() => void runBulkDecision()}>
                            {bulkBusy ? 'Applying…' : 'Confirm Bulk Decision'}
                        </button>
                        <button type="button" className="chip-button" disabled={bulkBusy} onClick={() => setBulkDecision(null)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {message && (
                <p className="message-inline">
                    {message}
                </p>
            )}

            <table>
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Risk</th>
                        <th>Requested</th>
                        <th>Decision</th>
                    </tr>
                </thead>
                <tbody>
                    {pagedPending.length === 0 ? (
                        <tr>
                            <td colSpan={4}>No pending approvals</td>
                        </tr>
                    ) : (
                        pagedPending.map((approval) => {
                            const busy = busyByApproval[approval.approval_id] === true;
                            return (
                                <tr
                                    key={approval.approval_id}
                                    style={focusedApprovalId === approval.approval_id ? { background: '#eff6ff' } : undefined}
                                >
                                    <td>
                                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedApprovals[approval.approval_id] === true}
                                                    onChange={(event) => {
                                                        const checked = event.target.checked;
                                                        setSelectedApprovals((prev) => ({
                                                            ...prev,
                                                            [approval.approval_id]: checked,
                                                        }));
                                                    }}
                                                />
                                                <strong>{approval.action_summary}</strong>
                                            </label>
                                            <span style={{ fontSize: '0.78rem', color: '#57534e', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                {approval.approval_id}
                                                <CopyLinkButton
                                                    href={buildDashboardHref(pathname, searchParams.toString(), {
                                                        tab: 'approvals',
                                                        workspaceId,
                                                        params: { approvalId: approval.approval_id },
                                                    })}
                                                    label="Copy Approval Link"
                                                    className="chip-button"
                                                />
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={riskBadgeClass(approval.risk_level)}>{approval.risk_level}</span>
                                    </td>
                                    <td>{new Date(approval.requested_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</td>
                                    <td>
                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                            <input
                                                type="text"
                                                placeholder="Decision reason"
                                                value={reasonByApproval[approval.approval_id] ?? ''}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    setReasonByApproval((prev) => ({
                                                        ...prev,
                                                        [approval.approval_id]: value,
                                                    }));
                                                }}
                                                className="approval-input"
                                                style={{ minWidth: 0, width: '100%' }}
                                            />
                                            <select
                                                value=""
                                                onChange={(event) => applyReasonTemplate(approval.approval_id, event.target.value)}
                                                className="approval-select"
                                                aria-label="Apply reason template"
                                            >
                                                <option value="">Quick reason template</option>
                                                {REASON_TEMPLATES.map((template) => (
                                                    <option key={template} value={template}>
                                                        {template}
                                                    </option>
                                                ))}
                                            </select>
                                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void submitDecision(approval, 'approved')}
                                                    className="secondary-action"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void submitDecision(approval, 'rejected')}
                                                    className="danger-action"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void submitDecision(approval, 'timeout_rejected')}
                                                    className="warn-action"
                                                >
                                                    Timeout Reject
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#57534e' }}>
                <span>Pending page {pendingPage} of {pendingPageCount}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => setPendingPage((v) => Math.max(1, v - 1))} disabled={pendingPage <= 1}>Prev</button>
                    <button type="button" onClick={() => setPendingPage((v) => Math.min(pendingPageCount, v + 1))} disabled={pendingPage >= pendingPageCount}>Next</button>
                </div>
            </div>

            <h3 style={{ marginTop: '1rem', marginBottom: '0.6rem', fontSize: '0.95rem' }}>Recent Decisions</h3>
            <table>
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>
                    {pagedRecent.length === 0 ? (
                        <tr>
                            <td colSpan={4}>No decisions yet</td>
                        </tr>
                    ) : (
                        pagedRecent.map((approval) => {
                            const latency = approval.decided_at
                                ? Math.max(
                                    0,
                                    Math.floor(
                                        (new Date(approval.decided_at).getTime() - new Date(approval.requested_at).getTime()) / 1000,
                                    ),
                                )
                                : null;

                            return (
                                <tr key={`${approval.approval_id}:${approval.decided_at ?? 'pending'}`}>
                                    <td>{approval.action_summary}</td>
                                    <td>{approval.decision_status}</td>
                                    <td>{latency === null ? 'N/A' : `${latency}s`}</td>
                                    <td>{approval.decision_reason ?? '-'}</td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#57534e' }}>
                <span>Recent page {recentPage} of {recentPageCount}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => setRecentPage((v) => Math.max(1, v - 1))} disabled={recentPage <= 1}>Prev</button>
                    <button type="button" onClick={() => setRecentPage((v) => Math.min(recentPageCount, v + 1))} disabled={recentPage >= recentPageCount}>Next</button>
                </div>
            </div>
        </article>
    );
}
