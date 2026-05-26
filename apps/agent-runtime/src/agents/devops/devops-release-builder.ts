// ============================================================================
// DEVOPS RELEASE BUILDER
//
// Parses git log between two tags and generates structured release notes:
//   - Groups commits by conventional-commit type (feat/fix/perf/chore/…)
//   - Formats a Markdown changelog body
//   - Produces the payload for a GitHub release API call
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommitType =
    | 'feat'
    | 'fix'
    | 'perf'
    | 'refactor'
    | 'docs'
    | 'test'
    | 'ci'
    | 'chore'
    | 'revert'
    | 'build'
    | 'style'
    | 'other';

export interface CommitEntry {
    sha:      string;     // short (7 chars)
    type:     CommitType;
    scope?:   string;
    message:  string;     // subject without type prefix
    breaking: boolean;
    author:   string;
    date:     string;     // YYYY-MM-DD
    body?:    string;
}

export interface ReleaseNotes {
    version:          string;
    previousVersion:  string;
    breaking:         CommitEntry[];
    features:         CommitEntry[];
    bugFixes:         CommitEntry[];
    performance:      CommitEntry[];
    other:            CommitEntry[];
    totalCommits:     number;
    formattedMarkdown: string;
}

// ---------------------------------------------------------------------------
// Git log command builder
// ---------------------------------------------------------------------------

/**
 * Build a git log command that emits a parseable one-line per commit format.
 * Format: SHA|AUTHOR|DATE|SUBJECT
 * Usage: git log v1.0.0..v1.1.0 --format="%h|%an|%cs|%s" --no-merges
 */
export function buildGitLogCommand(fromRef: string, toRef = 'HEAD'): string[] {
    return [
        'git', 'log',
        `${fromRef}..${toRef}`,
        '--format=%h|%an|%cs|%s',
        '--no-merges',
    ];
}

/** Get the latest tag so we can diff from there. */
export function buildGetLatestTagCommand(): string[] {
    return ['git', 'describe', '--tags', '--abbrev=0'];
}

/** Get the previous tag (before the latest). */
export function buildGetPreviousTagCommand(): string[] {
    return ['git', 'describe', '--tags', '--abbrev=0', 'HEAD~1'];
}

/** List all tags sorted by version. */
export function buildListTagsCommand(): string[] {
    return ['git', 'tag', '--sort=-version:refname'];
}

// ---------------------------------------------------------------------------
// Commit parser
// ---------------------------------------------------------------------------

const CONVENTIONAL_PATTERN =
    /^(feat|fix|perf|refactor|docs|test|ci|chore|revert|build|style)(\(([^)]+)\))?(!)?:\s*(.+)$/i;

function parseCommitType(subject: string): { type: CommitType; scope?: string; message: string; breaking: boolean } {
    const match = CONVENTIONAL_PATTERN.exec(subject);
    if (!match) {
        return { type: 'other', message: subject, breaking: false };
    }
    return {
        type:     (match[1]?.toLowerCase() ?? 'other') as CommitType,
        scope:    match[3] ?? undefined,
        message:  match[5]?.trim() ?? subject,
        breaking: match[4] === '!',
    };
}

/**
 * Parse `git log --format="%h|%an|%cs|%s" --no-merges` output.
 */
export function parseGitLog(rawGitLog: string): CommitEntry[] {
    return rawGitLog
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|');
            const sha     = (parts[0] ?? '').trim();
            const author  = (parts[1] ?? '').trim();
            const date    = (parts[2] ?? '').trim();
            const subject = parts.slice(3).join('|').trim(); // subject may contain |

            const { type, scope, message, breaking } = parseCommitType(subject);
            return { sha, type, scope, message, breaking, author, date };
        })
        .filter((e) => e.sha.length > 0);
}

// ---------------------------------------------------------------------------
// Release notes builder
// ---------------------------------------------------------------------------

export function buildReleaseNotes(params: {
    version:         string;
    previousVersion: string;
    commits:         CommitEntry[];
}): ReleaseNotes {
    const { version, previousVersion, commits } = params;

    const breaking    = commits.filter((c) => c.breaking || c.type === 'revert');
    const features    = commits.filter((c) => !c.breaking && c.type === 'feat');
    const bugFixes    = commits.filter((c) => !c.breaking && c.type === 'fix');
    const performance = commits.filter((c) => !c.breaking && c.type === 'perf');
    const other       = commits.filter(
        (c) => !c.breaking && !['feat', 'fix', 'perf', 'revert'].includes(c.type),
    );

    const notes: ReleaseNotes = {
        version, previousVersion,
        breaking, features, bugFixes, performance, other,
        totalCommits: commits.length,
        formattedMarkdown: '',
    };

    notes.formattedMarkdown = formatReleaseMarkdown(notes);
    return notes;
}

// ---------------------------------------------------------------------------
// Markdown formatter
// ---------------------------------------------------------------------------

function renderSection(title: string, commits: CommitEntry[]): string {
    if (commits.length === 0) return '';
    const items = commits.map((c) => {
        const scope = c.scope ? `**${c.scope}:** ` : '';
        return `- ${scope}${c.message} (\`${c.sha}\`)`;
    });
    return [`### ${title}`, ...items, ''].join('\n');
}

export function formatReleaseMarkdown(notes: ReleaseNotes): string {
    const sections: string[] = [
        `## What's Changed`,
        ``,
    ];

    if (notes.breaking.length > 0) {
        sections.push(`> ⚠️ **BREAKING CHANGES** in this release`, ``);
        sections.push(renderSection('⚠️ Breaking Changes', notes.breaking));
    }

    sections.push(renderSection('✨ New Features', notes.features));
    sections.push(renderSection('🐛 Bug Fixes', notes.bugFixes));
    sections.push(renderSection('⚡ Performance', notes.performance));

    if (notes.other.length > 0) {
        sections.push(renderSection('🔧 Other Changes', notes.other));
    }

    sections.push(
        `---`,
        `**Full Changelog:** \`${notes.previousVersion}...${notes.version}\``,
        ``,
        `_${notes.totalCommits} commit(s) since ${notes.previousVersion}_`,
    );

    return sections.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// GitHub release payload builder
// ---------------------------------------------------------------------------

export interface GitHubReleasePayload {
    tag_name:         string;
    name:             string;
    body:             string;
    draft:            boolean;
    prerelease:       boolean;
    target_commitish?: string;
}

export function buildGitHubReleasePayload(params: {
    version:          string;
    notes:            ReleaseNotes;
    draft?:           boolean;
    prerelease?:      boolean;
    targetBranch?:    string;
}): GitHubReleasePayload {
    return {
        tag_name:         params.version,
        name:             `Release ${params.version}`,
        body:             params.notes.formattedMarkdown,
        draft:            params.draft ?? false,
        prerelease:       params.prerelease ?? false,
        target_commitish: params.targetBranch,
    };
}
