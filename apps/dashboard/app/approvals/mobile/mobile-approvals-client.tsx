'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Clock, ChevronDown, ChevronUp, Zap } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high';
type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'timeout_rejected';

type Approval = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
    change_summary?: string;
    risk_level: RiskLevel;
    decision_status: DecisionStatus;
    requested_at: string;
    decided_at: string | null;
    decision_reason: string | null;
};

type Metrics = {
    pending_count: number;
    decision_count: number;
    p95_decision_latency_seconds: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; color: string; border: string }> = {
    high:   { label: 'HIGH',   bg: '#fef2f2', color: 'var(--danger)', border: '#fecaca' },
    medium: { label: 'MEDIUM', bg: '#fffbeb', color: 'var(--warn)', border: '#fde68a' },
    low:    { label: 'LOW',    bg: '#f0fdf4', color: 'var(--ok)', border: '#bbf7d0' },
};

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

function parseActionSummary(raw: string): string {
    try {
        const obj = JSON.parse(raw) as { change_summary?: string; action?: string; description?: string };
        return obj.change_summary ?? obj.action ?? obj.description ?? raw;
    } catch {
        return raw;
    }
}

// ── ApprovalCard ─────────────────────────────────────────────────────────────

function ApprovalCard({
    approval,
    onDecision,
}: {
    approval: Approval;
    onDecision: (id: string, workspaceId: string, decision: 'approved' | 'rejected', reason?: string) => Promise<void>;
}) {
    const risk = RISK_CONFIG[approval.risk_level] ?? RISK_CONFIG.medium;
    const summary = parseActionSummary(approval.action_summary);

    const [expanded, setExpanded] = useState(false);
    const [showReject, setShowReject] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<'approved' | 'rejected' | null>(null);

    const handleDecide = async (decision: 'approved' | 'rejected') => {
        setBusy(true);
        try {
            await onDecision(approval.approval_id, approval.workspace_id, decision, reason || undefined);
            setFlash(decision);
        } finally {
            setBusy(false);
        }
    };

    // Flash overlay while the card is being removed
    if (flash) {
        return (
            <div style={{
                borderRadius: 16, border: '1px solid var(--line)',
                background: flash === 'approved' ? '#f0fdf4' : '#fef2f2',
                padding: '28px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                minHeight: 80, transition: 'opacity 0.3s',
            }}>
                {flash === 'approved'
                    ? <CheckCircle size={28} color="#166534" />
                    : <XCircle size={28} color="#991b1b" />}
                <span style={{ fontSize: 13, fontWeight: 600, color: flash === 'approved' ? '#166534' : '#991b1b' }}>
                    {flash === 'approved' ? 'Approved' : 'Rejected'}
                </span>
            </div>
        );
    }

    return (
        <div style={{
            borderRadius: 16,
            border: `1px solid ${risk.border}`,
            background: 'var(--card)',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
            {/* Risk stripe */}
            <div style={{ height: 4, background: risk.color, opacity: 0.7 }} />

            <div style={{ padding: '16px 18px 0' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                        padding: '3px 9px', borderRadius: 9999,
                        background: risk.bg, color: risk.color, border: `1px solid ${risk.border}`,
                    }}>
                        {risk.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {timeAgo(approval.requested_at)}
                    </span>
                </div>

                {/* Agent + task */}
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontFamily: 'monospace' }}>
                    {approval.bot_id.slice(-10)}
                    {approval.task_id ? ` · task ${approval.task_id.slice(-6)}` : ''}
                </div>

                {/* Action summary */}
                <p style={{
                    fontSize: 14, fontWeight: 500, color: '#0f172a',
                    lineHeight: 1.55, margin: 0,
                    display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 3,
                    WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
                }}>
                    {summary}
                </p>

                {summary.length > 120 && (
                    <button
                        onClick={() => setExpanded(e => !e)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 12, color: 'var(--info)', background: 'none',
                            border: 'none', padding: '6px 0 0', cursor: 'pointer', fontWeight: 600,
                        }}
                    >
                        {expanded ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Show more</>}
                    </button>
                )}
            </div>

            {/* Reject reason input */}
            {showReject && (
                <div style={{ padding: '10px 18px 0' }}>
                    <textarea
                        placeholder="Reason for rejection (optional)…"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={2}
                        style={{
                            width: '100%', padding: '9px 12px',
                            borderRadius: 10, border: '1px solid var(--line)',
                            fontSize: 13, fontFamily: 'inherit', resize: 'none',
                            background: 'var(--bg)', boxSizing: 'border-box',
                            color: '#0f172a',
                        }}
                    />
                </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px 18px' }}>
                <button
                    onClick={() => handleDecide('approved')}
                    disabled={busy}
                    style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        minHeight: 52, borderRadius: 12,
                        background: busy ? '#e2e8f0' : '#16a34a',
                        color: busy ? '#94a3b8' : '#fff',
                        border: 'none', fontSize: 15, fontWeight: 700,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        transition: 'background 0.15s',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    <CheckCircle size={18} />
                    Approve
                </button>

                {showReject ? (
                    <button
                        onClick={() => handleDecide('rejected')}
                        disabled={busy}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            minHeight: 52, borderRadius: 12,
                            background: busy ? '#e2e8f0' : '#dc2626',
                            color: busy ? '#94a3b8' : '#fff',
                            border: 'none', fontSize: 15, fontWeight: 700,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <XCircle size={18} />
                        Confirm
                    </button>
                ) : (
                    <button
                        onClick={() => setShowReject(true)}
                        disabled={busy}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            minHeight: 52, borderRadius: 12,
                            background: 'var(--card)', color: 'var(--danger)',
                            border: '2px solid #fecaca',
                            fontSize: 15, fontWeight: 700,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <XCircle size={18} />
                        Reject
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MobileApprovalsClient({ workspaceIds }: { workspaceIds: string[] }) {
    const workspaceId = workspaceIds[0] ?? '';

    const [pending, setPending] = useState<Approval[]>([]);
    const [metrics, setMetrics] = useState<Metrics>({ pending_count: 0, decision_count: 0, p95_decision_latency_seconds: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!workspaceId) { setLoading(false); return; }
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/approvals`, { cache: 'no-store' });
            const data = (await res.json()) as {
                pending_approvals?: Approval[];
                approval_metrics?: Metrics;
                error?: string;
            };
            if (!res.ok) { setError(data.error ?? 'Failed to load approvals'); return; }
            // Sort: high risk first, then by age (oldest first)
            const sorted = (data.pending_approvals ?? []).sort((a, b) => {
                const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
                const rd = (riskOrder[a.risk_level] ?? 1) - (riskOrder[b.risk_level] ?? 1);
                if (rd !== 0) return rd;
                return new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime();
            });
            setPending(sorted);
            if (data.approval_metrics) setMetrics(data.approval_metrics);
            setLastRefreshed(new Date());
        } catch { setError('Network error. Pull to refresh.'); }
        finally { setLoading(false); setRefreshing(false); }
    }, [workspaceId]);

    // Initial load + auto-refresh every 30s
    useEffect(() => {
        void load();
        timerRef.current = setInterval(() => void load(true), 30_000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [load]);

    const handleDecision = useCallback(async (
        approvalId: string,
        wsId: string,
        decision: 'approved' | 'rejected',
        reason?: string,
    ) => {
        const res = await fetch('/api/approvals/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_id: approvalId, workspace_id: wsId, decision, reason }),
        });
        if (res.ok) {
            // Optimistic removal — small delay to let the flash animation show
            setTimeout(() => {
                setPending(prev => prev.filter(a => a.approval_id !== approvalId));
                setMetrics(m => ({ ...m, pending_count: Math.max(0, m.pending_count - 1) }));
            }, 600);
        } else {
            const body = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(body.message ?? 'Decision failed');
        }
    }, []);

    const highCount  = pending.filter(a => a.risk_level === 'high').length;
    const medCount   = pending.filter(a => a.risk_level === 'medium').length;
    const lowCount   = pending.filter(a => a.risk_level === 'low').length;

    return (
        <div style={{
            minHeight: '100dvh',
            background: 'var(--bg)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: 480, margin: '0 auto',
            // Respect iOS safe areas
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}>
            {/* ── Sticky header ── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: '#0f172a',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                boxShadow: '0 1px 8px rgba(0,0,0,0.25)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={16} color="#fff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>Approvals</span>
                                {metrics.pending_count > 0 && (
                                    <span style={{
                                        fontSize: 11, fontWeight: 700,
                                        background: '#ef4444', color: '#fff',
                                        borderRadius: 9999, padding: '1px 7px',
                                    }}>
                                        {metrics.pending_count}
                                    </span>
                                )}
                            </div>
                            {lastRefreshed && (
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                    Updated {timeAgo(lastRefreshed.toISOString())}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => void load(true)}
                        disabled={refreshing}
                        aria-label="Refresh"
                        style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: 'rgba(255,255,255,0.08)', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--ink-muted)',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Risk distribution bar */}
                {pending.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, padding: '0 18px 14px' }}>
                        {highCount > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: '#7f1d1d', color: '#fca5a5' }}>
                                {highCount} high
                            </span>
                        )}
                        {medCount > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: '#78350f', color: '#fcd34d' }}>
                                {medCount} medium
                            </span>
                        )}
                        {lowCount > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: '#14532d', color: '#86efac' }}>
                                {lowCount} low
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Error */}
                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', borderRadius: 12,
                        background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                        fontSize: 13, fontWeight: 500,
                    }}>
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                        <button
                            onClick={() => void load()}
                            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Loading skeletons */}
                {loading && (
                    <>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ borderRadius: 16, background: 'var(--card)', height: 180, border: '1px solid var(--line)', overflow: 'hidden' }}>
                                <div style={{ height: 4, background: 'var(--line)' }} />
                                <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ height: 20, width: '30%', background: 'var(--bg)', borderRadius: 9999 }} />
                                    <div style={{ height: 14, width: '90%', background: 'var(--bg)', borderRadius: 8 }} />
                                    <div style={{ height: 14, width: '75%', background: 'var(--bg)', borderRadius: 8 }} />
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Empty state */}
                {!loading && !error && pending.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 9999, background: 'var(--ok-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={32} color="#16a34a" />
                        </div>
                        <div>
                            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>All caught up!</div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>No pending approvals right now.</div>
                        </div>
                        {metrics.decision_count > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                {metrics.decision_count} decision{metrics.decision_count !== 1 ? 's' : ''} made this session
                                {metrics.p95_decision_latency_seconds != null && (
                                    <> · P95 {Math.round(metrics.p95_decision_latency_seconds)}s</>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Approval cards */}
                {!loading && pending.map(approval => (
                    <ApprovalCard
                        key={approval.approval_id}
                        approval={approval}
                        onDecision={handleDecision}
                    />
                ))}

                {/* Footer with full dashboard link */}
                {!loading && (
                    <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                        <a href="/?tab=approvals" style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}>
                            Open full dashboard →
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
