'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SalesSectionNav } from '../../../components/sales-section-nav';
import { use } from 'react';

type DealStage = 'discovery' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

interface Deal {
    id: string;
    title: string;
    stage: DealStage;
    botId: string;
    prospectId: string;
    value?: number;
    currency?: string;
    notes?: string;
    probability?: number;
    expectedCloseDate?: string;
    closedAt?: string;
    contractSentAt?: string;
    contractSignedAt?: string;
    createdAt: string;
    updatedAt: string;
}

interface Activity {
    id: string;
    activityType: string;
    subject: string;
    body?: string;
    outcome?: string;
    completedAt?: string;
    createdAt: string;
}

const STAGE_LABELS: Record<DealStage, string> = {
    discovery: 'Discovery',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Won',
    closed_lost: 'Lost',
};

const STAGE_BADGE: Record<DealStage, { bg: string; color: string }> = {
    discovery: { bg: 'rgba(148,163,184,0.15)', color: 'var(--ink-muted)' },
    proposal: { bg: 'rgba(2,132,199,0.12)', color: 'var(--info)' },
    negotiation: { bg: 'rgba(217,119,6,0.12)', color: 'var(--warn)' },
    closed_won: { bg: 'rgba(5,150,105,0.12)', color: 'var(--ok)' },
    closed_lost: { bg: 'rgba(220,38,38,0.12)', color: 'var(--danger)' },
};

const ACTIVITY_ICONS: Record<string, string> = {
    email: '✉️',
    call: '📞',
    meeting: '🤝',
    note: '📝',
    proposal_sent: '📄',
    contract_sent: '📋',
    contract_signed: '✅',
    demo: '💻',
    follow_up: '🔔',
    linkedin_message: '💼',
};

const VALID_NEXT: Partial<Record<DealStage, DealStage>> = {
    discovery: 'proposal',
    proposal: 'negotiation',
    negotiation: 'closed_won',
};

function formatCurrency(value: number | undefined, currency = 'USD'): string {
    if (value == null || value === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [deal, setDeal] = useState<Deal | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showLostModal, setShowLostModal] = useState(false);
    const [lostReason, setLostReason] = useState('');

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function load() {
        setLoading(true);
        setError('');
        try {
            const [dealRes, activitiesRes] = await Promise.all([
                fetch(`/api/sales/deals/${id}`),
                fetch(`/api/sales/activities?prospectId=__PLACEHOLDER__&limit=50`), // prospectId resolved after deal loads
            ]);

            if (!dealRes.ok) throw new Error(dealRes.status === 404 ? 'Deal not found' : 'Failed to load deal');

            const dealData = await dealRes.json() as Deal;
            setDeal(dealData);

            // Now fetch activities for this prospect
            const actRes = await fetch(`/api/sales/activities?prospectId=${dealData.prospectId}&limit=50`);
            if (actRes.ok) {
                const actData = await actRes.json() as { activities: Activity[] };
                setActivities(actData.activities ?? []);
            }

            // Ignore the placeholder request
            void activitiesRes;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    async function advanceStage() {
        if (!deal) return;
        const nextStage = VALID_NEXT[deal.stage];
        if (!nextStage) return;
        setSubmitting(true);
        setActionError('');
        try {
            const res = await fetch(`/api/sales/deals/${deal.id}/stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: nextStage, botId: deal.botId }),
            });
            if (!res.ok) throw new Error('Failed to advance stage');
            setDeal(d => d ? { ...d, stage: nextStage } : d);
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setSubmitting(false);
        }
    }

    async function submitCloseLost() {
        if (!deal) return;
        setSubmitting(true);
        setActionError('');
        try {
            const res = await fetch(`/api/sales/deals/${deal.id}/close-lost`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: lostReason, botId: deal.botId }),
            });
            if (!res.ok) throw new Error('Failed to close deal');
            setDeal(d => d ? { ...d, stage: 'closed_lost' } : d);
            setShowLostModal(false);
            setLostReason('');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setSubmitting(false);
        }
    }

    async function reopenDeal() {
        if (!deal) return;
        setSubmitting(true);
        setActionError('');
        try {
            const res = await fetch(`/api/sales/deals/${deal.id}/reopen`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Failed to reopen deal');
            setDeal(d => d ? { ...d, stage: 'discovery', closedAt: undefined } : d);
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <main className="page-shell">
                <Link href="/sales/deals" style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← Deals</Link>
                <p style={{ color: 'var(--ink-muted)' }}>Loading…</p>
            </main>
        );
    }

    if (error || !deal) {
        return (
            <main className="page-shell">
                <Link href="/sales/deals" style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← Deals</Link>
                <p style={{ color: 'var(--danger)' }}>{error || 'Deal not found'}</p>
            </main>
        );
    }

    const badge = STAGE_BADGE[deal.stage];
    const nextStage = VALID_NEXT[deal.stage];

    return (
        <main className="page-shell">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Link href="/sales/deals" style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
                    ← Deals
                </Link>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', flex: 1 }}>
                    {deal.title}
                </h1>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.25rem 0.75rem', borderRadius: 999, background: badge.bg, color: badge.color }}>
                    {STAGE_LABELS[deal.stage]}
                </span>
            </div>

            <SalesSectionNav />

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Deal overview */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                        <h2 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Deal Details
                        </h2>
                        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', margin: 0 }}>
                            {[
                                { label: 'Value', value: formatCurrency(deal.value, deal.currency) },
                                { label: 'Probability', value: deal.probability != null ? `${deal.probability}%` : '—' },
                                { label: 'Expected Close', value: deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '—' },
                                { label: 'Created', value: new Date(deal.createdAt).toLocaleDateString() },
                                { label: 'Closed At', value: deal.closedAt ? new Date(deal.closedAt).toLocaleDateString() : '—' },
                                { label: 'Contract Sent', value: deal.contractSentAt ? new Date(deal.contractSentAt).toLocaleDateString() : '—' },
                                { label: 'Contract Signed', value: deal.contractSignedAt ? new Date(deal.contractSignedAt).toLocaleDateString() : '—' },
                            ].map(row => (
                                <div key={row.label}>
                                    <dt style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                                        {row.label}
                                    </dt>
                                    <dd style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 500 }}>
                                        {row.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        {deal.notes && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                                    {deal.notes}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Activity timeline */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                        <h2 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Activity Timeline
                        </h2>
                        {activities.length === 0 ? (
                            <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>No activities recorded.</p>
                        ) : (
                            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {activities.map((a, i) => (
                                    <li
                                        key={a.id}
                                        style={{
                                            display: 'flex',
                                            gap: '0.75rem',
                                            paddingBottom: i < activities.length - 1 ? '1rem' : 0,
                                            position: 'relative',
                                        }}
                                    >
                                        {/* Timeline line */}
                                        {i < activities.length - 1 && (
                                            <div style={{ position: 'absolute', left: 15, top: 28, bottom: 0, width: 2, background: 'var(--line)' }} />
                                        )}
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.875rem', zIndex: 1 }}>
                                            {ACTIVITY_ICONS[a.activityType] ?? '📌'}
                                        </div>
                                        <div style={{ flex: 1, paddingTop: '0.35rem' }}>
                                            <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
                                                {a.subject}
                                            </p>
                                            {a.body && (
                                                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{a.body}</p>
                                            )}
                                            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                                {a.activityType} · {new Date(a.completedAt ?? a.createdAt).toLocaleString()}
                                                {a.outcome && ` · ${a.outcome}`}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>

                {/* Right column — actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                        <h2 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Actions
                        </h2>

                        {actionError && (
                            <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{actionError}</p>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {nextStage && (
                                <button
                                    onClick={() => void advanceStage()}
                                    disabled={submitting}
                                    style={{
                                        padding: '0.625rem 1rem',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: 'var(--brand)',
                                        color: 'var(--card)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: submitting ? 'not-allowed' : 'pointer',
                                        opacity: submitting ? 0.6 : 1,
                                    }}
                                >
                                    Advance to {STAGE_LABELS[nextStage]} →
                                </button>
                            )}

                            {deal.stage !== 'closed_lost' && deal.stage !== 'closed_won' && (
                                <button
                                    onClick={() => setShowLostModal(true)}
                                    disabled={submitting}
                                    style={{
                                        padding: '0.625rem 1rem',
                                        borderRadius: 8,
                                        border: '1px solid var(--danger)',
                                        background: 'transparent',
                                        color: 'var(--danger)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: submitting ? 'not-allowed' : 'pointer',
                                        opacity: submitting ? 0.6 : 1,
                                    }}
                                >
                                    Mark as Lost
                                </button>
                            )}

                            {deal.stage === 'closed_lost' && (
                                <button
                                    onClick={() => void reopenDeal()}
                                    disabled={submitting}
                                    style={{
                                        padding: '0.625rem 1rem',
                                        borderRadius: 8,
                                        border: '1px solid var(--info)',
                                        background: 'transparent',
                                        color: 'var(--info)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: submitting ? 'not-allowed' : 'pointer',
                                        opacity: submitting ? 0.6 : 1,
                                    }}
                                >
                                    Re-open Deal
                                </button>
                            )}
                        </div>

                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
                            <Link
                                href={`/sales/activity?prospectId=${deal.prospectId}`}
                                style={{ fontSize: '0.8rem', color: 'var(--brand)', textDecoration: 'none' }}
                            >
                                View all prospect activity →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Close Lost Modal */}
            {showLostModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Mark deal as lost"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowLostModal(false); }}
                >
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.5rem', width: 400, maxWidth: '90vw', boxShadow: 'var(--shadow-lg)' }}>
                        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>Mark Deal as Lost</h2>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--ink-soft)', fontWeight: 500 }}>
                            Reason (optional)
                        </label>
                        <textarea
                            value={lostReason}
                            onChange={e => setLostReason(e.target.value)}
                            rows={3}
                            placeholder="Why was this deal lost?"
                            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: 'var(--ink)', background: 'var(--bg)', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                onClick={() => setShowLostModal(false)}
                                style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: '0.875rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void submitCloseLost()}
                                disabled={submitting}
                                style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'var(--card)', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.875rem', opacity: submitting ? 0.6 : 1 }}
                            >
                                {submitting ? 'Saving…' : 'Mark Lost'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
