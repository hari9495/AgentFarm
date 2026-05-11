'use client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WeeklyTrendPoint = {
    week: string;        // weekStart ISO date string (e.g. "2025-05-05")
    tokens_used: number;
    invocations: number;
    cost_usd: number;
};

export type CostTrendChartProps = {
    data: WeeklyTrendPoint[];
    height?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatWeekLabel = (week: string): string => {
    // Handles ISO date "2025-05-05" or ISO week "2025-W20"
    if (/^\d{4}-W\d{2}$/.test(week)) {
        // ISO week — show as "W20"
        return week.slice(5);
    }
    try {
        const d = new Date(week);
        if (isNaN(d.getTime())) return week.slice(5, 10);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return week;
    }
};

const formatCost = (n: number): string =>
    n >= 1 ? `$${n.toFixed(2)}` : n === 0 ? '$0' : `$${n.toFixed(4)}`;

// ── Component ─────────────────────────────────────────────────────────────────

export function CostTrendChart({ data, height = 180 }: CostTrendChartProps) {
    const svgWidth = 600;
    const padLeft = 48;
    const padRight = 12;
    const padTop = 28;
    const padBottom = 36;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    if (data.length === 0) {
        return (
            <div className="card" style={{ display: 'grid', gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Cost Trend</h2>
                <svg
                    viewBox={`0 0 ${svgWidth} ${height}`}
                    style={{ width: '100%', display: 'block' }}
                    role="img"
                    aria-label="No cost trend data"
                >
                    <text
                        x={svgWidth / 2}
                        y={height / 2}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={13}
                    >
                        No trend data available
                    </text>
                </svg>
            </div>
        );
    }

    const maxCost = Math.max(...data.map((d) => d.cost_usd), 0);
    const allZero = maxCost === 0;

    const barGap = 6;
    const barW = Math.max(
        8,
        Math.floor((chartW - barGap * (data.length - 1)) / data.length),
    );
    const slotW = chartW / data.length;

    return (
        <div className="card" style={{ display: 'grid', gap: '0.6rem' }}>
            <h2 style={{ margin: 0 }}>Cost Trend</h2>
            <svg
                viewBox={`0 0 ${svgWidth} ${height}`}
                style={{ width: '100%', display: 'block', overflow: 'visible' }}
                role="img"
                aria-label="Weekly cost trend bar chart"
            >
                {/* Y-axis max label */}
                {!allZero && (
                    <text
                        x={padLeft - 4}
                        y={padTop}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize={10}
                    >
                        {formatCost(maxCost)}
                    </text>
                )}

                {/* Baseline */}
                <line
                    x1={padLeft}
                    y1={padTop + chartH}
                    x2={padLeft + chartW}
                    y2={padTop + chartH}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                />

                {data.map((point, i) => {
                    const barHeight = allZero ? 2 : Math.max(2, (point.cost_usd / maxCost) * chartH);
                    const x = padLeft + i * slotW + (slotW - barW) / 2;
                    const y = padTop + chartH - barHeight;
                    const labelX = padLeft + i * slotW + slotW / 2;

                    return (
                        <g key={point.week}>
                            <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={barHeight}
                                rx={3}
                                ry={3}
                                fill="#6366f1"
                                opacity={0.85}
                            />
                            {/* Cost value above bar */}
                            {!allZero && point.cost_usd > 0 && (
                                <text
                                    x={labelX}
                                    y={y - 4}
                                    textAnchor="middle"
                                    fill="#6366f1"
                                    fontSize={9}
                                    fontWeight={600}
                                >
                                    {formatCost(point.cost_usd)}
                                </text>
                            )}
                            {/* X-axis label */}
                            <text
                                x={labelX}
                                y={padTop + chartH + 16}
                                textAnchor="middle"
                                fill="#94a3b8"
                                fontSize={10}
                            >
                                {formatWeekLabel(point.week)}
                            </text>
                        </g>
                    );
                })}

                {allZero && (
                    <text
                        x={padLeft + chartW / 2}
                        y={padTop + chartH / 2}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={12}
                    >
                        No cost data yet
                    </text>
                )}
            </svg>
        </div>
    );
}
