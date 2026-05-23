// ============================================================================
// ROADMAP CONTEXT BUILDER
// Technical Writer Role
//
// Pure functions for parsing GitHub issues / milestones (from `gh` CLI JSON)
// and synthesising a strategic documentation context document — the
// "long-range strategic judgment" capability.
//
// parseGithubIssues   — classify issues as deprecated / upcoming / breaking
// buildRoadmapContext — produce a strategic Markdown context the agent reads
//                       before planning documentation work
//
// All pure functions — no I/O, no GitHub calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeprecatedItem {
    /** Feature / API / component name */
    name: string;
    /** Issue title as reason */
    reason: string;
    issueUrl?: string;
    /** Version or milestone when removal is planned */
    plannedRemoval?: string;
}

export interface UpcomingFeature {
    name: string;
    milestone?: string;
    issueUrl?: string;
    /** True when the issue explicitly requests documentation */
    needsDocs: boolean;
    issueTitle: string;
}

export interface BreakingChange {
    description: string;
    issueUrl?: string;
}

export interface RoadmapContext {
    deprecatedItems: DeprecatedItem[];
    upcomingFeatures: UpcomingFeature[];
    breakingChanges: BreakingChange[];
    /** Names to skip when choosing documentation targets */
    doNotDocumentList: string[];
    /** Feature names that explicitly need docs written */
    highPriorityDocTargets: string[];
    markdownContext: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type RawObj = Record<string, unknown>;

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

/** Extract quoted / backtick-quoted / PascalCase names from text. */
function extractNames(text: string): string[] {
    const names: string[] = [];
    for (const m of text.matchAll(/`([^`]{2,50})`/g))     names.push(m[1]!.trim());
    for (const m of text.matchAll(/"([^"]{2,50})"/g))      names.push(m[1]!.trim());
    for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]{2,30}(?:Service|Manager|Controller|Client|Provider|API|SDK|Hook)?)\b/g)) {
        names.push(m[1]!);
    }
    return [...new Set(names.filter((n) => n.length > 2))].slice(0, 5);
}

/** Extract a planned version string from free text. */
function extractVersion(text: string): string | undefined {
    const m = text.match(/v?(\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.]+)?)\b|version\s+(\d[\d.]+)/i);
    return m ? (m[1] ?? m[2]) : undefined;
}

function getLabelNames(issue: RawObj): string[] {
    const labels = issue['labels'];
    if (!Array.isArray(labels)) return [];
    return labels.map((l: unknown) =>
        typeof l === 'string' ? l :
        typeof l === 'object' && l !== null ? str((l as RawObj)['name']) : '',
    ).filter(Boolean);
}

function getMilestone(issue: RawObj): string | undefined {
    const ms = issue['milestone'];
    if (typeof ms === 'object' && ms !== null) return str((ms as RawObj)['title']) || undefined;
    return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a list of GitHub issues (raw JSON from `gh issue list --json`) into
 * three categories: deprecated items, upcoming features, and breaking changes.
 *
 * Classification is label-first; falls back to keyword matching on title+body.
 */
export function parseGithubIssues(issues: unknown[]): {
    deprecated: DeprecatedItem[];
    upcoming:   UpcomingFeature[];
    breaking:   BreakingChange[];
} {
    const deprecated: DeprecatedItem[] = [];
    const upcoming:   UpcomingFeature[] = [];
    const breaking:   BreakingChange[]  = [];

    const rawIssues = issues.filter((i): i is RawObj => typeof i === 'object' && i !== null);

    for (const issue of rawIssues) {
        const title      = str(issue['title']);
        const body       = str(issue['body']);
        const url        = str(issue['url']) || str(issue['html_url']) || undefined;
        const milestone  = getMilestone(issue);
        const labelNames = getLabelNames(issue);
        const labelStr   = labelNames.join(' ').toLowerCase();
        const allText    = (title + ' ' + body).toLowerCase();

        // ----------------------------------------------------------------
        // Deprecated / scheduled for removal
        // ----------------------------------------------------------------
        const isDeprecated =
            /deprecat|remov(al|ed)|sunset|end.of.life|\beol\b|scheduled.for.remov/.test(labelStr) ||
            /deprecat|will.be.remov|scheduled.for.remov|sunset|end.of.life/.test(allText);

        if (isDeprecated) {
            const names = extractNames(title + ' ' + body.slice(0, 500));
            deprecated.push({
                name:           names[0] ?? title.slice(0, 60),
                reason:         title,
                issueUrl:       url,
                plannedRemoval: extractVersion(body) ?? milestone,
            });
            continue;
        }

        // ----------------------------------------------------------------
        // Breaking changes
        // ----------------------------------------------------------------
        const isBreaking =
            /breaking.?change|incompatible|migration.?required|semver.?major/.test(labelStr) ||
            /breaking.change|breaks.backward|incompatible.change|requires.migration/.test(allText);

        if (isBreaking) {
            breaking.push({ description: title, issueUrl: url });
            continue;
        }

        // ----------------------------------------------------------------
        // Upcoming features
        // ----------------------------------------------------------------
        const isUpcoming =
            /enhancement|feature|roadmap|new.feature|upcoming|planned/.test(labelStr) ||
            /new feature|upcoming feature|planned for/.test(allText);

        if (isUpcoming) {
            const needsDocs = /\bdoc\b|document|write.up|needs.?docs|docs.?needed/.test(allText);
            const names     = extractNames(title + ' ' + body.slice(0, 500));
            upcoming.push({
                name:       names[0] ?? title.slice(0, 60),
                milestone,
                issueUrl:   url,
                needsDocs,
                issueTitle: title,
            });
        }
    }

    return { deprecated, upcoming, breaking };
}

/**
 * Synthesise a strategic Markdown context document the TW agent reads before
 * planning documentation work.  This is the single source of truth for:
 *   - Features that MUST NOT be documented (scheduled for removal)
 *   - Features that need urgent new documentation
 *   - Breaking changes that require existing doc updates
 *   - Upcoming features to watch
 *
 * @param planningDocContent  Optional raw text from ROADMAP.md / CHANGELOG.md
 */
export function buildRoadmapContext(
    deprecated: DeprecatedItem[],
    upcoming:   UpcomingFeature[],
    breaking:   BreakingChange[],
    planningDocContent?: string,
): RoadmapContext {
    const doNotDocumentList      = deprecated.map((d) => d.name);
    const highPriorityDocTargets = upcoming.filter((u) => u.needsDocs).map((u) => u.name);

    const now = new Date().toISOString().split('T')[0]!;
    const lines: string[] = [];

    lines.push('# Documentation Roadmap Context');
    lines.push(`\n_Generated: ${now} — consult this before starting any documentation work_\n`);

    if (doNotDocumentList.length > 0) {
        lines.push('## 🚫 Do Not Document — Scheduled for Removal\n');
        lines.push('> Writing docs for these items wastes effort — they are being deprecated.\n');
        for (const d of deprecated) {
            const removal = d.plannedRemoval ? ` _(removal: ${d.plannedRemoval})_` : '';
            lines.push(`- **${d.name}**${removal}: ${d.reason}`);
            if (d.issueUrl) lines.push(`  ↳ ${d.issueUrl}`);
        }
        lines.push('');
    }

    if (breaking.length > 0) {
        lines.push('## ⚡ Breaking Changes — Existing Docs Need Updating\n');
        for (const b of breaking) {
            lines.push(`- ${b.description}`);
            if (b.issueUrl) lines.push(`  ↳ ${b.issueUrl}`);
        }
        lines.push('');
    }

    if (highPriorityDocTargets.length > 0) {
        lines.push('## 📝 High Priority — New Docs Requested\n');
        for (const u of upcoming.filter((u) => u.needsDocs)) {
            const ms = u.milestone ? ` [${u.milestone}]` : '';
            lines.push(`- **${u.name}**${ms}: ${u.issueTitle}`);
            if (u.issueUrl) lines.push(`  ↳ ${u.issueUrl}`);
        }
        lines.push('');
    }

    const watchList = upcoming.filter((u) => !u.needsDocs);
    if (watchList.length > 0) {
        lines.push('## 🚀 Upcoming Features — Monitor for Doc Needs\n');
        watchList.slice(0, 15).forEach((u) => {
            const ms = u.milestone ? ` [${u.milestone}]` : '';
            lines.push(`- ${u.name}${ms}`);
        });
        lines.push('');
    }

    if (planningDocContent?.trim()) {
        lines.push('## 📄 Extracted from Planning Documents\n');
        lines.push(planningDocContent.trim().slice(0, 2000));
        lines.push('');
    }

    return {
        deprecatedItems: deprecated,
        upcomingFeatures: upcoming,
        breakingChanges: breaking,
        doNotDocumentList,
        highPriorityDocTargets,
        markdownContext: lines.join('\n'),
    };
}
