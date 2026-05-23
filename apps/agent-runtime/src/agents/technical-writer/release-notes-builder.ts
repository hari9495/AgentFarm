// ============================================================================
// RELEASE NOTES BUILDER
// Sprint 16 — Technical Writer Role
//
// Builds structured Markdown release notes from a list of merged PR objects.
// Groups PRs by label into sections: Features, Bug Fixes, Chores, Breaking Changes.
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PullRequest {
    title: string;
    number: number;
    labels: string[];
}

export interface ReleaseNotesOptions {
    version?: string;
    date?: string;
    repoUrl?: string;
}

export type ReleaseNotesCategory =
    | 'Breaking Changes'
    | 'Features'
    | 'Bug Fixes'
    | 'Chores';

// ---------------------------------------------------------------------------
// Label → category mapping
// ---------------------------------------------------------------------------

const BREAKING_LABELS = new Set([
    'breaking', 'breaking-change', 'breaking change',
    'semver-major', 'major',
]);

const FEATURE_LABELS = new Set([
    'feature', 'feat', 'enhancement', 'new feature',
    'semver-minor', 'minor',
]);

const BUG_LABELS = new Set([
    'bug', 'fix', 'bugfix', 'hotfix', 'regression',
    'defect', 'patch',
]);

const CHORE_LABELS = new Set([
    'chore', 'maintenance', 'refactor', 'docs', 'documentation',
    'ci', 'build', 'test', 'tests', 'style', 'perf', 'performance',
    'dependency', 'dependencies', 'dependabot', 'housekeeping',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a PR's labels into a release notes category.
 * Priority: Breaking Changes > Bug Fixes > Features > Chores.
 * Unlabelled PRs default to 'Chores'.
 */
export function classifyPrByLabel(labels: string[]): ReleaseNotesCategory {
    const normalised = labels.map((l) => l.toLowerCase().trim());

    if (normalised.some((l) => BREAKING_LABELS.has(l))) return 'Breaking Changes';
    if (normalised.some((l) => BUG_LABELS.has(l))) return 'Bug Fixes';
    if (normalised.some((l) => FEATURE_LABELS.has(l))) return 'Features';
    return 'Chores';
}

/**
 * Build a structured Markdown release notes document from a list of PRs.
 *
 * Sections are rendered in this order:
 *   ⚠️ Breaking Changes → ✨ Features → 🐛 Bug Fixes → 🔧 Chores
 *
 * Sections with no PRs are omitted.
 *
 * @param prList  Array of merged pull requests to include.
 * @param options Optional version label, date, and repository URL.
 *
 * @returns Markdown string.
 */
export function buildReleaseNotes(
    prList: PullRequest[],
    options: ReleaseNotesOptions = {},
): string {
    const version = options.version ?? 'Unreleased';
    const date = options.date ?? new Date().toISOString().slice(0, 10);
    const repoUrl = options.repoUrl ?? '';

    const grouped: Record<ReleaseNotesCategory, PullRequest[]> = {
        'Breaking Changes': [],
        'Features': [],
        'Bug Fixes': [],
        'Chores': [],
    };

    for (const pr of prList) {
        const category = classifyPrByLabel(pr.labels);
        grouped[category].push(pr);
    }

    const lines: string[] = [`# Release Notes — ${version}`, '', `**Date:** ${date}`, ''];

    const SECTION_ORDER: ReleaseNotesCategory[] = [
        'Breaking Changes',
        'Features',
        'Bug Fixes',
        'Chores',
    ];

    const SECTION_EMOJI: Record<ReleaseNotesCategory, string> = {
        'Breaking Changes': '⚠️',
        'Features': '✨',
        'Bug Fixes': '🐛',
        'Chores': '🔧',
    };

    let hasContent = false;
    for (const category of SECTION_ORDER) {
        const prs = grouped[category];
        if (prs.length === 0) continue;
        hasContent = true;
        lines.push(`## ${SECTION_EMOJI[category]} ${category}`, '');
        for (const pr of prs) {
            const prRef = repoUrl
                ? `[#${pr.number}](${repoUrl}/pull/${pr.number})`
                : `#${pr.number}`;
            lines.push(`- ${pr.title} (${prRef})`);
        }
        lines.push('');
    }

    if (!hasContent) {
        lines.push('*No changes recorded.*', '');
    }

    return lines.join('\n');
}
