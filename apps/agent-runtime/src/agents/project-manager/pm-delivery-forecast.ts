// ============================================================================
// PM DELIVERY FORECAST
//
// Velocity-based Monte Carlo style delivery forecasting.
//
// Given the last N sprints of velocity data plus remaining backlog points, we
// compute three scenarios (optimistic / realistic / pessimistic) and produce
// a plain-English forecast report — the same answer a human PM gives when the
// product owner asks "when will we be done?"
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryScenario = {
    label: 'optimistic' | 'realistic' | 'pessimistic';
    sprintsRemaining: number;
    estimatedEndDate: string; // ISO date string (YYYY-MM-DD)
    completionPct: number;    // % of remaining work delivered in this scenario
};

export type DeliveryForecast = {
    optimistic: DeliveryScenario;
    realistic: DeliveryScenario;
    pessimistic: DeliveryScenario;
    avgVelocity: number;
    p10Velocity: number;    // 10th percentile
    p90Velocity: number;    // 90th percentile
    remainingPoints: number;
    sprintLengthDays: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    formattedReport: string;
};

export type ForecastParams = {
    /** Points completed in each historical sprint (newest last is fine, order doesn't matter) */
    velocityHistory: number[];
    /** Total remaining story points in the backlog */
    remainingPoints: number;
    /** Sprint duration in calendar days */
    sprintLengthDays?: number;
    /** Date of the START of the current sprint (ISO) — defaults to today */
    currentSprintStartDate?: string;
    /** Days elapsed in the current sprint */
    currentSprintDaysElapsed?: number;
    /** Human-readable label for the deliverable */
    featureName?: string;
    teamName?: string;
};

// ---------------------------------------------------------------------------
// computeDeliveryForecast
// ---------------------------------------------------------------------------

export function computeDeliveryForecast(params: ForecastParams): DeliveryForecast {
    const {
        velocityHistory,
        remainingPoints,
        sprintLengthDays = 14,
        currentSprintStartDate,
        currentSprintDaysElapsed = 0,
        featureName = 'backlog',
        teamName = 'team',
    } = params;

    // Need at least 1 data point
    const history = velocityHistory.filter((v) => v > 0);
    if (history.length === 0) {
        const fallback = buildFallback(remainingPoints, sprintLengthDays, currentSprintStartDate);
        return fallback;
    }

    // Compute stats
    const sorted  = [...history].sort((a, b) => a - b);
    const avg     = history.reduce((s, v) => s + v, 0) / history.length;
    const p10     = percentile(sorted, 10);
    const p50     = percentile(sorted, 50);
    const p90     = percentile(sorted, 90);

    // Confidence: high if ≥5 sprints and stddev < 30% of mean, medium if ≥3, low otherwise
    const stddev  = Math.sqrt(history.reduce((s, v) => s + (v - avg) ** 2, 0) / history.length);
    const cv      = avg > 0 ? stddev / avg : 1;
    const confidence: 'high' | 'medium' | 'low' =
        history.length >= 5 && cv < 0.3 ? 'high' :
        history.length >= 3             ? 'medium' : 'low';

    // Days remaining in current sprint
    const daysLeftInCurrentSprint = Math.max(0, sprintLengthDays - currentSprintDaysElapsed);

    const refDate  = currentSprintStartDate
        ? new Date(currentSprintStartDate)
        : new Date();

    const optimistic  = buildScenario('optimistic',  p90,  remainingPoints, sprintLengthDays, daysLeftInCurrentSprint, refDate);
    const realistic   = buildScenario('realistic',   p50,  remainingPoints, sprintLengthDays, daysLeftInCurrentSprint, refDate);
    const pessimistic = buildScenario('pessimistic', p10,  remainingPoints, sprintLengthDays, daysLeftInCurrentSprint, refDate);

    const formattedReport = formatForecastReport({
        optimistic, realistic, pessimistic,
        avgVelocity: avg, p10Velocity: p10, p90Velocity: p90,
        remainingPoints, sprintLengthDays, confidenceLevel: confidence,
        featureName, teamName,
    });

    return {
        optimistic,
        realistic,
        pessimistic,
        avgVelocity: Math.round(avg * 10) / 10,
        p10Velocity: p10,
        p90Velocity: p90,
        remainingPoints,
        sprintLengthDays,
        confidenceLevel: confidence,
        formattedReport,
    };
}

// ---------------------------------------------------------------------------
// Scenario builder
// ---------------------------------------------------------------------------

function buildScenario(
    label: DeliveryScenario['label'],
    velocity: number,
    remainingPoints: number,
    sprintLengthDays: number,
    daysLeftInCurrentSprint: number,
    refDate: Date,
): DeliveryScenario {
    if (velocity <= 0) {
        return {
            label,
            sprintsRemaining: 999,
            estimatedEndDate: 'unknown',
            completionPct: 0,
        };
    }

    // Points deliverable in the remainder of the current sprint
    const currentSprintDelivery = (daysLeftInCurrentSprint / sprintLengthDays) * velocity;
    const afterCurrentSprint    = Math.max(0, remainingPoints - currentSprintDelivery);
    const fullSprintsNeeded     = Math.ceil(afterCurrentSprint / velocity);
    const totalDaysFromNow      = daysLeftInCurrentSprint + fullSprintsNeeded * sprintLengthDays;

    const endDate = new Date(refDate.getTime() + totalDaysFromNow * 86_400_000);
    const completionPct = Math.min(100, Math.round((remainingPoints / (remainingPoints + afterCurrentSprint)) * 100));

    return {
        label,
        sprintsRemaining: fullSprintsNeeded,
        estimatedEndDate: endDate.toISOString().slice(0, 10),
        completionPct,
    };
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

function formatForecastReport(params: {
    optimistic: DeliveryScenario;
    realistic: DeliveryScenario;
    pessimistic: DeliveryScenario;
    avgVelocity: number;
    p10Velocity: number;
    p90Velocity: number;
    remainingPoints: number;
    sprintLengthDays: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    featureName: string;
    teamName: string;
}): string {
    const confidenceIcon = params.confidenceLevel === 'high' ? '🟢' : params.confidenceLevel === 'medium' ? '🟡' : '🔴';
    const lines: string[] = [
        `## Delivery Forecast — ${params.featureName}`,
        '',
        `**Team:** ${params.teamName} | **Remaining Backlog:** ${params.remainingPoints} pts | **Sprint Length:** ${params.sprintLengthDays} days`,
        '',
        `### Velocity Profile`,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Average velocity | ${Math.round(params.avgVelocity * 10) / 10} pts/sprint |`,
        `| 90th percentile (optimistic) | ${params.p90Velocity} pts/sprint |`,
        `| 50th percentile (realistic)  | ${Math.round(params.avgVelocity * 10) / 10} pts/sprint |`,
        `| 10th percentile (pessimistic)| ${params.p10Velocity} pts/sprint |`,
        '',
        `### Delivery Scenarios`,
        `| Scenario | End Date | Sprints Needed |`,
        `|----------|----------|----------------|`,
        `| 🟢 Optimistic  | **${params.optimistic.estimatedEndDate}** | ${params.optimistic.sprintsRemaining} |`,
        `| 🟡 Realistic   | **${params.realistic.estimatedEndDate}** | ${params.realistic.sprintsRemaining} |`,
        `| 🔴 Pessimistic | **${params.pessimistic.estimatedEndDate}** | ${params.pessimistic.sprintsRemaining} |`,
        '',
        `### Forecast Confidence: ${confidenceIcon} ${params.confidenceLevel.toUpperCase()}`,
    ];

    if (params.confidenceLevel === 'low') {
        lines.push('');
        lines.push('⚠️ **Low confidence:** fewer than 3 sprints of velocity data or high variability (CV > 30%).');
        lines.push('Collect more sprint data to improve forecast accuracy.');
    } else if (params.confidenceLevel === 'medium') {
        lines.push('');
        lines.push('ℹ️ **Medium confidence:** 3–4 sprints of data. Add more sprint history for a tighter forecast.');
    }

    lines.push('');
    lines.push(`_Forecast generated ${new Date().toISOString().slice(0, 10)}_`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sortedAsc: number[], pct: number): number {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.max(0, Math.min(sortedAsc.length - 1, Math.round((pct / 100) * (sortedAsc.length - 1))));
    return sortedAsc[idx] ?? 0;
}

function buildFallback(
    remainingPoints: number,
    sprintLengthDays: number,
    currentSprintStartDate?: string,
): DeliveryForecast {
    const placeholder: DeliveryScenario = {
        label: 'realistic',
        sprintsRemaining: 0,
        estimatedEndDate: 'unknown',
        completionPct: 0,
    };
    return {
        optimistic:  { ...placeholder, label: 'optimistic' },
        realistic:   placeholder,
        pessimistic: { ...placeholder, label: 'pessimistic' },
        avgVelocity: 0,
        p10Velocity: 0,
        p90Velocity: 0,
        remainingPoints,
        sprintLengthDays,
        confidenceLevel: 'low',
        formattedReport: [
            '## Delivery Forecast',
            '',
            '⚠️ **No velocity data provided.** Supply `historical_velocity` as an array of completed-points per sprint to generate a forecast.',
            `Remaining backlog: ${remainingPoints} pts`,
        ].join('\n'),
    };
}

// Expose for use in handler report
export { formatForecastReport };

// Small helper for handler — re-export for cleaner imports
export type { ForecastParams as DeliveryForecastParams };
