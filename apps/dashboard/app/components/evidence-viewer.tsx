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

function methodColor(method: string): string {
    const m = method.toUpperCase();
    if (m === 'GET')    return 'var(--accent)';
    if (m === 'POST')   return 'var(--ok)';
    if (m === 'PUT')    return 'var(--warn)';
    if (m === 'PATCH')  return 'var(--accent)';
    if (m === 'DELETE') return 'var(--danger)';
    return 'var(--ink-muted)';
}

function statusColor(status?: number): string {
    if (!status) return 'var(--ink-muted)';
    if (status < 300) return 'var(--ok)';
    if (status < 400) return 'var(--warn)';
    return 'var(--danger)';
}

export function EvidenceViewer({ item }: { item: EvidenceViewerItem }) {
    const beforeUrl = item.evidenceBundle?.screenshotBefore?.url || item.screenshotBeforeUrl;
    const afterUrl  = item.evidenceBundle?.screenshotAfter?.url  || item.screenshotAfterUrl;

    return (
        <div style={{ display: 'grid', gap: '1.25rem' }}>

            {/* ── Screenshots ── */}
            <div>
                <p className="obs-section-title">Evidence Viewer</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                        { label: 'Before', url: beforeUrl, accent: 'var(--ink-muted)' },
                        { label: 'After',  url: afterUrl,  accent: 'var(--brand)' },
                    ].map(({ label, url, accent }) => (
                        <div key={label}>
                            <div style={{
                                background: 'var(--bg-deep)',
                                borderRadius: 10,
                                border: `1px solid ${label === 'After' ? 'rgba(214, 48, 31,0.35)' : 'var(--line)'}`,
                                overflow: 'hidden',
                                boxShadow: 'var(--shadow-sm)',
                            }}>
                                <div style={{
                                    padding: '5px 10px',
                                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}>
                                    <span style={{
                                        fontSize: '0.67rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.07em',
                                        textTransform: 'uppercase',
                                        color: accent,
                                        fontFamily: 'var(--font-plex-mono, monospace)',
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
                    <div style={{ marginTop: '0.6rem' }}>
                        <div style={{
                            background: 'var(--bg-deep)',
                            borderRadius: 10,
                            border: '1px solid var(--warn-border)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                <span style={{
                                    fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.07em',
                                    textTransform: 'uppercase', color: 'var(--warn)',
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                }}>Diff</span>
                            </div>
                            <img src={item.diffImageUrl} alt="Action diff" style={{ width: '100%', display: 'block' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--line)' }} />

            {/* ── Assertions ── */}
            <div>
                <p className="obs-section-title">Assertions</p>
                {item.assertions.length === 0 ? (
                    <p className="panel-muted" style={{
                        padding: '0.55rem 0.75rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        margin: 0,
                    }}>
                        No assertions recorded
                    </p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                        {item.assertions.map((a) => (
                            <div key={a.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.75rem',
                                background: a.passed ? 'var(--ok-bg)' : 'var(--danger-bg)',
                                border: `1px solid ${a.passed ? 'var(--ok-border)' : 'var(--danger-border)'}`,
                                borderRadius: 8,
                            }}>
                                <span style={{
                                    width: 17, height: 17,
                                    borderRadius: '50%',
                                    background: a.passed ? 'var(--ok-bg)' : 'var(--danger-bg)',
                                    border: `1px solid ${a.passed ? 'var(--ok-border)' : 'var(--danger-border)'}`,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 700,
                                    color: a.passed ? 'var(--ok)' : 'var(--danger)',
                                    flexShrink: 0,
                                }}>
                                    {a.passed ? '✓' : '✗'}
                                </span>
                                <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>{a.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Network Requests ── */}
            <div>
                <p className="obs-section-title">Network Requests</p>
                {item.networkRequests.length === 0 ? (
                    <p className="panel-muted" style={{
                        padding: '0.55rem 0.75rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        margin: 0,
                    }}>
                        No network requests captured
                    </p>
                ) : (
                    <div className="obs-log-console" style={{ gap: '0.1rem' }}>
                        {item.networkRequests.map((req, i) => (
                            <div key={`${req.method}:${req.url}:${i}`} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.2rem 0',
                                borderBottom: i < item.networkRequests.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                            }}>
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 700,
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                    color: methodColor(req.method),
                                    minWidth: 38, textAlign: 'center',
                                }}>
                                    {req.method.toUpperCase()}
                                </span>
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontFamily: 'var(--font-plex-mono, monospace)',
                                    color: 'var(--ink-muted)',
                                    flex: 1,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {req.url}
                                </span>
                                {typeof req.status === 'number' && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700,
                                        fontFamily: 'var(--font-plex-mono, monospace)',
                                        color: statusColor(req.status), flexShrink: 0,
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
                <p className="obs-section-title">DOM Evidence</p>
                <div className="obs-log-console" style={{ padding: '0.55rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--ink-muted)', flexShrink: 0 }}>hash</span>
                        <span style={{
                            fontFamily: 'var(--font-plex-mono, monospace)',
                            fontSize: '0.72rem', color: 'var(--info)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {item.domSnapshotHash ?? 'not captured'}
                        </span>
                    </div>
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
                            gap: '0.25rem',
                            fontSize: '0.78rem',
                            color: 'var(--brand)',
                            textDecoration: 'none',
                            fontWeight: 500,
                        }}
                    >
                        Open DOM checkpoint ↗
                    </a>
                )}
            </div>
        </div>
    );
}
