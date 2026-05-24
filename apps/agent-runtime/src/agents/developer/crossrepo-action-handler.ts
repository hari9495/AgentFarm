// ============================================================================
// CROSS-REPO ACTION HANDLER
// Multi-repository navigation: clone, search, refactor, status, PR creation.
// Tier 33 — workspace_crossrepo_* actions.
// ============================================================================

import {
    detectRepoLanguage,
    createEmptyCrossRepoContext,
    addRepoToContext,
    formatContextSummary,
    parseCrossRepoSearchResults,
    formatSearchHits,
    buildCrossRepoRefactorPrompt,
    parseCrossRepoRefactorEdits,
    buildCrossRepoPrBody,
    type CrossRepoContext,
    type RepoEntry,
} from './crossrepo-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrossrepoActionType =
    | 'workspace_crossrepo_clone'
    | 'workspace_crossrepo_search'
    | 'workspace_crossrepo_refactor'
    | 'workspace_crossrepo_status'
    | 'workspace_crossrepo_pr_create';

export const CROSSREPO_ACTION_TYPES = new Set<CrossrepoActionType>([
    'workspace_crossrepo_clone',
    'workspace_crossrepo_search',
    'workspace_crossrepo_refactor',
    'workspace_crossrepo_status',
    'workspace_crossrepo_pr_create',
]);

export function isCrossrepoActionType(at: string): at is CrossrepoActionType {
    return CROSSREPO_ACTION_TYPES.has(at as CrossrepoActionType);
}

type SubResult      = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;
type RunCommandFn   = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type LlmCallFn      = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface CrossrepoActionParams {
    actionType:    CrossrepoActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTEXT_FILE = '.agentfarm/crossrepo-context.json';

function safeJson(data: Record<string, unknown>): { ok: boolean; output: string } {
    return { ok: true, output: JSON.stringify(data) };
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

async function callLlmSafe(fn: LlmCallFn, prompt: string, sys?: string): Promise<string> {
    try { return await fn(prompt, sys); } catch { return ''; }
}

async function loadContext(executeAction: ExecuteActionFn, workspaceDir: string): Promise<CrossRepoContext> {
    try {
        const r = await executeAction('workspace_read_file', { file_path: CONTEXT_FILE });
        if (r.ok && r.output) return JSON.parse(r.output) as CrossRepoContext;
    } catch { /* no context yet */ }
    return createEmptyCrossRepoContext(workspaceDir);
}

async function saveContext(executeAction: ExecuteActionFn, ctx: CrossRepoContext): Promise<void> {
    await executeAction('workspace_write_file', {
        file_path: CONTEXT_FILE,
        content:   JSON.stringify(ctx, null, 2),
    });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleCrossrepoAction(
    params: CrossrepoActionParams,
): Promise<{ ok: boolean; output: string; errorOutput?: string }> {
    const { actionType, payload, workspaceDir, executeAction, runCommand, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_crossrepo_clone
        // Registers and clones one or more repos into sibling directories.
        //
        // payload:
        //   repos (required) — array of { name, url, branch? }
        //   base_dir?        — base directory under workspaceDir (default: "repos")
        // ====================================================================
        case 'workspace_crossrepo_clone': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            const rawRepos = payload['repos'];
            if (!Array.isArray(rawRepos) || rawRepos.length === 0) {
                return { ok: false, output: '', errorOutput: 'payload.repos must be a non-empty array of { name, url, branch? }' };
            }

            const baseDir  = str(payload['base_dir'], 'repos');
            const rootPath = `${workspaceDir}/${baseDir}`;

            // Ensure base directory exists
            await runCommand(['mkdir', '-p', rootPath], workspaceDir, 10_000);

            let ctx = await loadContext(executeAction, workspaceDir);
            const results: Array<{ name: string; ok: boolean; message: string }> = [];

            for (const repoSpec of rawRepos as Array<Record<string, unknown>>) {
                const name       = str(repoSpec['name']);
                const url        = str(repoSpec['url']);
                const branch     = str(repoSpec['branch'], 'main');
                const localPath  = `${baseDir}/${name}`;
                const absPath    = `${workspaceDir}/${localPath}`;

                if (!name || !url) {
                    results.push({ name: name || '(unknown)', ok: false, message: 'name and url are required' });
                    continue;
                }

                // Clone the repo
                const cloneResult = await runCommand(
                    ['git', 'clone', '--branch', branch, '--depth', '50', url, absPath],
                    workspaceDir,
                    120_000,
                );

                if (cloneResult.exitCode !== 0) {
                    results.push({ name, ok: false, message: cloneResult.stderr.slice(0, 200) });
                    continue;
                }

                // Detect language
                const lsResult = await runCommand(['ls'], absPath, 8_000);
                const language = detectRepoLanguage(lsResult.stdout);

                const entry: RepoEntry = {
                    name,
                    url,
                    localPath,
                    defaultBranch: branch,
                    language,
                    clonedAt:      new Date().toISOString(),
                    dependsOn:     (repoSpec['depends_on'] as string[] | undefined) ?? [],
                };

                ctx = addRepoToContext(ctx, entry);
                results.push({ name, ok: true, message: `cloned (${language})` });
            }

            await saveContext(executeAction, ctx);

            const successful = results.filter((r) => r.ok).length;
            return safeJson({
                cloned_count: successful,
                failed_count: results.length - successful,
                results,
                context_summary: formatContextSummary(ctx),
                summary: `Cloned ${successful}/${results.length} repo(s). ${formatContextSummary(ctx)}`,
            });
        }

        // ====================================================================
        // workspace_crossrepo_search
        // Searches a pattern across all registered repos using grep.
        //
        // payload:
        //   pattern   (required) — regex or literal string
        //   file_glob?           — e.g. "*.ts", "**/*.go"
        //   repo_names?          — filter to specific repos (default: all)
        //   case_insensitive?    — default false
        // ====================================================================
        case 'workspace_crossrepo_search': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            const pattern = str(payload['pattern']);
            if (!pattern) return { ok: false, output: '', errorOutput: 'payload.pattern is required' };

            const ctx       = await loadContext(executeAction, workspaceDir);
            const repoFilter = Array.isArray(payload['repo_names']) ? payload['repo_names'] as string[] : null;
            const repos     = repoFilter
                ? ctx.repos.filter((r) => repoFilter.includes(r.name))
                : ctx.repos;

            if (repos.length === 0) {
                return { ok: false, output: '', errorOutput: 'No repos registered. Run workspace_crossrepo_clone first.' };
            }

            const fileGlob        = str(payload['file_glob']);
            const caseInsensitive = payload['case_insensitive'] === true;

            const grepArgs = ['grep', '-rn', '--include', fileGlob || '*', caseInsensitive ? '-i' : '', pattern]
                .filter(Boolean);

            const rawResults: Array<{ repo: string; stdout: string }> = [];

            for (const repo of repos) {
                const repoAbsPath = `${workspaceDir}/${repo.localPath}`;
                const result      = await runCommand(grepArgs, repoAbsPath, 30_000);
                // grep exits with 1 when no matches — that's not an error
                rawResults.push({ repo: repo.name, stdout: result.stdout });
            }

            const hits    = parseCrossRepoSearchResults(rawResults);
            const summary = formatSearchHits(hits, pattern);

            return safeJson({
                hit_count:  hits.length,
                repo_count: repos.length,
                hits:       hits.slice(0, 200),  // cap to avoid huge payloads
                summary,
            });
        }

        // ====================================================================
        // workspace_crossrepo_refactor
        // Applies a coordinated code change across all registered repos using
        // LLM-generated edits, then commits each change.
        //
        // payload:
        //   description   (required) — human description of the change
        //   old_pattern   (required) — text/symbol to replace
        //   new_pattern   (required) — replacement
        //   refactor_type?           — rename_symbol | update_import | replace_text | interface_change
        //   file_glob?               — scope the search (default: all)
        //   repo_names?              — filter to specific repos (default: all)
        //   commit_message?          — git commit message
        //   dry_run?                 — default false; if true, return edits without applying
        // ====================================================================
        case 'workspace_crossrepo_refactor': {
            if (!runCommand || !callLlm) {
                return { ok: false, output: '', errorOutput: 'runCommand and callLlm are required for crossrepo_refactor' };
            }

            const description  = str(payload['description']);
            const oldPattern   = str(payload['old_pattern']);
            const newPattern   = str(payload['new_pattern']);
            if (!description || !oldPattern) {
                return { ok: false, output: '', errorOutput: 'payload.description and payload.old_pattern are required' };
            }

            const refactorType = str(payload['refactor_type'], 'replace_text') as Parameters<typeof buildCrossRepoRefactorPrompt>[0]['refactorType'];
            const fileGlob     = str(payload['file_glob']);
            const dryRun       = payload['dry_run'] === true;
            const commitMsg    = str(payload['commit_message'], `refactor: ${description}`);

            const ctx        = await loadContext(executeAction, workspaceDir);
            const repoFilter = Array.isArray(payload['repo_names']) ? payload['repo_names'] as string[] : null;
            const repos      = repoFilter ? ctx.repos.filter((r) => repoFilter.includes(r.name)) : ctx.repos;

            if (repos.length === 0) {
                return { ok: false, output: '', errorOutput: 'No repos registered. Run workspace_crossrepo_clone first.' };
            }

            // 1. Search for occurrences across all repos
            const grepArgs = ['grep', '-rn', '--include', fileGlob || '*', '-F', oldPattern].filter(Boolean);
            const rawResults: Array<{ repo: string; stdout: string }> = [];
            for (const repo of repos) {
                const res = await runCommand(grepArgs, `${workspaceDir}/${repo.localPath}`, 30_000);
                rawResults.push({ repo: repo.name, stdout: res.stdout });
            }
            const hits = parseCrossRepoSearchResults(rawResults);

            if (hits.length === 0) {
                return safeJson({ edited_count: 0, summary: `Pattern "${oldPattern}" not found in any registered repo.` });
            }

            // 2. Gather context snippets for top hits
            const contextSnippets: Array<{ repo: string; file: string; snippet: string }> = [];
            for (const hit of hits.slice(0, 10)) {
                const repo     = repos.find((r) => r.name === hit.repo);
                if (!repo) continue;
                const absFile  = `${workspaceDir}/${repo.localPath}/${hit.file}`;
                const readResult = await executeAction('workspace_read_file', { file_path: absFile });
                if (readResult.ok) {
                    contextSnippets.push({ repo: hit.repo, file: hit.file, snippet: readResult.output.slice(0, 800) });
                }
            }

            // 3. Ask LLM for edits
            const prompt = buildCrossRepoRefactorPrompt({
                refactorType,
                description,
                oldPattern,
                newPattern,
                hits: hits.slice(0, 40),
                contextSnippets,
            });
            const raw   = await callLlmSafe(callLlm, prompt, 'You are a senior software engineer performing a cross-repository refactor.');
            const edits = parseCrossRepoRefactorEdits(raw);

            if (edits.length === 0) {
                return safeJson({ edited_count: 0, summary: 'LLM produced no edits for this refactor.' });
            }

            if (dryRun) {
                return safeJson({
                    dry_run:     true,
                    edit_count:  edits.length,
                    edits,
                    summary:     `Dry-run: ${edits.length} edit(s) across ${new Set(edits.map((e) => e.repo)).size} repo(s).`,
                });
            }

            // 4. Apply edits per repo
            const editsByRepo: Record<string, typeof edits> = {};
            for (const edit of edits) {
                (editsByRepo[edit.repo] ??= []).push(edit);
            }

            const applyResults: Array<{ repo: string; applied: number; committed: boolean }> = [];

            for (const [repoName, repoEdits] of Object.entries(editsByRepo)) {
                const repo = repos.find((r) => r.name === repoName);
                if (!repo) continue;
                const repoDir = `${workspaceDir}/${repo.localPath}`;
                let applied   = 0;

                for (const edit of repoEdits) {
                    const absFile = `${repoDir}/${edit.file}`;
                    const patchResult = await executeAction('code_search_replace', {
                        file_path: absFile,
                        old_text:  edit.oldText,
                        new_text:  edit.newText,
                    });
                    if (patchResult.ok) applied++;
                }

                // Commit the changes in this repo
                let committed = false;
                if (applied > 0) {
                    const addResult = await runCommand(['git', 'add', '-A'], repoDir, 15_000);
                    if (addResult.exitCode === 0) {
                        const commitResult = await runCommand(['git', 'commit', '-m', commitMsg], repoDir, 15_000);
                        committed = commitResult.exitCode === 0;
                    }
                }

                applyResults.push({ repo: repoName, applied, committed });
            }

            const totalApplied   = applyResults.reduce((a, r) => a + r.applied, 0);
            const totalCommitted = applyResults.filter((r) => r.committed).length;

            return safeJson({
                edit_count:        edits.length,
                applied_count:     totalApplied,
                committed_repos:   totalCommitted,
                results:           applyResults,
                summary: `Cross-repo refactor: ${totalApplied} edit(s) applied, ${totalCommitted}/${applyResults.length} repo(s) committed.`,
            });
        }

        // ====================================================================
        // workspace_crossrepo_status
        // Runs `git status` and `git log --oneline -5` in every registered repo.
        //
        // payload:
        //   repo_names? — filter to specific repos (default: all)
        // ====================================================================
        case 'workspace_crossrepo_status': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            const ctx        = await loadContext(executeAction, workspaceDir);
            const repoFilter = Array.isArray(payload['repo_names']) ? payload['repo_names'] as string[] : null;
            const repos      = repoFilter ? ctx.repos.filter((r) => repoFilter.includes(r.name)) : ctx.repos;

            if (repos.length === 0) {
                return { ok: false, output: '', errorOutput: 'No repos registered. Run workspace_crossrepo_clone first.' };
            }

            const statuses: Array<{ repo: string; branch: string; dirty: boolean; status: string; recentCommits: string }> = [];

            for (const repo of repos) {
                const repoDir = `${workspaceDir}/${repo.localPath}`;

                const branchResult = await runCommand(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], repoDir, 8_000);
                const statusResult = await runCommand(['git', 'status', '--short'],                 repoDir, 8_000);
                const logResult    = await runCommand(['git', 'log', '--oneline', '-5'],             repoDir, 8_000);

                statuses.push({
                    repo:          repo.name,
                    branch:        branchResult.stdout.trim() || repo.defaultBranch,
                    dirty:         statusResult.stdout.trim().length > 0,
                    status:        statusResult.stdout.trim() || 'clean',
                    recentCommits: logResult.stdout.trim(),
                });
            }

            const dirtyCount = statuses.filter((s) => s.dirty).length;
            const lines = statuses.map((s) =>
                `  [${s.repo}] branch=${s.branch} ${s.dirty ? '(dirty)' : '(clean)'}` +
                (s.dirty ? `\n    ${s.status.split('\n').slice(0, 5).join('\n    ')}` : ''),
            ).join('\n');

            return safeJson({
                repo_count:  statuses.length,
                dirty_count: dirtyCount,
                statuses,
                summary: `Cross-repo status: ${dirtyCount}/${statuses.length} repo(s) have uncommitted changes.\n${lines}`,
            });
        }

        // ====================================================================
        // workspace_crossrepo_pr_create
        // For each repo that has a committed-but-not-pushed branch, creates a PR.
        //
        // payload:
        //   title      (required) — PR title (same across all repos)
        //   description (required) — what the change does
        //   base_branch?           — target branch (default: repo's defaultBranch)
        //   repo_names?            — filter to specific repos (default: all)
        // ====================================================================
        case 'workspace_crossrepo_pr_create': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            const title       = str(payload['title']);
            const description = str(payload['description']);
            if (!title || !description) {
                return { ok: false, output: '', errorOutput: 'payload.title and payload.description are required' };
            }

            const ctx        = await loadContext(executeAction, workspaceDir);
            const repoFilter = Array.isArray(payload['repo_names']) ? payload['repo_names'] as string[] : null;
            const repos      = repoFilter ? ctx.repos.filter((r) => repoFilter.includes(r.name)) : ctx.repos;

            if (repos.length === 0) {
                return { ok: false, output: '', errorOutput: 'No repos registered.' };
            }

            const prResults: Array<{ repo: string; ok: boolean; pr_url?: string; message: string }> = [];
            const allRepoNames = repos.map((r) => r.name);

            for (const repo of repos) {
                const repoDir   = `${workspaceDir}/${repo.localPath}`;
                const base      = str(payload['base_branch'], repo.defaultBranch);

                // Get current branch
                const branchResult = await runCommand(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], repoDir, 8_000);
                const branch       = branchResult.stdout.trim();

                if (!branch || branch === base) {
                    prResults.push({ repo: repo.name, ok: false, message: `On base branch "${base}" — nothing to PR` });
                    continue;
                }

                // Push the branch
                const pushResult = await runCommand(['git', 'push', '-u', 'origin', branch], repoDir, 60_000);
                if (pushResult.exitCode !== 0) {
                    prResults.push({ repo: repo.name, ok: false, message: `Push failed: ${pushResult.stderr.slice(0, 200)}` });
                    continue;
                }

                // Get changed files for PR body
                const diffResult  = await runCommand(['git', 'diff', `${base}...${branch}`, '--name-only'], repoDir, 15_000);
                const fileList    = diffResult.stdout.trim().split('\n').filter(Boolean);
                const otherRepos  = allRepoNames.filter((n) => n !== repo.name);

                const prBody = buildCrossRepoPrBody({
                    description,
                    repoName:    repo.name,
                    editCount:   fileList.length,
                    fileList,
                    relatedRepos: otherRepos,
                });

                // Create PR via gh CLI
                const prResult = await runCommand(
                    ['gh', 'pr', 'create', '--title', title, '--body', prBody, '--base', base, '--head', branch],
                    repoDir,
                    60_000,
                );

                if (prResult.exitCode === 0) {
                    const prUrl = prResult.stdout.trim().split('\n').find((l) => l.startsWith('https://'));
                    prResults.push({ repo: repo.name, ok: true, pr_url: prUrl, message: 'PR created' });
                } else {
                    prResults.push({ repo: repo.name, ok: false, message: prResult.stderr.slice(0, 200) });
                }
            }

            const created = prResults.filter((r) => r.ok).length;
            return safeJson({
                pr_count:    created,
                failed_count: prResults.length - created,
                results:     prResults,
                summary:     `Cross-repo PRs: ${created}/${prResults.length} created.`,
            });
        }
    }
}
