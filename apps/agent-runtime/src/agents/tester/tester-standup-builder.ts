// ============================================================================
// TESTER STANDUP BUILDER
// Sprint 19 — Meeting / Standup / Scrum Participation
//
// Converts episodic memory records into structured standup content and
// prepares the agent for meetings it needs to join (standup, sprint review,
// planning, retrospective, or job/tech interview).
//
// buildStandupSummary    → yesterday / today / blockers from episodic records
// buildMeetingContext    → meeting-type-specific briefing for the agent
// buildInterviewScript   → structured interview Q&A for tester-agent-as-interviewer
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

export type MeetingContext = {
    meetingType: MeetingType;
    openingStatement: string;
    agenda: string[];
    listeningFor: string[];
    closingStatement: string;
};

export type MeetingType = 'standup' | 'scrum_planning' | 'sprint_review' | 'retrospective' | 'interview';

export type InterviewQA = {
    question: string;
    followUp: string;
    hints: string;       // notes for the interviewer agent, not spoken aloud
};

// ---------------------------------------------------------------------------
// buildStandupSummary
// ---------------------------------------------------------------------------

export function buildStandupSummary(
    recentMemory: string[],
    config: { botName: string; teamName: string },
): StandupSummary {
    const yesterday: string[] = [];
    const today: string[] = [];
    const blockers: string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        if (
            lower.includes('pass') ||
            lower.includes('completed') ||
            lower.includes('fixed') ||
            lower.includes('merged')
        ) {
            yesterday.push(sanitiseMemoryLine(record));
        } else if (
            lower.includes('fail') ||
            lower.includes('block') ||
            lower.includes('error') ||
            lower.includes('could not') ||
            lower.includes('unable to')
        ) {
            blockers.push(sanitiseMemoryLine(record));
        } else {
            today.push(sanitiseMemoryLine(record));
        }
    }

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : 'Yesterday I continued ongoing testing tasks.',
        today.length > 0
            ? `Today I plan to ${today.slice(0, 2).join(' and ')}.`
            : 'Today I will continue the testing cycle.',
        blockers.length > 0
            ? `I have a blocker: ${blockers[0]}.`
            : 'No blockers.',
    ];

    return {
        yesterday: yesterday.slice(0, 5),
        today: today.slice(0, 5),
        blockers: blockers.slice(0, 3),
        spokenText: parts.join(' '),
    };
}

// ---------------------------------------------------------------------------
// buildMeetingContext
// ---------------------------------------------------------------------------

export function buildMeetingContext(
    meetingType: MeetingType,
    options: {
        botName?: string;
        teamName?: string;
        agenda?: string;
        standupSummary?: StandupSummary;
    } = {},
): MeetingContext {
    const botName = options.botName ?? 'AI Tester';
    const teamName = options.teamName ?? 'the team';

    switch (meetingType) {
        case 'standup': {
            const summary = options.standupSummary;
            const opening = `Good morning ${teamName}, this is ${botName}.`;
            const standupText = summary?.spokenText ?? 'I am ready to share my standup update.';
            return {
                meetingType,
                openingStatement: opening,
                agenda: [
                    `What I did yesterday: ${summary?.yesterday.join('; ') ?? 'see update'}`,
                    `What I plan today: ${summary?.today.join('; ') ?? 'see update'}`,
                    `Blockers: ${summary?.blockers.length ? summary.blockers.join('; ') : 'none'}`,
                ],
                listeningFor: [
                    'Any changes to sprint priorities that affect my test scope',
                    'New defects or regressions reported by other team members',
                    'Requests for additional test coverage or exploratory sessions',
                ],
                closingStatement: standupText,
            };
        }

        case 'scrum_planning': {
            return {
                meetingType,
                openingStatement: `Hello ${teamName}, ${botName} joining for sprint planning.`,
                agenda: [
                    'Review acceptance criteria on each story before committing',
                    'Identify which stories need automated tests vs exploratory sessions',
                    'Flag stories with no clear definition of done for quality',
                    'Agree test data requirements upfront',
                ],
                listeningFor: [
                    'Story acceptance criteria and edge cases',
                    'API contracts and schema changes',
                    'Integration dependencies that affect test setup',
                    'Performance or security requirements',
                ],
                closingStatement: `I will create test plans for committed stories and flag any missing acceptance criteria.`,
            };
        }

        case 'sprint_review': {
            return {
                meetingType,
                openingStatement: `Hi everyone, ${botName} here for the sprint review.`,
                agenda: [
                    'Report test coverage achieved this sprint',
                    'Demo automated test suite results',
                    'Summarise defects found and resolved',
                    'Highlight any open quality risks going to production',
                ],
                listeningFor: [
                    'Stakeholder questions about quality or reliability',
                    'Acceptance feedback on delivered stories',
                    'New quality requirements for next sprint',
                ],
                closingStatement: `Quality summary: I will provide full test metrics in the sprint report.`,
            };
        }

        case 'retrospective': {
            return {
                meetingType,
                openingStatement: `Hello ${teamName}, ${botName} here for retro.`,
                agenda: [
                    'What testing practices went well this sprint',
                    'What slowed down quality delivery',
                    'One testing improvement to commit to next sprint',
                ],
                listeningFor: [
                    'Team pain points related to testing or CI feedback loops',
                    'Suggestions for improving test coverage or speed',
                ],
                closingStatement: `I will implement the agreed testing improvement in the next sprint.`,
            };
        }

        case 'interview': {
            return {
                meetingType,
                openingStatement: `Hello, I am ${botName} conducting your technical interview today. This will be approximately 45 minutes. Please let me know if you need anything repeated or clarified.`,
                agenda: [
                    'Introduction and background (5 min)',
                    'Core testing concepts (15 min)',
                    'Technical scenario questions (15 min)',
                    'Candidate questions (10 min)',
                ],
                listeningFor: [
                    'Evidence of systematic testing approach',
                    'Understanding of the testing pyramid',
                    'Experience with automation frameworks',
                    'Quality mindset and defect prevention instincts',
                ],
                closingStatement: `Thank you for your time. We will review your responses and contact you within 3–5 business days.`,
            };
        }
    }
}

// ---------------------------------------------------------------------------
// buildInterviewScript — structured QA interview script
// ---------------------------------------------------------------------------

export function buildInterviewScript(
    level: 'junior' | 'mid' | 'senior',
    focusAreas: Array<'automation' | 'manual' | 'performance' | 'security' | 'mobile' | 'api'> = ['automation', 'manual'],
): InterviewQA[] {
    const coreQA: InterviewQA[] = [
        {
            question: 'Can you describe the difference between verification and validation in software testing?',
            followUp: 'Can you give a real example of each from your experience?',
            hints: 'Listen for: verification = building the thing right, validation = building the right thing.',
        },
        {
            question: 'What is the testing pyramid and how does it influence where you invest test automation effort?',
            followUp: 'Where do you draw the line between unit, integration, and end-to-end tests?',
            hints: 'Listen for: large base of unit tests, smaller integration, minimal E2E. Avoid inverted pyramid.',
        },
        {
            question: 'How do you decide what NOT to automate?',
            followUp: 'Give an example of a test case that is deliberately kept manual.',
            hints: 'Listen for: exploratory testing, one-off scenarios, visually subjective checks, rarely-run paths.',
        },
        {
            question: 'Walk me through how you would test a login page thoroughly.',
            followUp: 'What security-focused tests would you add?',
            hints: 'Listen for: happy path, invalid creds, locked account, SQL injection, CSRF, rate limiting.',
        },
    ];

    const automationQA: InterviewQA[] = [
        {
            question: 'What is the Page Object Model pattern and what problem does it solve?',
            followUp: 'How do you handle dynamic locators in your Page Objects?',
            hints: 'Listen for: separation of test logic from page structure, maintainability.',
        },
        {
            question: 'Describe how you would set up CI integration for your automated test suite.',
            followUp: 'How do you handle test flakiness in CI?',
            hints: 'Listen for: pipeline triggers, parallel execution, retry policies, quarantine flags.',
        },
    ];

    const performanceQA: InterviewQA[] = [
        {
            question: 'What is the difference between load testing, stress testing, and soak testing?',
            followUp: 'Which tool would you choose for each and why?',
            hints: 'Load = normal load, Stress = beyond normal, Soak = sustained duration. k6, JMeter, Gatling.',
        },
    ];

    const securityQA: InterviewQA[] = [
        {
            question: 'What is DAST and how does it complement SAST in a CI pipeline?',
            followUp: 'Have you used OWASP ZAP or Burp Suite? What did you test for?',
            hints: 'DAST = runtime analysis, SAST = static source analysis. Both needed for comprehensive security testing.',
        },
    ];

    const apiQA: InterviewQA[] = [
        {
            question: 'What would you check when testing a REST API beyond the happy path?',
            followUp: 'How do you test API versioning and backward compatibility?',
            hints: 'Listen for: error codes, edge payloads, auth, rate limits, schema validation, contract tests.',
        },
    ];

    const seniorQA: InterviewQA[] = level === 'senior' ? [
        {
            question: 'How have you influenced quality culture at the team or organisation level?',
            followUp: 'What metrics do you use to demonstrate quality improvement over time?',
            hints: 'Listen for: shift-left, test-driven culture, quality dashboards, defect escape rates.',
        },
    ] : [];

    const script = [...coreQA];
    if (focusAreas.includes('automation')) script.push(...automationQA);
    if (focusAreas.includes('performance')) script.push(...performanceQA);
    if (focusAreas.includes('security')) script.push(...securityQA);
    if (focusAreas.includes('api')) script.push(...apiQA);
    script.push(...seniorQA);

    return script;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitiseMemoryLine(line: string): string {
    // Strip any leading timestamps or IDs, keep the first 160 chars
    return line.replace(/^\[.*?\]\s*/, '').slice(0, 160).trim();
}
