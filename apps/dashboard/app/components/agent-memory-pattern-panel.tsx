type LearnedPattern = {
    id: string;
    pattern: string;
    confidence: number;
    observedCount: number;
    lastSeen: string;
};

type Props = {
    patterns: LearnedPattern[];
};

const formatConfidence = (value: number): string => `${Math.round(value * 100)}%`;

export function AgentMemoryPatternPanel({ patterns }: Props) {
    return (
        <section className="card" aria-label="agent-memory-pattern-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                    <h2>Learned Patterns</h2>
                    <p className="muted" style={{ marginTop: '-0.2rem' }}>
                        Code review and execution feedback that will be injected into future runs.
                    </p>
                </div>
                <span className={`badge ${patterns.length > 0 ? 'low' : 'warn'}`}>{patterns.length} active</span>
            </div>

            {patterns.length === 0 ? (
                <p className="muted">No learned patterns for this workspace yet.</p>
            ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {patterns.map((pattern) => (
                        <article key={pattern.id} className="status-panel" style={{ display: 'grid', gap: '0.45rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <strong>{pattern.pattern}</strong>
                                <span className="badge low">confidence {formatConfidence(pattern.confidence)}</span>
                            </div>
                            <div className="muted" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <span>observed {pattern.observedCount} time{pattern.observedCount === 1 ? '' : 's'}</span>
                                <span>last seen {new Date(pattern.lastSeen).toLocaleString('en-US')}</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}