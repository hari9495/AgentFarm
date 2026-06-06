'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportIssueStatus = 'open' | 'diagnosing' | 'fixing' | 'escalated' | 'resolved';
export type SupportIssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export type SupportIssue = {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    title: string;
    description: string;
    status: SupportIssueStatus;
    severity: SupportIssueSeverity;
    tierReached: number | null;
    fixApplied: boolean;
    diagnosisReport: Record<string, unknown> | null;
    resolutionNotes: string | null;
    escalatedTo: string | null;
    createdAt: string;
    resolvedAt: string | null;
};

// ---------------------------------------------------------------------------
// Shared selection context (lifted via URL search param to avoid prop-drilling)
// ---------------------------------------------------------------------------

export const SELECTED_ISSUE_STORAGE_KEY = 'support_selected_issue_id';

export function getSelectedIssueId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(SELECTED_ISSUE_STORAGE_KEY);
}

export function setSelectedIssueId(id: string | null): void {
    if (id) {
        window.sessionStorage.setItem(SELECTED_ISSUE_STORAGE_KEY, id);
    } else {
        window.sessionStorage.removeItem(SELECTED_ISSUE_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('support_issue_selected', { detail: id }));
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<SupportIssueSeverity, { bg: string; text: string }> = {
    critical: { bg: 'var(--danger-bg)', text: 'var(--danger)' },
    high:     { bg: '#ffedd5', text: '#9a3412' },
    medium:   { bg: 'var(--warn-bg)', text: '#854d0e' },
    low:      { bg: 'var(--bg)', text: 'var(--ink-muted)' },
};

const STATUS_COLORS: Record<SupportIssueStatus, { bg: string; text: string; label: string }> = {
    open:       { bg: 'var(--bg)', text: 'var(--ink-muted)',  label: 'Open' },
    diagnosing: { bg: 'var(--info-bg)', text: 'var(--info)',  label: 'Diagnosing' },
    fixing:     { bg: '#ede9fe', text: '#6d28d9',  label: 'Fixing' },
    escalated:  { bg: 'var(--danger-bg)', text: 'var(--danger)',  label: 'Escalated' },
    resolved:   { bg: 'var(--ok-bg)', text: 'var(--ok)',  label: 'Resolved' },
};

function SeverityBadge({ severity }: { severity: SupportIssueSeverity }) {
    const c = SEVERITY_COLORS[severity];
    return (
        <span style={{
            padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
            {severity}
        </span>
    );
}

function StatusPill({ status }: { status: SupportIssueStatus }) {
    const c = STATUS_COLORS[status];
    const isSpinning = status === 'diagnosing' || status === 'fixing';
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
            background: c.bg, color: c.text,
        }}>
            {isSpinning && (
                <span style={{
                    display: 'inline-block', width: 7, height: 7,
                    border: `1.5px solid ${c.text}`, borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                }} />
            )}
            {c.label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Time display helper
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupportIssueFeed() {
    const [issues, setIssues] = useState<SupportIssue[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const esRef = useRef<EventSource | null>(null);

    // Sync selection from sessionStorage on mount
    useEffect(() => {
        setSelectedId(getSelectedIssueId());
        const handler = (e: Event) => {
            setSelectedId((e as CustomEvent<string | null>).detail);
        };
        window.addEventListener('support_issue_selected', handler);
        return () => window.removeEventListener('support_issue_selected', handler);
    }, []);

    // SSE subscription
    useEffect(() => {
        const es = new EventSource('/api/support/issues', {});
        esRef.current = es;

        es.onopen = () => { setConnected(true); setError(null); };
        es.onerror = () => { setConnected(false); setError('Connection lost — retrying…'); };

        es.onmessage = (e: MessageEvent) => {
            try {
                const issue = JSON.parse(e.data as string) as SupportIssue;
                setIssues((prev) => {
                    const idx = prev.findIndex((i) => i.id === issue.id);
                    if (idx === -1) return [issue, ...prev];
                    const next = [...prev];
                    next[idx] = issue;
                    return next;
                });
            } catch { /* ignore malformed */ }
        };

        return () => { es.close(); };
    }, []);

    const selectIssue = (id: string) => {
        setSelectedId(id);
        setSelectedIssueId(id);
    };

    const sortedIssues = [...issues].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <header style={{
                padding: '0.8rem 1rem', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem', flex: 1 }}>Issue Feed</h2>
                <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: connected ? 'var(--ok)' : 'var(--danger)',
                    flexShrink: 0,
                }} title={connected ? 'Live' : 'Disconnected'} />
            </header>

            {error && (
                <p style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                    {error}
                </p>
            )}

            <div style={{ overflowY: 'auto', maxHeight: '72vh' }}>
                {sortedIssues.length === 0 && (
                    <p style={{ margin: 0, padding: '1.2rem', color: 'var(--ink-soft)', fontSize: '0.85rem', textAlign: 'center' }}>
                        No issues yet. Start a chat session to raise one.
                    </p>
                )}

                {sortedIssues.map((issue) => {
                    const isSelected = issue.id === selectedId;
                    return (
                        <div
                            key={issue.id}
                            onClick={() => selectIssue(issue.id)}
                            style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid var(--line)',
                                borderLeft: isSelected ? '3px solid #0066cc' : '3px solid transparent',
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(0,102,204,0.04)' : undefined,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                <SeverityBadge severity={issue.severity} />
                                <StatusPill status={issue.status} />
                                {issue.fixApplied && (
                                    <span style={{ fontSize: 11, color: 'var(--ok)', marginLeft: 'auto', flexShrink: 0 }}>
                                        ✓ Fixed
                                    </span>
                                )}
                            </div>
                            <p style={{
                                margin: '0 0 0.2rem', fontSize: '0.83rem', fontWeight: isSelected ? 600 : 400,
                                color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {issue.title}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
                                {timeAgo(issue.createdAt)}
                                {issue.tierReached != null && ` · Tier ${issue.tierReached}`}
                            </p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
