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
    gate_type?: string | null;
    gate_category?: string | null;
    packet_complete?: boolean;
    risk_level: 'low' | 'medium' | 'high';
    decision_status: string;
    requested_at: string;
    decided_at: string | null;
    decision_reason: string | null;
    selected_option_id?: string | null;
    delegated_to_user_id?: string | null;
    delegated_to_user_name?: string | null;
    delegated_by_user_id?: string | null;
    delegated_at?: string | null;
    delegation_expires_at?: string | null;
};

type WhatIfOption = {
    optionId: string;
    summary: string;
};

type ApprovalBatchCard = {
    batchId: string;
    taskId: string;
    status: 'pending' | 'approved_all' | 'rejected_all' | 'partial';
    totalCount: number;
    decision?: 'approve_all' | 'reject_all' | 'review_individually';
    reason?: string;
};

type TeamMember = {
    id: string;
    name: string;
    email: string;
    role: string;
};

type Props = {
    workspaceId: string;
    initialPending: ApprovalItem[];
    initialRecent: ApprovalItem[];
    focusedApprovalId?: string;
    currentUserId?: string;
    initialMetrics: {
        pending_count: number;
        decision_count: number;
        p95_decision_latency_seconds: number | null;
    };
};

type DecisionValue = 'approved' | 'rejected' | 'timeout_rejected';
type SortValue = 'requested_desc' | 'requested_asc' | 'risk_desc';
type SavedView = 'all' | 'pending_high_risk' | 'aging_15m' | 'my_team' | 'delegated_to_me';

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

const gateCategoryBadgeClass = (category: string): string => {
    if (category === 'compliance') return 'badge high';
    if (category === 'strategy') return 'badge medium';
    return 'badge';
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
        approval.gate_type ?? '',
        approval.selected_option_id ?? '',
    ].join(' ').toLowerCase();
};

const parseWhatIfOptions = (actionSummary: string): WhatIfOption[] => {
    const lines = actionSummary.split(/\r?\n/);
    const options: WhatIfOption[] = [];

    for (const line of lines) {
        const match = line.match(/Option\s+\d+\s*\(([^)]+)\):\s*(.+)$/i);
        if (!match) {
            continue;
        }
        const optionId = (match[1] ?? '').trim();
        const summary = (match[2] ?? '').trim();
        if (!optionId) {
            continue;
        }
        options.push({ optionId, summary });
    }

    return options;
};

const getQualityStatus = (approval: ApprovalItem): string => {
    return `Lint ${approval.lint_status ?? 'not_run'} | Test ${approval.test_status ?? 'not_run'}`;
};

export function ApprovalQueuePanel({ workspaceId, initialPending, initialRecent, focusedApprovalId, initialMetrics, currentUserId }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pending, setPending] = useState<ApprovalItem[]>(initialPending);
    const [recent, setRecent] = useState<ApprovalItem[]>(initialRecent);
    const [metrics, setMetrics] = useState(initialMetrics);
    const [reasonByApproval, setReasonByApproval] = useState<Record<string, string>>({});
    const [busyByApproval, setBusyByApproval] = useState<Record<string, boolean>>({});
    const [escalationBusy, setEscalationBusy] = useState(false);
    const [escalateByApproval, setEscalateByApproval] = useState<Record<string, boolean>>({});
    const [escalateReasonByApproval, setEscalateReasonByApproval] = useState<Record<string, string>>({});
    const [escalateResultByApproval, setEscalateResultByApproval] = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
    const [search, setSearch] = useState('');
    const [pendingPage, setPendingPage] = useState(1);
    const [recentPage, setRecentPage] = useState(1);
    const [pendingSort, setPendingSort] = useState<SortValue>('risk_desc');
    const [savedView, setSavedView] = useState<SavedView>('all');
    const [selectedApprovals, setSelectedApprovals] = useState<Record<string, boolean>>({});
    const [selectedOptionByApproval, setSelectedOptionByApproval] = useState<Record<string, string>>({});
    const [bulkDecision, setBulkDecision] = useState<DecisionValue | null>(null);
    const [bulkReason, setBulkReason] = useState('Bulk decision confirmed by operations triage run.');
    const [bulkBusy, setBulkBusy] = useState(false);
    const [batchCards, setBatchCards] = useState<ApprovalBatchCard[]>([]);
    const [batchBusy, setBatchBusy] = useState(false);
    const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(focusedApprovalId ?? null);
    const [drawerTab, setDrawerTab] = useState<'summary' | 'evidence' | 'negotiate'>('summary');
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

    const [delegatingApprovalId, setDelegatingApprovalId] = useState<string | null>(null);
    const [delegateTargetUserId, setDelegateTargetUserId] = useState('');
    const [delegateExpiresAt, setDelegateExpiresAt] = useState('');
    const [delegateNote, setDelegateNote] = useState('');
    const [delegateBusy, setDelegateBusy] = useState(false);
    const [delegateResult, setDelegateResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [teamMembersLoaded, setTeamMembersLoaded] = useState(false);

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

                if (savedView === 'delegated_to_me') {
                    return Boolean(currentUserId && item.delegated_to_user_id === currentUserId);
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
        const selectedOptionId = decision === 'approved'
            ? (selectedOptionByApproval[approval.approval_id]?.trim() || undefined)
            : undefined;
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
                    selected_option_id: selectedOptionId,
                }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                decided_at?: string;
                decision_reason?: string | null;
                decision?: string;
                selected_option_id?: string | null;
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
                selected_option_id: body.selected_option_id ?? selectedOptionId ?? null,
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
            setSelectedOptionByApproval((prev) => {
                const next = { ...prev };
                delete next[approval.approval_id];
                return next;
            });
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
            const selectedOptionId = bulkDecision === 'approved'
                ? (selectedOptionByApproval[approval.approval_id]?.trim() || undefined)
                : undefined;
            const response = await fetch('/api/approvals/decision', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    approval_id: approval.approval_id,
                    workspace_id: workspaceId,
                    decision: bulkDecision,
                    reason: bulkReason.trim(),
                    selected_option_id: selectedOptionId,
                }),
            });

            if (!response.ok) {
                continue;
            }

            const body = (await response.json().catch(() => ({}))) as {
                decided_at?: string;
                decision_reason?: string | null;
                decision?: string;
                selected_option_id?: string | null;
            };

            const moved: ApprovalItem = {
                ...approval,
                decision_status: body.decision ?? bulkDecision,
                decided_at: body.decided_at ?? new Date().toISOString(),
                decision_reason: body.decision_reason ?? bulkReason.trim(),
                selected_option_id: body.selected_option_id ?? selectedOptionId ?? null,
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
        setSelectedOptionByApproval((prev) => {
            const next = { ...prev };
            for (const approval of selected) {
                delete next[approval.approval_id];
            }
            return next;
        });
        setBulkDecision(null);
        setBulkBusy(false);
        setMessage(`Bulk decision completed for ${processed} approvals.`);
    };

    const createBatchFromSelection = async () => {
        const selected = pending.filter((item) => selectedApprovals[item.approval_id]);
        if (selected.length === 0) {
            setMessage('Select at least one approval to create a batch card.');
            return;
        }

        setBatchBusy(true);
        setMessage(null);

        try {
            const response = await fetch('/api/approvals/batch/intake', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    task_id: selected[0]?.task_id ?? 'batch_task',
                    actions: selected.map((approval) => ({
                        task_id: approval.task_id ?? approval.approval_id,
                        action_type: approval.action_summary,
                        risk_level: approval.risk_level === 'high' ? 'high' : 'medium',
                        payload: { approval_id: approval.approval_id },
                    })),
                }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                batch?: {
                    batchId: string;
                    taskId: string;
                    status: 'pending' | 'approved_all' | 'rejected_all' | 'partial';
                    totalCount: number;
                    decision?: 'approve_all' | 'reject_all' | 'review_individually';
                    reason?: string;
                };
                error?: string;
                message?: string;
            };

            if (!response.ok || !body.batch) {
                setMessage(body.message ?? body.error ?? 'Failed to create approval batch.');
                return;
            }

            setBatchCards((prev) => [
                {
                    batchId: body.batch!.batchId,
                    taskId: body.batch!.taskId,
                    status: body.batch!.status,
                    totalCount: body.batch!.totalCount,
                    decision: body.batch!.decision,
                    reason: body.batch!.reason,
                },
                ...prev,
            ].slice(0, 10));
            setMessage(`Created batch ${body.batch.batchId} with ${body.batch.totalCount} approvals.`);
        } finally {
            setBatchBusy(false);
        }
    };

    const decideBatchCard = async (
        batchId: string,
        decision: 'approve_all' | 'reject_all' | 'review_individually',
    ) => {
        setBatchBusy(true);
        setMessage(null);

        try {
            const response = await fetch(`/api/approvals/batch/${encodeURIComponent(batchId)}/decision`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    decision,
                    reason: bulkReason.trim() || undefined,
                }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                batch?: ApprovalBatchCard;
                error?: string;
                message?: string;
            };

            if (!response.ok || !body.batch) {
                setMessage(body.message ?? body.error ?? 'Failed to decide approval batch.');
                return;
            }

            setBatchCards((prev) => prev.map((batch) => (batch.batchId === batchId
                ? {
                    ...batch,
                    status: body.batch!.status,
                    decision: body.batch!.decision,
                    reason: body.batch!.reason,
                }
                : batch)));
            setMessage(`Batch ${batchId} marked as ${body.batch.status}.`);
        } finally {
            setBatchBusy(false);
        }
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

    const escalateApproval = async (approvalId: string) => {
        const reason = escalateReasonByApproval[approvalId]?.trim();
        if (!reason) {
            setEscalateResultByApproval(prev => ({ ...prev, [approvalId]: { ok: false, msg: 'Please enter a reason for escalation.' } }));
            return;
        }
        setEscalateByApproval(prev => ({ ...prev, [approvalId]: true }));
        setEscalateResultByApproval(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
        try {
            const response = await fetch('/api/approvals/escalate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ workspace_id: workspaceId, approval_id: approvalId, reason }),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!response.ok) {
                setEscalateResultByApproval(prev => ({ ...prev, [approvalId]: { ok: false, msg: body.message ?? body.error ?? 'Escalation failed.' } }));
            } else {
                setEscalateResultByApproval(prev => ({ ...prev, [approvalId]: { ok: true, msg: 'Escalated successfully. A senior reviewer has been notified.' } }));
                setEscalateReasonByApproval(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
            }
        } catch {
            setEscalateResultByApproval(prev => ({ ...prev, [approvalId]: { ok: false, msg: 'Network error during escalation.' } }));
        } finally {
            setEscalateByApproval(prev => ({ ...prev, [approvalId]: false }));
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

    const fetchTeamMembers = async () => {
        if (teamMembersLoaded) {
            return;
        }
        try {
            const res = await fetch('/api/team/members');
            if (res.ok) {
                const data = (await res.json()) as { members?: TeamMember[] };
                setTeamMembers(data.members ?? []);
                setTeamMembersLoaded(true);
            }
        } catch {
            // non-fatal
        }
    };

    const openDelegateModal = (approvalId: string) => {
        setDelegatingApprovalId(approvalId);
        setDelegateTargetUserId('');
        setDelegateExpiresAt('');
        setDelegateNote('');
        setDelegateResult(null);
        void fetchTeamMembers();
    };

    const closeDelegateModal = () => {
        setDelegatingApprovalId(null);
        setDelegateResult(null);
    };

    const submitDelegation = async () => {
        if (!delegatingApprovalId || !delegateTargetUserId) {
            return;
        }
        setDelegateBusy(true);
        setDelegateResult(null);

        try {
            const body: Record<string, unknown> = {
                workspace_id: workspaceId,
                delegate_to_user_id: delegateTargetUserId,
            };
            if (delegateExpiresAt) {
                body.expires_at = new Date(delegateExpiresAt).toISOString();
            }
            if (delegateNote.trim()) {
                body.note = delegateNote.trim();
            }

            const res = await fetch(`/api/approvals/${encodeURIComponent(delegatingApprovalId)}/delegate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                delegated_to_user_name?: string;
                delegated_at?: string;
            };

            if (!res.ok) {
                setDelegateResult({ ok: false, msg: data.message ?? data.error ?? 'Delegation failed.' });
                return;
            }

            const delegateName =
                data.delegated_to_user_name ??
                teamMembers.find((m) => m.id === delegateTargetUserId)?.name ??
                delegateTargetUserId;

            setPending((prev) =>
                prev.map((a) =>
                    a.approval_id === delegatingApprovalId
                        ? {
                            ...a,
                            delegated_to_user_id: delegateTargetUserId,
                            delegated_to_user_name: delegateName,
                            delegated_by_user_id: currentUserId,
                            delegated_at: data.delegated_at ?? new Date().toISOString(),
                        }
                        : a,
                ),
            );

            setDelegateResult({ ok: true, msg: `Delegated to ${delegateName}.` });
            setTimeout(() => {
                closeDelegateModal();
            }, 1400);
        } finally {
            setDelegateBusy(false);
        }
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
            <p style={{ margin: '-0.45rem 0 0.7rem', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
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
                    <option value="delegated_to_me">View: delegated to me</option>
                </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>Capture decisions with reasons, latency, and escalation control.</span>
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
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                    Selected: {Object.values(selectedApprovals).filter(Boolean).length}
                </span>
                <button
                    type="button"
                    className="chip-button"
                    onClick={() => void createBatchFromSelection()}
                    disabled={batchBusy}
                >
                    {batchBusy ? 'Batching…' : 'Create Batch Card'}
                </button>
            </div>

            {batchCards.length > 0 && (
                <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.85rem' }}>
                    {batchCards.map((batch) => (
                        <div key={batch.batchId} className="message-inline" style={{ display: 'grid', gap: '0.35rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <span>
                                    Batch <strong>{batch.batchId.slice(0, 12)}</strong> | Task <strong>{batch.taskId}</strong> | Count <strong>{batch.totalCount}</strong>
                                </span>
                                <span className={batch.status === 'pending' ? 'badge medium' : 'badge low'}>{batch.status}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <button type="button" className="secondary-action" disabled={batchBusy || batch.status !== 'pending'} onClick={() => void decideBatchCard(batch.batchId, 'approve_all')}>
                                    Approve All
                                </button>
                                <button type="button" className="danger-action" disabled={batchBusy || batch.status !== 'pending'} onClick={() => void decideBatchCard(batch.batchId, 'reject_all')}>
                                    Reject All
                                </button>
                                <button type="button" className="warn-action" disabled={batchBusy || batch.status !== 'pending'} onClick={() => void decideBatchCard(batch.batchId, 'review_individually')}>
                                    Review Individually
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
                            const whatIfOptions = parseWhatIfOptions(approval.action_summary);
                            const selectedOptionValue = selectedOptionByApproval[approval.approval_id]
                                ?? approval.selected_option_id
                                ?? '';
                            return (
                                <tr
                                    key={approval.approval_id}
                                    style={focusedApprovalId === approval.approval_id ? { background: 'var(--info-bg)' } : undefined}
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
                                                <div style={{ display: 'grid', gap: '0.18rem', fontSize: '0.78rem', color: 'var(--ink-muted)', paddingLeft: '1.55rem' }}>
                                                    {approval.impacted_scope && <span>Scope: {approval.impacted_scope}</span>}
                                                    {approval.risk_reason && <span>Risk: {approval.risk_reason}</span>}
                                                    {approval.proposed_rollback && <span>Rollback: {approval.proposed_rollback}</span>}
                                                    <span>Quality: {getQualityStatus(approval)}</span>
                                                </div>
                                            )}
                                            {approval.gate_type && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', paddingLeft: '1.55rem', flexWrap: 'wrap' }}>
                                                    <span className={gateCategoryBadgeClass(approval.gate_category ?? 'quality')}>
                                                        {approval.gate_category ?? 'quality'}
                                                    </span>
                                                    <span style={{ color: 'var(--ink-muted)' }}>human validation gate — {approval.gate_type}</span>
                                                </div>
                                            )}
                                            <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
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
                                            {approval.delegated_to_user_id && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '0.3rem', paddingLeft: '1.55rem' }}>
                                                    <span style={{ padding: '0.1rem 0.45rem', borderRadius: 9999, background: 'rgba(3,105,161,0.08)', border: '1px solid rgba(3,105,161,0.2)', fontWeight: 600 }}>
                                                        → {approval.delegated_to_user_name ?? approval.delegated_to_user_id}
                                                    </span>
                                                    {approval.delegation_expires_at && (
                                                        <span style={{ color: 'var(--ink-muted)' }}>
                                                            expires {new Date(approval.delegation_expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
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
                                                {whatIfOptions.length > 0 && (
                                                    <select
                                                        value={selectedOptionValue}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSelectedOptionByApproval((prev) => ({
                                                                ...prev,
                                                                [approval.approval_id]: value,
                                                            }));
                                                        }}
                                                        className="approval-select"
                                                        aria-label="Select what-if option"
                                                    >
                                                        <option value="">No option selected</option>
                                                        {whatIfOptions.map((option) => (
                                                            <option key={option.optionId} value={option.optionId}>
                                                                {option.optionId}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void submitDecision(approval, 'approved')}
                                                    className="ok-action"
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
                                                <button
                                                    type="button"
                                                    disabled={escalateByApproval[approval.approval_id] === true}
                                                    onClick={() => {
                                                        setSelectedApprovalId(approval.approval_id);
                                                        setDrawerTab('summary');
                                                        // Scroll the escalation section into view after drawer opens
                                                        setTimeout(() => {
                                                            const el = document.querySelector('[data-escalate-section]');
                                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }, 150);
                                                    }}
                                                    className="warn-action"
                                                >
                                                    ↑ Escalate
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openDelegateModal(approval.approval_id)}
                                                    className="info-action"
                                                >
                                                    → Delegate
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
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
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
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{approval.impacted_scope}</span>
                                                )}
                                                {approval.selected_option_id && (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                                        Option: {approval.selected_option_id}
                                                    </span>
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
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                <span>Recent page {recentPage} of {recentPageCount}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => setRecentPage((v) => Math.max(1, v - 1))} disabled={recentPage <= 1}>Prev</button>
                    <button type="button" onClick={() => setRecentPage((v) => Math.min(recentPageCount, v + 1))} disabled={recentPage >= recentPageCount}>Next</button>
                </div>
            </div>

            {delegatingApprovalId && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Delegate approval"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(12,18,28,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeDelegateModal(); }}
                >
                    <div style={{ width: 'min(26rem, 95%)', background: 'var(--card)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 24px 48px rgba(15,23,42,0.22)', display: 'grid', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>Delegate Approval</h3>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                    Assign this approval to another team member for review.
                                </p>
                            </div>
                            <button type="button" className="chip-button" onClick={closeDelegateModal}>Close</button>
                        </div>

                        <div style={{ display: 'grid', gap: '0.55rem' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                Delegate to
                                <select
                                    value={delegateTargetUserId}
                                    onChange={(e) => setDelegateTargetUserId(e.target.value)}
                                    className="approval-select"
                                    style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}
                                >
                                    <option value="">— select team member —</option>
                                    {teamMembers
                                        .filter((m) => m.id !== currentUserId)
                                        .map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} ({m.email})
                                            </option>
                                        ))}
                                </select>
                            </label>

                            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                Decision deadline <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span>
                                <input
                                    type="datetime-local"
                                    value={delegateExpiresAt}
                                    onChange={(e) => setDelegateExpiresAt(e.target.value)}
                                    className="approval-input"
                                    style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}
                                    min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                                />
                            </label>

                            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                Note <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span>
                                <input
                                    type="text"
                                    value={delegateNote}
                                    onChange={(e) => setDelegateNote(e.target.value)}
                                    placeholder="Why are you delegating this?"
                                    className="approval-input"
                                    style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}
                                />
                            </label>
                        </div>

                        {delegateResult && (
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.4rem', background: delegateResult.ok ? 'rgba(26,122,74,0.07)' : 'rgba(196,22,28,0.07)', border: `1px solid ${delegateResult.ok ? 'rgba(26,122,74,0.2)' : 'rgba(196,22,28,0.2)'}`, fontSize: '0.82rem', color: delegateResult.ok ? 'var(--ok)' : 'var(--danger)' }}>
                                {delegateResult.ok ? '✓ ' : '⚠ '}{delegateResult.msg}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="chip-button" onClick={closeDelegateModal} disabled={delegateBusy}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void submitDelegation()}
                                disabled={delegateBusy || !delegateTargetUserId}
                                style={{ padding: '0.45rem 1rem', borderRadius: 9999, border: '1px solid rgba(3,105,161,0.35)', background: delegateBusy || !delegateTargetUserId ? 'var(--bg-deep)' : 'var(--info-bg)', color: delegateBusy || !delegateTargetUserId ? 'var(--ink-muted)' : 'var(--info)', fontSize: '0.82rem', fontWeight: 700, cursor: delegateBusy || !delegateTargetUserId ? 'not-allowed' : 'pointer' }}
                            >
                                {delegateBusy ? 'Delegating…' : '→ Delegate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            background: 'var(--warn-bg)',
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
                                <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{selectedApproval.approval_id}</span>
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
                                    background: drawerTab === 'summary' ? 'var(--warn-bg)' : 'transparent',
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
                                    background: drawerTab === 'evidence' ? 'var(--warn-bg)' : 'transparent',
                                    border: 'none',
                                    borderBottom: drawerTab === 'evidence' ? '2px solid #b45309' : 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: drawerTab === 'evidence' ? 'bold' : 'normal',
                                }}
                            >
                                Evidence
                            </button>
                            {selectedApproval.gate_type === 'negotiation' && (
                                <button
                                    type="button"
                                    onClick={() => setDrawerTab('negotiate')}
                                    style={{
                                        padding: '0.5rem 0.75rem',
                                        background: drawerTab === 'negotiate' ? 'var(--info-bg)' : 'transparent',
                                        border: 'none',
                                        borderBottom: drawerTab === 'negotiate' ? '2px solid #2C8A8A' : 'none',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: drawerTab === 'negotiate' ? 'bold' : 'normal',
                                        color: 'var(--info)',
                                    }}
                                >
                                    Negotiate
                                </button>
                            )}
                        </div>

                        <div style={{ overflowY: 'auto', display: 'grid', gap: '0.65rem' }}>
                            {drawerTab === 'summary' && (
                                <>
                                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                        <span className={riskBadgeClass(selectedApproval.risk_level)}>{selectedApproval.risk_level}</span>
                                        <span className="badge">{selectedApproval.decision_status}</span>
                                        <span className="badge">{selectedApproval.packet_complete ? 'packet complete' : 'summary fallback'}</span>
                                    </div>

                                    {selectedApproval.gate_type && (
                                        <div style={{
                                            background: selectedApproval.gate_category === 'compliance' ? 'var(--danger-bg)' : selectedApproval.gate_category === 'strategy' ? 'var(--info-bg)' : 'var(--bg)',
                                            border: '1px solid',
                                            borderColor: selectedApproval.gate_category === 'compliance' ? 'var(--danger-border)' : selectedApproval.gate_category === 'strategy' ? 'var(--info-border)' : 'var(--line)',
                                            borderRadius: '0.35rem',
                                            padding: '0.65rem',
                                            display: 'grid',
                                            gap: '0.35rem',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <span className={gateCategoryBadgeClass(selectedApproval.gate_category ?? 'quality')}>
                                                    {selectedApproval.gate_category ?? 'quality'}
                                                </span>
                                                <strong>Human Validation Gate</strong>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>— {selectedApproval.gate_type}</span>
                                            </div>
                                            {selectedApproval.change_summary && (
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{selectedApproval.change_summary}</p>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <strong>Requested</strong>
                                        <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{new Date(selectedApproval.requested_at).toLocaleString()}</p>
                                    </div>
                                    {selectedApproval.decided_at && (
                                        <div>
                                            <strong>Decided</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{new Date(selectedApproval.decided_at).toLocaleString()}</p>
                                        </div>
                                    )}
                                    {selectedApproval.impacted_scope && (
                                        <div>
                                            <strong>Impacted Scope</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.impacted_scope}</p>
                                        </div>
                                    )}
                                    {selectedApproval.risk_reason && (
                                        <div>
                                            <strong>Risk Reason</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.risk_reason}</p>
                                        </div>
                                    )}
                                    {selectedApproval.proposed_rollback && (
                                        <div>
                                            <strong>Rollback Plan</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.proposed_rollback}</p>
                                        </div>
                                    )}
                                    <div>
                                        <strong>Quality Gate</strong>
                                        <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{getQualityStatus(selectedApproval)}</p>
                                    </div>
                                    {selectedApproval.decision_reason && (
                                        <div>
                                            <strong>Decision Reason</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.decision_reason}</p>
                                        </div>
                                    )}
                                    {selectedApproval.selected_option_id && (
                                        <div>
                                            <strong>Selected What-If Option</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.selected_option_id}</p>
                                        </div>
                                    )}
                                    {selectedApproval.change_summary && selectedApproval.change_summary !== selectedApproval.action_summary && (
                                        <div>
                                            <strong>Raw Action Summary</strong>
                                            <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-soft)' }}>{selectedApproval.action_summary}</p>
                                        </div>
                                    )}

                                    {/* ── Delegation info ─────────────────────────────────── */}
                                    {selectedApproval.delegated_to_user_id && (
                                        <div style={{ padding: '0.65rem 0.75rem', borderRadius: '0.4rem', background: 'rgba(3,105,161,0.05)', border: '1px solid rgba(3,105,161,0.18)', display: 'grid', gap: '0.3rem' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Delegated</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--info)' }}>
                                                → <strong>{selectedApproval.delegated_to_user_name ?? selectedApproval.delegated_to_user_id}</strong>
                                            </div>
                                            {selectedApproval.delegated_at && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                                    since {new Date(selectedApproval.delegated_at).toLocaleString()}
                                                </div>
                                            )}
                                            {selectedApproval.delegation_expires_at && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--warn)' }}>
                                                    deadline: {new Date(selectedApproval.delegation_expires_at).toLocaleString()}
                                                </div>
                                            )}
                                            {selectedApproval.decision_status === 'pending' && (
                                                <button
                                                    type="button"
                                                    onClick={() => openDelegateModal(selectedApproval.approval_id)}
                                                    style={{ marginTop: '0.3rem', alignSelf: 'flex-start', padding: '0.3rem 0.65rem', borderRadius: 9999, border: '1px solid rgba(3,105,161,0.3)', background: 'rgba(3,105,161,0.07)', color: 'var(--info)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Re-delegate
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Per-approval escalation ─────────────────────────── */}
                                    {selectedApproval.decision_status === 'pending' && (() => {
                                        const id = selectedApproval.approval_id;
                                        const busy = escalateByApproval[id] === true;
                                        const result = escalateResultByApproval[id];
                                        const reason = escalateReasonByApproval[id] ?? '';
                                        return (
                                            <div data-escalate-section style={{ borderTop: '1px solid #e5e5ea', paddingTop: 14, marginTop: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(180,83,9,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <span style={{ fontSize: 13 }}>↑</span>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Escalate to Senior Reviewer</div>
                                                        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>This decision is above my authority</div>
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={reason}
                                                    onChange={e => setEscalateReasonByApproval(prev => ({ ...prev, [id]: e.target.value }))}
                                                    placeholder="Why are you escalating? e.g. This touches production data — needs VP approval."
                                                    rows={2}
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                />
                                                {result && (
                                                    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: result.ok ? 'rgba(26,122,74,0.07)' : 'rgba(196,22,28,0.07)', border: `1px solid ${result.ok ? 'rgba(26,122,74,0.2)' : 'rgba(196,22,28,0.2)'}`, fontSize: 12, color: result.ok ? 'var(--ok)' : 'var(--danger)' }}>
                                                        {result.ok ? '✓ ' : '⚠ '}{result.msg}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void escalateApproval(id)}
                                                    disabled={busy || !reason.trim()}
                                                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, border: '1px solid rgba(180,83,9,0.35)', background: busy || !reason.trim() ? 'var(--bg-deep)' : 'color-mix(in srgb, var(--warn) 8%, transparent)', color: busy || !reason.trim() ? 'var(--ink-muted)' : 'var(--warn)', fontSize: 12, fontWeight: 700, cursor: busy || !reason.trim() ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                                                >
                                                    ↑ {busy ? 'Escalating…' : 'Escalate'}
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </>
                            )}

                            {drawerTab === 'negotiate' && (() => {
                                const busy = busyByApproval[selectedApproval.approval_id] === true;
                                const negotiationOptions = parseWhatIfOptions(selectedApproval.action_summary);
                                const selectedOptionValue =
                                    selectedOptionByApproval[selectedApproval.approval_id]
                                    ?? selectedApproval.selected_option_id
                                    ?? '';

                                // Parse the full action_summary for display (lines before "Option N")
                                const summaryLines = selectedApproval.action_summary
                                    .split(/\r?\n/)
                                    .filter((line) => !line.match(/^Option\s+\d+\s*\(/i));

                                return (
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {/* Context block */}
                                        <div style={{
                                            background: 'var(--info-bg)',
                                            border: '1px solid var(--info-border)',
                                            borderRadius: '0.35rem',
                                            padding: '0.75rem',
                                            display: 'grid',
                                            gap: '0.35rem',
                                        }}>
                                            <strong style={{ color: 'var(--info)', fontSize: '0.85rem' }}>Negotiation Request</strong>
                                            <pre style={{
                                                margin: 0,
                                                fontSize: '0.78rem',
                                                color: 'var(--info)',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                fontFamily: 'inherit',
                                                lineHeight: 1.55,
                                            }}>
                                                {summaryLines.join('\n').trim()}
                                            </pre>
                                        </div>

                                        {/* Options */}
                                        {negotiationOptions.length > 0 ? (
                                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                                <strong style={{ fontSize: '0.85rem' }}>Select an Option</strong>
                                                {negotiationOptions.map((option) => {
                                                    const isSelected = selectedOptionValue === option.optionId;
                                                    return (
                                                        <label
                                                            key={option.optionId}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '0.5rem',
                                                                padding: '0.55rem 0.7rem',
                                                                borderRadius: '0.3rem',
                                                                border: `1px solid ${isSelected ? 'var(--info)' : 'var(--line)'}`,
                                                                background: isSelected ? 'var(--info-bg)' : 'var(--bg)',
                                                                cursor: selectedApproval.decision_status !== 'pending' ? 'default' : 'pointer',
                                                            }}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name={`negotiate-option-${selectedApproval.approval_id}`}
                                                                value={option.optionId}
                                                                checked={isSelected}
                                                                disabled={selectedApproval.decision_status !== 'pending'}
                                                                onChange={() => {
                                                                    setSelectedOptionByApproval((prev) => ({
                                                                        ...prev,
                                                                        [selectedApproval.approval_id]: option.optionId,
                                                                    }));
                                                                }}
                                                                style={{ marginTop: '0.15rem', flexShrink: 0 }}
                                                            />
                                                            <div style={{ display: 'grid', gap: '0.15rem' }}>
                                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--info)' }}>
                                                                    {option.optionId}
                                                                </span>
                                                                <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{option.summary}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                                                No options found in the action summary.
                                            </p>
                                        )}

                                        {/* Decision buttons — only when still pending */}
                                        {selectedApproval.decision_status === 'pending' && (
                                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Decision reason (optional)"
                                                    value={reasonByApproval[selectedApproval.approval_id] ?? ''}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setReasonByApproval((prev) => ({
                                                            ...prev,
                                                            [selectedApproval.approval_id]: value,
                                                        }));
                                                    }}
                                                    className="approval-input"
                                                    style={{ minWidth: 0, width: '100%' }}
                                                />
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button
                                                        type="button"
                                                        disabled={busy || !selectedOptionValue}
                                                        onClick={() => void submitDecision(selectedApproval, 'approved')}
                                                        className="secondary-action"
                                                        title={!selectedOptionValue ? 'Select an option first' : 'Accept selected option'}
                                                    >
                                                        Accept Option
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => void submitDecision(selectedApproval, 'rejected')}
                                                        className="danger-action"
                                                    >
                                                        Reject All
                                                    </button>
                                                </div>
                                                {!selectedOptionValue && (
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--warn)', margin: 0 }}>
                                                        Select an option above before clicking &ldquo;Accept Option&rdquo;.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Already-decided state */}
                                        {selectedApproval.decision_status !== 'pending' && (
                                            <div style={{
                                                padding: '0.55rem 0.7rem',
                                                borderRadius: '0.3rem',
                                                background: selectedApproval.decision_status === 'approved' ? 'var(--ok-bg)' : 'var(--danger-bg)',
                                                border: `1px solid ${selectedApproval.decision_status === 'approved' ? 'var(--ok)' : 'var(--danger)'}`,
                                                fontSize: '0.82rem',
                                                color: selectedApproval.decision_status === 'approved' ? 'var(--ok)' : 'var(--danger)',
                                            }}>
                                                Decision: <strong>{selectedApproval.decision_status}</strong>
                                                {selectedApproval.selected_option_id && (
                                                    <> — selected option: <strong>{selectedApproval.selected_option_id}</strong></>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {drawerTab === 'evidence' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                                    {/* Loading */}
                                    {evidenceBusy && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {[1,2,3].map(i => <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--bg)' }} />)}
                                        </div>
                                    )}

                                    {/* No evidence */}
                                    {!evidenceBusy && evidenceData && evidenceData.total === 0 && (
                                        <div style={{ padding: '20px 16px', textAlign: 'center', borderRadius: 12, border: '1px dashed #d2d2d7', background: 'var(--bg)' }}>
                                            <div style={{ fontSize: 22, marginBottom: 6 }}>📋</div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>No evidence bundle yet</div>
                                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                                                The agent has not submitted an evidence bundle for this approval.
                                                Evidence is attached when an agent packages context for a high-risk action.
                                            </div>
                                        </div>
                                    )}

                                    {/* Evidence record */}
                                    {!evidenceBusy && evidenceData && (() => {
                                        const rec = evidenceData.evidence[0];
                                        const pagination = getEvidencePaginationState(evidenceData.total, evidenceData.limit, evidenceData.offset);
                                        if (!rec) return null;

                                        const fieldStyle: React.CSSProperties = {
                                            background: 'var(--card)', border: '1px solid var(--line)',
                                            borderRadius: 10, padding: '10px 12px',
                                        };
                                        const labelStyle: React.CSSProperties = {
                                            fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4,
                                        };
                                        const valueStyle: React.CSSProperties = {
                                            fontSize: 13, color: 'var(--ink)', lineHeight: 1.45,
                                            fontFamily: rec.connector_used ? 'ui-monospace, monospace' : undefined,
                                        };

                                        return (
                                            <>
                                                {/* Evidence count badge */}
                                                {evidenceData.total > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', padding: '2px 8px', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px solid rgba(45, 138, 138,0.18)' }}>
                                                            {evidenceData.total} evidence record{evidenceData.total !== 1 ? 's' : ''}
                                                        </span>
                                                        {evidenceData.total > 1 && (
                                                            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                                                Showing {pagination.startIndex}–{pagination.endIndex} of {evidenceData.total}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Context fields */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                                                    {rec.connector_used && (
                                                        <div style={fieldStyle}>
                                                            <div style={labelStyle}>Connector</div>
                                                            <div style={valueStyle}>{rec.connector_used}</div>
                                                        </div>
                                                    )}

                                                    {rec.actor_id && (
                                                        <div style={fieldStyle}>
                                                            <div style={labelStyle}>Actor (Bot)</div>
                                                            <div style={{ ...valueStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{rec.actor_id}</div>
                                                        </div>
                                                    )}

                                                    {rec.approval_reason && (
                                                        <div style={fieldStyle}>
                                                            <div style={labelStyle}>Agent's Justification</div>
                                                            <div style={{ ...valueStyle, fontFamily: undefined }}>{rec.approval_reason}</div>
                                                        </div>
                                                    )}

                                                    {rec.action_outcome && (
                                                        <div style={{ ...fieldStyle, borderColor: rec.action_outcome.error_reason ? 'rgba(196,22,28,0.3)' : 'rgba(26,122,74,0.3)', background: rec.action_outcome.error_reason ? 'rgba(196,22,28,0.04)' : 'rgba(26,122,74,0.04)' }}>
                                                            <div style={{ ...labelStyle, color: rec.action_outcome.error_reason ? 'var(--danger)' : 'var(--ok)' }}>Action Outcome</div>
                                                            <div style={{ ...valueStyle, fontFamily: undefined, color: rec.action_outcome.error_reason ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>
                                                                {rec.action_outcome.result_summary ?? 'Pending'}
                                                            </div>
                                                            {rec.action_outcome.error_reason && (
                                                                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                                                                    {rec.action_outcome.error_reason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Quality gates */}
                                                {rec.quality_gate_results && rec.quality_gate_results.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                                                            Quality Gates ({rec.quality_gate_results.length})
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                            {rec.quality_gate_results.map((check, idx) => {
                                                                const passed = check.status === 'passed';
                                                                const failed = check.status === 'failed';
                                                                return (
                                                                    <div key={idx} style={{
                                                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                                                        padding: '8px 10px', borderRadius: 9,
                                                                        background: passed ? 'rgba(26,122,74,0.06)' : failed ? 'rgba(196,22,28,0.06)' : 'rgba(180,83,9,0.06)',
                                                                        border: `1px solid ${passed ? 'rgba(26,122,74,0.2)' : failed ? 'rgba(196,22,28,0.2)' : 'rgba(180,83,9,0.2)'}`,
                                                                    }}>
                                                                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{passed ? '✅' : failed ? '❌' : '⚠️'}</span>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: 12, fontWeight: 700, color: passed ? 'var(--ok)' : failed ? 'var(--danger)' : 'var(--warn)' }}>
                                                                                {check.checkType}
                                                                            </div>
                                                                            {check.details && (
                                                                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{check.details}</div>
                                                                            )}
                                                                        </div>
                                                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: passed ? 'var(--ok)' : failed ? 'var(--danger)' : 'var(--warn)', flexShrink: 0 }}>
                                                                            {check.status}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Execution logs */}
                                                {rec.execution_logs && rec.execution_logs.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                                                            Execution Logs
                                                        </div>
                                                        <div style={{ background: 'var(--bg-deep)', borderRadius: 10, padding: '10px 12px', maxHeight: '180px', overflowY: 'auto' }}>
                                                            {rec.execution_logs.slice(-10).map((log, idx) => {
                                                                const color = log.level === 'error' ? 'var(--danger)' : log.level === 'warn' ? 'var(--warn)' : 'var(--ok)';
                                                                return (
                                                                    <div key={idx} style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, display: 'flex', gap: 8 }}>
                                                                        <span style={{ color: 'var(--ink-muted)', flexShrink: 0 }}>
                                                                            {log.timestamp.split('T')[1]?.slice(0, 8)}
                                                                        </span>
                                                                        <span style={{ color, flexShrink: 0, fontWeight: 700 }}>
                                                                            {log.level.toUpperCase()}
                                                                        </span>
                                                                        <span style={{ color: 'var(--ink)' }}>{log.message}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Pagination */}
                                                {evidenceData.total > 1 && evidencePaginationEnabled && (
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 4 }}>
                                                        <button type="button" className="chip-button"
                                                            disabled={!pagination.canPrev || evidenceBusy}
                                                            onClick={() => void fetchEvidence(selectedApproval.approval_id, { offset: normalizeEvidenceOffset(evidenceData.total, evidenceData.limit, Math.max(0, evidenceOffset - evidenceData.limit)) })}>
                                                            ← Newer
                                                        </button>
                                                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                                            Page {pagination.page} / {pagination.pageCount}
                                                        </span>
                                                        <button type="button" className="chip-button"
                                                            disabled={!pagination.canNext || evidenceBusy}
                                                            onClick={() => void fetchEvidence(selectedApproval.approval_id, { offset: normalizeEvidenceOffset(evidenceData.total, evidenceData.limit, evidenceOffset + evidenceData.limit) })}>
                                                            Older →
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}
