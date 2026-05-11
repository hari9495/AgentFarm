'use client';

export type UsageSummaryCardProps = {
    total_invocations: number;
    total_cost_usd: number;
    total_tokens: number;
    success_rate: number;
    period_start: string;
    period_end: string;
};

function MetricTile({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: '1rem 1.1rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
            }}
        >
            <p
                style={{
                    margin: 0,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--ink-muted)',
                }}
            >
                {label}
            </p>
            <p
                style={{
                    margin: 0,
                    fontSize: '1.6rem',
                    fontWeight: 700,
                    color: 'var(--ink)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                }}
            >
                {value}
            </p>
            {sub && (
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{sub}</p>
            )}
        </div>
    );
}

export function UsageSummaryCard({
    total_invocations,
    total_cost_usd,
    total_tokens,
    success_rate,
    period_start,
    period_end,
}: UsageSummaryCardProps) {
    const formatTokens = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return n.toLocaleString();
    };

    const fromLabel = new Date(period_start).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
    const toLabel = new Date(period_end).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    const successPct =
        success_rate != null ? `${(success_rate * 100).toFixed(1)}%` : '—';

    return (
        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <h2 style={{ margin: 0 }}>Usage This Period</h2>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.65rem',
                }}
            >
                <MetricTile
                    label="Tasks Run"
                    value={total_invocations.toLocaleString()}
                />
                <MetricTile
                    label="Total Cost"
                    value={`$${total_cost_usd.toFixed(2)}`}
                />
                <MetricTile
                    label="Tokens Used"
                    value={formatTokens(total_tokens)}
                />
                <MetricTile
                    label="Success Rate"
                    value={successPct}
                />
            </div>

            <p
                style={{
                    margin: 0,
                    fontSize: '0.78rem',
                    color: 'var(--ink-muted)',
                }}
            >
                Period: {fromLabel} — {toLabel}
            </p>
        </div>
    );
}
