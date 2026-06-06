'use client';

import { useEffect, useRef, useState } from 'react';
import { type SupportIssue, getSelectedIssueId } from './support-issue-feed';

// ---------------------------------------------------------------------------
// Tier row definitions
// ---------------------------------------------------------------------------

type TierRowProps = {
    tier: number;
    label: string;
    reached: boolean;
    applied: boolean | undefined;
    detail?: string;
};

function TierRow({ tier, label, reached, applied, detail }: TierRowProps) {
    const statusColor = !reached
        ? 'var(--ink-muted)'
        : applied
            ? 'var(--ok)'
            : 'var(--danger)';

    const statusLabel = !reached ? 'not reached' : applied ? 'applied' : 'failed';
    const rowOpacity = reached ? 1 : 0.45;

    return (
        <div style={{
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
            padding: '0.6rem 0', opacity: rowOpacity,
            borderBottom: '1px solid var(--line)',
        }}>
            <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: reached ? statusColor : 'var(--bg)',
                fontSize: 12, fontWeight: 700, color: reached ? 'var(--card)' : 'var(--ink-muted)',
            }}>
                {tier}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: 'var(--ink)' }}>
                    {label}
                </p>
                {detail && (
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--ink-soft)', wordBreak: 'break-word' }}>
                        {detail}
                    </p>
                )}
            </div>
            <span style={{
                fontSize: 11, fontWeight: 700, color: statusColor,
                flexShrink: 0, letterSpacing: '0.03em',
            }}>
                {statusLabel}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupportFixTimeline() {
    const [issueId, setIssueId] = useState<string | null>(null);
    const [issue, setIssue] = useState<SupportIssue | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const id = getSelectedIssueId();
        if (id) setIssueId(id);

        const handler = (e: Event) => setIssueId((e as CustomEvent<string | null>).detail);
        window.addEventListener('support_issue_selected', handler);
        return () => window.removeEventListener('support_issue_selected', handler);
    }, []);

    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!issueId) { setIssue(null); return; }

        const fetchIssue = async () => {
            try {
                const res = await fetch(`/api/support/issues/${encodeURIComponent(issueId)}`, {
                    cache: 'no-store',
                });
                if (!res.ok) { setError(`Error ${res.status}`); return; }
                setIssue(await res.json() as SupportIssue);
                setError(null);
            } catch {
                setError('Failed to load fix timeline');
            } finally {
                setLoading(false);
            }
        };

        setLoading(true);
        void fetchIssue();
        pollRef.current = setInterval(() => void fetchIssue(), 4_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [issueId]);

    const tierReached = issue?.tierReached ?? 0;

    const resolutionTime = issue?.resolvedAt && issue.createdAt
        ? Math.round((new Date(issue.resolvedAt).getTime() - new Date(issue.createdAt).getTime()) / 1000)
        : null;

    return (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <header style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Fix Timeline</h2>
            </header>

            <div style={{ padding: '0.5rem 1rem' }}>
                {!issueId && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                        Select an issue to view its fix timeline.
                    </p>
                )}
                {issueId && loading && !issue && (
                    <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', margin: '0.5rem 0' }}>Loading…</p>
                )}
                {error && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: '0.5rem 0' }}>{error}</p>
                )}
                {issue && (
                    <>
                        <TierRow
                            tier={1}
                            label="Tier 1 — Config Fix"
                            reached={tierReached >= 1}
                            applied={tierReached >= 1 ? issue.fixApplied : undefined}
                            detail={
                                tierReached >= 1 && issue.fixApplied
                                    ? 'Automatic config fix applied successfully.'
                                    : tierReached >= 1
                                        ? 'No automatic fix available for this issue.'
                                        : undefined
                            }
                        />
                        <TierRow
                            tier={2}
                            label="Tier 2 — Code Fix (Developer Agent)"
                            reached={tierReached >= 2}
                            applied={tierReached >= 2 ? true : undefined}
                        />
                        <TierRow
                            tier={3}
                            label="Tier 3 — Infra Fix (DevOps Agent)"
                            reached={tierReached >= 3}
                            applied={tierReached >= 3 ? true : undefined}
                        />
                        <TierRow
                            tier={4}
                            label="Tier 4 — Human Escalation"
                            reached={issue.escalatedTo != null}
                            applied={issue.escalatedTo != null ? true : undefined}
                            detail={issue.escalatedTo ?? undefined}
                        />

                        {resolutionTime != null && (
                            <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--ok)' }}>
                                Resolved in {resolutionTime < 60
                                    ? `${resolutionTime}s`
                                    : `${Math.round(resolutionTime / 60)}m`}
                            </p>
                        )}
                        {issue.resolutionNotes && (
                            <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                                {issue.resolutionNotes}
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
