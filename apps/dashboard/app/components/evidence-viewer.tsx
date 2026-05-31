'use client';

type AssertionItem = { id: string; description: string; passed: boolean };
type NetworkRequestItem = { method: string; url: string; status?: number };

type EvidenceBundle = {
    screenshotBefore?: { url?: string; provider?: string };
    screenshotAfter?: { url?: string; provider?: string };
    domCheckpoint?: { url?: string } | null;
    domSnapshotStored?: boolean;
} | null;

export type EvidenceViewerItem = {
    screenshotBeforeUrl: string;
    screenshotAfterUrl: string;
    diffImageUrl: string | null;
    assertions: AssertionItem[];
    networkRequests: NetworkRequestItem[];
    domSnapshotHash: string | null;
    evidenceBundle: EvidenceBundle;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p style={{
            margin: '0 0 0.5rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--m-ink-muted, #94a3b8)',
        }}>
            {children}
        </p>
    );
}

function statusColor(status?: number): string {
    if (!status) return '#94a3b8';
    if (status < 300) return '#22c55e';
    if (status < 400) return '#f59e0b';
    return '#ef4444';
}

function methodColor(method: string): string {
    const m = method.toUpperCase();
    if (m === 'GET')    return '#60a5fa';
    if (m === 'POST')   return '#34d399';
    if (m === 'PUT')    return '#fbbf24';
    if (m === 'PATCH')  return '#a78bfa';
    if (m === 'DELETE') return '#f87171';
    return '#94a3b8';
}

export function EvidenceViewer({ item }: { item: EvidenceViewerItem }) {
    const beforeUrl = item.evidenceBundle?.screenshotBefore?.url || item.screenshotBeforeUrl;
    const afterUrl  = item.evidenceBundle?.screenshotAfter?.url  || item.screenshotAfterUrl;

    return (
        <div style={{ display: 'grid', gap: '1.25rem' }}>

            {/* ── Screenshots ── */}
            <div>
                <SectionLabel>Evidence Viewer</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                        { label: 'Before', url: beforeUrl },
                        { label: 'After',  url: afterUrl  },
                    ].map(({ label, url }) => (
                        <div key={label} style={{ position: 'relative' }}>
                            <div style={{
                                background: '#0d1117',
                                borderRadius: 10,
                                border: '1px solid rgba(99,102,241,0.25)',
                                overflow: 'hidden',
                                boxShadow: '0 0 0 1px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}>
                                <div style={{
                                    padding: '6px 10px',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        color: label === 'Before' ? '#94a3b8' : '#818cf8',
                                        background: label === 'Before' ? 'rgba(148,163,184,0.1)' : 'rgba(129,140,248,0.12)',
                                        padding: '1px 7px',
                                        borderRadius: 4,
                                        border: `1px solid ${label === 'Before' ? 'rgba(148,163,184,0.2)' : 'rgba(129,140,248,0.3)'}`,
                                    }}>
                                        {label}
                                    </span>
                                </div>
                                <img
                                    src={url}
                                    alt={`${label} action state`}
                                    style={{ width: '100%', display: 'block' }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {item.diffImageUrl && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <div style={{
                            background: '#0d1117',
                            borderRadius: 10,
                            border: '1px solid rgba(245,158,11,0.25)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '6px 10px',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: '#fbbf24',
                                    background: 'rgba(251,191,36,0.1)',
                                    padding: '1px 7px',
                                    borderRadius: 4,
                                    border: '1px solid rgba(251,191,36,0.3)',
                                }}>
                                    Diff
                                </span>
                            </div>
                            <img src={item.diffImageUrl} alt="Action diff" style={{ width: '100%', display: 'block' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'rgba(148,163,184,0.12)' }} />

            {/* ── Assertions ── */}
            <div>
                <SectionLabel>Assertions</SectionLabel>
                {item.assertions.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.6rem 0.75rem',
                        background: 'rgba(148,163,184,0.06)',
                        borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.12)',
                    }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No assertions recorded</span>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                        {item.assertions.map((a) => (
                            <div key={a.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.75rem',
                                background: a.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                                borderRadius: 8,
                                border: `1px solid ${a.passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            }}>
                                <span style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: a.passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.65rem',
                                    color: a.passed ? '#22c55e' : '#ef4444',
                                    flexShrink: 0,
                                }}>
                                    {a.passed ? '✓' : '✗'}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>{a.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Network Requests ── */}
            <div>
                <SectionLabel>Network Requests</SectionLabel>
                {item.networkRequests.length === 0 ? (
                    <div style={{
                        padding: '0.6rem 0.75rem',
                        background: 'rgba(148,163,184,0.06)',
                        borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.12)',
                    }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No network requests captured</span>
                    </div>
                ) : (
                    <div style={{
                        background: 'rgba(15,23,42,0.5)',
                        borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.12)',
                        overflow: 'hidden',
                    }}>
                        {item.networkRequests.map((req, i) => (
                            <div key={`${req.method}:${req.url}:${i}`} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.75rem',
                                borderBottom: i < item.networkRequests.length - 1 ? '1px solid rgba(148,163,184,0.08)' : 'none',
                            }}>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                    color: methodColor(req.method),
                                    background: `${methodColor(req.method)}18`,
                                    padding: '1px 6px',
                                    borderRadius: 3,
                                    flexShrink: 0,
                                    minWidth: 40,
                                    textAlign: 'center',
                                }}>
                                    {req.method.toUpperCase()}
                                </span>
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                    color: '#94a3b8',
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {req.url}
                                </span>
                                {typeof req.status === 'number' && (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-plex-mono, monospace)',
                                        color: statusColor(req.status),
                                        flexShrink: 0,
                                    }}>
                                        {req.status}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── DOM Evidence ── */}
            <div>
                <SectionLabel>DOM Evidence</SectionLabel>
                <div style={{
                    background: 'rgba(15,23,42,0.5)',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.12)',
                    padding: '0.6rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', flexShrink: 0 }}>hash</span>
                    <span style={{
                        fontFamily: 'var(--font-plex-mono, monospace)',
                        fontSize: '0.72rem',
                        color: '#a5b4fc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {item.domSnapshotHash ?? 'not captured'}
                    </span>
                </div>
                {item.evidenceBundle?.domCheckpoint?.url && (
                    <a
                        href={item.evidenceBundle.domCheckpoint.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            marginTop: '0.4rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.75rem',
                            color: '#818cf8',
                            textDecoration: 'none',
                        }}
                    >
                        Open DOM checkpoint ↗
                    </a>
                )}
            </div>
        </div>
    );
}
