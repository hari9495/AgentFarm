// ============================================================================
// CROSS-REPO BUILDER
// Types, context management, and pure helper functions for multi-repo navigation.
// No side-effects — all I/O lives in crossrepo-action-handler.ts.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoEntry {
    /** Short name used to reference this repo in other actions. */
    name:          string;
    /** Remote URL (HTTPS or SSH). */
    url:           string;
    /** Path relative to the cross-repo workspace root. */
    localPath:     string;
    /** Default branch (main, master, develop…). */
    defaultBranch: string;
    /** Primary language detected from the repo root. */
    language:      string;
    /** ISO timestamp when the repo was cloned. */
    clonedAt:      string;
    /** Names of other repos in the context that this repo imports/depends on. */
    dependsOn:     string[];
    /** ISO timestamp of the last proactive scan, if any. */
    lastScanned?:  string;
}

export interface CrossRepoContext {
    /** Absolute path of the root directory that contains all repo subdirs. */
    workspaceRoot: string;
    repos:         RepoEntry[];
    lastUpdatedAt: string;
}

export interface CrossRepoSearchHit {
    repo:   string;
    file:   string;
    line:   number;
    column: number;
    text:   string;
}

export interface CrossRepoPrSpec {
    repo:    string;
    branch:  string;
    title:   string;
    body:    string;
    commits: string[];
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/**
 * Guesses the primary language of a repo from a file listing.
 * Pure function — accepts the raw `ls` output or a list of filenames.
 */
export function detectRepoLanguage(fileList: string): string {
    const files = fileList.toLowerCase();
    if (files.includes('package.json'))                             return 'typescript';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'java';
    if (files.includes('go.mod'))                                   return 'go';
    if (files.includes('cargo.toml'))                               return 'rust';
    if (files.includes('requirements.txt') || files.includes('pyproject.toml')) return 'python';
    if (files.includes('.csproj') || files.includes('.sln'))        return 'csharp';
    if (files.includes('pubspec.yaml'))                             return 'dart';
    if (files.includes('gemfile'))                                  return 'ruby';
    return 'unknown';
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

export function createEmptyCrossRepoContext(workspaceRoot: string): CrossRepoContext {
    return { workspaceRoot, repos: [], lastUpdatedAt: new Date().toISOString() };
}

export function addRepoToContext(ctx: CrossRepoContext, entry: RepoEntry): CrossRepoContext {
    const existing = ctx.repos.findIndex((r) => r.name === entry.name);
    const repos = existing === -1
        ? [...ctx.repos, entry]
        : ctx.repos.map((r, i) => (i === existing ? entry : r));
    return { ...ctx, repos, lastUpdatedAt: new Date().toISOString() };
}

export function removeRepoFromContext(ctx: CrossRepoContext, name: string): CrossRepoContext {
    return {
        ...ctx,
        repos:         ctx.repos.filter((r) => r.name !== name),
        lastUpdatedAt: new Date().toISOString(),
    };
}

export function formatContextSummary(ctx: CrossRepoContext): string {
    if (ctx.repos.length === 0) return 'No repos registered in cross-repo context.';
    const lines = ctx.repos.map((r) =>
        `  ${r.name} (${r.language}) — ${r.localPath} [branch: ${r.defaultBranch}]${r.dependsOn.length ? ` depends on: ${r.dependsOn.join(', ')}` : ''}`,
    );
    return [`Cross-repo context (${ctx.repos.length} repo(s)):`, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// Search result parser
// ---------------------------------------------------------------------------

/**
 * Parses raw grep -n output from multiple repos into structured hits.
 * Format expected per line: "<file>:<lineNum>:<matchedText>"
 */
export function parseCrossRepoSearchResults(
    rawResults: Array<{ repo: string; stdout: string }>,
): CrossRepoSearchHit[] {
    const hits: CrossRepoSearchHit[] = [];
    for (const { repo, stdout } of rawResults) {
        for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // grep -n format: path/to/file.ts:42:   const foo = bar();
            const match = trimmed.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
                hits.push({
                    repo,
                    file:   match[1] ?? '',
                    line:   parseInt(match[2] ?? '0', 10),
                    column: 0,
                    text:   (match[3] ?? '').trim(),
                });
            }
        }
    }
    return hits;
}

/**
 * Formats search hits into a readable summary string.
 */
export function formatSearchHits(hits: CrossRepoSearchHit[], pattern: string): string {
    if (hits.length === 0) return `No matches found for "${pattern}" across registered repos.`;
    const byRepo: Record<string, CrossRepoSearchHit[]> = {};
    for (const hit of hits) {
        (byRepo[hit.repo] ??= []).push(hit);
    }
    const sections = Object.entries(byRepo).map(([repo, repoHits]) => {
        const lines = repoHits.map((h) => `    ${h.file}:${h.line}  ${h.text}`);
        return [`  [${repo}] — ${repoHits.length} match(es)`, ...lines].join('\n');
    });
    return [`Found ${hits.length} match(es) for "${pattern}":`, ...sections].join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompt builders
// ---------------------------------------------------------------------------

/**
 * Builds a prompt asking the LLM to produce patch hunks for a cross-repo refactor.
 * Returns a prompt expecting JSON array of { repo, file, oldText, newText }.
 */
export function buildCrossRepoRefactorPrompt(params: {
    refactorType: 'rename_symbol' | 'update_import' | 'replace_text' | 'interface_change';
    description:  string;
    oldPattern:   string;
    newPattern:   string;
    hits:         CrossRepoSearchHit[];
    contextSnippets: Array<{ repo: string; file: string; snippet: string }>;
}): string {
    const hitSummary = params.hits.slice(0, 40).map((h) =>
        `  ${h.repo}/${h.file}:${h.line}  ${h.text}`,
    ).join('\n');

    const snippets = params.contextSnippets.slice(0, 10).map((s) =>
        `[${s.repo}] ${s.file}:\n${s.snippet.slice(0, 400)}`,
    ).join('\n\n');

    return [
        `You are a senior software engineer performing a cross-repository ${params.refactorType} refactor.`,
        ``,
        `Task: ${params.description}`,
        `Pattern to replace: ${params.oldPattern}`,
        `Replacement:        ${params.newPattern}`,
        ``,
        `Matching locations (up to 40 shown):`,
        hitSummary,
        ``,
        `Code context:`,
        snippets,
        ``,
        `Generate the minimal safe edits. Return a JSON array where each element has:`,
        `  repo      — repository name (exactly as shown above)`,
        `  file      — file path relative to repo root`,
        `  oldText   — the exact text to replace (must match file content exactly)`,
        `  newText   — the replacement text`,
        ``,
        `Rules:`,
        `  - Only change lines that are genuinely affected by this refactor`,
        `  - Preserve indentation and surrounding whitespace exactly`,
        `  - Do not modify test files unless the refactor requires it`,
        `  - Return [] if no changes are needed`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

export interface CrossRepoRefactorEdit {
    repo:    string;
    file:    string;
    oldText: string;
    newText: string;
}

/**
 * Parses LLM output into CrossRepoRefactorEdit[]. Pure function.
 */
export function parseCrossRepoRefactorEdits(raw: string): CrossRepoRefactorEdit[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    try {
        const items = JSON.parse(cleaned.slice(start, end + 1)) as Array<{
            repo?: unknown; file?: unknown; oldText?: unknown; newText?: unknown;
        }>;
        return items
            .filter((i) =>
                typeof i.repo    === 'string' &&
                typeof i.file    === 'string' &&
                typeof i.oldText === 'string' &&
                typeof i.newText === 'string',
            )
            .map((i) => ({
                repo:    i.repo    as string,
                file:    i.file    as string,
                oldText: i.oldText as string,
                newText: i.newText as string,
            }));
    } catch { return []; }
}

/**
 * Builds a pull-request body for a cross-repo change. Pure function.
 */
export function buildCrossRepoPrBody(params: {
    description:  string;
    repoName:     string;
    editCount:    number;
    fileList:     string[];
    relatedRepos: string[];
}): string {
    const fileLines = params.fileList.slice(0, 20).map((f) => `- \`${f}\``).join('\n');
    return [
        `## Cross-repo refactor: ${params.description}`,
        ``,
        `This PR is part of a coordinated change across ${params.relatedRepos.length + 1} repo(s):`,
        `${[params.repoName, ...params.relatedRepos].map((r) => `- ${r}`).join('\n')}`,
        ``,
        `### Changes in this repo`,
        `${params.editCount} edit(s) across ${params.fileList.length} file(s):`,
        fileLines,
        ``,
        `🤖 Generated by AgentFarm cross-repo navigator`,
    ].join('\n');
}
