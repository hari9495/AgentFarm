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

export function EvidenceViewer({ item }: { item: EvidenceViewerItem }) {
    const beforeUrl = item.evidenceBundle?.screenshotBefore?.url || item.screenshotBeforeUrl;
    const afterUrl = item.evidenceBundle?.screenshotAfter?.url || item.screenshotAfterUrl;

    return (
        <section style={{ display: 'grid', gap: '0.75rem' }} aria-label="evidence-viewer">
            <h3 style={{ margin: 0 }}>Evidence Viewer</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <figure style={{ margin: 0 }}>
                    <figcaption className="muted">Before</figcaption>
                    <img src={beforeUrl} alt="Before action state" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption className="muted">After</figcaption>
                    <img src={afterUrl} alt="After action state" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                </figure>
            </div>

            {item.diffImageUrl && (
                <figure style={{ margin: 0 }}>
                    <figcaption className="muted">Diff</figcaption>
                    <img src={item.diffImageUrl} alt="Action diff image" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)' }} />
                </figure>
            )}

            <section>
                <h3 style={{ marginBottom: '0.35rem' }}>Assertions</h3>
                {item.assertions.length === 0 ? (
                    <p className="muted">No assertions recorded.</p>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {item.assertions.map((assertion) => (
                            <li key={assertion.id}>
                                {assertion.description} · {assertion.passed ? 'pass' : 'fail'}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h3 style={{ marginBottom: '0.35rem' }}>Network Requests</h3>
                {item.networkRequests.length === 0 ? (
                    <p className="muted">No network requests captured.</p>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {item.networkRequests.map((request, index) => (
                            <li key={`${request.method}:${request.url}:${index}`}>
                                {request.method} {request.url} {typeof request.status === 'number' ? `· ${request.status}` : ''}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h3 style={{ marginBottom: '0.35rem' }}>DOM Evidence</h3>
                <p className="muted" style={{ margin: 0 }}>
                    Snapshot hash: {item.domSnapshotHash ?? 'not captured'}
                </p>
                {item.evidenceBundle?.domCheckpoint?.url && (
                    <a href={item.evidenceBundle.domCheckpoint.url} target="_blank" rel="noreferrer" className="tab-link" style={{ marginTop: '0.5rem', display: 'inline-flex' }}>
                        Open DOM checkpoint
                    </a>
                )}
            </section>
        </section>
    );
}
