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
        <section className="card" aria-label="session-replay-timeline" style={{ display: 'grid', gap: '0.9rem' }}>
            <header>
                <h2>Session Replay</h2>
                <p className="muted" style={{ marginTop: '-0.15rem' }}>
                    Session {sessionId} · {items.length} tracked actions
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 290px) 1fr', gap: '1rem' }}>
                <aside style={{ borderRight: '1px solid rgba(148,163,184,0.3)', paddingRight: '0.8rem', maxHeight: 540, overflow: 'auto' }}>
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            type="button"
                            className="tab-link"
                            onClick={() => setSelectedId(item.id)}
                            style={{
                                width: '100%',
                                marginBottom: '0.5rem',
                                justifyContent: 'space-between',
                                borderColor: item.id === selected?.id ? 'var(--accent)' : undefined,
                            }}
                        >
                            <span>{index + 1}. {item.actionType}</span>
                            <span className={`badge ${item.verified ? 'low' : 'warn'}`}>{item.verified ? 'verified' : 'failed'}</span>
                        </button>
                    ))}
                </aside>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {selected ? (
                        <>
                            <div className="status-panel" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <strong>{selected.actionType}</strong>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <span className={`badge ${selected.riskLevel === 'high' ? 'warn' : 'low'}`}>{selected.riskLevel} risk</span>
                                    <span className={`badge ${selected.success ? 'low' : 'warn'}`}>{selected.success ? 'success' : 'error'}</span>
                                </div>
                            </div>

                            <p style={{ margin: 0 }}><strong>Target:</strong> {selected.target}</p>
                            <p style={{ margin: 0 }}><strong>Duration:</strong> {selected.durationMs}ms</p>
                            <EvidenceViewer item={selected} />

                            {selected.errorMessage && (
                                <div className="status-panel warning">
                                    <strong>Error:</strong> {selected.errorMessage}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="muted">No action selected.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
