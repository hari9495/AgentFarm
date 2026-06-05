'use client';

import { useEffect, useState } from 'react';

type SupportStats = {
    thisWeek: number;
    thisMonth: number;
    totalResolved: number;
    tierBreakdown: Record<string, number>;
    tier1AutoFixRate: number;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="card" style={{ padding: '0.75rem 1rem', minWidth: 120, flex: 1 }}>
            <p style={{ margin: '0 0 0.15rem', fontSize: '0.72rem', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {label}
            </p>
            <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                {value}
            </p>
            {sub && (
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{sub}</p>
            )}
        </div>
    );
}

export function SupportStatsBar() {
    const [stats, setStats] = useState<SupportStats | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/support/stats', { cache: 'no-store' });
                if (res.ok) setStats(await res.json() as SupportStats);
            } catch { /* ignore */ }
        };
        void load();
        const interval = setInterval(() => void load(), 30_000);
        return () => clearInterval(interval);
    }, []);

    if (!stats) return null;

    return (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <StatCard label="This Week" value={stats.thisWeek} />
            <StatCard label="This Month" value={stats.thisMonth} />
            <StatCard label="Resolved" value={stats.totalResolved} />
            <StatCard
                label="Tier 1 Auto-fix Rate"
                value={`${stats.tier1AutoFixRate}%`}
                sub="target ≥ 60%"
            />
            <StatCard
                label="Tier Breakdown"
                value={`T1: ${stats.tierBreakdown['1'] ?? 0}`}
                sub={`T2: ${stats.tierBreakdown['2'] ?? 0}  T3: ${stats.tierBreakdown['3'] ?? 0}  T4: ${stats.tierBreakdown['4'] ?? 0}`}
            />
        </div>
    );
}
