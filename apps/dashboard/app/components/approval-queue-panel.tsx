'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CopyLinkButton } from './copy-link-button';
import { buildDashboardHref } from './dashboard-navigation';
import {
    applyEvidencePaginationParams,
    getEvidencePaginationState,
    isEvidencePaginationEnabled,
    normalizeEvidenceOffset,
    shouldApplyEvidenceResponse,
} from './approval-evidence-pagination';

type ApprovalItem = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
    change_summary?: string;
    impacted_scope?: string | null;
    risk_reason?: string | null;
    proposed_rollback?: string | null;
    lint_status?: string | null;
    test_status?: string | null;
    packet_complete?: boolean;
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

const getApprovalHeadline = (approval: ApprovalItem): string => {
    return approval.change_summary?.trim() || approval.action_summary;
};

const getApprovalSearchText = (approval: ApprovalItem): string => {
    return [
        approval.action_summary,
        approval.change_summary ?? '',
        approval.impacted_scope ?? '',
        approval.risk_reason ?? '',
        approval.proposed_rollback ?? '',
        approval.lint_status ?? '',
        approval.test_status ?? '',
    ].join(' ').toLowerCase();
};

const getQualityStatus = (approval: ApprovalItem): string => {
    return `Lint ${approval.lint_status ?? 'not_run'} | Test ${approval.test_status ?? 'not_run'}`;
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
    const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(focusedApprovalId ?? null);
    const [drawerTab, setDrawerTab] = useState<'summary' | 'evidence'>('summary');
    const [evidenceBusy, setEvidenceBusy] = useState(false);
    const [evidenceData, setEvidenceData] = useState<{
        approval_id: string;
        workspace_id: string;
        total: number;
        limit: number;
        offset: number;
        evidence: Array<{
            evidence_id: string;
            status: string;
            execution_logs?: Array<{ timestamp: string; level: string; message: string }>;
            quality_gate_results?: Array<{ checkType: string; status: string; details?: string }>;
            action_outcome?: { success: boolean | null; result_summary?: string | null; error_reason?: string | null };
            connector_used?: string | null;
            actor_id?: string | null;
            approval_reason?: string | null;
        }>;
    } | null>(null);
    const [evidenceOffset, setEvidenceOffset] = useState(0);
    const evidenceRequestIdRef = useRef(0);
    const selectedApprovalIdRef = useRef<string | null>(selectedApprovalId);

    const evidencePaginationEnabled = isEvidencePaginationEnabled(process.env.NEXT_PUBLIC_APPROVAL_EVIDENCE_PAGINATION);
    const EVIDENCE_PAGE_SIZE = 5;

    useEffect(() => {
        selectedApprovalIdRef.current = selectedApprovalId;
    }, [selectedApprovalId]);

    useEffect(() => {
        evidenceRequestIdRef.current += 1;
        setEvidenceBusy(false);
        setEvidenceOffset(0);
        setEvidenceData(null);
    }, [selectedApprovalId]);

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

    const selectedApproval = useMemo(() => {
        if (!selectedApprovalId) {
            return null;
        }

        return [...pending, ...recent].find((approval) => approval.approval_id === selectedApprovalId) ?? null;
    }, [pending, recent, selectedApprovalId]);

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
                getApprovalSearchText(item).includes(query)
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
                getApprovalSearchText(item).includes(query)
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

    const fetchEvidence = async (approvalId: string, options?: { offset?: number }) => {
        const offset = Math.max(0, options?.offset ?? 0);
        const params = new URLSearchParams({ workspace_id: workspaceId });
        applyEvidencePaginationParams(params, evidencePaginationEnabled, EVIDENCE_PAGE_SIZE, offset);

        const requestId = evidenceRequestIdRef.current + 1;
        evidenceRequestIdRef.current = requestId;

        setEvidenceBusy(true);
        try {
            const response = await fetch(`/api/approvals/${approvalId}/evidence?${params.toString()}`);
            const body = (await response.json().catch(() => ({}))) as typeof evidenceData;
            if (!shouldApplyEvidenceResponse(requestId, evidenceRequestIdRef.current)) {
                return;
            }
            if (selectedApprovalIdRef.current !== approvalId) {
                return;
            }
            if (response.ok && body && 'evidence' in body) {
                const nextOffset = body.offset ?? offset;
                if (evidencePaginationEnabled && body.total > 0 && body.evidence.length === 0) {
                    const normalizedOffset = normalizeEvidenceOffset(body.total, body.limit, nextOffset);
                    if (normalizedOffset !== nextOffset) {
                        void fetchEvidence(approvalId, { offset: normalizedOffset });
                        return;
                    }
                }
                setEvidenceData(body);
                setEvidenceOffset(nextOffset);
            } else {
                setEvidenceData({
                    approval_id: approvalId,
                    workspace_id: workspaceId,
                    total: 0,
                    limit: evidencePaginationEnabled ? EVIDENCE_PAGE_SIZE : 20,
                    offset,
                    evidence: [],
                });
                setEvidenceOffset(offset);
            }
        } finally {
            if (shouldApplyEvidenceResponse(requestId, evidenceRequestIdRef.current)) {
                setEvidenceBusy(false);
            }
        }
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
                                                <strong>{getApprovalHeadline(approval)}</strong>
                                            </label>
                                            {approval.packet_complete && (
                                                <div style={{ display: 'grid', gap: '0.18rem', fontSize: '0.78rem', color: '#57534e', paddingLeft: '1.55rem' }}>
                                                    {approval.impacted_scope && <span>Scope: {approval.impacted_scope}</span>}
                                                    {approval.risk_reason && <span>Risk: {approval.risk_reason}</span>}
                                                    {approval.proposed_rollback && <span>Rollback: {approval.proposed_rollback}</span>}
                                                    <span>Quality: {getQualityStatus(approval)}</span>
                                                </div>
                                            )}
                                            <span style={{ fontSize: '0.78rem', color: '#57534e', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                {approval.approval_id}
                                                <button
                                                    type="button"
                                                    className="chip-button"
                                                    onClick={() => {
                                                        setSelectedApprovalId(approval.approval_id);
                                                        setDrawerTab('summary');
                                                        setEvidenceOffset(0);
                                                        setEvidenceData(null);
                                                    }}
                                                >
                                                    View Details
                                                </button>
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
                                    <td>
                                        <div style={{ display: 'grid', gap: '0.18rem' }}>
                                            <span>{getApprovalHeadline(approval)}</span>
                                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {approval.packet_complete && approval.impacted_scope && (
                                                    <span style={{ fontSize: '0.78rem', color: '#57534e' }}>{approval.impacted_scope}</span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="chip-button"
                                                    onClick={() => {
                                                        setSelectedApprovalId(approval.approval_id);
                                                        setDrawerTab('summary');
                                                        setEvidenceOffset(0);
                                                        setEvidenceData(null);
                                                    }}
                                                >
                                                    View Details
                                                </button>
                                            </div>
                                        </div>
                                    </td>
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

            {selectedApproval && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Approval details ${selectedApproval.approval_id}`}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(12, 18, 28, 0.38)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        zIndex: 40,
                    }}
                >
                    <div
                        style={{
                            width: 'min(32rem, 100%)',
                            height: '100%',
                            background: '#fffbeb',
                            borderLeft: '1px solid #d6d3d1',
                            padding: '1rem',
                            overflowY: 'auto',
                            display: 'grid',
                            gap: '0.9rem',
                            gridTemplateRows: 'auto auto 1fr',
                            boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.18)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <span style={{ fontSize: '0.78rem', color: '#57534e' }}>{selectedApproval.approval_id}</span>
                                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{getApprovalHeadline(selectedApproval)}</h3>
                            </div>
                            <button type="button" className="chip-button" onClick={() => { setSelectedApprovalId(null); setDrawerTab('summary'); setEvidenceOffset(0); setEvidenceData(null); }}>
                                Close
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #d6d3d1' }}>
                            <button
                                type="button"
                                onClick={() => setDrawerTab('summary')}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    background: drawerTab === 'summary' ? '#fef3c7' : 'transparent',
                                    border: 'none',
                                    borderBottom: drawerTab === 'summary' ? '2px solid #b45309' : 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: drawerTab === 'summary' ? 'bold' : 'normal',
                                }}
                            >
                                Summary
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDrawerTab('evidence');
                                    setEvidenceOffset(0);
                                    if (!evidenceData) {
                                        void fetchEvidence(selectedApproval.approval_id, { offset: 0 });
                                    }
                                }}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    background: drawerTab === 'evidence' ? '#fef3c7' : 'transparent',
                                    border: 'none',
                                    borderBottom: drawerTab === 'evidence' ? '2px solid #b45309' : 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: drawerTab === 'evidence' ? 'bold' : 'normal',
                                }}
                            >
                                Evidence
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', display: 'grid', gap: '0.65rem' }}>
                            {drawerTab === 'summary' && (
                                <>
                                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                        <span className={riskBadgeClass(selectedApproval.risk_level)}>{selectedApproval.risk_level}</span>
                                        <span className="badge">{selectedApproval.decision_status}</span>
                                        <span className="badge">{selectedApproval.packet_complete ? 'packet complete' : 'summary fallback'}</span>
                                    </div>

                                    <div>
                                        <strong>Requested</strong>
                                        <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{new Date(selectedApproval.requested_at).toLocaleString()}</p>
                                    </div>
                                    {selectedApproval.decided_at && (
                                        <div>
                                            <strong>Decided</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{new Date(selectedApproval.decided_at).toLocaleString()}</p>
                                        </div>
                                    )}
                                    {selectedApproval.impacted_scope && (
                                        <div>
                                            <strong>Impacted Scope</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{selectedApproval.impacted_scope}</p>
                                        </div>
                                    )}
                                    {selectedApproval.risk_reason && (
                                        <div>
                                            <strong>Risk Reason</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{selectedApproval.risk_reason}</p>
                                        </div>
                                    )}
                                    {selectedApproval.proposed_rollback && (
                                        <div>
                                            <strong>Rollback Plan</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{selectedApproval.proposed_rollback}</p>
                                        </div>
                                    )}
                                    <div>
                                        <strong>Quality Gate</strong>
                                        <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{getQualityStatus(selectedApproval)}</p>
                                    </div>
                                    {selectedApproval.decision_reason && (
                                        <div>
                                            <strong>Decision Reason</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{selectedApproval.decision_reason}</p>
                                        </div>
                                    )}
                                    {selectedApproval.change_summary && selectedApproval.change_summary !== selectedApproval.action_summary && (
                                        <div>
                                            <strong>Raw Action Summary</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: '#44403c' }}>{selectedApproval.action_summary}</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {drawerTab === 'evidence' && (
                                <>
                                    {evidenceBusy && <p style={{ color: '#57534e', fontSize: '0.85rem' }}>Loading evidence...</p>}
                                    {!evidenceBusy && evidenceData && (() => {
                                        const latestRecord = evidenceData.evidence[0];
                                        const pagination = getEvidencePaginationState(
                                            evidenceData.total,
                                            evidenceData.limit,
                                            evidenceData.offset,
                                        );
                                        return (
                                            <>
                                                {evidenceData.total === 0 && (
                                                    <p style={{ color: '#92400e', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                        Evidence record not found for this approval yet.
                                                    </p>
                                                )}

                                                {latestRecord && (
                                                    <>
                                                        {latestRecord.connector_used && (
                                                            <div>
                                                                <strong>Connector</strong>
                                                                <p style={{ margin: '0.2rem 0 0', color: '#44403c', fontSize: '0.78rem' }}>{latestRecord.connector_used}</p>
                                                            </div>
                                                        )}

                                                        {latestRecord.actor_id && (
                                                            <div>
                                                                <strong>Actor</strong>
                                                                <p style={{ margin: '0.2rem 0 0', color: '#44403c', fontSize: '0.78rem' }}>{latestRecord.actor_id}</p>
                                                            </div>
                                                        )}

                                                        {latestRecord.approval_reason && (
                                                            <div>
                                                                <strong>Approval Reason</strong>
                                                                <p style={{ margin: '0.2rem 0 0', color: '#44403c', fontSize: '0.78rem' }}>{latestRecord.approval_reason}</p>
                                                            </div>
                                                        )}

                                                        {latestRecord.quality_gate_results && latestRecord.quality_gate_results.length > 0 && (
                                                            <div>
                                                                <strong>Quality Gate Results</strong>
                                                                <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                                    {latestRecord.quality_gate_results.map((check, idx) => (
                                                                        <div key={idx} style={{ fontSize: '0.78rem', color: '#44403c' }}>
                                                                            <span
                                                                                style={{
                                                                                    display: 'inline-block',
                                                                                    padding: '0.1rem 0.3rem',
                                                                                    borderRadius: '0.2rem',
                                                                                    background:
                                                                                        check.status === 'passed'
                                                                                            ? '#dcfce7'
                                                                                            : check.status === 'failed'
                                                                                              ? '#fee2e2'
                                                                                              : '#fef3c7',
                                                                                    color:
                                                                                        check.status === 'passed'
                                                                                            ? '#166534'
                                                                                            : check.status === 'failed'
                                                                                              ? '#991b1b'
                                                                                              : '#92400e',
                                                                                }}
                                                                            >
                                                                                {check.checkType} {check.status}
                                                                            </span>
                                                                            {check.details && (
                                                                                <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem' }}>{check.details}</p>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {latestRecord.execution_logs && latestRecord.execution_logs.length > 0 && (
                                                            <div>
                                                                <strong>Execution Logs (last 10)</strong>
                                                                <div style={{ display: 'grid', gap: '0.2rem', marginTop: '0.2rem', maxHeight: '12rem', overflowY: 'auto' }}>
                                                                    {latestRecord.execution_logs.slice(-10).map((log, idx) => (
                                                                        <div key={idx} style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#44403c' }}>
                                                                            <span style={{ color: log.level === 'error' ? '#dc2626' : log.level === 'warn' ? '#b45309' : '#57534e' }}>
                                                                                [{log.timestamp.split('T')[1]?.slice(0, 8)}] {log.level}
                                                                            </span>
                                                                            {' '} {log.message}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {latestRecord.action_outcome && (
                                                            <div>
                                                                <strong>Action Outcome</strong>
                                                                <p style={{ margin: '0.2rem 0 0', color: '#44403c', fontSize: '0.78rem' }}>
                                                                    {latestRecord.action_outcome.result_summary ?? 'Pending'}
                                                                </p>
                                                                {latestRecord.action_outcome.error_reason && (
                                                                    <p style={{ margin: '0.2rem 0 0', color: '#dc2626', fontSize: '0.78rem' }}>
                                                                        Error: {latestRecord.action_outcome.error_reason}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {evidenceData.total > 1 && (
                                                            <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.25rem' }}>
                                                                <p style={{ fontSize: '0.72rem', color: '#57534e', margin: 0 }}>
                                                                    Showing {pagination.startIndex}-{pagination.endIndex} of {evidenceData.total} evidence records.
                                                                </p>
                                                                {evidencePaginationEnabled && (
                                                                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                                                        <button
                                                                            type="button"
                                                                            className="chip-button"
                                                                            disabled={!pagination.canPrev || evidenceBusy}
                                                                            onClick={() => {
                                                                                void fetchEvidence(selectedApproval.approval_id, {
                                                                                    offset: normalizeEvidenceOffset(
                                                                                        evidenceData.total,
                                                                                        evidenceData.limit,
                                                                                        Math.max(0, evidenceOffset - evidenceData.limit),
                                                                                    ),
                                                                                });
                                                                            }}
                                                                        >
                                                                            Newer
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="chip-button"
                                                                            disabled={!pagination.canNext || evidenceBusy}
                                                                            onClick={() => {
                                                                                void fetchEvidence(selectedApproval.approval_id, {
                                                                                    offset: normalizeEvidenceOffset(
                                                                                        evidenceData.total,
                                                                                        evidenceData.limit,
                                                                                        evidenceOffset + evidenceData.limit,
                                                                                    ),
                                                                                });
                                                                            }}
                                                                        >
                                                                            Older
                                                                        </button>
                                                                        <span style={{ fontSize: '0.72rem', color: '#57534e' }}>
                                                                            Page {pagination.page} of {pagination.pageCount}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}
