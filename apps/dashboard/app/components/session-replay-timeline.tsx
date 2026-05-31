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

function riskBadgeClass(level: string): string {
    if (level === 'high')   return 'badge high';
    if (level === 'medium') return 'badge medium';
    return 'badge low';
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

    return (
        <div className="card" style={{ display: 'grid', gap: '1rem' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ display: 'inline-block', width: 3, height: '0.95rem', background: 'var(--brand)', borderRadius: 2, flexShrink: 0 }} />
                        Session Replay
                    </h2>
                    <p style={{ margin: '0.15rem 0 0 calc(0.45rem + 3px)', fontSize: '0.78rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-plex-mono, monospace)' }}>
                        {sessionId}
                    </p>
                </div>
                <span className="badge neutral">{items.length} action{items.length !== 1 ? 's' : ''}</span>
            </div>

            {/* ── Layout ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 240px) 1fr', gap: '1rem', alignItems: 'start' }}>

                {/* Step list */}
                <div style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '0.4rem',
                    maxHeight: 540,
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
                                    gap: '0.5rem',
                                    padding: '0.45rem 0.6rem',
                                    marginBottom: '0.2rem',
                                    borderRadius: 8,
                                    border: isActive ? '1px solid var(--info-border)' : '1px solid transparent',
                                    background: isActive ? 'var(--info-bg)' : 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.12s, border-color 0.12s',
                                }}
                            >
                                {/* Step circle */}
                                <span style={{
                                    width: 20, height: 20,
                                    borderRadius: '50%',
                                    background: isActive ? 'var(--info-bg)' : 'var(--card)',
                                    border: `1px solid ${isActive ? 'var(--info-border)' : 'var(--line-strong)'}`,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.62rem', fontWeight: 700,
                                    color: isActive ? 'var(--brand)' : 'var(--ink-muted)',
                                    flexShrink: 0,
                                }}>
                                    {index + 1}
                                </span>

                                {/* Label */}
                                <span style={{
                                    flex: 1,
                                    fontSize: '0.78rem',
                                    fontWeight: isActive ? 600 : 400,
                                    color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {item.actionType}
                                </span>

                                {/* Status dot */}
                                <span style={{
                                    width: 7, height: 7,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    background: item.verified ? 'var(--ok)' : 'var(--danger)',
                                }} />
                            </button>
                        );
                    })}
                </div>

                {/* Detail panel */}
                {selected ? (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>

                        {/* Action title + badges */}
                        <div style={{
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            padding: '0.85rem 1rem',
                            boxShadow: 'var(--shadow-sm)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <span style={{
                                    fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)',
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                }}>
                                    {selected.actionType}
                                </span>
                                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                                    <span className={riskBadgeClass(selected.riskLevel)}>{selected.riskLevel} risk</span>
                                    <span className={selected.success ? 'badge low' : 'badge high'}>{selected.success ? 'success' : 'error'}</span>
                                </div>
                            </div>

                            {/* KV metadata */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.45rem' }}>
                                {[
                                    { label: 'Target',   value: selected.target },
                                    { label: 'Duration', value: `${selected.durationMs}ms` },
                                    { label: 'Verified', value: selected.verified ? 'Yes' : 'No' },
                                    { label: 'Started',  value: new Date(selected.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{
                                        padding: '0.4rem 0.6rem',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--line)',
                                        borderRadius: 8,
                                    }}>
                                        <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)' }}>
                                            {label}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Error */}
                        {selected.errorMessage && (
                            <div className="status-panel error" style={{ display: 'flex', gap: '0.5rem', marginTop: 0 }}>
                                <strong style={{ flexShrink: 0 }}>Error:</strong>
                                <span style={{ fontSize: '0.82rem' }}>{selected.errorMessage}</span>
                            </div>
                        )}

                        {/* Evidence */}
                        <div style={{
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            padding: '1rem',
                            boxShadow: 'var(--shadow-sm)',
                        }}>
                            <EvidenceViewer item={selected} />
                        </div>
                    </div>
                ) : (
                    <p className="panel-muted" style={{ padding: '2rem', textAlign: 'center' }}>
                        Select an action from the timeline to inspect its evidence.
                    </p>
                )}
            </div>
        </div>
    );
}
