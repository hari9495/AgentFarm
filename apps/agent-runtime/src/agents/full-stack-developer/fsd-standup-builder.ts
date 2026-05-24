// ============================================================================
// FULL-STACK DEVELOPER STANDUP BUILDER
// Sprint 16 — Full-Stack Developer Role
//
// Converts episodic memory into a structured standup that includes both
// frontend and backend work items plus web-specific health metrics.
//
// buildFsdStandupSummary    → yesterday / today / blockers from memory
// buildFsdSprintContext     → sprint ceremony talking points
// buildFrontendHealthReport → Core Web Vitals + a11y + SEO snapshot
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FsdStandupSummary = {
    yesterday:      string[];
    today:          string[];
    blockers:       string[];
    frontendItems:  string[];
    backendItems:   string[];
    spokenText:     string;
};

export type FrontendHealthReport = {
    lcp:             string | null;   // Largest Contentful Paint
    cls:             string | null;   // Cumulative Layout Shift
    fid:             string | null;   // First Input Delay
    a11yScore:       number | null;   // 0–100
    seoScore:        number | null;   // 0–100
    bundleSizeKb:    number | null;
    openIssues:      string[];
    summary:         string;
};

export type FsdCeremonyType = 'standup' | 'planning' | 'review' | 'retrospective' | 'grooming';

export type FsdCeremonyContext = {
    ceremonyType:      FsdCeremonyType;
    openingStatement:  string;
    agenda:            string[];
    listeningFor:      string[];
    closingStatement:  string;
};

// ---------------------------------------------------------------------------
// buildFsdStandupSummary
// ---------------------------------------------------------------------------

export function buildFsdStandupSummary(
    recentMemory: string[],
    config: {
        botName:   string;
        teamName:  string;
        sprintContext?: {
            sprintNumber?:     number;
            sprintGoal?:       string;
            daysRemaining?:    number;
        };
        frontendHealth?: FrontendHealthReport;
    },
): FsdStandupSummary {
    const yesterday:     string[] = [];
    const today:         string[] = [];
    const blockers:      string[] = [];
    const frontendItems: string[] = [];
    const backendItems:  string[] = [];

    for (const record of recentMemory) {
        const lower = record.toLowerCase();

        // Classify as frontend or backend
        const isFrontend =
            lower.includes('component') || lower.includes('ui') ||
            lower.includes('css') || lower.includes('react') ||
            lower.includes('vue') || lower.includes('angular') ||
            lower.includes('figma') || lower.includes('design') ||
            lower.includes('accessibility') || lower.includes('responsive');

        const isBackend =
            lower.includes('api') || lower.includes('database') ||
            lower.includes('migration') || lower.includes('endpoint') ||
            lower.includes('service') || lower.includes('auth') ||
            lower.includes('server') || lower.includes('query');

        if (isFrontend) frontendItems.push(sanitise(record));
        if (isBackend)  backendItems.push(sanitise(record));

        // Classify as yesterday/today/blocker
        if (
            lower.includes('merged') || lower.includes('shipped') ||
            lower.includes('fixed')  || lower.includes('completed') ||
            lower.includes('deployed') || lower.includes('success')
        ) {
            yesterday.push(sanitise(record));
        } else if (
            lower.includes('fail')    || lower.includes('block') ||
            lower.includes('error')   || lower.includes('could not') ||
            lower.includes('conflict') || lower.includes('broken')
        ) {
            blockers.push(sanitise(record));
        } else {
            today.push(sanitise(record));
        }
    }

    const sc = config.sprintContext;
    const sprintTag = sc?.sprintNumber ? ` (Sprint ${sc.sprintNumber})` : '';
    const health    = config.frontendHealth;
    const healthTag = health ? ` | a11y: ${health.a11yScore ?? '?'}/100` : '';

    const parts: string[] = [
        yesterday.length > 0
            ? `Yesterday I ${yesterday.slice(0, 3).join('; ')}.`
            : 'Yesterday I continued full-stack development tasks.',
        today.length > 0
            ? `Today I plan to ${today.slice(0, 2).join(' and ')}.`
            : `Today I will continue the current sprint work${sprintTag}${healthTag}.`,
        blockers.length > 0
            ? `I have a blocker: ${blockers[0]}.`
            : 'No blockers.',
    ];

    return {
        yesterday:     yesterday.slice(0, 5),
        today:         today.slice(0, 5),
        blockers:      blockers.slice(0, 3),
        frontendItems: frontendItems.slice(0, 5),
        backendItems:  backendItems.slice(0, 5),
        spokenText:    parts.join(' '),
    };
}

// ---------------------------------------------------------------------------
// buildFsdSprintContext
// ---------------------------------------------------------------------------

export function buildFsdSprintContext(
    ceremonyType: FsdCeremonyType,
    options: { botName?: string; teamName?: string; summary?: FsdStandupSummary } = {},
): FsdCeremonyContext {
    const botName  = options.botName  ?? 'AI Full-Stack Developer';
    const teamName = options.teamName ?? 'the team';

    switch (ceremonyType) {
        case 'standup':
            return {
                ceremonyType,
                openingStatement: `Good morning ${teamName}, ${botName} here.`,
                agenda: [
                    `Frontend: ${options.summary?.frontendItems.slice(0, 2).join('; ') ?? 'ongoing UI work'}`,
                    `Backend: ${options.summary?.backendItems.slice(0, 2).join('; ')  ?? 'ongoing API work'}`,
                    `Blockers: ${options.summary?.blockers.length ? options.summary.blockers[0] : 'none'}`,
                ],
                listeningFor: [
                    'Design changes that affect components I am building',
                    'API contract changes from backend team',
                    'New acceptance criteria on in-progress tickets',
                ],
                closingStatement: options.summary?.spokenText ?? 'Ready to ship.',
            };

        case 'planning':
            return {
                ceremonyType,
                openingStatement: `Hello ${teamName}, ${botName} joining for sprint planning.`,
                agenda: [
                    'Review Figma designs for UI stories before committing',
                    'Confirm API contracts and DB schema for backend stories',
                    'Identify full-stack stories that span both layers',
                    'Flag missing acceptance criteria or design gaps',
                ],
                listeningFor: [
                    'Stories with Figma links I can handoff immediately',
                    'API changes that require frontend integration work',
                    'Auth or security requirements that affect both layers',
                ],
                closingStatement: `I will set up component stubs and API scaffolds for committed stories.`,
            };

        case 'review':
            return {
                ceremonyType,
                openingStatement: `Hi everyone, ${botName} here for the sprint review.`,
                agenda: [
                    'Demo delivered UI components and user flows',
                    'Show API endpoints and integration tests green',
                    'Report Core Web Vitals and a11y scores',
                    'Highlight open tech debt introduced this sprint',
                ],
                listeningFor: [
                    'Stakeholder feedback on UI/UX of delivered features',
                    'Acceptance or rejection of completed stories',
                    'Performance or accessibility concerns from QA',
                ],
                closingStatement: `I will capture action items and create follow-up tickets.`,
            };

        case 'retrospective':
            return {
                ceremonyType,
                openingStatement: `Hello ${teamName}, ${botName} here for retro.`,
                agenda: [
                    'What in the frontend-backend integration worked well',
                    'Where the design-to-code handoff caused slowdowns',
                    'One improvement to commit to for next sprint',
                ],
                listeningFor: [
                    'Pain points in the Figma-to-component workflow',
                    'API contract mismatches that caused rework',
                    'Suggestions for improving e2e test coverage',
                ],
                closingStatement: `I will implement the agreed improvement and track it as a tech-debt ticket.`,
            };

        case 'grooming':
            return {
                ceremonyType,
                openingStatement: `Hi ${teamName}, ${botName} joining for backlog grooming.`,
                agenda: [
                    'Check Figma completion status for UI-heavy stories',
                    'Identify stories that need API + UI work estimated together',
                    'Flag stories with unclear frontend-backend boundaries',
                ],
                listeningFor: [
                    'Stories that mix frontend and backend with hidden complexity',
                    'Design changes that would invalidate existing components',
                    'Cross-service dependencies that delay delivery',
                ],
                closingStatement: `I will add technical notes, sub-tasks, and Figma links to groomed stories.`,
            };
    }
}

// ---------------------------------------------------------------------------
// buildFrontendHealthReport
// ---------------------------------------------------------------------------

export function buildFrontendHealthReport(
    metrics: {
        lcp?:          number | null;   // ms
        cls?:          number | null;   // unitless score
        fid?:          number | null;   // ms
        a11yScore?:    number | null;
        seoScore?:     number | null;
        bundleSizeKb?: number | null;
    },
): FrontendHealthReport {
    const openIssues: string[] = [];

    const lcpMs = metrics.lcp ?? null;
    const clsVal = metrics.cls ?? null;
    const fidMs  = metrics.fid ?? null;

    if (lcpMs !== null && lcpMs > 2500)
        openIssues.push(`LCP ${lcpMs}ms exceeds 2500ms threshold`);
    if (clsVal !== null && clsVal > 0.1)
        openIssues.push(`CLS ${clsVal.toFixed(3)} exceeds 0.1 threshold`);
    if (fidMs !== null && fidMs > 100)
        openIssues.push(`FID ${fidMs}ms exceeds 100ms threshold`);
    if ((metrics.a11yScore ?? 100) < 90)
        openIssues.push(`A11y score ${metrics.a11yScore}/100 below 90 target`);
    if ((metrics.seoScore ?? 100) < 80)
        openIssues.push(`SEO score ${metrics.seoScore}/100 below 80 target`);
    if ((metrics.bundleSizeKb ?? 0) > 500)
        openIssues.push(`Bundle ${metrics.bundleSizeKb}KB exceeds 500KB budget`);

    const summary = openIssues.length > 0
        ? `Frontend health: ${openIssues.length} issue(s) — ${openIssues[0]}`
        : 'Frontend health: all metrics within target thresholds.';

    return {
        lcp:          lcpMs !== null ? `${lcpMs}ms` : null,
        cls:          clsVal !== null ? clsVal.toFixed(3) : null,
        fid:          fidMs !== null ? `${fidMs}ms` : null,
        a11yScore:    metrics.a11yScore ?? null,
        seoScore:     metrics.seoScore  ?? null,
        bundleSizeKb: metrics.bundleSizeKb ?? null,
        openIssues,
        summary,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitise(line: string): string {
    return line.replace(/^\[.*?\]\s*/, '').slice(0, 160).trim();
}
