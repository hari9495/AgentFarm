// ============================================================================
// ONBOARDING BUILDER
// Technical Writer Role
//
// Generates role-specific onboarding flows with progressive disclosure:
// Day 1 → Week 1 → Month 1 structure, checklist output, and role forks.
//
// buildOnboardingFlowMarkdown — full narrative onboarding doc
// buildOnboardingChecklist    — compact checkbox format for copy-paste into Notion/Confluence
// buildOnboardingTemplate     — pre-filled skeleton for a given role
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingRole = 'developer' | 'admin' | 'end-user';

export interface OnboardingTask {
    /** Unique short ID, e.g. "dev-001". */
    id: string;
    title: string;
    /** 1-3 sentence explanation of what to do and why it matters. */
    description: string;
    /** Human-readable estimate, e.g. "5 minutes". */
    estimatedTime?: string;
    /** Link to the relevant documentation section. */
    docLink?: string;
    required: boolean;
    /** "You'll know this is done when..." */
    completionCriteria?: string;
    /** Sub-tasks or optional follow-up actions. */
    subtasks?: string[];
}

export interface OnboardingPhase {
    /** Phase label, e.g. "Day 1", "Week 1", "Month 1". */
    phase: string;
    /** What the user should be able to do by the end of this phase. */
    goals: string[];
    tasks: OnboardingTask[];
}

export interface OnboardingFlow {
    title: string;
    role: OnboardingRole;
    product: string;
    /** Optional welcome message at the top of the doc. */
    welcome?: string;
    phases: OnboardingPhase[];
}

// ---------------------------------------------------------------------------
// Role labels and context
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<OnboardingRole, string> = {
    developer: 'Developer',
    admin: 'Administrator',
    'end-user': 'End User',
};

const ROLE_WELCOME: Record<OnboardingRole, string> = {
    developer: `Welcome to the developer onboarding guide. This guide takes you from zero to a working development setup, introduces the core APIs, and points you to deeper resources for each area.`,
    admin: `Welcome to the administrator onboarding guide. This guide covers account provisioning, security configuration, user management, and monitoring essentials.`,
    'end-user': `Welcome! This guide walks you through everything you need to get up and running quickly — from your first login to your first successful workflow.`,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function taskStatusBadge(required: boolean): string {
    return required ? '🔴 Required' : '🟡 Recommended';
}

function renderTaskDetail(task: OnboardingTask, headingLevel: number): string {
    const h = '#'.repeat(headingLevel);
    const lines: string[] = [];
    const badge = taskStatusBadge(task.required);

    lines.push(`${h} ${task.title} — ${badge}`);
    lines.push('');
    lines.push(task.description.trim());
    lines.push('');

    const meta: string[] = [];
    if (task.estimatedTime) meta.push(`**Time:** ${task.estimatedTime}`);
    if (task.docLink) meta.push(`**Docs:** [View →](${task.docLink})`);
    if (meta.length > 0) {
        lines.push(meta.join('  |  '));
        lines.push('');
    }

    if (task.subtasks && task.subtasks.length > 0) {
        lines.push('**Steps:**');
        lines.push('');
        task.subtasks.forEach((st, i) => lines.push(`${i + 1}. ${st}`));
        lines.push('');
    }

    if (task.completionCriteria) {
        lines.push(`> ✅ **Done when:** ${task.completionCriteria}`);
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildOnboardingFlowMarkdown
// ---------------------------------------------------------------------------

/**
 * Render a full onboarding guide with phase sections, task details,
 * completion criteria, and cross-links.
 */
export function buildOnboardingFlowMarkdown(flow: OnboardingFlow): string {
    const date = new Date().toISOString().split('T')[0];
    const roleLabel = ROLE_LABELS[flow.role];
    const lines: string[] = [];

    lines.push(`# ${flow.title}`);
    lines.push('');
    lines.push(`**Product:** ${flow.product}  `);
    lines.push(`**Role:** ${roleLabel}  `);
    lines.push(`**Updated:** ${date}`);
    lines.push('');
    lines.push(flow.welcome ?? ROLE_WELCOME[flow.role]);
    lines.push('');

    // Phase summary table
    lines.push('## Overview\n');
    lines.push('| Phase | Goals | Required Tasks |');
    lines.push('|-------|-------|----------------|');
    for (const phase of flow.phases) {
        const reqCount = phase.tasks.filter((t) => t.required).length;
        const goalSummary = phase.goals[0] ?? '';
        lines.push(`| ${phase.phase} | ${goalSummary}${phase.goals.length > 1 ? ` +${phase.goals.length - 1} more` : ''} | ${reqCount} |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Phase sections
    for (const phase of flow.phases) {
        lines.push(`## ${phase.phase}\n`);

        if (phase.goals.length > 0) {
            lines.push('**Goals for this phase:**\n');
            phase.goals.forEach((g) => lines.push(`- ${g}`));
            lines.push('');
        }

        for (const task of phase.tasks) {
            lines.push(renderTaskDetail(task, 3));
        }

        lines.push('');
    }

    // Quick-reference progress checklist at the end
    lines.push('---');
    lines.push('');
    lines.push('## Progress Checklist\n');
    lines.push(`_Copy this into your notes to track completion._\n`);
    for (const phase of flow.phases) {
        lines.push(`### ${phase.phase}\n`);
        for (const task of phase.tasks) {
            const badge = task.required ? '🔴' : '🟡';
            lines.push(`- [ ] ${badge} **${task.title}**${task.estimatedTime ? ` _(${task.estimatedTime})_` : ''}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildOnboardingChecklist
// ---------------------------------------------------------------------------

/**
 * Compact checklist format — one line per task, grouped by phase.
 * Designed for Notion, Confluence, or Slack copy-paste.
 */
export function buildOnboardingChecklist(flow: OnboardingFlow): string {
    const lines: string[] = [];
    lines.push(`## ${flow.title} — Onboarding Checklist (${ROLE_LABELS[flow.role]})\n`);

    for (const phase of flow.phases) {
        lines.push(`**${phase.phase}**`);
        for (const task of flow.phases.flatMap((p) => p === phase ? p.tasks : [])) {
            const badge = task.required ? '[🔴 Required]' : '[🟡 Recommended]';
            const timeHint = task.estimatedTime ? ` — ${task.estimatedTime}` : '';
            const link = task.docLink ? ` → ${task.docLink}` : '';
            lines.push(`☐ ${task.title} ${badge}${timeHint}${link}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildOnboardingTemplate
// ---------------------------------------------------------------------------

/**
 * Generate a pre-filled onboarding skeleton for a given role.
 * Contains realistic placeholder tasks for Day 1 / Week 1 / Month 1.
 */
export function buildOnboardingTemplate(
    product: string,
    role: OnboardingRole,
): OnboardingFlow {
    const roleLabel = ROLE_LABELS[role];
    const prefix = role.slice(0, 3).toUpperCase();

    const TEMPLATES: Record<OnboardingRole, OnboardingPhase[]> = {
        developer: [
            {
                phase: 'Day 1 — Environment Setup',
                goals: [
                    'Get a working local development environment',
                    'Run the application locally and see the welcome screen',
                ],
                tasks: [
                    {
                        id: `${prefix}-001`,
                        title: 'Clone the repository',
                        description: `Clone the ${product} repository and verify you can access the default branch.`,
                        estimatedTime: '5 minutes',
                        docLink: '_[link to repository setup docs]_',
                        required: true,
                        completionCriteria: `\`git status\` returns clean output in the project directory.`,
                        subtasks: ['Fork or clone the repo', 'Verify branch access'],
                    },
                    {
                        id: `${prefix}-002`,
                        title: 'Install dependencies',
                        description: 'Install all required dependencies using the package manager.',
                        estimatedTime: '10 minutes',
                        docLink: '_[link to local setup docs]_',
                        required: true,
                        completionCriteria: 'No errors during install; `node_modules` or equivalent directory is present.',
                    },
                    {
                        id: `${prefix}-003`,
                        title: 'Configure local environment variables',
                        description: 'Copy `.env.example` to `.env` and fill in the required values.',
                        estimatedTime: '10 minutes',
                        docLink: '_[link to env var reference]_',
                        required: true,
                        completionCriteria: '`.env` file is present with all required keys set.',
                    },
                    {
                        id: `${prefix}-004`,
                        title: 'Run the application locally',
                        description: `Start the ${product} development server and verify the home page loads.`,
                        estimatedTime: '5 minutes',
                        required: true,
                        completionCriteria: 'Application is reachable at `http://localhost:3000` (or configured port).',
                    },
                ],
            },
            {
                phase: 'Week 1 — Core Concepts',
                goals: [
                    'Understand the codebase structure and key modules',
                    'Make and test a small change end to end',
                    'Complete your first PR',
                ],
                tasks: [
                    {
                        id: `${prefix}-005`,
                        title: 'Read the architecture overview',
                        description: 'Understand the high-level architecture and the responsibilities of each major module.',
                        estimatedTime: '30 minutes',
                        docLink: '_[link to architecture docs]_',
                        required: true,
                        completionCriteria: 'You can describe the data flow through the system in one paragraph.',
                    },
                    {
                        id: `${prefix}-006`,
                        title: 'Complete the quickstart tutorial',
                        description: 'Follow the quickstart tutorial to build a minimal working feature end to end.',
                        estimatedTime: '1 hour',
                        docLink: '_[link to quickstart tutorial]_',
                        required: true,
                        completionCriteria: 'The tutorial\'s expected output matches your output.',
                    },
                    {
                        id: `${prefix}-007`,
                        title: 'Submit your first pull request',
                        description: 'Make a small change (docs fix, minor improvement) and take it through the full PR process.',
                        estimatedTime: '2 hours',
                        docLink: '_[link to contribution guide]_',
                        required: true,
                        completionCriteria: 'PR is merged or approved with at least one review.',
                    },
                    {
                        id: `${prefix}-008`,
                        title: 'Set up your IDE with recommended extensions',
                        description: 'Install the recommended IDE extensions for linting, formatting, and debugging.',
                        estimatedTime: '15 minutes',
                        docLink: '_[link to IDE setup guide]_',
                        required: false,
                    },
                ],
            },
            {
                phase: 'Month 1 — Independence',
                goals: [
                    'Work independently on assigned issues',
                    'Understand testing, CI, and release processes',
                ],
                tasks: [
                    {
                        id: `${prefix}-009`,
                        title: 'Own an issue from triage to merge',
                        description: 'Pick up an open issue, implement the fix, write tests, and see it through to merge.',
                        estimatedTime: '_[varies]_',
                        required: true,
                        completionCriteria: 'Issue is closed; code is in the main branch.',
                    },
                    {
                        id: `${prefix}-010`,
                        title: 'Understand the CI/CD pipeline',
                        description: 'Read the CI configuration and understand what checks must pass before a merge.',
                        estimatedTime: '20 minutes',
                        docLink: '_[link to CI/CD docs]_',
                        required: true,
                    },
                    {
                        id: `${prefix}-011`,
                        title: 'Review two pull requests from teammates',
                        description: 'Actively participate in code review to build familiarity with team standards.',
                        estimatedTime: '_[varies]_',
                        required: false,
                    },
                ],
            },
        ],

        admin: [
            {
                phase: 'Day 1 — Access & Orientation',
                goals: [
                    'Log in and access the admin console',
                    'Understand the tenant and user model',
                ],
                tasks: [
                    {
                        id: `${prefix}-001`,
                        title: 'Log in to the admin console',
                        description: `Sign in to ${product} with your admin credentials and verify you see the admin dashboard.`,
                        estimatedTime: '5 minutes',
                        required: true,
                        completionCriteria: 'Admin dashboard is visible with your organisation name.',
                    },
                    {
                        id: `${prefix}-002`,
                        title: 'Review the tenant settings',
                        description: 'Navigate to Settings → Tenant and understand the organisation-wide defaults.',
                        estimatedTime: '15 minutes',
                        docLink: '_[link to tenant settings docs]_',
                        required: true,
                    },
                    {
                        id: `${prefix}-003`,
                        title: 'Audit existing user roles',
                        description: 'Review who has admin, editor, and viewer access. Remove stale accounts.',
                        estimatedTime: '20 minutes',
                        docLink: '_[link to user management docs]_',
                        required: true,
                        completionCriteria: 'User list is accurate; no unknown admin accounts remain.',
                    },
                ],
            },
            {
                phase: 'Week 1 — Security Baseline',
                goals: [
                    'Complete the security baseline configuration',
                    'Set up SSO and MFA if applicable',
                ],
                tasks: [
                    {
                        id: `${prefix}-004`,
                        title: 'Enable multi-factor authentication',
                        description: 'Enforce MFA for all admin accounts and optionally for all users.',
                        estimatedTime: '15 minutes',
                        docLink: '_[link to MFA configuration docs]_',
                        required: true,
                        completionCriteria: 'MFA is enforced in Settings → Security → Authentication.',
                    },
                    {
                        id: `${prefix}-005`,
                        title: 'Configure SSO (if applicable)',
                        description: 'Connect your identity provider (Okta, Azure AD, Google Workspace) via SAML or OIDC.',
                        estimatedTime: '1 hour',
                        docLink: '_[link to SSO setup docs]_',
                        required: false,
                        completionCriteria: 'At least one test user can log in via SSO.',
                    },
                    {
                        id: `${prefix}-006`,
                        title: 'Set up audit log retention',
                        description: 'Configure the audit log export destination and retention period to meet compliance requirements.',
                        estimatedTime: '20 minutes',
                        docLink: '_[link to audit log docs]_',
                        required: true,
                    },
                ],
            },
            {
                phase: 'Month 1 — Operational Readiness',
                goals: [
                    'Set up monitoring and alerting',
                    'Document your configuration for the team',
                ],
                tasks: [
                    {
                        id: `${prefix}-007`,
                        title: 'Configure email notifications and alerts',
                        description: 'Set up alerts for failed logins, quota thresholds, and system health events.',
                        estimatedTime: '30 minutes',
                        docLink: '_[link to alerting docs]_',
                        required: true,
                    },
                    {
                        id: `${prefix}-008`,
                        title: 'Document your environment configuration',
                        description: `Create an internal runbook for ${product} that captures your SSO settings, user roles, and backup procedure.`,
                        estimatedTime: '1 hour',
                        required: true,
                        completionCriteria: 'Runbook is accessible to at least one backup admin.',
                    },
                ],
            },
        ],

        'end-user': [
            {
                phase: 'Day 1 — First Login',
                goals: [
                    'Complete your profile setup',
                    'Complete your first task successfully',
                ],
                tasks: [
                    {
                        id: `${prefix}-001`,
                        title: 'Create your account',
                        description: `Sign up for ${product} using your work email and verify your address.`,
                        estimatedTime: '3 minutes',
                        docLink: '_[link to sign-up guide]_',
                        required: true,
                        completionCriteria: 'You can log in and see the dashboard.',
                    },
                    {
                        id: `${prefix}-002`,
                        title: 'Complete your profile',
                        description: 'Add your name, avatar, and notification preferences.',
                        estimatedTime: '5 minutes',
                        required: true,
                    },
                    {
                        id: `${prefix}-003`,
                        title: 'Complete the interactive welcome tour',
                        description: 'Follow the in-app guided tour to learn the main features.',
                        estimatedTime: '10 minutes',
                        docLink: '_[link to welcome tour docs]_',
                        required: true,
                        completionCriteria: 'Tour is marked complete in your account.',
                    },
                    {
                        id: `${prefix}-004`,
                        title: 'Complete your first task',
                        description: `Follow the quick-start guide to complete your first ${product} task from start to finish.`,
                        estimatedTime: '15 minutes',
                        docLink: '_[link to quick-start guide]_',
                        required: true,
                        completionCriteria: 'First task is saved and visible in your dashboard.',
                    },
                ],
            },
            {
                phase: 'Week 1 — Core Workflow',
                goals: [
                    'Use the three most common features independently',
                    'Connect any integrations you need',
                ],
                tasks: [
                    {
                        id: `${prefix}-005`,
                        title: 'Explore the three core features',
                        description: '_[List the three most important features for end users and link to their guides.]_',
                        estimatedTime: '30 minutes',
                        docLink: '_[link to feature overview]_',
                        required: true,
                    },
                    {
                        id: `${prefix}-006`,
                        title: 'Connect your integrations',
                        description: 'Connect the tools you use daily (Slack, email, calendar) to streamline your workflow.',
                        estimatedTime: '15 minutes',
                        docLink: '_[link to integrations guide]_',
                        required: false,
                    },
                    {
                        id: `${prefix}-007`,
                        title: 'Set your notification preferences',
                        description: 'Customise which notifications you receive and how (email, in-app, Slack).',
                        estimatedTime: '5 minutes',
                        required: false,
                    },
                ],
            },
            {
                phase: 'Month 1 — Power User',
                goals: [
                    'Discover advanced features that save time',
                    'Know where to find help when you need it',
                ],
                tasks: [
                    {
                        id: `${prefix}-008`,
                        title: 'Explore keyboard shortcuts',
                        description: 'Learn the top 5 keyboard shortcuts that experienced users rely on.',
                        estimatedTime: '10 minutes',
                        docLink: '_[link to keyboard shortcuts reference]_',
                        required: false,
                    },
                    {
                        id: `${prefix}-009`,
                        title: 'Bookmark the help centre',
                        description: `Add the ${product} help centre and community forum to your browser bookmarks.`,
                        estimatedTime: '2 minutes',
                        docLink: '_[link to help centre]_',
                        required: true,
                    },
                ],
            },
        ],
    };

    return {
        title: `${product} Onboarding Guide — ${roleLabel}`,
        role,
        product,
        welcome: ROLE_WELCOME[role],
        phases: TEMPLATES[role],
    };
}
