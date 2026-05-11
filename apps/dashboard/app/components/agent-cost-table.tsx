'use client';

// ── Types — exact field names from /api/analytics/cost-summary by_provider ───

export type ProviderCost = {
    provider: string;
    tokens_used: number;
    estimated_cost_usd: number;
};

export type AgentCostTableProps = {
    byProvider: ProviderCost[];
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentCostTable({ byProvider }: AgentCostTableProps) {
    if (byProvider.length === 0) {
        return (
            <div className="card">
                <h2 style={{ margin: '0 0 0.75rem' }}>Cost by Provider</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', margin: 0 }}>
                    No provider data available.
                </p>
            </div>
        );
    }

    const totalCost = byProvider.reduce((sum, p) => sum + p.estimated_cost_usd, 0);

    // Sort descending by cost
    const sorted = [...byProvider].sort(
        (a, b) => b.estimated_cost_usd - a.estimated_cost_usd,
    );

    const thStyle: React.CSSProperties = {
        padding: '0.5rem 0.75rem',
        textAlign: 'left' as const,
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--ink-muted)',
        borderBottom: '1px solid var(--line)',
        whiteSpace: 'nowrap',
    };

    const tdStyle: React.CSSProperties = {
        padding: '0.55rem 0.75rem',
        fontSize: '0.875rem',
        color: 'var(--ink)',
        borderBottom: '1px solid var(--line)',
    };

    const tdNumStyle: React.CSSProperties = {
        ...tdStyle,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
    };

    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <h2 style={{ margin: '0 0 0.75rem' }}>Cost by Provider</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={thStyle}>Provider</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Tokens Used</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Total Cost</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Cost %</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((row) => {
                        const pct =
                            totalCost > 0
                                ? ((row.estimated_cost_usd / totalCost) * 100).toFixed(1)
                                : '0.0';
                        const tokensLabel =
                            row.tokens_used >= 1_000_000
                                ? `${(row.tokens_used / 1_000_000).toFixed(2)}M`
                                : row.tokens_used >= 1_000
                                  ? `${(row.tokens_used / 1_000).toFixed(1)}k`
                                  : row.tokens_used.toLocaleString();

                        return (
                            <tr key={row.provider}>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.provider}</td>
                                <td style={tdNumStyle}>{tokensLabel}</td>
                                <td style={{ ...tdNumStyle, color: '#059669', fontWeight: 600 }}>
                                    ${row.estimated_cost_usd.toFixed(4)}
                                </td>
                                <td style={tdNumStyle}>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            padding: '2px 7px',
                                            borderRadius: 12,
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            background: 'var(--brand-light)',
                                            color: 'var(--brand-dark)',
                                        }}
                                    >
                                        {pct}%
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                {sorted.length > 1 && (
                    <tfoot>
                        <tr>
                            <td
                                style={{
                                    ...tdStyle,
                                    fontWeight: 700,
                                    borderTop: '2px solid var(--line)',
                                    borderBottom: 'none',
                                }}
                            >
                                Total
                            </td>
                            <td style={{ ...tdNumStyle, borderTop: '2px solid var(--line)', borderBottom: 'none' }}>
                                —
                            </td>
                            <td
                                style={{
                                    ...tdNumStyle,
                                    fontWeight: 700,
                                    color: '#059669',
                                    borderTop: '2px solid var(--line)',
                                    borderBottom: 'none',
                                }}
                            >
                                ${totalCost.toFixed(4)}
                            </td>
                            <td style={{ ...tdNumStyle, borderTop: '2px solid var(--line)', borderBottom: 'none' }}>
                                100%
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
