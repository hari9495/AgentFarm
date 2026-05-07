'use client';

import { useMemo, useState } from 'react';

type SessionReplayItem = {
    id: string;
    actionType: string;
    target: string;
    screenshotBeforeUrl: string;
    screenshotAfterUrl: string;
    diffImageUrl: string | null;
    assertions: Array<{ id: string; description: string; passed: boolean }>;
    verified: boolean;
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                                <figure style={{ margin: 0 }}>
                                    <figcaption className="muted">Before</figcaption>
                                    <img src={selected.screenshotBeforeUrl} alt="Before action state" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                                </figure>
                                <figure style={{ margin: 0 }}>
                                    <figcaption className="muted">After</figcaption>
                                    <img src={selected.screenshotAfterUrl} alt="After action state" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                                </figure>
                            </div>

                            {selected.diffImageUrl && (
                                <figure style={{ margin: 0 }}>
                                    <figcaption className="muted">Diff</figcaption>
                                    <img src={selected.diffImageUrl} alt="Action diff image" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                                </figure>
                            )}

                            <section>
                                <h3 style={{ marginBottom: '0.35rem' }}>Assertions</h3>
                                {selected.assertions.length === 0 ? (
                                    <p className="muted">No assertions recorded.</p>
                                ) : (
                                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                                        {selected.assertions.map((assertion) => (
                                            <li key={assertion.id}>
                                                {assertion.description} · {assertion.passed ? 'pass' : 'fail'}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

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
