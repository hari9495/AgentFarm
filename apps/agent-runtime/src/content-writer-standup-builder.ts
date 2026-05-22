// ============================================================================
// CONTENT WRITER STANDUP BUILDER
// Sprint 17 — Content Writer Role
//
// Converts episodic memory records into a structured standup summary for
// a content writer agent. Mirrors the tester-standup-builder.ts pattern.
//
// buildContentWriterStandupSummary → yesterday / today / blockers from memory
// ============================================================================

// ---------------------------------------------------------------------------
// Types
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
    // Remove any surrounding quotes and trim whitespace
    return line.replace(/^["']|["']$/g, '').trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a standup summary for a content writer bot from recent episodic
 * memory records.
 *
 * Memory lines are classified as:
 *   - yesterday: lines that mention completed or successful output
 *   - blockers: lines that mention failure, blockage, or missing info
 *   - today: everything else (in-progress or planned)
 *
 * @param recentMemory  Array of episodic memory summary strings (most recent first).
 * @param config        Bot name and team name for the spoken text.
 */
export function buildContentWriterStandupSummary(
    recentMemory: string[],
    config: { botName: string; teamName: string },
): StandupSummary {
    const yesterday: string[] = [];
    const today: string[] = [];
    const blockers: string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('success') ||
            lower.includes('generated') ||
            lower.includes('drafted') ||
            lower.includes('completed') ||
            lower.includes('routed') ||
            lower.includes('passed')
        ) {
            yesterday.push(sanitiseMemoryLine(record));
        } else if (
            lower.includes('fail') ||
            lower.includes('block') ||
            lower.includes('flagged') ||
            lower.includes('error') ||
            lower.includes('could not') ||
            lower.includes('unable to') ||
            lower.includes('missing')
        ) {
            blockers.push(sanitiseMemoryLine(record));
        } else {
            today.push(sanitiseMemoryLine(record));
        }
    }

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : 'Yesterday I continued ongoing content tasks.',
        today.length > 0
            ? `Today I plan to ${today.slice(0, 3).join('; ')}.`
            : 'Today I will continue drafting and reviewing content.',
        blockers.length > 0
            ? `Blockers: ${blockers.slice(0, 2).join('; ')}.`
            : 'No blockers.',
    ];

    const spokenText = `Good morning. This is ${config.botName} from ${config.teamName}. ` +
        parts.join(' ');

    return { yesterday, today, blockers, spokenText };
}
