'use client';

import Link from 'next/link';
import { PageHeader } from '../../components/page-header';
import { useEffect, useRef, useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';

type DealStage = 'discovery' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

interface Deal {
    id: string;
    title: string;
    stage: DealStage;
    botId: string;
    prospectId: string;
    value?: number;
    currency?: string;
    updatedAt: string;
}

const STAGES: { key: DealStage; label: string; accentColor: string }[] = [
    { key: 'discovery', label: 'Discovery', accentColor: 'var(--ink-muted)' },
    { key: 'proposal', label: 'Proposal', accentColor: 'var(--info)' },
    { key: 'negotiation', label: 'Negotiation', accentColor: 'var(--warn)' },
    { key: 'closed_won', label: 'Won', accentColor: 'var(--ok)' },
    { key: 'closed_lost', label: 'Lost', accentColor: 'var(--danger)' },
];

const VALID_NEXT: Partial<Record<DealStage, DealStage>> = {
    discovery: 'proposal',
    proposal: 'negotiation',
    negotiation: 'closed_won',
};

function formatCurrency(value: number | undefined, currency = 'USD'): string {
    if (value == null || value === 0) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export default function PipelinePage() {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showLostModal, setShowLostModal] = useState<{ dealId: string; botId: string } | null>(null);
    const [lostReason, setLostReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const draggingId = useRef<string | null>(null);

    useEffect(() => {
        void load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch('/api/sales/deals?limit=200');
            if (!res.ok) throw new Error('Failed to load deals');
            const data = await res.json() as { deals: Deal[] };
            setDeals(data.deals ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    function handleDragStart(e: React.DragEvent, dealId: string) {
        draggingId.current = dealId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dealId);
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    async function handleDrop(e: React.DragEvent, targetStage: DealStage) {
        e.preventDefault();
        const id = draggingId.current ?? e.dataTransfer.getData('text/plain');
        if (!id) return;

        const deal = deals.find(d => d.id === id);
        if (!deal || deal.stage === targetStage) return;

        // Only allow valid forward transitions; "closed_lost" needs modal
        if (targetStage === 'closed_lost') {
            setShowLostModal({ dealId: id, botId: deal.botId });
            return;
        }

        const expectedNext = VALID_NEXT[deal.stage];
        if (expectedNext !== targetStage) return;

        // Optimistic update
        setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: targetStage } : d));

        try {
            const res = await fetch(`/api/sales/deals/${id}/stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: targetStage, botId: deal.botId }),
            });
            if (!res.ok) void load(); // revert on failure
        } catch {
            void load();
        }
    }

    async function submitCloseLost() {
        if (!showLostModal) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/sales/deals/${showLostModal.dealId}/close-lost`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: lostReason, botId: showLostModal.botId }),
            });
            if (res.ok) {
                setDeals(prev =>
                    prev.map(d => d.id === showLostModal.dealId ? { ...d, stage: 'closed_lost' } : d),
                );
            }
        } finally {
            setSubmitting(false);
            setShowLostModal(null);
            setLostReason('');
        }
    }

    return (
        <main style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
            <PageHeader
                eyebrow="Sales"
                title="Pipeline"
                description="Visualize and manage deals across all pipeline stages."
                backHref="/sales"
                backLabel="← Sales"
            />

            <SalesSectionNav />

            {loading && <p style={{ color: 'var(--ink-muted)' }}>Loading…</p>}
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', gap: '0.75rem', overflowX: 'auto' }}>
                    {STAGES.map(stage => {
                        const stageDeals = deals.filter(d => d.stage === stage.key);
                        return (
                            <div
                                key={stage.key}
                                onDragOver={handleDragOver}
                                onDrop={e => void handleDrop(e, stage.key)}
                                style={{
                                    background: 'var(--bg)',
                                    border: '2px dashed var(--line)',
                                    borderRadius: 12,
                                    padding: '0.75rem',
                                    minHeight: 400,
                                    transition: 'border-color 0.15s ease',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: stage.accentColor,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {stage.label}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--ink-muted)', background: 'var(--card)', borderRadius: 999, padding: '0.1rem 0.5rem', border: '1px solid var(--line)' }}>
                                        {stageDeals.length}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {stageDeals.map(deal => (
                                        <div
                                            key={deal.id}
                                            draggable
                                            onDragStart={e => handleDragStart(e, deal.id)}
                                            style={{
                                                background: 'var(--card)',
                                                border: '1px solid var(--line)',
                                                borderRadius: 8,
                                                padding: '0.75rem',
                                                cursor: 'grab',
                                                boxShadow: 'var(--shadow-sm)',
                                                transition: 'box-shadow 0.15s ease',
                                                borderLeft: `3px solid ${stage.accentColor}`,
                                            }}
                                        >
                                            <Link
                                                href={`/sales/deals/${deal.id}`}
                                                style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', display: 'block', marginBottom: '0.35rem' }}
                                            >
                                                {deal.title}
                                            </Link>
                                            {deal.value != null && deal.value > 0 && (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--ok)', fontWeight: 500 }}>
                                                    {formatCurrency(deal.value, deal.currency)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Close Lost Modal */}
            {showLostModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Mark deal as lost"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowLostModal(null); }}
                >
                    <div
                        style={{
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            padding: '1.5rem',
                            width: 400,
                            maxWidth: '90vw',
                            boxShadow: 'var(--shadow-lg)',
                        }}
                    >
                        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>
                            Mark Deal as Lost
                        </h2>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--ink-soft)', fontWeight: 500 }}>
                            Reason (optional)
                        </label>
                        <textarea
                            value={lostReason}
                            onChange={e => setLostReason(e.target.value)}
                            rows={3}
                            placeholder="Why was this deal lost?"
                            style={{
                                width: '100%',
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.875rem',
                                color: 'var(--ink)',
                                background: 'var(--bg)',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                onClick={() => setShowLostModal(null)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: 8,
                                    border: '1px solid var(--line)',
                                    background: 'var(--card)',
                                    color: 'var(--ink-soft)',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void submitCloseLost()}
                                disabled={submitting}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: 'var(--danger)',
                                    color: 'var(--card)',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    fontSize: '0.875rem',
                                    opacity: submitting ? 0.6 : 1,
                                }}
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
