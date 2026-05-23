// ============================================================================
// CORPORATE ASSISTANT STANDUP BUILDER
// Sprint 15 — Corporate Assistant Role
//
// Converts episodic memory records into structured standup content and
// prepares the agent for meetings it needs to join.
//
// buildCorporateAssistantStandupSummary → yesterday / today / blockers
// buildCorporateAssistantMeetingContext → meeting-type-specific briefing
// ============================================================================

// ---------------------------------------------------------------------------
// Types (same shape as tester-standup-builder — compatible via structural typing)
// ---------------------------------------------------------------------------

export type StandupSummary = {
    yesterday: string[];
    today: string[];
    blockers: string[];
    spokenText: string;
};

export type MeetingContext = {
    meetingType: MeetingType;
    openingStatement: string;
    agenda: string[];
    listeningFor: string[];
    closingStatement: string;
};

export type MeetingType =
    | 'standup'
    | 'scrum_planning'
    | 'sprint_review'
    | 'retrospective'
    | 'all_hands'
    | 'one_on_one';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitiseMemoryLine(line: string): string {
    return line.replace(/\|+/g, ',').trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// buildCorporateAssistantStandupSummary
// ---------------------------------------------------------------------------

/**
 * Converts raw episodic memory records into a structured standup summary.
 *
 * Classification rules (keyword-match):
 *   • sent | scheduled | created | shared | resolved  → yesterday
 *   • fail | error | blocked | unable | could not    → blockers
 *   • everything else                                  → today
 */
export function buildCorporateAssistantStandupSummary(
    recentMemory: string[],
    config: { botName?: string; teamName?: string } = {},
): StandupSummary {
    const botName = config.botName ?? 'Corporate Assistant';
    const teamName = config.teamName ?? 'the team';

    const yesterday: string[] = [];
    const today: string[] = [];
    const blockers: string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('sent') ||
            lower.includes('scheduled') ||
            lower.includes('created') ||
            lower.includes('shared') ||
            lower.includes('resolved') ||
            lower.includes('completed') ||
            lower.includes('forwarded')
        ) {
            yesterday.push(sanitiseMemoryLine(record));
        } else if (
            lower.includes('fail') ||
            lower.includes('block') ||
            lower.includes('error') ||
            lower.includes('could not') ||
            lower.includes('unable to') ||
            lower.includes('escalated')
        ) {
            blockers.push(sanitiseMemoryLine(record));
        } else {
            today.push(sanitiseMemoryLine(record));
        }
    }

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : 'Yesterday I continued supporting ongoing operational tasks.',
        today.length > 0
            ? `Today I plan to ${today.slice(0, 2).join(' and ')}.`
            : 'Today I will continue processing incoming requests.',
        blockers.length > 0
            ? `I have a blocker: ${blockers[0]}.`
            : 'No blockers.',
    ];

    void botName; // used in greeting via buildCorporateAssistantMeetingContext
    void teamName;

    return {
        yesterday: yesterday.slice(0, 5),
        today: today.slice(0, 5),
        blockers: blockers.slice(0, 3),
        spokenText: parts.join(' '),
    };
}

// ---------------------------------------------------------------------------
// buildCorporateAssistantMeetingContext
// ---------------------------------------------------------------------------

/**
 * Returns a meeting-type-specific briefing for the corporate assistant agent.
 */
export function buildCorporateAssistantMeetingContext(
    meetingType: MeetingType,
    options: {
        botName?: string;
        teamName?: string;
        standupSummary?: StandupSummary;
    } = {},
): MeetingContext {
    const botName = options.botName ?? 'Corporate Assistant';
    const teamName = options.teamName ?? 'the team';

    switch (meetingType) {
        case 'standup': {
            const summary = options.standupSummary;
            const standupText = summary?.spokenText ?? 'I am ready to share my standup update.';
            return {
                meetingType,
                openingStatement: `Good morning ${teamName}, this is ${botName}.`,
                agenda: [standupText, 'Open for follow-up questions.'],
                listeningFor: ['blockers', 'reassignments', 'new priorities'],
                closingStatement: `Thank you. I will pick up my queue now.`,
            };
        }
        case 'all_hands': {
            return {
                meetingType,
                openingStatement: `Hello everyone, this is ${botName} joining the all-hands.`,
                agenda: ['Listen and capture action items.', 'Note any operational changes.'],
                listeningFor: ['policy changes', 'escalation contacts', 'priority shifts'],
                closingStatement: `Thank you. I will log action items and follow up.`,
            };
        }
        case 'one_on_one': {
            return {
                meetingType,
                openingStatement: `Hi, this is ${botName}. Thanks for making time.`,
                agenda: ['Review outstanding tasks.', 'Clarify priorities.'],
                listeningFor: ['feedback', 'redirects', 'new assignments'],
                closingStatement: `Understood. I will update my queue accordingly.`,
            };
        }
        default: {
            return {
                meetingType,
                openingStatement: `Hello, this is ${botName} joining on behalf of ${teamName}.`,
                agenda: ['Participate as needed.'],
                listeningFor: ['action items', 'decisions'],
                closingStatement: `Thank you for including me.`,
            };
        }
    }
}
