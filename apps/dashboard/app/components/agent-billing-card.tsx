'use client';

import { useEffect, useState } from 'react';

type MeteringSummary = {
    periodStart: string;
    periodEnd: string;
    taskCount: number;
    billableTaskCount: number;
    platformFeeUsd: number;
    llmCostUsd: number;
    totalChargeUsd: number;
};

type Props = { botId: string };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const defaultFrom = () => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
const defaultTo = () => isoDate(new Date());

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid #1e293b',
        }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
            <span style={{
                fontSize: '13px',
                fontWeight: highlight ? 700 : 500,
                color: highlight ? '#38bdf8' : '#e2e8f0',
                fontVariantNumeric: 'tabular-nums',
            }}>
                {value}
            </span>
        </div>
    );
}

export default function AgentBillingCard({ botId }: Props) {
    const [data, setData] = useState<MeteringSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [from] = useState(defaultFrom);
    const [to] = useState(defaultTo);

    useEffect(() => {
        const params = new URLSearchParams({ botId, from, to });
        fetch(`/api/billing/agent?${params.toString()}`, { cache: 'no-store' })
            .then(async (res) => {
                if (!res.ok) throw new Error('failed');
                return res.json() as Promise<MeteringSummary>;
            })
            .then((d) => { setData(d); setLoading(false); })
            .catch(() => { setError('Could not load billing data.'); setLoading(false); });
    }, [botId, from, to]);

    if (loading) {
        return (
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Loading…</p>
        );
    }

    if (error || !data) {
        return (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-muted)' }}>
                {error ?? 'No billing data available.'}
            </p>
        );
    }

    const periodLabel = `${new Date(data.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return (
        <div>
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#475569' }}>{periodLabel}</p>
            <StatRow label="Total tasks" value={data.taskCount.toLocaleString()} />
            <StatRow label="Billable tasks" value={data.billableTaskCount.toLocaleString()} />
            <StatRow label="Platform fee" value={`$${data.platformFeeUsd.toFixed(2)}`} />
            <StatRow label="LLM inference cost" value={`$${data.llmCostUsd.toFixed(4)}`} />
            <StatRow label="Total charge" value={`$${data.totalChargeUsd.toFixed(2)}`} highlight />
            <a
                href="/billing"
                style={{
                    display: 'inline-block',
                    marginTop: '14px',
                    fontSize: '11px',
                    color: '#38bdf8',
                    textDecoration: 'none',
                }}
            >
                Full billing dashboard →
            </a>
        </div>
    );
}
