'use client';

import Link from 'next/link';
import { PageHeader } from '../components/page-header';
import { useEffect, useState } from 'react';
import { SalesSectionNav } from '../components/sales-section-nav';

interface SalesStats {
    totalWon: number;
    totalLost: number;
    totalPipelineValue: number;
    wonValue: number;
    avgDaysToClose: number;
}

interface Activity {
    id: string;
    activityType: string;
    subject: string;
    completedAt?: string;
    createdAt: string;
    prospectId?: string;
}

interface Deal {
    id: string;
    title: string;
    stage: string;
    value?: number;
    currency?: string;
    updatedAt: string;
}

const STAGE_LABELS: Record<string, string> = {
    discovery: 'Discovery',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Won',
    closed_lost: 'Lost',
};

const STAGE_COLORS: Record<string, string> = {
    discovery: 'var(--ink-muted)',
    proposal: 'var(--info)',
    negotiation: 'var(--warn)',
    closed_won: 'var(--ok)',
    closed_lost: 'var(--danger)',
};

function formatCurrency(value: number | undefined, currency = 'USD'): string {
    if (value == null || value === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export default function SalesPage() {
    const [stats, setStats] = useState<SalesStats | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            try {
                const [statsRes, activitiesRes, dealsRes] = await Promise.all([
                    fetch('/api/sales/stats'),
                    fetch('/api/sales/activities?limit=10'),
                    fetch('/api/sales/deals?limit=5'),
                ]);

                if (!statsRes.ok) throw new Error('Failed to load stats');

                const [statsData, activitiesData, dealsData] = await Promise.all([
                    statsRes.json() as Promise<SalesStats>,
                    activitiesRes.json() as Promise<{ activities: Activity[] }>,
                    dealsRes.json() as Promise<{ deals: Deal[] }>,
                ]);

                setStats(statsData);
                setActivities(activitiesData.activities ?? []);
                setDeals(dealsData.deals ?? []);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load');
            } finally {
                setLoading(false);
            }
        }
        void load();
    }, []);

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Sales"
                title="Sales"
                description="Manage deals, activities, and pipeline performance."
            />

            <SalesSectionNav />

            {loading && <p style={{ color: 'var(--ink-muted)' }}>Loading…</p>}
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

            {stats && (
                <div className="metric-row" style={{ '--card-index': 0 } as React.CSSProperties}>
                    <div className="metric-card" style={{ '--card-index': 0 } as React.CSSProperties}>
                        <h2>Deals Won</h2>
                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ok)', margin: 0 }}>
                            {stats.totalWon}
                        </p>
                    </div>
                    <div className="metric-card" style={{ '--card-index': 1 } as React.CSSProperties}>
                        <h2>Deals Lost</h2>
                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--danger)', margin: 0 }}>
                            {stats.totalLost}
                        </p>
                    </div>
                    <div className="metric-card" style={{ '--card-index': 2 } as React.CSSProperties}>
                        <h2>Pipeline Value</h2>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                            {formatCurrency(stats.totalPipelineValue)}
                        </p>
                    </div>
                    <div className="metric-card" style={{ '--card-index': 3 } as React.CSSProperties}>
                        <h2>Won Revenue</h2>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ok)', margin: 0 }}>
                            {formatCurrency(stats.wonValue)}
                        </p>
                    </div>
                    <div className="metric-card" style={{ '--card-index': 4 } as React.CSSProperties}>
                        <h2>Avg Days to Close</h2>
                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--brand)', margin: 0 }}>
                            {stats.avgDaysToClose > 0 ? stats.avgDaysToClose : '—'}
                        </p>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Recent Activity */}
                <div
                    style={{
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        padding: '1.25rem',
                        boxShadow: 'var(--shadow-sm)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Recent Activity
                        </h2>
                        <Link href="/sales/activity" style={{ fontSize: '0.8rem', color: 'var(--brand)', textDecoration: 'none' }}>
                            View all →
                        </Link>
                    </div>
                    {activities.length === 0 && !loading && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>No recent activity.</p>
                    )}
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {activities.map(a => (
                            <li key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 500 }}>{a.subject}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'capitalize' }}>
                                    {a.activityType} · {new Date(a.completedAt ?? a.createdAt).toLocaleDateString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Open Deals */}
                <div
                    style={{
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        padding: '1.25rem',
                        boxShadow: 'var(--shadow-sm)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Open Deals
                        </h2>
                        <Link href="/sales/deals" style={{ fontSize: '0.8rem', color: 'var(--brand)', textDecoration: 'none' }}>
                            View all →
                        </Link>
                    </div>
                    {deals.length === 0 && !loading && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>No open deals.</p>
                    )}
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {deals.map(d => (
                            <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <Link
                                        href={`/sales/deals/${d.id}`}
                                        style={{ fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}
                                    >
                                        {d.title}
                                    </Link>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        Updated {new Date(d.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                                    <span
                                        style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            padding: '0.125rem 0.5rem',
                                            borderRadius: 999,
                                            background: `${STAGE_COLORS[d.stage] ?? 'var(--ink-muted)'}20`,
                                            color: STAGE_COLORS[d.stage] ?? 'var(--ink-muted)',
                                        }}
                                    >
                                        {STAGE_LABELS[d.stage] ?? d.stage}
                                    </span>
                                    {d.value != null && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                            {formatCurrency(d.value, d.currency)}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>
    );
}
