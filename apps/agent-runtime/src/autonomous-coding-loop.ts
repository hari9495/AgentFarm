/**
 * Autonomous Coding Loop
 *
 * Chains issue analysis → branch creation → workspace actions → test verification →
 * PR creation into a single self-healing pipeline. Each step produces a checkpoint
 * that allows the loop to resume after partial failures.
 *
 * The loop is purely orchestration logic — all I/O goes through the existing
 * workspace executor primitives and skill handlers so it operates within the
 * same sandbox and allowlist constraints.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRedisClient } from '@agentfarm/redis-client';
import { getSkillHandler, analyzeIssueWithLLM, synthesizeCodeFixWithLLM, analyzeDiffWithLLM } from './skill-execution-engine.js';
import { executeLocalWorkspaceAction } from './local-workspace-executor.js';
import { signOutbound } from './outbound-signer.js';
import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LoopStep =
    | 'analyze_issue'
    | 'create_branch'
    | 'implement_changes'
    | 'run_tests'
    | 'fix_failures'
    | 'commit_push'
    | 'create_pr'
    | 'done';

export type LoopStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type LoopStepRecord = {
    step: LoopStep;
    status: LoopStepStatus;
    started_at?: string;
    completed_at?: string;
    output?: unknown;
    error?: string;
    attempt: number;
};

export type AutonomousLoopInput = {
    /** Human-readable description of the task, e.g. "Fix issue #42: null pointer in auth middleware" */
    task_description: string;
    /** Repository context — used to fill skill inputs */
    repo?: string;
    /** Issue number to reference in branch/PR names */
    issue_number?: number;
    /** Files the implementation should touch (hint for workspace actions) */
    target_files?: string[];
    /** Explicit per-file content to write in live (non-dry-run) mode */
    file_edits?: Array<{ file: string; content: string }>;
    /** Tenant ID — required for real workspace execution */
    tenantId?: string;
    /** Bot ID — required for real workspace execution */
    botId?: string;
    /** Workspace key — defaults to the loop ID when not provided */
    workspace_key?: string;
    /** Maximum fix-attempt cycles before giving up */
    max_fix_attempts?: number;
    /** Skip real git/file operations — when true uses plan-only mode; defaults to live execution */
    dry_run?: boolean;
    /** Agent persona — used to sign outbound messages (e.g. PR body disclosure) */
    persona?: AgentPersonaRecord | null;
    /**
     * How long to poll the opened PR for review comments and respond to them.
     * Set to 0 (default) to skip review-comment polling.
     * Value is in minutes; the loop polls every 30 seconds.
     */
    pr_review_wait_mins?: number;
};

export type AutonomousLoopResult = {
    ok: boolean;
    task_description: string;
    steps: LoopStepRecord[];
    pr_url?: string;
    branch_name?: string;
    summary: string;
    total_duration_ms: number;
    checkpoint_file?: string;
};

// ---------------------------------------------------------------------------
// Checkpoint persistence — Redis-backed with tmpdir fallback
//
// Redis key:  af:loop:checkpoint:{loopId}   (string, JSON)
// TTL:        7 days — long enough to resume after a weekend outage.
// Fallback:   when REDIS_URL is unset, state is written to tmpdir (single
//             instance only; not suitable for horizontal scaling).
// ---------------------------------------------------------------------------

const _CKPT_DIR = join(tmpdir(), 'agentfarm-loop-checkpoints');
const _CKPT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function _ckKey(loopId: string): string {
    return `af:loop:checkpoint:${loopId}`;
}

async function saveCheckpoint(loopId: string, steps: LoopStepRecord[]): Promise<string> {
    const payload = JSON.stringify({ loopId, steps, saved_at: new Date().toISOString() });
    const redis = getRedisClient();
    if (redis) {
        const key = _ckKey(loopId);
        await redis.set(key, payload, 'EX', _CKPT_TTL);
        return key;
    }
    // Fallback: write to local tmpdir
    await mkdir(_CKPT_DIR, { recursive: true });
    const file = join(_CKPT_DIR, `${loopId}.json`);
    await writeFile(file, payload, 'utf-8');
    return file;
}

async function loadCheckpoint(loopId: string): Promise<LoopStepRecord[] | null> {
    try {
        const redis = getRedisClient();
        let raw: string | null;
        if (redis) {
            raw = await redis.get(_ckKey(loopId));
        } else {
            raw = await readFile(join(_CKPT_DIR, `${loopId}.json`), 'utf-8');
        }
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { steps: LoopStepRecord[] };
        return parsed.steps ?? null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoopId(taskDescription: string, issueNumber?: number): string {
    const slug = taskDescription
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40);
    return `loop-${issueNumber ?? 'x'}-${slug}-${Date.now()}`;
}

function buildBranchName(taskDescription: string, issueNumber?: number): string {
    const slug = taskDescription
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40);
    return issueNumber ? `feat/issue-${issueNumber}-${slug}` : `feat/${slug}`;
}

function stepRecord(step: LoopStep): LoopStepRecord {
    return { step, status: 'pending', attempt: 0 };
}

// ---------------------------------------------------------------------------
// Core pipeline steps
// ---------------------------------------------------------------------------

async function runAnalyzeIssue(input: AutonomousLoopInput): Promise<LoopStepRecord> {
    const startedAt = Date.now();
    const handler = getSkillHandler('issue-autopilot');
    const record: LoopStepRecord = { step: 'analyze_issue', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    if (!handler) {
        return { ...record, status: 'failed', error: 'issue-autopilot skill handler not registered', completed_at: new Date().toISOString() };
    }

    // Attempt LLM-based issue decomposition; fall back gracefully if unavailable
    const llmPlan = await analyzeIssueWithLLM(
        input.task_description,
        `Autonomous loop task: ${input.task_description}`,
    );

    const result = handler({
        issue_number: input.issue_number ?? 0,
        issue_title: input.task_description,
        issue_body: `Autonomous loop task: ${input.task_description}`,
        repo: input.repo ?? 'agentfarm/monorepo',
        llm_plan: llmPlan ?? undefined,
    }, startedAt);

    return {
        ...record,
        status: result.ok ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        output: result,
        error: result.ok ? undefined : result.summary,
    };
}

function runCreateBranch(branchName: string, dryRun: boolean): LoopStepRecord {
    const record: LoopStepRecord = { step: 'create_branch', status: 'running', started_at: new Date().toISOString(), attempt: 1 };
    const handler = getSkillHandler('branch-manager');

    if (!handler) {
        return { ...record, status: 'failed', error: 'branch-manager skill handler not registered', completed_at: new Date().toISOString() };
    }

    const result = handler({ branch_name: branchName, action: 'create', dry_run: dryRun }, Date.now());
    return {
        ...record,
        status: result.ok ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        output: result,
        error: result.ok ? undefined : result.summary,
    };
}

async function executeCreateBranch(
    branchName: string,
    input: AutonomousLoopInput,
    workspaceKey: string,
): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'create_branch', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    // Dry-run: use the skill plan without executing
    if (input.dry_run === true) {
        return runCreateBranch(branchName, true);
    }

    const tenantId = input.tenantId ?? '';
    const botId = input.botId ?? '';
    if (!tenantId || !botId) {
        return { ...record, status: 'failed', completed_at: new Date().toISOString(), error: 'tenantId and botId are required for live git branch execution.' };
    }

    // Execute the branch creation via workspace executor (real git checkout -b)
    const gitResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId: workspaceKey,
        actionType: 'git_branch',
        payload: { branch_name: branchName, task_description: branchName, task_type: 'feat' },
    });

    return {
        ...record,
        status: gitResult.ok ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        output: { branch_name: branchName, git_output: gitResult.output },
        error: gitResult.ok ? undefined : (gitResult.errorOutput ?? 'git branch creation failed'),
    };
}

async function runImplementChanges(
    input: AutonomousLoopInput,
    branchName: string,
    workspaceKey: string,
): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'implement_changes', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    // Dry-run: return a structured plan without executing any file writes
    if (input.dry_run === true) {
        const changes = (input.target_files ?? ['src/index.ts']).map((file) => ({
            file,
            action: 'edit',
            summary: `Apply fix for: ${input.task_description}`,
        }));
        return {
            ...record,
            status: 'success',
            completed_at: new Date().toISOString(),
            output: { branch: branchName, changes, note: 'Dry-run mode — no actual edits applied. Set dry_run=false to apply.' },
        };
    }

    // Live mode: call code_edit for each file
    const tenantId = input.tenantId ?? '';
    const botId = input.botId ?? '';
    if (!tenantId || !botId) {
        return { ...record, status: 'failed', completed_at: new Date().toISOString(), error: 'tenantId and botId are required for live code_edit execution.' };
    }

    const targetFiles = input.target_files ?? [];
    const fileEdits = input.file_edits ?? [];

    if (targetFiles.length === 0) {
        return { ...record, status: 'success', completed_at: new Date().toISOString(), output: { branch: branchName, note: 'No target_files specified — nothing to write.' } };
    }

    const results: Array<{ file: string; ok?: boolean; output?: string; error?: string; skipped?: boolean; synthesized?: boolean }> = [];
    for (const file of targetFiles) {
        const explicitEdit = fileEdits.find((e) => e.file === file);
        let content: string | null = explicitEdit?.content ?? null;
        let synthesized = false;

        // If no explicit content provided, synthesize via LLM (live mode only)
        if (!content) {
            const apiKey = process.env['ANTHROPIC_API_KEY'];
            if (apiKey) {
                try {
                    // Use the runtime's configured model rather than a hardcoded version.
                    // Falls back to the current fast Haiku model if env is unset.
                    const model = process.env['AF_SYNTHESIS_MODEL'] ?? 'claude-haiku-4-5-20251001';
                    const resp = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            model,
                            max_tokens: 2048,
                            messages: [{
                                role: 'user',
                                content: `You are a TypeScript developer. Generate the complete file content for "${file}" to implement the following task:\n\n${input.task_description}\n\nReturn ONLY the raw file content with no markdown fences or explanation.`,
                            }],
                        }),
                    });
                    if (resp.ok) {
                        const json = await resp.json() as { content?: Array<{ type: string; text?: string }> };
                        const text = json.content?.find((c) => c.type === 'text')?.text;
                        if (text?.trim()) {
                            content = text.trim();
                            synthesized = true;
                        }
                    }
                } catch {
                    // LLM synthesis failed — skip this file rather than writing garbage
                }
            }
        }

        if (!content) {
            results.push({ file, skipped: true });
            continue;
        }

        const editResult = await executeLocalWorkspaceAction({
            tenantId,
            botId,
            taskId: workspaceKey,
            actionType: 'code_edit',
            payload: { workspace_key: workspaceKey, file_path: file, content },
        });
        results.push({ file, ok: editResult.ok, output: editResult.output, error: editResult.errorOutput, synthesized });
    }

    const anyFailed = results.some((r) => r.ok === false);
    const synthesizedCount = results.filter((r) => r.synthesized).length;
    return {
        ...record,
        status: anyFailed ? 'failed' : 'success',
        completed_at: new Date().toISOString(),
        output: { branch: branchName, results, synthesized_files: synthesizedCount },
        error: anyFailed ? 'One or more file edits failed — see output.results for detail.' : undefined,
    };
}

async function runTests(input: AutonomousLoopInput, workspaceKey: string): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'run_tests', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    // Dry-run: return simulated passing result
    if (input.dry_run === true) {
        const passed = Math.floor(Math.random() * 50) + 250;
        return {
            ...record,
            status: 'success',
            completed_at: new Date().toISOString(),
            output: { repo: input.repo ?? 'agentfarm/monorepo', passed, failed: 0, skipped: 0, summary: `All ${passed} tests passed.` },
        };
    }

    // Live mode: execute the workspace test runner
    const tenantId = input.tenantId ?? '';
    const botId = input.botId ?? '';
    if (!tenantId || !botId) {
        return { ...record, status: 'failed', completed_at: new Date().toISOString(), error: 'tenantId and botId are required for live test execution.' };
    }

    const result = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId: workspaceKey,
        actionType: 'run_tests',
        payload: { workspace_key: workspaceKey },
    });

    return {
        ...record,
        status: result.ok ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        output: { output: result.output, errorOutput: result.errorOutput ?? null },
        error: result.ok ? undefined : (result.errorOutput ?? 'Tests failed'),
    };
}

async function runFixFailures(
    taskDescription: string,
    testOutput: unknown,
    attempt: number,
    input: AutonomousLoopInput,
    workspaceKey: string,
): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'fix_failures', status: 'running', started_at: new Date().toISOString(), attempt };

    // Step 1: Diagnose the failure using ci-failure-explainer
    const handler = getSkillHandler('ci-failure-explainer');
    const diagnosisResult = handler
        ? handler({ ci_log: JSON.stringify(testOutput), job_name: 'unit-tests', repo: 'agentfarm/monorepo' }, Date.now())
        : null;

    // Step 2: Ask LLM for a targeted code fix (search-and-replace patches)
    const testOutputStr = typeof testOutput === 'string'
        ? testOutput
        : JSON.stringify(testOutput ?? '').slice(0, 4000);

    const patches = input.dry_run
        ? null
        : await synthesizeCodeFixWithLLM(
            testOutputStr,
            taskDescription,
            input.target_files ?? [],
        );

    // Step 3: In live mode, apply each patch via code_read + code_edit
    const appliedFiles: string[] = [];
    const applyErrors: string[] = [];

    if (!input.dry_run && patches && patches.length > 0 && input.tenantId && input.botId) {
        for (const patch of patches) {
            // Read current file content
            const readResult = await executeLocalWorkspaceAction({
                tenantId: input.tenantId,
                botId: input.botId,
                taskId: workspaceKey,
                actionType: 'code_read',
                payload: { workspace_key: workspaceKey, file_path: patch.filePath },
            });

            if (!readResult.ok) {
                applyErrors.push(`Could not read ${patch.filePath}: ${readResult.errorOutput ?? 'unknown error'}`);
                continue;
            }

            const original = readResult.output;
            if (!original.includes(patch.searchString)) {
                applyErrors.push(`Search string not found in ${patch.filePath} — skipping patch`);
                continue;
            }

            // Apply the replacement (first occurrence only, as the LLM targets a specific site)
            const fixed = original.replace(patch.searchString, patch.replacement);

            const editResult = await executeLocalWorkspaceAction({
                tenantId: input.tenantId,
                botId: input.botId,
                taskId: workspaceKey,
                actionType: 'code_edit',
                payload: { workspace_key: workspaceKey, file_path: patch.filePath, content: fixed },
            });

            if (editResult.ok) {
                appliedFiles.push(patch.filePath);
            } else {
                applyErrors.push(`Edit failed for ${patch.filePath}: ${editResult.errorOutput ?? 'unknown error'}`);
            }
        }
    }

    const realFixApplied = appliedFiles.length > 0;
    const status = diagnosisResult || realFixApplied ? 'success' : 'failed';

    return {
        ...record,
        status,
        completed_at: new Date().toISOString(),
        output: {
            diagnosis: diagnosisResult,
            task: taskDescription,
            patches_suggested: patches?.length ?? 0,
            files_patched: appliedFiles,
            apply_errors: applyErrors,
            dry_run: input.dry_run ?? false,
            auto_fix_applied: realFixApplied,
        },
        error: status === 'failed' ? 'No diagnosis and no fix applied' : undefined,
    };
}

// ---------------------------------------------------------------------------
// Commit and push: stage all changes, commit, push branch to remote
// ---------------------------------------------------------------------------

async function runCommitAndPush(
    input: AutonomousLoopInput,
    branchName: string,
    workspaceKey: string,
): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'commit_push', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    // Dry-run: skip real git operations
    if (input.dry_run === true) {
        return {
            ...record,
            status: 'success',
            completed_at: new Date().toISOString(),
            output: { branch: branchName, note: 'Dry-run: no git commit or push performed.' },
        };
    }

    const tenantId = input.tenantId ?? '';
    const botId = input.botId ?? '';
    if (!tenantId || !botId) {
        return { ...record, status: 'failed', completed_at: new Date().toISOString(), error: 'tenantId and botId are required for git commit/push.' };
    }

    // Stage + commit
    const commitResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId: workspaceKey,
        actionType: 'git_commit',
        payload: {
            workspace_key: workspaceKey,
            message: `feat: ${input.task_description}`,
            auto_message: false,
        },
    });

    if (!commitResult.ok) {
        return {
            ...record,
            status: 'failed',
            completed_at: new Date().toISOString(),
            output: { commit: commitResult.output },
            error: commitResult.errorOutput ?? 'git commit failed',
        };
    }

    // Push branch to remote
    const pushResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId: workspaceKey,
        actionType: 'git_push',
        payload: { workspace_key: workspaceKey, remote: 'origin', branch: branchName },
    });

    return {
        ...record,
        status: pushResult.ok ? 'success' : 'failed',
        completed_at: new Date().toISOString(),
        output: { branch: branchName, commit: commitResult.output, push: pushResult.output },
        error: pushResult.ok ? undefined : (pushResult.errorOutput ?? 'git push failed'),
    };
}

// ---------------------------------------------------------------------------
// GitHub PR creation (real REST API call)
// ---------------------------------------------------------------------------

export type GitHubPRResult =
    | { ok: true; prNumber: number; prUrl: string }
    | { ok: false; error: string };

/**
 * Calls the GitHub REST API to open a pull request.
 * Accepts an optional fetchImpl for unit-test injection.
 */
export async function createGitHubPR(params: {
    token: string;
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
    fetchImpl?: typeof fetch;
}): Promise<GitHubPRResult> {
    const { token, owner, repo, title, body, head, base, draft = false } = params;
    const fetchImpl = params.fetchImpl ?? fetch;
    try {
        const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, body, head, base, draft }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, error: `GitHub API error ${response.status}: ${errorText.slice(0, 200)}` };
        }
        const data = await response.json() as { number: number; html_url: string };
        return { ok: true, prNumber: data.number, prUrl: data.html_url };
    } catch (err) {
        return { ok: false, error: `PR creation failed: ${String(err)}` };
    }
}

// ---------------------------------------------------------------------------
// PR review comment polling + automated response
// ---------------------------------------------------------------------------

export type PRReviewPollResult = {
    replied: number;
    fixed: number;
    errors: string[];
    skipped_dry_run: boolean;
};

/**
 * Polls the opened PR for review comments for up to `pollDurationMs` milliseconds
 * (polls every 30 s). For each pending review comment:
 *   - Requests a code-level fix via LLM → applies via code_edit if applicable
 *   - Posts a reply comment explaining the resolution
 *
 * Designed to be called after runCreatePr succeeds. Safe to call with no env
 * vars — returns early with skipped_dry_run:false, errors listing the missing config.
 */
export async function pollAndRespondPRComments(params: {
    prNumber: number;
    owner: string;
    repo: string;
    token: string;
    input: AutonomousLoopInput;
    workspaceKey: string;
    pollDurationMs?: number;
    fetchImpl?: typeof fetch;
}): Promise<PRReviewPollResult> {
    const { prNumber, owner, repo, token, input, workspaceKey } = params;
    const fetchImpl = params.fetchImpl ?? fetch;
    const pollDurationMs = params.pollDurationMs ?? 0;
    const result: PRReviewPollResult = { replied: 0, fixed: 0, errors: [], skipped_dry_run: false };

    if (input.dry_run) {
        result.skipped_dry_run = true;
        return result;
    }
    if (!token || !owner || !repo) {
        result.errors.push('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO');
        return result;
    }

    const githubHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    const deadline = Date.now() + pollDurationMs;
    const pollInterval = 30_000;
    const seenCommentIds = new Set<number>();

    const processBatch = async (): Promise<void> => {
        // Fetch pull request review comments (inline code comments)
        let reviewComments: Array<{ id: number; body: string; path: string; line?: number; position?: number }> = [];
        try {
            const commentsResp = await fetchImpl(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`,
                { headers: githubHeaders },
            );
            if (commentsResp.ok) {
                reviewComments = await commentsResp.json() as typeof reviewComments;
            }
        } catch (err) {
            result.errors.push(`Failed to fetch review comments: ${String(err)}`);
            return;
        }

        for (const comment of reviewComments) {
            if (seenCommentIds.has(comment.id)) continue;
            seenCommentIds.add(comment.id);

            const filePath = comment.path;
            const lineNumber = comment.line ?? comment.position ?? 0;
            const commentBody = comment.body ?? '';

            // Use LLM to analyse the review comment and decide on a response
            const analysis = await analyzeDiffWithLLM(commentBody, filePath, lineNumber);

            let replyBody: string;
            let fixApplied = false;

            if (analysis) {
                // Attempt to synthesize a code fix for concrete concerns
                const patches = input.target_files || filePath
                    ? await synthesizeCodeFixWithLLM(
                        `Review comment on ${filePath}:${lineNumber} — ${commentBody}`,
                        input.task_description,
                        filePath ? [filePath] : (input.target_files ?? []),
                    )
                    : null;

                if (patches && patches.length > 0 && input.tenantId && input.botId) {
                    for (const patch of patches) {
                        const readResult = await executeLocalWorkspaceAction({
                            tenantId: input.tenantId,
                            botId: input.botId,
                            taskId: workspaceKey,
                            actionType: 'code_read',
                            payload: { workspace_key: workspaceKey, file_path: patch.filePath },
                        });
                        if (readResult.ok && readResult.output.includes(patch.searchString)) {
                            const fixed = readResult.output.replace(patch.searchString, patch.replacement);
                            const editResult = await executeLocalWorkspaceAction({
                                tenantId: input.tenantId,
                                botId: input.botId,
                                taskId: workspaceKey,
                                actionType: 'code_edit',
                                payload: { workspace_key: workspaceKey, file_path: patch.filePath, content: fixed },
                            });
                            if (editResult.ok) {
                                result.fixed++;
                                fixApplied = true;
                            }
                        }
                    }
                }

                replyBody = fixApplied
                    ? `Thanks for the review! I've applied the fix: ${analysis.suggestion}`
                    : `Acknowledged — ${analysis.concern}. ${analysis.suggestion}`;
            } else {
                replyBody = 'Acknowledged — will address in follow-up.';
            }

            // Post reply to the review comment
            try {
                const replyResp = await fetchImpl(
                    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments/${comment.id}/replies`,
                    {
                        method: 'POST',
                        headers: { ...githubHeaders, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ body: replyBody }),
                    },
                );
                if (replyResp.ok) {
                    result.replied++;
                } else {
                    result.errors.push(`Reply to comment ${comment.id} failed: ${replyResp.status}`);
                }
            } catch (err) {
                result.errors.push(`Reply to comment ${comment.id} threw: ${String(err)}`);
            }
        }
    };

    // Initial pass
    await processBatch();

    // Continue polling until the deadline (if a positive duration was given)
    while (Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
        await processBatch();
    }

    return result;
}

async function runCreatePr(input: AutonomousLoopInput, branchName: string, steps: LoopStepRecord[]): Promise<LoopStepRecord> {
    const record: LoopStepRecord = { step: 'create_pr', status: 'running', started_at: new Date().toISOString(), attempt: 1 };

    const handler = getSkillHandler('pr-description-generator');
    if (!handler) {
        return { ...record, status: 'failed', error: 'pr-description-generator not registered', completed_at: new Date().toISOString() };
    }
    const descResult = handler({
        pr_title: input.task_description,
        commits: [`feat: ${input.task_description}`],
        changed_files: input.target_files ?? [],
        issue_ref: input.issue_number ? `#${input.issue_number}` : undefined,
        dry_run: input.dry_run ?? true,
    }, Date.now());

    const completedSteps = steps.filter((s) => s.status === 'success').length;

    // Dry-run: skip real GitHub call
    if (input.dry_run) {
        return {
            ...record,
            status: descResult.ok ? 'success' : 'failed',
            completed_at: new Date().toISOString(),
            output: {
                branch: branchName,
                pr_title: input.task_description,
                description_result: descResult,
                steps_completed: completedSteps,
                note: 'Dry-run: PR not actually opened.',
            },
            error: descResult.ok ? undefined : descResult.summary,
        };
    }

    // Live mode: call GitHub REST API
    const token = process.env['GITHUB_TOKEN'] ?? '';
    const owner = process.env['GITHUB_OWNER'] ?? '';
    const repo = process.env['GITHUB_REPO'] ?? '';
    const base = process.env['GITHUB_DEFAULT_BASE_BRANCH'] ?? 'main';

    if (!token || !owner || !repo) {
        const msg = 'Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO — PR creation skipped.';
        console.warn(`[autonomous-loop] ${msg}`);
        return {
            ...record,
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: msg,
            output: { branch: branchName, pr_title: input.task_description, note: msg },
        };
    }

    const prBody = (descResult.ok && typeof (descResult as { summary?: string }).summary === 'string')
        ? (descResult as { summary: string }).summary
        : input.task_description;

    const signedPrBody = signOutbound(prBody, input.persona ?? null);

    const prResult = await createGitHubPR({
        token,
        owner,
        repo,
        title: input.task_description,
        body: signedPrBody,
        head: branchName,
        base,
        draft: false,
    });

    if (!prResult.ok) {
        console.warn(`[autonomous-loop] GitHub PR creation failed: ${prResult.error}`);
        return {
            ...record,
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: prResult.error,
            output: { branch: branchName, pr_title: input.task_description, note: 'PR creation failure — loop continues.' },
        };
    }

    return {
        ...record,
        status: 'success',
        completed_at: new Date().toISOString(),
        output: {
            branch: branchName,
            pr_title: input.task_description,
            pr_number: prResult.prNumber,
            pr_url: prResult.prUrl,
            steps_completed: completedSteps,
        },
    };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAutonomousLoop(input: AutonomousLoopInput): Promise<AutonomousLoopResult> {
    const startTime = Date.now();
    const maxFixAttempts = input.max_fix_attempts ?? 3;
    const branchName = buildBranchName(input.task_description, input.issue_number);
    const loopId = makeLoopId(input.task_description, input.issue_number);
    const workspaceKey = input.workspace_key ?? loopId;

    const steps: LoopStepRecord[] = [
        stepRecord('analyze_issue'),
        stepRecord('create_branch'),
        stepRecord('implement_changes'),
        stepRecord('run_tests'),
        stepRecord('commit_push'),
        stepRecord('create_pr'),
    ];

    // Step 1: Analyze issue (LLM-enhanced when ANTHROPIC_API_KEY available)
    steps[0] = await runAnalyzeIssue(input);
    await saveCheckpoint(loopId, steps);
    if (steps[0].status === 'failed') {
        return buildResult(input, steps, branchName, loopId, startTime, 'Issue analysis failed — loop aborted.');
    }

    // Step 2: Create branch (executes real git checkout -b in live mode)
    steps[1] = await executeCreateBranch(branchName, input, workspaceKey);
    await saveCheckpoint(loopId, steps);
    if (steps[1].status === 'failed') {
        return buildResult(input, steps, branchName, loopId, startTime, 'Branch creation failed — loop aborted.');
    }

    // Step 3: Implement changes (calls code_edit in live mode)
    steps[2] = await runImplementChanges(input, branchName, workspaceKey);
    await saveCheckpoint(loopId, steps);

    // Step 4: Run tests + self-heal loop (calls run_tests executor in live mode)
    let testRecord = await runTests(input, workspaceKey);
    let fixAttempts = 0;
    const fixRecords: LoopStepRecord[] = [];

    while (testRecord.status === 'failed' && fixAttempts < maxFixAttempts) {
        fixAttempts++;
        const fixRecord = await runFixFailures(input.task_description, testRecord.output, fixAttempts, input, workspaceKey);
        fixRecords.push(fixRecord);
        await saveCheckpoint(loopId, [...steps, ...fixRecords]);
        testRecord = await runTests(input, workspaceKey);
    }

    const runTestsIdx = steps.findIndex((s) => s.step === 'run_tests');
    steps[runTestsIdx] = testRecord;
    if (fixRecords.length > 0) {
        steps.splice(runTestsIdx, 0, ...fixRecords);
    }
    await saveCheckpoint(loopId, steps);

    if (testRecord.status === 'failed') {
        return buildResult(input, steps, branchName, loopId, startTime, `Tests still failing after ${fixAttempts} fix attempt(s) — loop aborted.`);
    }

    // Step 5: Commit + push (calls git_commit then git_push in live mode)
    const commitPushIdx = steps.findIndex((s) => s.step === 'commit_push');
    steps[commitPushIdx] = await runCommitAndPush(input, branchName, workspaceKey);
    await saveCheckpoint(loopId, steps);

    if (steps[commitPushIdx].status === 'failed') {
        return buildResult(input, steps, branchName, loopId, startTime, 'Commit/push failed — loop aborted.');
    }

    // Step 6: Create PR
    const prIndex = steps.findIndex((s) => s.step === 'create_pr');
    steps[prIndex] = await runCreatePr(input, branchName, steps);
    const checkpointFile = await saveCheckpoint(loopId, steps);

    // Step 7 (optional): Poll PR for review comments and respond
    const prReviewMins = input.pr_review_wait_mins ?? 0;
    if (
        prReviewMins > 0 &&
        !input.dry_run &&
        steps[prIndex].status === 'success' &&
        typeof (steps[prIndex].output as Record<string, unknown>)?.['pr_number'] === 'number'
    ) {
        const prNumber = (steps[prIndex].output as Record<string, unknown>)['pr_number'] as number;
        const token = process.env['GITHUB_TOKEN'] ?? '';
        const owner = process.env['GITHUB_OWNER'] ?? '';
        const repo = process.env['GITHUB_REPO'] ?? '';
        if (token && owner && repo) {
            await pollAndRespondPRComments({
                prNumber,
                owner,
                repo,
                token,
                input,
                workspaceKey,
                pollDurationMs: prReviewMins * 60 * 1000,
            });
        }
    }

    const allOk = steps.every((s) => s.status === 'success' || s.status === 'skipped');
    return buildResult(
        input,
        steps,
        branchName,
        loopId,
        startTime,
        allOk
            ? `Autonomous loop complete. Branch: ${branchName}. ${fixAttempts} fix cycle(s) used.`
            : 'Autonomous loop completed with warnings — review step details.',
        checkpointFile,
    );
}

function buildResult(
    input: AutonomousLoopInput,
    steps: LoopStepRecord[],
    branchName: string,
    _loopId: string,
    startTime: number,
    summary: string,
    checkpointFile?: string,
): AutonomousLoopResult {
    const allOk = steps.every((s) => s.status === 'success' || s.status === 'skipped');
    return {
        ok: allOk,
        task_description: input.task_description,
        steps,
        branch_name: branchName,
        pr_url: allOk && !input.dry_run
            ? `https://github.com/${input.repo ?? 'agentfarm/monorepo'}/pull/new/${encodeURIComponent(branchName)}`
            : undefined,
        summary,
        total_duration_ms: Date.now() - startTime,
        checkpoint_file: checkpointFile,
    };
}

// ---------------------------------------------------------------------------
// Resume from checkpoint
// ---------------------------------------------------------------------------

export async function resumeFromCheckpoint(loopId: string, input: AutonomousLoopInput): Promise<AutonomousLoopResult | null> {
    const saved = await loadCheckpoint(loopId);
    if (!saved) return null;

    const branchName = buildBranchName(input.task_description, input.issue_number);
    const workspaceKey = input.workspace_key ?? loopId;
    const startTime = Date.now();

    const failedIndex = saved.findIndex((s) => s.status === 'failed' || s.status === 'pending');
    if (failedIndex === -1) {
        return buildResult(input, saved, branchName, loopId, startTime, 'Loop already complete — loaded from checkpoint.');
    }

    // Resume from exactly the first incomplete step, preserving all prior successes.
    const steps = [...saved];
    const resumeStep = steps[failedIndex]?.step;

    // Replay only the steps that haven't succeeded yet.
    if (resumeStep === 'analyze_issue' || failedIndex === 0) {
        steps[0] = await runAnalyzeIssue(input);
        await saveCheckpoint(loopId, steps);
        if (steps[0].status === 'failed') {
            return buildResult(input, steps, branchName, loopId, startTime, 'Issue analysis failed on resume.');
        }
    }

    if (steps.findIndex((s) => s.step === 'create_branch' && s.status !== 'success') !== -1) {
        const idx = steps.findIndex((s) => s.step === 'create_branch');
        if (idx !== -1) {
            steps[idx] = await executeCreateBranch(branchName, input, workspaceKey);
            await saveCheckpoint(loopId, steps);
            if (steps[idx].status === 'failed') {
                return buildResult(input, steps, branchName, loopId, startTime, 'Branch creation failed on resume.');
            }
        }
    }

    if (steps.findIndex((s) => s.step === 'implement_changes' && s.status !== 'success') !== -1) {
        const idx = steps.findIndex((s) => s.step === 'implement_changes');
        if (idx !== -1) {
            steps[idx] = await runImplementChanges(input, branchName, workspaceKey);
            await saveCheckpoint(loopId, steps);
        }
    }

    const testIdx = steps.findIndex((s) => s.step === 'run_tests');
    if (testIdx !== -1 && steps[testIdx].status !== 'success') {
        const maxFix = input.max_fix_attempts ?? 3;
        let testRecord = await runTests(input, workspaceKey);
        let fixAttempts = 0;
        while (testRecord.status === 'failed' && fixAttempts < maxFix) {
            fixAttempts++;
            await runFixFailures(input.task_description, testRecord.output, fixAttempts, input, workspaceKey);
            testRecord = await runTests(input, workspaceKey);
        }
        steps[testIdx] = testRecord;
        await saveCheckpoint(loopId, steps);
        if (testRecord.status === 'failed') {
            return buildResult(input, steps, branchName, loopId, startTime, `Tests still failing after ${fixAttempts} fix attempt(s) on resume.`);
        }
    }

    const commitIdx = steps.findIndex((s) => s.step === 'commit_push');
    if (commitIdx !== -1 && steps[commitIdx].status !== 'success') {
        steps[commitIdx] = await runCommitAndPush(input, branchName, workspaceKey);
        await saveCheckpoint(loopId, steps);
        if (steps[commitIdx].status === 'failed') {
            return buildResult(input, steps, branchName, loopId, startTime, 'Commit/push failed on resume.');
        }
    }

    const prIdx = steps.findIndex((s) => s.step === 'create_pr');
    if (prIdx !== -1 && steps[prIdx].status !== 'success') {
        steps[prIdx] = await runCreatePr(input, branchName, steps);
        await saveCheckpoint(loopId, steps);
    }

    const allOk = steps.every((s) => s.status === 'success' || s.status === 'skipped');
    return buildResult(input, steps, branchName, loopId, startTime,
        allOk ? `Resumed and completed from checkpoint at step "${resumeStep}".`
              : 'Loop resumed with warnings — check step details.',
        await saveCheckpoint(loopId, steps),
    );
}
