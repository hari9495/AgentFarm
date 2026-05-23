// ============================================================================
// TECHNICAL WRITER STANDUP BUILDER
// Sprint 16 — Technical Writer Role
//
// Converts episodic memory records into a structured standup summary.
//
// buildTechnicalWriterStandupSummary → yesterday / today / blockers / sprint context
// ============================================================================

// ---------------------------------------------------------------------------
// Types (same shape as corporate-assistant-standup-builder — structurally compatible)
// ---------------------------------------------------------------------------

export type SprintContext = {
    sprintNumber?: number;
    sprintGoal?: string;
    /** Calendar days remaining in the sprint. */
    daysRemaining?: number;
    /** Number of doc sections updated this sprint so far. */
    docsUpdatedThisSprint?: number;
    /** Stories completed this sprint that had documentation impact. */
    docImpactStories?: string[];
};

export type StandupSummary = {
    yesterday: string[];
    today: string[];
    blockers: string[];
    spokenText: string;
    /** Present when sprint context is supplied. */
    sprintContext?: SprintContext;
    /** Formatted Markdown block suitable for Slack or Confluence. */
    markdownSummary: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitiseMemoryLine(line: string): string {
    return line.replace(/\|+/g, ',').trim().slice(0, 150);
}

function buildMarkdownSummary(
    botName: string,
    teamName: string,
    yesterday: string[],
    today: string[],
    blockers: string[],
    sprint?: SprintContext,
): string {
    const lines: string[] = [];
    lines.push(`## 📝 ${botName} — Daily Standup`);
    lines.push(`_Team: ${teamName}_\n`);

    if (sprint?.sprintNumber !== undefined) {
        const goal = sprint.sprintGoal ? ` — _${sprint.sprintGoal}_` : '';
        const days = sprint.daysRemaining !== undefined ? ` · ${sprint.daysRemaining}d remaining` : '';
        lines.push(`**Sprint ${sprint.sprintNumber}**${goal}${days}\n`);
    }

    lines.push('### Yesterday');
    if (yesterday.length > 0) {
        yesterday.forEach((y) => lines.push(`- ${y}`));
    } else {
        lines.push('- No completed tasks recorded.');
    }
    lines.push('');

    lines.push('### Today');
    if (today.length > 0) {
        today.forEach((t) => lines.push(`- ${t}`));
    } else {
        lines.push('- Continuing with pending documentation tasks.');
    }
    lines.push('');

    lines.push('### Blockers');
    if (blockers.length > 0) {
        blockers.forEach((b) => lines.push(`- ⚠️ ${b}`));
    } else {
        lines.push('- None.');
    }
    lines.push('');

    if (sprint?.docsUpdatedThisSprint !== undefined || sprint?.docImpactStories?.length) {
        lines.push('### Sprint Doc Progress');
        if (sprint.docsUpdatedThisSprint !== undefined) {
            lines.push(`- Docs updated this sprint: **${sprint.docsUpdatedThisSprint}**`);
        }
        if (sprint.docImpactStories && sprint.docImpactStories.length > 0) {
            lines.push(`- Stories with doc impact: ${sprint.docImpactStories.map((s) => `\`${s}\``).join(', ')}`);
        }
        lines.push('');
    }

    return lines.join('\n');
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
 *
 * @param recentMemory  Episodic memory records from the agent runtime.
 * @param config        Bot and team display names, plus optional sprint context.
 */
export function buildTechnicalWriterStandupSummary(
    recentMemory: string[],
    config: {
        botName?: string;
        teamName?: string;
        sprintContext?: SprintContext;
    } = {},
): StandupSummary {
    const botName = config.botName ?? 'Technical Writer';
    const teamName = config.teamName ?? 'the team';
    const sprint = config.sprintContext;

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

    const spoken: string[] = [`Hi, I'm ${botName} working with ${teamName}.`];

    if (sprint?.sprintNumber !== undefined) {
        const sprintLine = sprint.sprintGoal
            ? `We are in Sprint ${sprint.sprintNumber}: "${sprint.sprintGoal}".`
            : `We are in Sprint ${sprint.sprintNumber}.`;
        const daysLine = sprint.daysRemaining !== undefined
            ? ` ${sprint.daysRemaining} day(s) remaining.`
            : '';
        spoken.push(sprintLine + daysLine);
    }

    if (yesterday.length > 0) {
        spoken.push(`Yesterday: ${yesterday.join('; ')}.`);
    } else {
        spoken.push('Yesterday: No completed tasks recorded.');
    }

    if (today.length > 0) {
        spoken.push(`Today: ${today.join('; ')}.`);
    } else {
        spoken.push('Today: Continuing with pending documentation tasks.');
    }

    if (blockers.length > 0) {
        spoken.push(`Blockers: ${blockers.join('; ')}.`);
    } else {
        spoken.push('No blockers.');
    }

    const markdownSummary = buildMarkdownSummary(botName, teamName, yesterday, today, blockers, sprint);

    return {
        yesterday,
        today,
        blockers,
        spokenText: spoken.join(' '),
        sprintContext: sprint,
        markdownSummary,
    };
}
