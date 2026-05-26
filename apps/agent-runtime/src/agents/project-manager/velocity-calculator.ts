/**
 * Velocity Calculator
 *
 * Pure functions for computing team velocity, forecasting future sprints,
 * and detecting velocity trends (improving / stable / declining).
 *
 * No I/O — all data passed in; output is a plain object.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SprintRecord {
    sprintName: string;
    committedPoints: number;
    completedPoints: number;
    /** ISO-8601 date string */
    endDate: string;
    /** Number of calendar days in the sprint. */
    durationDays: number;
    /** Team size for normalization. */
    teamSize?: number;
}

export interface VelocityReport {
    sprintCount: number;
    averageVelocity: number;
    rollingVelocity: number; // last 3 sprints
    trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
    /** Predicted velocity for next sprint (conservative estimate). */
    forecastVelocity: number;
    /** Predicted sprints to clear current backlog. */
    backlogForecastSprints?: number;
    completionRate: number; // average committed vs completed ratio
    sprintSummaries: Array<{
        name: string;
        committed: number;
        completed: number;
        completionRate: number;
        velocityPerDay: number;
    }>;
    warnings: string[];
    markdown: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function average(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function detectTrend(velocities: number[]): VelocityReport['trend'] {
    if (velocities.length < 3) return 'insufficient_data';
    const recent = velocities.slice(-3);
    const older = velocities.slice(0, -3);
    if (older.length === 0) {
        // Only 3 sprints: compare first vs last
        const first = recent[0] ?? 0;
        const last = recent[recent.length - 1] ?? 0;
        const delta = (last - first) / (first || 1);
        if (delta > 0.1)  return 'improving';
        if (delta < -0.1) return 'declining';
        return 'stable';
    }
    const recentAvg = average(recent);
    const olderAvg = average(older);
    const delta = (recentAvg - olderAvg) / (olderAvg || 1);
    if (delta > 0.1)  return 'improving';
    if (delta < -0.1) return 'declining';
    return 'stable';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute velocity metrics from a list of completed sprint records.
 *
 * @param sprints   Historical sprint data (oldest first)
 * @param remainingBacklogPoints  Total unplanned points in the backlog (for forecast)
 */
export function calculateVelocity(
    sprints: SprintRecord[],
    remainingBacklogPoints?: number,
): VelocityReport {
    const warnings: string[] = [];

    if (sprints.length === 0) {
        return {
            sprintCount: 0,
            averageVelocity: 0,
            rollingVelocity: 0,
            trend: 'insufficient_data',
            forecastVelocity: 0,
            backlogForecastSprints: undefined,
            completionRate: 0,
            sprintSummaries: [],
            warnings: ['No sprint history available — cannot compute velocity.'],
            markdown: '> No sprint history available.',
        };
    }

    if (sprints.length < 3) {
        warnings.push(`Only ${sprints.length} sprint(s) recorded — velocity data may not be representative. Aim for at least 3 sprints.`);
    }

    const summaries = sprints.map((s) => {
        const completionRate = s.committedPoints > 0
            ? Math.round((s.completedPoints / s.committedPoints) * 100)
            : 0;
        const velocityPerDay = s.durationDays > 0
            ? Math.round((s.completedPoints / s.durationDays) * 10) / 10
            : 0;
        return {
            name: s.sprintName,
            committed: s.committedPoints,
            completed: s.completedPoints,
            completionRate,
            velocityPerDay,
        };
    });

    const completedVelocities = sprints.map((s) => s.completedPoints);
    const averageVelocity = Math.round(average(completedVelocities));
    const rolling3 = completedVelocities.slice(-3);
    const rollingVelocity = Math.round(average(rolling3));
    const trend = detectTrend(completedVelocities);

    // Conservative forecast: use rolling average, but cap at average * 1.1
    const forecastVelocity = trend === 'declining'
        ? Math.round(rollingVelocity * 0.9)
        : Math.min(rollingVelocity, Math.round(averageVelocity * 1.1));

    const allCompletionRates = summaries.map((s) => s.completionRate);
    const completionRate = Math.round(average(allCompletionRates));

    if (completionRate < 70) {
        warnings.push(`Average sprint completion rate is ${completionRate}% — below the healthy threshold of 70%. Review estimation accuracy and scope management.`);
    }
    if (trend === 'declining') {
        warnings.push('Velocity is trending downward. Investigate team capacity, tech debt, and process inefficiencies.');
    }

    let backlogForecastSprints: number | undefined;
    if (remainingBacklogPoints != null && forecastVelocity > 0) {
        backlogForecastSprints = Math.ceil(remainingBacklogPoints / forecastVelocity);
    }

    const markdown = formatVelocityMarkdown({
        summaries,
        averageVelocity,
        rollingVelocity,
        forecastVelocity,
        trend,
        completionRate,
        backlogForecastSprints,
        warnings,
    });

    return {
        sprintCount: sprints.length,
        averageVelocity,
        rollingVelocity,
        trend,
        forecastVelocity,
        backlogForecastSprints,
        completionRate,
        sprintSummaries: summaries,
        warnings,
        markdown,
    };
}

function trendEmoji(trend: VelocityReport['trend']): string {
    return { improving: '📈', stable: '➡️', declining: '📉', insufficient_data: '❓' }[trend];
}

function formatVelocityMarkdown(params: {
    summaries: VelocityReport['sprintSummaries'];
    averageVelocity: number;
    rollingVelocity: number;
    forecastVelocity: number;
    trend: VelocityReport['trend'];
    completionRate: number;
    backlogForecastSprints?: number;
    warnings: string[];
}): string {
    const { summaries, averageVelocity, rollingVelocity, forecastVelocity, trend, completionRate, backlogForecastSprints, warnings } = params;
    const lines: string[] = [];

    lines.push('# 📊 Team Velocity Report');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Average Velocity | **${averageVelocity} pts/sprint** |`);
    lines.push(`| Rolling (last 3) | **${rollingVelocity} pts/sprint** |`);
    lines.push(`| Trend | ${trendEmoji(trend)} ${trend.replace('_', ' ')} |`);
    lines.push(`| Forecast (next sprint) | **${forecastVelocity} pts** |`);
    lines.push(`| Avg Completion Rate | **${completionRate}%** |`);
    if (backlogForecastSprints != null) {
        lines.push(`| Backlog Forecast | **~${backlogForecastSprints} sprint(s)** to complete |`);
    }
    lines.push('');

    lines.push('## Sprint History');
    lines.push('| Sprint | Committed | Completed | Completion | Pts/Day |');
    lines.push('|---|---|---|---|---|');
    for (const s of summaries) {
        lines.push(`| ${s.name} | ${s.committed} | ${s.completed} | ${s.completionRate}% | ${s.velocityPerDay} |`);
    }
    lines.push('');

    if (warnings.length > 0) {
        lines.push('## ⚠️ Warnings');
        for (const w of warnings) {
            lines.push(`- ${w}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`_Generated by AgentFarm PM Agent — ${new Date().toISOString().split('T')[0]}_`);

    return lines.join('\n');
}
