type OperationalSignalTimelinePoint = {
    label: string;
    value: number;
    timestamp: number;
};

type OperationalSignalTimelineProps = {
    points: OperationalSignalTimelinePoint[];
    source: 'live' | 'fallback';
};

export function OperationalSignalTimeline({ points, source }: OperationalSignalTimelineProps) {
    const totalTimelineSignals = points.reduce((sum, point) => sum + point.value, 0);

    if (points.length < 2) {
        return (
            <section className="card signal-card" aria-labelledby="operational-signal-title">
                <div className="signal-card-header">
                    <div>
                        <h2 id="operational-signal-title">Operational Signal Timeline</h2>
                        <p className="signal-card-copy">
                            Event, approval, and runtime telemetry is charted here as soon as at least two historical points are available.
                        </p>
                    </div>
                    <div className="signal-card-badges">
                        <span className="badge neutral">12h window</span>
                        <span className={`badge ${source === 'live' ? 'low' : 'warn'}`}>{source === 'live' ? 'live telemetry' : 'fallback telemetry'}</span>
                    </div>
                </div>

                <p className="signal-chart-empty" data-testid="timeline-empty-state">
                    Historical points will render here once the workspace emits at least two timestamped signals.
                </p>
            </section>
        );
    }

    const timelinePeak = Math.max(...points.map((point) => point.value), 1);
    const timelineWidth = 420;
    const timelineHeight = 164;
    const timelinePaddingX = 12;
    const timelinePaddingTop = 16;
    const timelinePaddingBottom = 24;
    const timelineStepX = (timelineWidth - timelinePaddingX * 2) / (points.length - 1);
    const coordinates = points.map((point, index) => {
        const x = timelinePaddingX + timelineStepX * index;
        const y = timelineHeight - timelinePaddingBottom - ((timelineHeight - timelinePaddingTop - timelinePaddingBottom) * point.value) / timelinePeak;
        return { ...point, x, y };
    });
    const timelineLinePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const timelineAreaPath = `M ${coordinates[0].x} ${timelineHeight - timelinePaddingBottom} ${coordinates
        .map((point) => `L ${point.x} ${point.y}`)
        .join(' ')} L ${coordinates[coordinates.length - 1].x} ${timelineHeight - timelinePaddingBottom} Z`;

    return (
        <section className="card signal-card" aria-labelledby="operational-signal-title">
            <div className="signal-card-header">
                <div>
                    <h2 id="operational-signal-title">Operational Signal Timeline</h2>
                    <p className="signal-card-copy">
                        Historical telemetry across approvals, runtime, and audit channels to highlight activity spikes and plateaus.
                    </p>
                </div>
                <div className="signal-card-badges">
                    <span className="badge neutral">12h window</span>
                    <span className="badge low">{totalTimelineSignals} tracked signals</span>
                    <span className={`badge ${source === 'live' ? 'low' : 'warn'}`}>{source === 'live' ? 'live telemetry' : 'fallback telemetry'}</span>
                </div>
            </div>

            <div className="signal-chart" role="img" aria-label="Time-series chart of recent operational signals across the last twelve hours">
                <div className="signal-chart-frame">
                    <svg viewBox={`0 0 ${timelineWidth} ${timelineHeight}`} className="signal-chart-svg" aria-hidden="true" data-testid="timeline-chart-svg">
                        <defs>
                            <linearGradient id="signalTimelineFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(99, 102, 241, 0.28)" />
                                <stop offset="100%" stopColor="rgba(99, 102, 241, 0.02)" />
                            </linearGradient>
                        </defs>
                        {[0.25, 0.5, 0.75].map((ratio) => {
                            const y = timelinePaddingTop + (timelineHeight - timelinePaddingTop - timelinePaddingBottom) * ratio;
                            return <line key={ratio} x1={timelinePaddingX} y1={y} x2={timelineWidth - timelinePaddingX} y2={y} className="signal-chart-grid" />;
                        })}
                        <path d={timelineAreaPath} className="signal-chart-area" />
                        <path d={timelineLinePath} className="signal-chart-line" />
                        {coordinates.map((point) => (
                            <circle key={point.timestamp} cx={point.x} cy={point.y} r="4" className="signal-chart-dot" />
                        ))}
                    </svg>
                </div>

                <div className="signal-chart-axis" aria-hidden="true">
                    {points.map((point) => (
                        <span key={point.timestamp} className="signal-axis-label">{point.label}</span>
                    ))}
                </div>

                <div className="signal-chart-summary">
                    <div className="signal-summary-item">
                        <span className="signal-summary-label">Peak</span>
                        <strong className="signal-summary-value">{timelinePeak}</strong>
                    </div>
                    <div className="signal-summary-item">
                        <span className="signal-summary-label">Latest bucket</span>
                        <strong className="signal-summary-value">{points[points.length - 1]?.value ?? 0}</strong>
                    </div>
                    <div className="signal-summary-item">
                        <span className="signal-summary-label">Points</span>
                        <strong className="signal-summary-value">{points.length}</strong>
                    </div>
                </div>
            </div>
        </section>
    );
}

export type { OperationalSignalTimelinePoint };