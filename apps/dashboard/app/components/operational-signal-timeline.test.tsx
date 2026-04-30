import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperationalSignalTimeline } from './operational-signal-timeline';

test('OperationalSignalTimeline renders empty-state visual when fewer than two points are available', () => {
    const html = renderToStaticMarkup(
        <OperationalSignalTimeline
            source="live"
            points={[
                {
                    label: '10:00 AM',
                    value: 3,
                    timestamp: Date.now(),
                },
            ]}
        />,
    );

    assert.match(html, /signal-chart-empty/);
    assert.match(html, /Historical points will render here once the workspace emits at least two timestamped signals\./);
    assert.match(html, /data-testid="timeline-empty-state"/);
});

test('OperationalSignalTimeline renders chart visuals when two or more telemetry points are available', () => {
    const now = Date.now();
    const html = renderToStaticMarkup(
        <OperationalSignalTimeline
            source="live"
            points={[
                { label: '9:00 AM', value: 2, timestamp: now - 3_600_000 },
                { label: '10:00 AM', value: 4, timestamp: now },
            ]}
        />,
    );

    assert.match(html, /data-testid="timeline-chart-svg"/);
    assert.match(html, /signal-chart-line/);
    assert.doesNotMatch(html, /signal-chart-empty/);
});