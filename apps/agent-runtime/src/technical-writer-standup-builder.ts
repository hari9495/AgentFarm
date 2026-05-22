// ============================================================================
// TECHNICAL WRITER STANDUP BUILDER
// Sprint 16 — Technical Writer Role
//
// Converts episodic memory records into a structured standup summary.
//
// buildTechnicalWriterStandupSummary → yesterday / today / blockers
// ============================================================================

// ---------------------------------------------------------------------------
// Types (same shape as corporate-assistant-standup-builder — structurally compatible)
// ---------------------------------------------------------------------------

export type StandupSummary = {
    yesterday: string[];
    today: string[];
    blockers: string[];
    spokenText: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitiseMemoryLine(line: string): string {
    return line.replace(/\|+/g, ',').trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// buildTechnicalWriterStandupSummary
// ---------------------------------------------------------------------------

/**
 * Converts raw episodic memory records into a structured standup summary.
 *
 * Classification rules (keyword-match):
 *   • updated | generated | built | opened | created | published  → yesterday
 *   • fail | error | blocked | unable | could not | violation     → blockers
 *   • everything else                                              → today
 */
export function buildTechnicalWriterStandupSummary(
    recentMemory: string[],
    config: { botName?: string; teamName?: string } = {},
): StandupSummary {
    const botName = config.botName ?? 'Technical Writer';
    const teamName = config.teamName ?? 'the team';

    const yesterday: string[] = [];
    const today: string[] = [];
    const blockers: string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('updated') ||
            lower.includes('generated') ||
            lower.includes('built') ||
            lower.includes('opened') ||
            lower.includes('created') ||
            lower.includes('published') ||
            lower.includes('completed') ||
            lower.includes('resolved')
        ) {
            yesterday.push(sanitiseMemoryLine(record));
        } else if (
            lower.includes('fail') ||
            lower.includes('error') ||
            lower.includes('blocked') ||
            lower.includes('unable') ||
            lower.includes('could not') ||
            lower.includes('violation')
        ) {
            blockers.push(sanitiseMemoryLine(record));
        } else {
            today.push(sanitiseMemoryLine(record));
        }
    }

    const lines: string[] = [
        `Hi, I'm ${botName} working with ${teamName}.`,
    ];

    if (yesterday.length > 0) {
        lines.push(`Yesterday: ${yesterday.join('; ')}.`);
    } else {
        lines.push('Yesterday: No completed tasks recorded.');
    }

    if (today.length > 0) {
        lines.push(`Today: ${today.join('; ')}.`);
    } else {
        lines.push('Today: Continuing with pending documentation tasks.');
    }

    if (blockers.length > 0) {
        lines.push(`Blockers: ${blockers.join('; ')}.`);
    } else {
        lines.push('No blockers.');
    }

    return {
        yesterday,
        today,
        blockers,
        spokenText: lines.join(' '),
    };
}
