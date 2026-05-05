import React from 'react';

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

    // Threshold bands — warning at 65% of peak, danger at 85%
    const chartInnerH = timelineHeight - timelinePaddingTop - timelinePaddingBottom;
    const chartInnerW = timelineWidth - timelinePaddingX * 2;
    const warnThresholdY = timelinePaddingTop + (1 - 0.65) * chartInnerH;
    const dangerThresholdY = timelinePaddingTop + (1 - 0.85) * chartInnerH;
    const warnBandH = warnThresholdY - timelinePaddingTop;
    const dangerBandH = dangerThresholdY - timelinePaddingTop;

    // Anomaly markers — points at or above warning threshold
    const warnThresholdValue = timelinePeak * 0.65;
    const anomalyCoords = coordinates.filter((c) => c.value >= warnThresholdValue);

    // Forecast ghost-line — linear regression on last 4 points, extrapolate 2 more
    const forecastPoints = (() => {
        const n = Math.min(4, coordinates.length);
        const recent = coordinates.slice(-n);
        const meanX = recent.reduce((s, p) => s + p.x, 0) / n;
        const meanY = recent.reduce((s, p) => s + p.y, 0) / n;
        const denom = recent.reduce((s, p) => s + (p.x - meanX) ** 2, 0) || 1;
        const slope = recent.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) / denom;
        const intercept = meanY - slope * meanX;
        return [1, 2].map((i) => {
            const x = coordinates[coordinates.length - 1].x + timelineStepX * i;
            const y = Math.min(Math.max(intercept + slope * x, timelinePaddingTop), timelineHeight - timelinePaddingBottom);
            return { x, y };
        });
    })();
    const forecastPath = [coordinates[coordinates.length - 1], ...forecastPoints]
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');

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
                    {anomalyCoords.length > 0 && <span className="badge warn">{anomalyCoords.length} spike{anomalyCoords.length > 1 ? 's' : ''}</span>}
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
                        {/* Warning threshold band */}
                        <rect x={timelinePaddingX} y={timelinePaddingTop} width={chartInnerW} height={warnBandH} fill="rgba(245,158,11,0.06)" />
                        {/* Danger threshold band */}
                        <rect x={timelinePaddingX} y={timelinePaddingTop} width={chartInnerW} height={dangerBandH} fill="rgba(239,68,68,0.07)" />
                        {/* Grid lines */}
                        {[0.25, 0.5, 0.75].map((ratio) => {
                            const y = timelinePaddingTop + (timelineHeight - timelinePaddingTop - timelinePaddingBottom) * ratio;
                            return <line key={ratio} x1={timelinePaddingX} y1={y} x2={timelineWidth - timelinePaddingX} y2={y} className="signal-chart-grid" />;
                        })}
                        {/* Warning threshold line */}
                        <line x1={timelinePaddingX} y1={warnThresholdY} x2={timelineWidth - timelinePaddingX} y2={warnThresholdY} stroke="rgba(245,158,11,0.5)" strokeWidth="1" strokeDasharray="4 3" />
                        {/* Danger threshold line */}
                        <line x1={timelinePaddingX} y1={dangerThresholdY} x2={timelineWidth - timelinePaddingX} y2={dangerThresholdY} stroke="rgba(239,68,68,0.45)" strokeWidth="1" strokeDasharray="4 3" />
                        {/* Area + main line */}
                        <path d={timelineAreaPath} className="signal-chart-area" />
                        <path d={timelineLinePath} className="signal-chart-line" />
                        {/* Forecast ghost-line */}
                        <path d={forecastPath} fill="none" stroke="rgba(99,102,241,0.3)" strokeWidth="1.8" strokeDasharray="5 4" strokeLinecap="round" />
                        {forecastPoints.map((fp, i) => (
                            <circle key={`forecast-${i}`} cx={fp.x} cy={fp.y} r="3" fill="none" stroke="rgba(99,102,241,0.35)" strokeWidth="1.5" />
                        ))}
                        {/* Anomaly markers */}
                        {anomalyCoords.map((c) => (
                            <circle key={`anomaly-${c.timestamp}`} cx={c.x} cy={c.y} r="7" fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.65)" strokeWidth="1.5" />
                        ))}
                        {/* Regular data dots */}
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