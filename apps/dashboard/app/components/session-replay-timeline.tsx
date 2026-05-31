'use client';

import { useMemo, useState } from 'react';
import { EvidenceViewer } from './evidence-viewer';

type SessionReplayItem = {
    id: string;
    actionType: string;
    target: string;
    screenshotBeforeUrl: string;
    screenshotAfterUrl: string;
    diffImageUrl: string | null;
    assertions: Array<{ id: string; description: string; passed: boolean }>;
    networkRequests: Array<{ method: string; url: string; status?: number }>;
    verified: boolean;
    domSnapshotHash: string | null;
    evidenceBundle: {
        screenshotBefore?: { url?: string; provider?: string };
        screenshotAfter?: { url?: string; provider?: string };
        domCheckpoint?: { url?: string } | null;
        domSnapshotStored?: boolean;
    } | null;
    riskLevel: string;
    success: boolean;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string;
    durationMs: number;
};

function riskStyle(level: string): { bg: string; color: string; border: string } {
    if (level === 'high')   return { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.3)' };
    if (level === 'medium') return { bg: 'rgba(245,158,11,0.1)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)' };
    return                         { bg: 'rgba(34,197,94,0.08)',  color: '#4ade80', border: 'rgba(34,197,94,0.25)' };
}

function MetaChip({ label, value, tone = 'default' }: {
    label: string;
    value: string;
    tone?: 'success' | 'warn' | 'error' | 'default';
}) {
    const colors = {
        success: { color: '#4ade80', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)' },
        warn:    { color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
        error:   { color: '#f87171', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
        default: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.18)' },
    }[tone];
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '0.4rem 0.65rem',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
        }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#64748b' }}>{label}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: colors.color }}>{value}</span>
        </div>
    );
}

export function SessionReplayTimeline({
    sessionId,
    items,
}: {
    sessionId: string;
    items: SessionReplayItem[];
}) {
    const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

    const selected = useMemo(
        () => items.find((item) => item.id === selectedId) ?? items[0],
        [items, selectedId],
    );

    const risk = riskStyle(selected?.riskLevel ?? 'low');

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            {/* ── Header strip ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
            }}>
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                        Session Replay
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'var(--font-plex-mono, monospace)' }}>
                        {sessionId}
                    </p>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.3rem 0.65rem',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 20,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: '#818cf8',
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block' }} />
                    {items.length} action{items.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── Main layout ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: '1rem', alignItems: 'start' }}>

                {/* Step list */}
                <nav style={{
                    background: 'rgba(15,23,42,0.4)',
                    border: '1px solid rgba(148,163,184,0.12)',
                    borderRadius: 12,
                    padding: '0.5rem',
                    maxHeight: 520,
                    overflowY: 'auto',
                }}>
                    {items.map((item, index) => {
                        const isActive = item.id === selected?.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedId(item.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.55rem',
                                    padding: '0.5rem 0.6rem',
                                    marginBottom: '0.25rem',
                                    borderRadius: 8,
                                    border: isActive ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
                                    background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.12s, border-color 0.12s',
                                }}
                            >
                                {/* Step number circle */}
                                <span style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    background: isActive ? 'rgba(99,102,241,0.25)' : 'rgba(148,163,184,0.1)',
                                    border: `1px solid ${isActive ? 'rgba(99,102,241,0.4)' : 'rgba(148,163,184,0.2)'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color: isActive ? '#818cf8' : '#64748b',
                                    flexShrink: 0,
                                }}>
                                    {index + 1}
                                </span>

                                {/* Action label */}
                                <span style={{
                                    flex: 1,
                                    fontSize: '0.78rem',
                                    fontWeight: isActive ? 600 : 400,
                                    color: isActive ? '#e2e8f0' : '#94a3b8',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {item.actionType}
                                </span>

                                {/* Status dot */}
                                <span style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    background: item.verified ? '#4ade80' : '#f87171',
                                    boxShadow: item.verified ? '0 0 4px rgba(74,222,128,0.5)' : '0 0 4px rgba(248,113,113,0.5)',
                                }} />
                            </button>
                        );
                    })}
                </nav>

                {/* Detail panel */}
                {selected ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>

                        {/* Action title bar */}
                        <div style={{
                            background: 'rgba(15,23,42,0.5)',
                            border: '1px solid rgba(148,163,184,0.12)',
                            borderRadius: 12,
                            padding: '0.85rem 1rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <span style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: '#e2e8f0',
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                }}>
                                    {selected.actionType}
                                </span>
                                <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: 20,
                                        background: risk.bg,
                                        color: risk.color,
                                        border: `1px solid ${risk.border}`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}>
                                        {selected.riskLevel} risk
                                    </span>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: 20,
                                        background: selected.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: selected.success ? '#4ade80' : '#f87171',
                                        border: `1px solid ${selected.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}>
                                        {selected.success ? 'success' : 'error'}
                                    </span>
                                </div>
                            </div>

                            {/* Metadata chips row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.4rem' }}>
                                <MetaChip label="Target" value={selected.target} />
                                <MetaChip
                                    label="Duration"
                                    value={`${selected.durationMs}ms`}
                                    tone={selected.durationMs > 2000 ? 'warn' : 'default'}
                                />
                                <MetaChip
                                    label="Verified"
                                    value={selected.verified ? 'Yes' : 'No'}
                                    tone={selected.verified ? 'success' : 'error'}
                                />
                                <MetaChip
                                    label="Started"
                                    value={new Date(selected.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                />
                            </div>
                        </div>

                        {selected.errorMessage && (
                            <div style={{
                                padding: '0.6rem 0.85rem',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: 8,
                                fontSize: '0.78rem',
                                color: '#f87171',
                                display: 'flex',
                                gap: '0.5rem',
                            }}>
                                <span style={{ flexShrink: 0, fontWeight: 700 }}>Error:</span>
                                <span>{selected.errorMessage}</span>
                            </div>
                        )}

                        {/* Evidence */}
                        <div style={{
                            background: 'rgba(15,23,42,0.4)',
                            border: '1px solid rgba(148,163,184,0.12)',
                            borderRadius: 12,
                            padding: '1rem',
                        }}>
                            <EvidenceViewer item={selected} />
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                        Select an action from the timeline to inspect its evidence.
                    </div>
                )}
            </div>
        </div>
    );
}
