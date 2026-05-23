// ============================================================================
// DEVELOPER STANDUP BUILDER
// Sprint 16 — Developer Role
//
// Converts episodic memory records into a structured developer standup and
// prepares sprint-ceremony context (planning, review, retrospective).
//
// buildDeveloperStandupSummary  → yesterday / today / blockers from memory
// buildSprintCeremonyContext    → agenda + talking points for planning/review/retro
// buildTechSpecOutline          → skeleton tech spec from feature description
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevStandupSummary = {
    yesterday: string[];
    today:     string[];
    blockers:  string[];
    spokenText: string;
};

export type SprintCeremonyType =
    | 'planning'
    | 'review'
    | 'retrospective'
    | 'grooming';

export type SprintCeremonyContext = {
    ceremonyType:      SprintCeremonyType;
    openingStatement:  string;
    agenda:            string[];
    listeningFor:      string[];
    closingStatement:  string;
};

export type TechSpecOutline = {
    title:        string;
    problem:      string;
    proposedSolution: string;
    sections:     string[];
};

// ---------------------------------------------------------------------------
// buildDeveloperStandupSummary
// ---------------------------------------------------------------------------

export function buildDeveloperStandupSummary(
    recentMemory: string[],
    config: {
        botName:  string;
        teamName: string;
        sprintContext?: {
            sprintNumber?:      number;
            sprintGoal?:        string;
            daysRemaining?:     number;
            ticketsCompleted?:  number;
        };
    },
): DevStandupSummary {
    const yesterday: string[] = [];
    const today:     string[] = [];
    const blockers:  string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('merged') ||
            lower.includes('shipped') ||
            lower.includes('fixed') ||
            lower.includes('closed') ||
            lower.includes('completed') ||
            lower.includes('success')
        ) {
            yesterday.push(sanitise(record));
        } else if (
            lower.includes('fail') ||
            lower.includes('block') ||
            lower.includes('error') ||
            lower.includes('could not') ||
            lower.includes('unable to') ||
            lower.includes('conflict')
        ) {
            blockers.push(sanitise(record));
        } else {
            today.push(sanitise(record));
        }
    }

    const sc = config.sprintContext;
    const sprintLine = sc?.sprintNumber
        ? ` (Sprint ${sc.sprintNumber}${sc.daysRemaining != null ? `, ${sc.daysRemaining}d left` : ''})`
        : '';

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : 'Yesterday I worked on ongoing development tasks.',
        today.length > 0
            ? `Today I plan to ${today.slice(0, 2).join(' and ')}.`
            : `Today I will continue the current sprint work${sprintLine}.`,
        blockers.length > 0
            ? `I have a blocker: ${blockers[0]}.`
            : 'No blockers.',
    ];

    return {
        yesterday: yesterday.slice(0, 5),
        today:     today.slice(0, 5),
        blockers:  blockers.slice(0, 3),
        spokenText: parts.join(' '),
    };
}

// ---------------------------------------------------------------------------
// buildSprintCeremonyContext
// ---------------------------------------------------------------------------

export function buildSprintCeremonyContext(
    ceremonyType: SprintCeremonyType,
    options: {
        botName?:  string;
        teamName?: string;
        summary?:  DevStandupSummary;
    } = {},
): SprintCeremonyContext {
    const botName  = options.botName  ?? 'AI Developer';
    const teamName = options.teamName ?? 'the team';

    switch (ceremonyType) {
        case 'planning': {
            return {
                ceremonyType,
                openingStatement: `Hello ${teamName}, ${botName} joining for sprint planning.`,
                agenda: [
                    'Review backlog items and acceptance criteria',
                    'Flag missing technical details or unclear requirements',
                    'Identify dependencies and external blockers upfront',
                    'Estimate complexity and agree on sprint scope',
                    'Assign items and confirm Definition of Done',
                ],
                listeningFor: [
                    'Acceptance criteria gaps I can help clarify',
                    'Technical dependencies between stories',
                    'Architecture decisions that affect implementation',
                    'Performance or security requirements',
                ],
                closingStatement: `I will break down assigned stories into tasks and create branch/PR stubs.`,
            };
        }

        case 'review': {
            return {
                ceremonyType,
                openingStatement: `Hi everyone, ${botName} here for the sprint review.`,
                agenda: [
                    'Demo completed features and merged PRs',
                    'Walk through test coverage and CI status',
                    'Highlight technical debt introduced this sprint',
                    'Flag any items that rolled over and why',
                ],
                listeningFor: [
                    'Stakeholder feedback on delivered functionality',
                    'New requirements emerging from the demo',
                    'Acceptance or rejection of delivered work',
                ],
                closingStatement: `I will action any feedback items and update the backlog accordingly.`,
            };
        }

        case 'retrospective': {
            return {
                ceremonyType,
                openingStatement: `Hello ${teamName}, ${botName} here for retro.`,
                agenda: [
                    'What code or process improvements landed well',
                    'Where the development loop was slow or painful',
                    'One concrete engineering improvement to commit to',
                ],
                listeningFor: [
                    'Pain points in the PR review or CI pipeline',
                    'Repeated bugs that could be caught earlier',
                    'Suggestions to improve code quality tooling',
                ],
                closingStatement: `I will implement the agreed engineering improvement and track it as a tech-debt ticket.`,
            };
        }

        case 'grooming': {
            return {
                ceremonyType,
                openingStatement: `Hi ${teamName}, ${botName} joining for backlog grooming.`,
                agenda: [
                    'Triage newly filed issues by severity and complexity',
                    'Break down large stories into implementable sub-tasks',
                    'Identify stories ready for sprint vs. needs more detail',
                    'Flag architectural concerns early',
                ],
                listeningFor: [
                    'Stories that have hidden technical risk',
                    'Items that should be spiked before committing',
                    'Cross-team dependencies that could delay delivery',
                ],
                closingStatement: `I will add technical notes and sub-tasks to groomed stories.`,
            };
        }
    }
}

// ---------------------------------------------------------------------------
// buildTechSpecOutline
// ---------------------------------------------------------------------------

/**
 * Generates a skeleton tech spec from a natural-language feature description.
 * Intended as a starting point — the developer agent or a human fills in the blanks.
 */
export function buildTechSpecOutline(
    featureDescription: string,
    options: { authorName?: string } = {},
): TechSpecOutline {
    const title = featureDescription.split('\n')[0]?.slice(0, 80) ?? 'Feature';
    const author = options.authorName ?? 'AI Developer Agent';
    const today = new Date().toISOString().split('T')[0];

    return {
        title,
        problem: `_[To be filled: what problem does "${title}" solve?]_`,
        proposedSolution: `_[To be filled: high-level approach]_`,
        sections: [
            `# Tech Spec: ${title}`,
            `_Author: ${author} | Date: ${today}_`,
            '',
            '## Problem Statement',
            `_[Describe the problem or opportunity this feature addresses]_`,
            '',
            '## Proposed Solution',
            `_[High-level approach — one paragraph max]_`,
            '',
            '## Scope',
            '### In Scope',
            '- _[item 1]_',
            '',
            '### Out of Scope',
            '- _[item 1]_',
            '',
            '## Technical Design',
            '### Data Model Changes',
            '_[Schema changes, new tables/fields, migration plan]_',
            '',
            '### API Changes',
            '_[New endpoints, changed request/response shapes, versioning]_',
            '',
            '### Service Layer',
            '_[Business logic changes, new services, dependency updates]_',
            '',
            '### Frontend Changes',
            '_[UI components, state changes, routing]_',
            '',
            '## Testing Strategy',
            '- Unit tests: _[what to unit-test]_',
            '- Integration tests: _[what to integration-test]_',
            '- E2E: _[key user journeys]_',
            '',
            '## Security Considerations',
            '_[Auth, input validation, data exposure, rate limiting]_',
            '',
            '## Performance Considerations',
            '_[Expected load, caching strategy, DB query plan]_',
            '',
            '## Rollout Plan',
            '- Feature flag: _[yes / no]_',
            '- Migration steps: _[list in order]_',
            '- Rollback plan: _[how to revert]_',
            '',
            '## Open Questions',
            '- [ ] _[question 1]_',
        ],
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitise(line: string): string {
    return line.replace(/^\[.*?\]\s*/, '').slice(0, 160).trim();
}
