/**
 * CSE Standup Builder — generates the daily support-team standup summary.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CseStandupOptions {
    botName?: string;
    teamName?: string;
    shiftPeriod?: string;
}

export interface CseStandupSummary {
    summary: string;
    sections: {
        ticketsHandled: string;
        openIssues: string;
        escalations: string;
        kpiSnapshot: string;
        blockers: string;
    };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildCseStandupSummary(
    recentMemory: string[],
    options: CseStandupOptions = {},
): CseStandupSummary {
    const botName = options.botName ?? 'CSE Agent';
    const teamName = options.teamName ?? 'Customer Support';
    const period = options.shiftPeriod ?? 'last 24 hours';

    const memoryLines = recentMemory.length > 0
        ? recentMemory.map((m) => `  • ${m}`).join('\n')
        : '  • No recorded activity for this period.';

    const summary = [
        `📋 ${botName} — ${teamName} Standup (${period})`,
        '',
        memoryLines,
    ].join('\n');

    const sections = {
        ticketsHandled: extractSection(recentMemory, ['ticket', 'resolved', 'closed', 'handled']) ||
            'No ticket data recorded.',
        openIssues: extractSection(recentMemory, ['open', 'pending', 'waiting', 'unresolved']) ||
            'No open issues flagged.',
        escalations: extractSection(recentMemory, ['escalate', 'escalation', 'tier2', 'tier3', 'engineering']) ||
            'No escalations this period.',
        kpiSnapshot: extractSection(recentMemory, ['csat', 'fcr', 'aht', 'nps', 'satisfaction', 'score']) ||
            'No KPI data recorded for this period.',
        blockers: extractSection(recentMemory, ['blocker', 'blocked', 'unable', 'cannot', 'issue']) ||
            'No blockers reported.',
    };

    return { summary, sections };
}

function extractSection(memory: string[], keywords: string[]): string {
    const matches = memory.filter((m) =>
        keywords.some((k) => m.toLowerCase().includes(k)),
    );
    if (matches.length === 0) return '';
    return matches.map((m) => `  • ${m}`).join('\n');
}
