// ============================================================================
// PROJECT MANAGER / SCRUM MASTER — STANDUP BUILDER
//
// Converts episodic memory records into a structured PM/SM standup summary
// and provides sprint ceremony context for facilitation.
//
// buildPmStandupSummary     → yesterday / today / blockers from memory
// buildPmSprintHealthSummary → health snapshot (velocity, risks, scope drift)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PmStandupSummary = {
    yesterday: string[];
    today: string[];
    blockers: string[];
    teamHighlights: string[];
    spokenText: string;
};

export type SprintHealthSummary = {
    sprintName?: string;
    sprintGoal?: string;
    ragStatus: 'green' | 'amber' | 'red';
    ragReason: string;
    velocity?: { current: number; target: number; trend: string };
    openBlockers: number;
    openRisks: number;
    daysRemaining?: number;
    completedPoints?: number;
    committedPoints?: number;
    spokenText: string;
};

// ---------------------------------------------------------------------------
// buildPmStandupSummary
// ---------------------------------------------------------------------------

/**
 * Convert recent episodic memory records into a PM/SM standup update.
 *
 * The PM standup focuses on:
 *   - What project/delivery actions were completed (yesterday)
 *   - What coordination work is planned (today)
 *   - What blockers or risks need escalation
 *   - Team highlights worth celebrating
 */
export function buildPmStandupSummary(
    recentMemory: string[],
    config: {
        botName: string;
        teamName: string;
        sprintContext?: {
            sprintNumber?: number;
            sprintGoal?: string;
            daysRemaining?: number;
            completedPoints?: number;
            committedPoints?: number;
        };
    },
): PmStandupSummary {
    const yesterday: string[] = [];
    const today: string[] = [];
    const blockers: string[] = [];
    const teamHighlights: string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('completed') ||
            lower.includes('approved') ||
            lower.includes('committed') ||
            lower.includes('generated') ||
            lower.includes('created') ||
            lower.includes('captured') ||
            lower.includes('aligned') ||
            lower.includes('resolved') ||
            lower.includes('sprint plan')
        ) {
            yesterday.push(sanitise(record));
        } else if (
            lower.includes('blocked') ||
            lower.includes('escalated') ||
            lower.includes('risk') ||
            lower.includes('declining') ||
            lower.includes('red') ||
            lower.includes('amber') ||
            lower.includes('drift') ||
            lower.includes('impediment')
        ) {
            blockers.push(sanitise(record));
        } else if (
            lower.includes('improving') ||
            lower.includes('velocity') ||
            lower.includes('clear') ||
            lower.includes('ahead')
        ) {
            teamHighlights.push(sanitise(record));
        } else {
            today.push(sanitise(record));
        }
    }

    const sc = config.sprintContext;
    const sprintLine = sc?.sprintNumber
        ? ` (Sprint ${sc.sprintNumber}${sc.daysRemaining != null ? `, ${sc.daysRemaining}d remaining` : ''})`
        : '';

    const velocityLine = sc?.completedPoints != null && sc?.committedPoints != null
        ? ` Team has completed ${sc.completedPoints}/${sc.committedPoints} points.`
        : '';

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : `Yesterday I managed project coordination tasks${sprintLine}.`,
        today.length > 0
            ? `Today I plan to ${today.slice(0, 2).join(' and ')}.`
            : `Today I will continue sprint coordination${sprintLine}.${velocityLine}`,
        blockers.length > 0
            ? `I have blockers requiring attention: ${blockers[0]}.`
            : 'No escalation-level blockers.',
    ];

    if (teamHighlights.length > 0) {
        parts.push(`Team highlight: ${teamHighlights[0]}`);
    }

    return {
        yesterday: yesterday.slice(0, 5),
        today: today.slice(0, 5),
        blockers: blockers.slice(0, 3),
        teamHighlights: teamHighlights.slice(0, 3),
        spokenText: parts.join(' '),
    };
}

// ---------------------------------------------------------------------------
// buildPmSprintHealthSummary
// ---------------------------------------------------------------------------

/**
 * Generate a RAG (Red/Amber/Green) sprint health summary.
 * Used for status reports, steering committee prep, and proactive monitoring.
 */
export function buildPmSprintHealthSummary(params: {
    sprintName?: string;
    sprintGoal?: string;
    daysRemaining?: number;
    completedPoints?: number;
    committedPoints?: number;
    openBlockers?: number;
    openRisks?: number;
    velocityTrend?: 'improving' | 'stable' | 'declining' | 'insufficient_data';
    currentVelocity?: number;
    targetVelocity?: number;
}): SprintHealthSummary {
    const {
        sprintName,
        sprintGoal,
        daysRemaining,
        completedPoints,
        committedPoints,
        openBlockers = 0,
        openRisks = 0,
        velocityTrend,
        currentVelocity,
        targetVelocity,
    } = params;

    let ragStatus: SprintHealthSummary['ragStatus'] = 'green';
    const ragReasons: string[] = [];

    // Velocity check
    if (velocityTrend === 'declining') {
        ragStatus = 'amber';
        ragReasons.push('Velocity trending downward');
    }

    // Completion rate
    if (completedPoints != null && committedPoints != null && committedPoints > 0) {
        const completionPct = (completedPoints / committedPoints) * 100;
        const expectedPct = daysRemaining != null && daysRemaining > 0
            ? 100 - (daysRemaining / (daysRemaining + 1)) * 100
            : 50;

        if (completionPct < expectedPct * 0.6) {
            ragStatus = 'red';
            ragReasons.push(`Only ${Math.round(completionPct)}% complete with limited time remaining`);
        } else if (completionPct < expectedPct * 0.8) {
            ragStatus = 'amber';
            ragReasons.push(`Completion at ${Math.round(completionPct)}% — slightly behind pace`);
        }
    }

    // Blockers
    if (openBlockers >= 3) {
        ragStatus = 'red';
        ragReasons.push(`${openBlockers} open blocker(s) — sprint at risk`);
    } else if (openBlockers >= 1) {
        if (ragStatus !== 'red') ragStatus = 'amber';
        ragReasons.push(`${openBlockers} open blocker(s) requiring resolution`);
    }

    // Risks
    if (openRisks >= 5) {
        if (ragStatus !== 'red') ragStatus = 'amber';
        ragReasons.push(`${openRisks} open risks on the register`);
    }

    const ragReason = ragReasons.length > 0
        ? ragReasons.join('; ')
        : 'No issues detected — sprint on track';

    const ragEmoji = { green: '🟢', amber: '🟡', red: '🔴' }[ragStatus];
    const sprint = sprintName ?? 'current sprint';
    const velocityStr = currentVelocity != null
        ? `Current velocity: ${currentVelocity}pts${targetVelocity != null ? ` (target: ${targetVelocity}pts)` : ''}.`
        : '';
    const completionStr = completedPoints != null && committedPoints != null
        ? `${completedPoints}/${committedPoints} points delivered.`
        : '';
    const blockerStr = openBlockers > 0 ? `${openBlockers} open blocker(s).` : '';
    const daysStr = daysRemaining != null ? `${daysRemaining} day(s) remaining.` : '';

    const spokenText = [
        `Sprint health status for ${sprint}: ${ragEmoji} ${ragStatus.toUpperCase()}.`,
        ragReason,
        [completionStr, velocityStr, blockerStr, daysStr].filter(Boolean).join(' '),
    ].filter(Boolean).join(' ');

    return {
        sprintName,
        sprintGoal,
        ragStatus,
        ragReason,
        velocity: currentVelocity != null
            ? {
                current: currentVelocity,
                target: targetVelocity ?? currentVelocity,
                trend: velocityTrend ?? 'stable',
            }
            : undefined,
        openBlockers,
        openRisks,
        daysRemaining,
        completedPoints,
        committedPoints,
        spokenText,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitise(line: string): string {
    return line.replace(/^\[.*?\]\s*/, '').slice(0, 160).trim();
}
