'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type HeatCell = {
    day: number;   // 0 = Sun
    hour: number;  // 0–23
    tokens: number;
};

type Props = { workspaceId?: string };

function buildLabel(hour: number): string {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
}

function interpolateColor(pct: number): string {
    if (pct === 0) return 'var(--bg-deep)';
    // purple → indigo → sky blue gradient based on intensity
    const r = Math.round(99 + (14 - 99) * pct);
    const g = Math.round(102 + (165 - 102) * pct);
    const b = Math.round(241 + (233 - 241) * pct);
    const alpha = 0.15 + pct * 0.85;
    return `rgba(${r},${g},${b},${alpha})`;
}

export function TokenHeatmap({ workspaceId }: Props) {
    const [cells, setCells] = useState<HeatCell[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ day: number; hour: number; tokens: number } | null>(null);
    const [days, setDays] = useState(28);

    const fetch_data = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ days: String(days) });
            if (workspaceId) params.set('workspace_id', workspaceId);
            const res = await fetch(`/api/analytics/token-heatmap?${params.toString()}`);
            if (!res.ok) {
                setError('Failed to load heatmap data.');
                return;
            }
            const data = (await res.json()) as { cells?: HeatCell[] };
            setCells(data.cells ?? []);
        } catch {
            setError('Network error loading heatmap.');
        } finally {
            setLoading(false);
        }
    }, [workspaceId, days]);

    useEffect(() => { void fetch_data(); }, [fetch_data]);

    const maxTokens = cells.length > 0 ? Math.max(...cells.map((c) => c.tokens), 1) : 1;

    const cellMap = new Map<string, number>();
    for (const c of cells) {
        cellMap.set(`${c.day}-${c.hour}`, c.tokens);
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>Token Usage Heatmap</h2>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {[7, 14, 28].map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={`chip-button${days === d ? ' active' : ''}`}
                            onClick={() => setDays(d)}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            <p style={{ margin: '-0.3rem 0 1rem', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Hourly token usage by day of week — darker = more tokens.
            </p>

            {loading && <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>Loading…</p>}
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</p>}

            {!loading && !error && (
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, minmax(22px, 1fr))`, gap: 2, minWidth: 600 }}>
                        {/* Hour labels */}
                        <div />
                        {HOURS.map((h) => (
                            <div key={h} style={{ fontSize: '0.58rem', color: 'var(--ink-muted)', textAlign: 'center', paddingBottom: 4, fontWeight: 600 }}>
                                {h % 3 === 0 ? buildLabel(h) : ''}
                            </div>
                        ))}

                        {/* Day rows */}
                        {DAYS.map((day, dayIdx) => (
                            <Fragment key={dayIdx}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center' }}>
                                    {day}
                                </div>
                                {HOURS.map((hour) => {
                                    const tokens = cellMap.get(`${dayIdx}-${hour}`) ?? 0;
                                    const pct = tokens / maxTokens;
                                    return (
                                        <div
                                            key={`${dayIdx}-${hour}`}
                                            style={{
                                                height: 22,
                                                borderRadius: 3,
                                                background: interpolateColor(pct),
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                cursor: tokens > 0 ? 'pointer' : 'default',
                                                position: 'relative',
                                                transition: 'transform 0.1s ease',
                                            }}
                                            onMouseEnter={() => setTooltip({ day: dayIdx, hour, tokens })}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    );
                                })}
                            </Fragment>
                        ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Less</span>
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                            <div key={v} style={{ width: 16, height: 16, borderRadius: 3, background: interpolateColor(v), border: '1px solid rgba(0,0,0,0.08)' }} />
                        ))}
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>More</span>
                    </div>

                    {/* Tooltip */}
                    {tooltip && tooltip.tokens > 0 && (
                        <div style={{
                            marginTop: '0.6rem',
                            padding: '0.45rem 0.75rem',
                            borderRadius: 6,
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            fontSize: '0.78rem',
                            color: 'var(--ink)',
                            display: 'inline-block',
                        }}>
                            <strong>{DAYS[tooltip.day]}</strong> at {buildLabel(tooltip.hour)} —{' '}
                            <strong>{tooltip.tokens.toLocaleString()}</strong> tokens
                        </div>
                    )}
                </div>
            )}

            {!loading && !error && cells.length === 0 && (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    No token usage data for this period.
                </p>
            )}
        </div>
    );
}
