// ============================================================================
// DEVELOPER ACTION HANDLER
// Sprint 16 — Developer Role
//
// Handles all workspace_dev_* action types by orchestrating the existing
// workspace executor primitives (passed in via executeAction) and the pure
// helper functions in this folder.
//
// Architecture:
//   - Pure orchestration: all I/O flows through executeAction / runCommand
//   - No direct LLM calls: analysis delegated to workspace_ai_code_review,
//     workspace_explain_code, workspace_semantic_search, etc.
//   - LLM prose (summaries, specs, commit messages) via callLlm when provided
//   - All public API: handleDeveloperAction(params) → LocalWorkspaceResult
// ============================================================================

import {
    buildDeveloperStandupSummary,
    buildSprintCeremonyContext,
    buildTechSpecOutline,
    type SprintCeremonyType,
} from './developer-standup-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeveloperActionType =
    | 'workspace_dev_implement_feature'
    | 'workspace_dev_fix_bug'
    | 'workspace_dev_code_review'
    | 'workspace_dev_refactor'
    | 'workspace_dev_write_tests'
    | 'workspace_dev_debug_session'
    | 'workspace_dev_create_pr'
    | 'workspace_dev_handle_issue'
    | 'workspace_dev_branch_manage'
    | 'workspace_dev_commit'
    | 'workspace_dev_security_audit'
    | 'workspace_dev_dependency_audit'
    | 'workspace_dev_performance_audit'
    | 'workspace_dev_code_quality'
    | 'workspace_dev_api_design'
    | 'workspace_dev_db_migration'
    | 'workspace_dev_onboard_codebase'
    | 'workspace_dev_standup_report'
    | 'workspace_dev_incident_response'
    | 'workspace_dev_tech_spec';

export const DEVELOPER_ACTION_TYPES = new Set<DeveloperActionType>([
    'workspace_dev_implement_feature',
    'workspace_dev_fix_bug',
    'workspace_dev_code_review',
    'workspace_dev_refactor',
    'workspace_dev_write_tests',
    'workspace_dev_debug_session',
    'workspace_dev_create_pr',
    'workspace_dev_handle_issue',
    'workspace_dev_branch_manage',
    'workspace_dev_commit',
    'workspace_dev_security_audit',
    'workspace_dev_dependency_audit',
    'workspace_dev_performance_audit',
    'workspace_dev_code_quality',
    'workspace_dev_api_design',
    'workspace_dev_db_migration',
    'workspace_dev_onboard_codebase',
    'workspace_dev_standup_report',
    'workspace_dev_incident_response',
    'workspace_dev_tech_spec',
]);

export function isDeveloperActionType(at: string): at is DeveloperActionType {
    return DEVELOPER_ACTION_TYPES.has(at as DeveloperActionType);
}

export type DevActionResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
    [key: string]: unknown;
};

/** Minimal result from executeAction — mirrors LocalWorkspaceResult */
type SubResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
};

type ExecuteActionFn = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<SubResult>;

type RunCommandFn = (
    args: string[],
    cwd: string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface DeveloperActionParams {
    actionType:       DeveloperActionType;
    tenantId:         string;
    botId:            string;
    taskId:           string;
    payload:          Record<string, unknown>;
    workspaceDir:     string;
    executeAction:    ExecuteActionFn;
    runCommand?:      RunCommandFn;
    callLlm?:         LlmCallFn;
    /** Optional — when provided, RAG context is fetched and injected into every LLM call. */
    gatewayBaseUrl?:  string;
    serviceToken?:    string;
    workspaceId?:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(obj: Record<string, unknown>): DevActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function num(v: unknown, fallback = 0): number {
    return typeof v === 'number' ? v : fallback;
}

async function callLlmSafe(callLlm: LlmCallFn | undefined, prompt: string, systemPrompt?: string): Promise<string> {
    if (!callLlm) return '';
    try {
        return await callLlm(prompt, systemPrompt);
    } catch {
        return '';
    }
}

/** Parse JSON from a sub-action result safely. */
function parseSubOutput(result: SubResult): Record<string, unknown> {
    try {
        return JSON.parse(result.output) as Record<string, unknown>;
    } catch {
        return {};
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleDeveloperAction(
    params: DeveloperActionParams,
): Promise<DevActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand,
            callLlm: rawCallLlm, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = params;

    // RAG pre-flight — wrap callLlm with architecture patterns and past implementation context
    let callLlm = rawCallLlm;
    if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildDeveloperRagContext } = await import('./developer-rag-retriever.js');
            const ragCtx = await buildDeveloperRagContext(
                {
                    tenantId, botId,
                    taskTitle: String(payload['title'] ?? payload['description'] ?? actionType),
                    taskDescription: String(payload['description'] ?? ''),
                    documentType: 'feature_implementation',
                },
                gatewayBaseUrl, serviceToken, workspaceId,
            );
            if (ragCtx.contextBlock) {
                callLlm = (prompt: string, sys?: string): Promise<string> =>
                    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) {

        // ====================================================================
        // workspace_dev_implement_feature
        // Full feature implementation from an issue number, spec, or description.
        // Delegates to workspace_github_issue_fix (which runs the autonomous loop).
        //
        // payload:
        //   issue_number?     — GitHub issue number to implement
        //   description?      — natural-language feature description
        //   target_files?     — string[] hint files to modify
        //   repo?             — owner/repo slug
        //   branch?           — target branch name override
        //   dry_run?          — if true, produce a plan only, no file edits
        // ====================================================================
        case 'workspace_dev_implement_feature': {
            const issueNumber = typeof payload['issue_number'] === 'number' ? payload['issue_number'] : null;
            const description = str(payload['description']);
            const repo        = str(payload['repo']);
            const dryRun      = payload['dry_run'] === true;

            if (!issueNumber && !description) {
                return { ok: false, output: '', errorOutput: 'payload.issue_number or payload.description is required.' };
            }

            // Prefer GitHub issue fix when an issue number is provided
            if (issueNumber) {
                const result = await executeAction('workspace_github_issue_fix', {
                    issue_number: issueNumber,
                    repo,
                    dry_run: dryRun,
                    target_files: payload['target_files'],
                });
                const data = parseSubOutput(result);
                return safeJson({
                    issue_number: issueNumber,
                    ok:            result.ok,
                    summary:       data['summary'] ?? (result.ok ? 'Feature implemented.' : 'Implementation failed.'),
                    pr_url:        data['pr_url'] ?? null,
                    files_changed: data['files_changed'] ?? [],
                    dry_run:       dryRun,
                });
            }

            // No issue number — delegate to workspace_subagent_spawn which accepts a
            // natural-language prompt natively: it reads the target files, calls the
            // injected LLM code-gen function to generate real code_edit steps, runs
            // tests to verify, and retries with LLM-generated fixes on failure.
            // (workspace_autonomous_plan_execute requires a pre-built plan[] array and
            // would return an error here — this was the original bug.)
            const result = await executeAction('workspace_subagent_spawn', {
                prompt:        description,
                target_files:  payload['target_files'],
                test_command:  str(payload['test_command']),
                build_command: str(payload['build_command']),
                max_attempts:  typeof payload['max_attempts'] === 'number' ? payload['max_attempts'] : 3,
                dry_run:       dryRun,
            });
            const data = parseSubOutput(result);
            return safeJson({
                ok:            result.ok,
                summary:       data['summary'] ?? data['specialist_brief'] ?? (result.ok ? 'Feature implemented.' : 'Implementation failed.'),
                files_changed: data['files_changed'] ?? [],
                plan_source:   data['plan_source'] ?? 'subagent',
                dry_run:       dryRun,
            });
        }

        // ====================================================================
        // workspace_dev_fix_bug
        // Diagnose and fix a bug from error context, stack trace, or issue.
        //
        // payload:
        //   error_message?    — error text or stack trace
        //   issue_number?     — GitHub issue number
        //   file_path?        — file where the bug is suspected
        //   description?      — natural-language description of the bug
        //   repo?             — owner/repo slug
        //   dry_run?          — plan only
        // ====================================================================
        case 'workspace_dev_fix_bug': {
            const errorMsg    = str(payload['error_message']);
            const issueNumber = typeof payload['issue_number'] === 'number' ? payload['issue_number'] : null;
            const filePath    = str(payload['file_path']);
            const description = str(payload['description']);
            const dryRun      = payload['dry_run'] === true;

            if (!errorMsg && !issueNumber && !description) {
                return { ok: false, output: '', errorOutput: 'payload.error_message, issue_number, or description is required.' };
            }

            // Step 1: locate the error in the codebase if a file isn't given
            let contextSnippet = '';
            if (!filePath && errorMsg) {
                const grepResult = await executeAction('workspace_grep', {
                    pattern: errorMsg.split('\n')[0]?.slice(0, 80) ?? errorMsg.slice(0, 80),
                    max_results: 5,
                });
                contextSnippet = grepResult.output.slice(0, 400);
            }

            // Step 2: delegate to issue fix or autonomous loop
            if (issueNumber) {
                const result = await executeAction('workspace_github_issue_fix', {
                    issue_number: issueNumber,
                    repo:         str(payload['repo']),
                    dry_run:      dryRun,
                });
                const data = parseSubOutput(result);
                return safeJson({
                    issue_number:    issueNumber,
                    ok:              result.ok,
                    summary:         data['summary'] ?? (result.ok ? 'Bug fixed.' : 'Fix failed.'),
                    pr_url:          data['pr_url'] ?? null,
                    files_changed:   data['files_changed'] ?? [],
                    context_snippet: contextSnippet,
                    dry_run:         dryRun,
                });
            }

            const fixPrompt = [
                description && `Bug description: ${description}`,
                errorMsg && `Error: ${errorMsg.slice(0, 400)}`,
                contextSnippet && `Grep context:\n${contextSnippet}`,
            ].filter(Boolean).join('\n\n');

            // workspace_autonomous_plan_execute requires a pre-built plan[] array and
            // would return an error here — use workspace_subagent_spawn which accepts
            // a natural-language prompt natively (same fix as implement_feature).
            const result = await executeAction('workspace_subagent_spawn', {
                prompt:       fixPrompt,
                target_files: filePath ? [filePath] : undefined,
                dry_run:      dryRun,
            });
            const data = parseSubOutput(result);
            return safeJson({
                ok:            result.ok,
                summary:       data['summary'] ?? data['specialist_brief'] ?? (result.ok ? 'Bug fixed.' : 'Fix failed.'),
                files_changed: data['files_changed'] ?? [],
                plan_source:   data['plan_source'] ?? 'subagent',
                dry_run:       dryRun,
            });
        }

        // ====================================================================
        // workspace_dev_code_review
        // Review a PR or file diff with detailed inline comments.
        //
        // payload:
        //   pr_number?     — PR number to review
        //   file_path?     — single file to review
        //   diff?          — raw diff string
        //   focus?         — "security" | "performance" | "style" | "correctness" | "all"
        //   repo?          — owner/repo slug
        // ====================================================================
        case 'workspace_dev_code_review': {
            const prNumber = typeof payload['pr_number'] === 'number' ? payload['pr_number'] : null;
            const filePath = str(payload['file_path']);
            const focus    = str(payload['focus'], 'all');

            // Prepare the review using pr_review_prepare or ai_code_review
            let reviewResult: SubResult;
            if (prNumber) {
                reviewResult = await executeAction('workspace_pr_review_prepare', {
                    pr_number: prNumber,
                    repo:      str(payload['repo']),
                    focus,
                });
            } else {
                reviewResult = await executeAction('workspace_ai_code_review', {
                    file_path: filePath,
                    diff:      payload['diff'],
                    focus,
                });
            }

            const data = parseSubOutput(reviewResult);

            // Enrich with LLM summary if available
            let reviewSummary = str(data['summary'] ?? data['output']);
            if (callLlm && reviewResult.ok && reviewSummary) {
                const enriched = await callLlmSafe(
                    callLlm,
                    `You are a senior software engineer reviewing code.\n\nCode review output:\n${reviewSummary.slice(0, 2000)}\n\nWrite a concise, actionable review summary with:\n1. Must-fix issues (list each)\n2. Suggestions (optional improvements)\n3. Overall verdict (Approved / Changes Required / Needs Major Rework)`,
                    'Output plain markdown. Be specific and constructive.',
                );
                if (enriched) reviewSummary = enriched;
            }

            const mustFixCount   = num(data['must_fix_count']);
            const suggestionCount = num(data['suggestion_count']);

            return safeJson({
                ok:               reviewResult.ok,
                pr_number:        prNumber,
                file_path:        filePath,
                focus,
                summary:          reviewSummary,
                must_fix_count:   mustFixCount,
                suggestion_count: suggestionCount,
                comments:         data['comments'] ?? [],
                verdict:          mustFixCount > 0 ? 'changes_requested' : 'approved',
            });
        }

        // ====================================================================
        // workspace_dev_refactor
        // Refactor a module or function while preserving external behaviour.
        //
        // payload:
        //   file_path?      — file to refactor
        //   scope?          — "function" | "module" | "class"
        //   goal?           — "readability" | "performance" | "extract_function" |
        //                     "remove_duplication" | "decompose"
        //   description?    — natural-language refactor description
        //   dry_run?        — plan only
        // ====================================================================
        case 'workspace_dev_refactor': {
            const filePath = str(payload['file_path']);
            const goal     = str(payload['goal'], 'readability');
            const dryRun   = payload['dry_run'] === true;

            const planResult = await executeAction('workspace_refactor_plan', {
                file_path: filePath,
                goal,
                description: payload['description'],
            });
            const planData = parseSubOutput(planResult);

            if (dryRun || !planResult.ok) {
                return safeJson({
                    ok:        planResult.ok,
                    dry_run:   true,
                    file_path: filePath,
                    goal,
                    plan:      planData['plan'] ?? planResult.output,
                });
            }

            // Execute the refactor via bulk refactor or atomic edit
            const execResult = await executeAction('workspace_bulk_refactor', {
                file_path: filePath,
                plan:      planData['plan'] ?? '',
                goal,
            });
            const execData = parseSubOutput(execResult);

            return safeJson({
                ok:            execResult.ok,
                file_path:     filePath,
                goal,
                plan:          planData['plan'] ?? '',
                files_changed: execData['files_changed'] ?? [filePath],
                summary:       execData['summary'] ?? (execResult.ok ? `Refactored ${filePath} for ${goal}.` : 'Refactor failed.'),
            });
        }

        // ====================================================================
        // workspace_dev_write_tests
        // Write unit or integration tests for a module, function, or feature.
        //
        // payload:
        //   file_path       — source file to write tests for
        //   test_framework? — "jest" | "vitest" | "pytest" | "go_test" | "junit" (auto-detected)
        //   test_type?      — "unit" | "integration" | "e2e" (default: unit)
        //   coverage_target?— 0–100 coverage % goal
        // ====================================================================
        case 'workspace_dev_write_tests': {
            const filePath      = str(payload['file_path']);
            const testType      = str(payload['test_type'], 'unit');
            const coverageTarget = num(payload['coverage_target'], 80);

            if (!filePath) {
                return { ok: false, output: '', errorOutput: 'payload.file_path is required for workspace_dev_write_tests.' };
            }

            const result = await executeAction('workspace_generate_test', {
                file_path:       filePath,
                test_type:       testType,
                test_framework:  payload['test_framework'],
                coverage_target: coverageTarget,
            });
            const data = parseSubOutput(result);

            return safeJson({
                ok:            result.ok,
                file_path:     filePath,
                test_file:     data['test_file'] ?? null,
                test_type:     testType,
                tests_written: data['tests_written'] ?? 0,
                coverage_estimate: data['coverage_estimate'] ?? null,
                summary:       data['summary'] ?? (result.ok ? `Tests written for ${filePath}.` : 'Test generation failed.'),
            });
        }

        // ====================================================================
        // workspace_dev_debug_session
        // Start an interactive debug session to diagnose a failing test or error.
        //
        // payload:
        //   error_message?  — error text or stack trace
        //   test_file?      — failing test file
        //   file_path?      — source file suspected to have the bug
        //   runtime?        — "node" | "python" | "go" (auto-detected)
        // ====================================================================
        case 'workspace_dev_debug_session': {
            const errorMsg = str(payload['error_message']);
            const testFile = str(payload['test_file']);
            const filePath = str(payload['file_path']);

            // 1. Explain the error
            const explainResult = await executeAction('workspace_explain_code', {
                file_path:  filePath || testFile,
                question:   errorMsg || 'What is the root cause of the failing test?',
            });
            const explanation = explainResult.output.slice(0, 800);

            // 2. Start a debug session if we have a concrete target
            let sessionData: Record<string, unknown> = {};
            if (filePath) {
                const sessionStart = await executeAction('workspace_debug_session_start', {
                    file_path: filePath,
                    runtime:   payload['runtime'],
                });
                sessionData = parseSubOutput(sessionStart);
            }

            // 3. Ask LLM for fix suggestions
            let fixSuggestion = '';
            if (callLlm && errorMsg) {
                fixSuggestion = await callLlmSafe(
                    callLlm,
                    `Debug session context:\nError: ${errorMsg.slice(0, 400)}\nCode explanation: ${explanation.slice(0, 600)}\n\nProvide a concise root-cause analysis and the most likely fix in 3–5 bullet points.`,
                    'You are a senior engineer debugging a production issue. Be specific and concise.',
                );
            }

            return safeJson({
                ok:             true,
                error_message:  errorMsg,
                file_path:      filePath,
                test_file:      testFile,
                explanation,
                session_id:     sessionData['session_id'] ?? null,
                fix_suggestion: fixSuggestion || explanation,
            });
        }

        // ====================================================================
        // workspace_dev_create_pr
        // Create a well-described pull request for current branch changes.
        //
        // payload:
        //   title?          — PR title (auto-generated if omitted)
        //   body?           — PR body markdown (auto-generated if omitted)
        //   base?           — base branch (default: main)
        //   draft?          — create as draft PR
        //   repo?           — owner/repo slug
        // ====================================================================
        case 'workspace_dev_create_pr': {
            const base  = str(payload['base'], 'main');
            const draft = payload['draft'] === true;

            // Generate title & body with LLM if not provided
            let title = str(payload['title']);
            let body  = str(payload['body']);

            if (callLlm && (!title || !body)) {
                const diffResult = await executeAction('workspace_diff', { base });
                const diffSummary = diffResult.output.slice(0, 2000);

                if (!title) {
                    title = await callLlmSafe(
                        callLlm,
                        `Write a concise, imperative-mood PR title (max 72 chars) for this diff:\n\n${diffSummary}`,
                        'Return only the title string, no quotes or markdown.',
                    );
                    title = title.trim().slice(0, 72);
                }

                if (!body) {
                    body = await callLlmSafe(
                        callLlm,
                        `Write a GitHub PR description in markdown for this diff:\n\n${diffSummary}\n\nInclude: ## Summary (bullet points), ## Testing (what was tested), ## Notes (anything reviewers should know).`,
                        'Return only the markdown body. Keep it concise and actionable.',
                    );
                }
            }

            const result = await executeAction('workspace_create_pr', {
                title: title || 'Automated PR',
                body:  body  || '_Generated by AgentFarm developer agent._',
                base,
                draft,
                repo:  str(payload['repo']),
            });
            const data = parseSubOutput(result);

            return safeJson({
                ok:       result.ok,
                title,
                base,
                draft,
                pr_url:   data['pr_url'] ?? data['url'] ?? null,
                pr_number: data['pr_number'] ?? null,
                summary:  data['summary'] ?? (result.ok ? 'PR created.' : 'PR creation failed.'),
            });
        }

        // ====================================================================
        // workspace_dev_handle_issue
        // Fully triage, assign, and resolve (or escalate) a GitHub issue.
        //
        // payload:
        //   issue_number    — GitHub issue number
        //   repo?           — owner/repo slug
        //   mode?           — "triage" | "fix" | "close" (default: fix)
        // ====================================================================
        case 'workspace_dev_handle_issue': {
            const issueNumber = typeof payload['issue_number'] === 'number' ? payload['issue_number'] : null;
            const mode        = str(payload['mode'], 'fix');

            if (!issueNumber) {
                return { ok: false, output: '', errorOutput: 'payload.issue_number is required.' };
            }

            if (mode === 'triage') {
                const result = await executeAction('workspace_github_issue_triage', {
                    issue_number: issueNumber,
                    repo: str(payload['repo']),
                });
                return safeJson({ ok: result.ok, mode: 'triage', issue_number: issueNumber, ...parseSubOutput(result) });
            }

            // fix or close mode → attempt fix
            const result = await executeAction('workspace_github_issue_fix', {
                issue_number: issueNumber,
                repo:         str(payload['repo']),
                dry_run:      mode === 'close' ? false : (payload['dry_run'] === true),
            });
            const data = parseSubOutput(result);

            return safeJson({
                ok:           result.ok,
                mode,
                issue_number: issueNumber,
                pr_url:       data['pr_url'] ?? null,
                summary:      data['summary'] ?? (result.ok ? 'Issue resolved.' : 'Issue handling failed.'),
                files_changed: data['files_changed'] ?? [],
            });
        }

        // ====================================================================
        // workspace_dev_branch_manage
        // Create, list, or delete branches.
        //
        // payload:
        //   action    — "create" | "list" | "delete"
        //   name?     — branch name (required for create/delete)
        //   base?     — base branch for create (default: main)
        // ====================================================================
        case 'workspace_dev_branch_manage': {
            const action = str(payload['action'], 'list');
            const name   = str(payload['name']);
            const base   = str(payload['base'], 'main');

            if (action === 'list') {
                const result = await executeAction('workspace_github_pr_status', {
                    list_branches: true,
                });
                return safeJson({ ok: result.ok, action: 'list', ...parseSubOutput(result) });
            }

            if (!name) {
                return { ok: false, output: '', errorOutput: `Branch name is required for action "${action}".` };
            }

            if (action === 'create' && runCommand) {
                try {
                    const { exitCode, stderr } = await runCommand(
                        ['git', 'checkout', '-b', name, base],
                        workspaceDir,
                        15_000,
                    );
                    return safeJson({
                        ok:     exitCode === 0,
                        action: 'create',
                        name,
                        base,
                        error:  exitCode !== 0 ? stderr : undefined,
                    });
                } catch (err) {
                    return { ok: false, output: '', errorOutput: String(err) };
                }
            }

            if (action === 'delete' && runCommand) {
                try {
                    const { exitCode, stderr } = await runCommand(
                        ['git', 'branch', '-d', name],
                        workspaceDir,
                        10_000,
                    );
                    return safeJson({
                        ok:     exitCode === 0,
                        action: 'delete',
                        name,
                        error:  exitCode !== 0 ? stderr : undefined,
                    });
                } catch (err) {
                    return { ok: false, output: '', errorOutput: String(err) };
                }
            }

            return { ok: false, output: '', errorOutput: `Unknown branch action "${action}" or runCommand not available.` };
        }

        // ====================================================================
        // workspace_dev_commit
        // Stage and commit changes with an auto-generated or provided message.
        //
        // payload:
        //   message?        — commit message (generated if omitted and callLlm provided)
        //   files?          — string[] of files to stage (default: all changed)
        //   push?           — also push to remote (default: false)
        // ====================================================================
        case 'workspace_dev_commit': {
            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'runCommand is required for workspace_dev_commit.' };
            }

            const files  = Array.isArray(payload['files']) ? (payload['files'] as unknown[]).filter((f): f is string => typeof f === 'string') : [];
            const doPush = payload['push'] === true;
            let message  = str(payload['message']);

            // Stage files
            const addArgs = files.length > 0 ? ['git', 'add', ...files] : ['git', 'add', '-A'];
            await runCommand(addArgs, workspaceDir, 15_000).catch(() => {});

            // Auto-generate commit message from diff
            if (!message && callLlm) {
                const { stdout: diffOut } = await runCommand(['git', 'diff', '--cached', '--stat'], workspaceDir, 10_000).catch(() => ({ stdout: '', stderr: '', exitCode: 1 }));
                message = await callLlmSafe(
                    callLlm,
                    `Write a concise, imperative-mood git commit message (max 72 chars) for these staged changes:\n\n${diffOut.slice(0, 1000)}`,
                    'Return only the commit message string, no quotes.',
                );
                message = message.trim().replace(/^["']|["']$/g, '').slice(0, 72);
            }

            if (!message) message = 'chore: automated commit [dev-agent]';

            const { exitCode, stderr } = await runCommand(['git', 'commit', '-m', message], workspaceDir, 20_000).catch(() => ({ stdout: '', stderr: 'commit failed', exitCode: 1 }));

            if (exitCode !== 0) {
                return { ok: false, output: '', errorOutput: `git commit failed: ${stderr}` };
            }

            let pushed = false;
            if (doPush) {
                const pushResult = await runCommand(['git', 'push'], workspaceDir, 30_000).catch(() => ({ stdout: '', stderr: 'push failed', exitCode: 1 }));
                pushed = pushResult.exitCode === 0;
            }

            return safeJson({ ok: true, message, files_staged: files.length > 0 ? files : ['all'], pushed });
        }

        // ====================================================================
        // workspace_dev_security_audit
        // Comprehensive security scan: SAST + secrets + CVE check.
        //
        // payload:
        //   scope?    — "sast" | "secrets" | "cve" | "all" (default: all)
        //   path?     — path to scan (default: workspace root)
        // ====================================================================
        case 'workspace_dev_security_audit': {
            const scope = str(payload['scope'], 'all');
            const path  = str(payload['path']);

            const results: Record<string, unknown> = {};
            let findingCount = 0;

            if (scope === 'all' || scope === 'sast') {
                const r = await executeAction('workspace_sast_scan', { path: path || undefined });
                const d = parseSubOutput(r);
                results['sast'] = d;
                findingCount += num(d['finding_count']);
            }
            if (scope === 'all' || scope === 'secrets') {
                const r = await executeAction('workspace_secret_scan', { path: path || undefined });
                const d = parseSubOutput(r);
                results['secrets'] = d;
                findingCount += num(d['finding_count']);
            }
            if (scope === 'all' || scope === 'cve') {
                const r = await executeAction('workspace_cve_check', {});
                const d = parseSubOutput(r);
                results['cve'] = d;
                findingCount += num(d['vulnerable_count']);
            }

            let summary = `Security audit (${scope}): ${findingCount} finding(s).`;
            if (callLlm && findingCount > 0) {
                const auditStr = JSON.stringify(results).slice(0, 2000);
                const enriched = await callLlmSafe(
                    callLlm,
                    `Summarise these security findings in plain English. Prioritise by severity. Provide remediation steps:\n\n${auditStr}`,
                    'Be concise. Group by severity: Critical, High, Medium, Low.',
                );
                if (enriched) summary = enriched;
            }

            return safeJson({ ok: true, scope, finding_count: findingCount, results, summary });
        }

        // ====================================================================
        // workspace_dev_dependency_audit
        // Check for outdated and vulnerable dependencies.
        //
        // payload:
        //   auto_upgrade?   — true to apply non-breaking upgrades automatically
        // ====================================================================
        case 'workspace_dev_dependency_audit': {
            const autoUpgrade = payload['auto_upgrade'] === true;

            const upgradeResult = await executeAction('workspace_dependency_upgrade_plan', {});
            const upgradeData   = parseSubOutput(upgradeResult);

            const cveResult = await executeAction('workspace_cve_check', {});
            const cveData   = parseSubOutput(cveResult);

            const outdatedCount  = num(upgradeData['upgrades_available']);
            const vulnerableCount = num(cveData['vulnerable_count']);

            let applied = false;
            if (autoUpgrade && outdatedCount > 0) {
                const applyResult = await executeAction('workspace_dependency_upgrade_apply', {
                    upgrades: upgradeData['upgrades'] ?? [],
                    breaking: false, // never auto-apply breaking upgrades
                });
                applied = applyResult.ok;
            }

            return safeJson({
                ok:              true,
                outdated_count:  outdatedCount,
                vulnerable_count: vulnerableCount,
                upgrade_plan:    upgradeData['upgrades'] ?? [],
                cve_findings:    cveData['findings'] ?? [],
                auto_upgrade:    autoUpgrade,
                applied,
                summary: `Dependencies: ${outdatedCount} outdated, ${vulnerableCount} vulnerable.${applied ? ' Non-breaking upgrades applied.' : ''}`,
            });
        }

        // ====================================================================
        // workspace_dev_performance_audit
        // Run benchmarks and flag performance regressions.
        //
        // payload:
        //   benchmark_target? — specific function/file to benchmark
        //   baseline?         — baseline commit/tag to compare against
        // ====================================================================
        case 'workspace_dev_performance_audit': {
            const benchmarkTarget = str(payload['benchmark_target']);

            const benchResult = await executeAction('workspace_benchmark_run', {
                target:   benchmarkTarget || undefined,
                baseline: payload['baseline'],
            });
            const benchData = parseSubOutput(benchResult);

            const regressionResult = await executeAction('workspace_perf_regression_flag', {
                benchmark_results: benchData,
            });
            const regressionData = parseSubOutput(regressionResult);

            const regressionCount = num(regressionData['regression_count']);

            return safeJson({
                ok:              benchResult.ok,
                benchmark_target: benchmarkTarget,
                benchmark_results: benchData,
                regression_count: regressionCount,
                regressions:     regressionData['regressions'] ?? [],
                summary: regressionCount > 0
                    ? `Performance audit: ${regressionCount} regression(s) detected.`
                    : 'Performance audit: no regressions.',
            });
        }

        // ====================================================================
        // workspace_dev_code_quality
        // Run linter, formatter, and dead-code detection.
        //
        // payload:
        //   path?       — path to check (default: workspace root)
        //   fix?        — auto-fix lint/format issues (default: false)
        // ====================================================================
        case 'workspace_dev_code_quality': {
            const path    = str(payload['path']);
            const autoFix = payload['fix'] === true;

            const complexityResult  = await executeAction('workspace_complexity_metrics', { path: path || undefined });
            const complexityData    = parseSubOutput(complexityResult);

            const deadCodeResult = await executeAction('workspace_dead_code_remove', {
                path: path || undefined,
                dry_run: !autoFix,
            });
            const deadCodeData = parseSubOutput(deadCodeResult);

            const importResult = await executeAction('workspace_import_cleanup', {
                path: path || undefined,
                dry_run: !autoFix,
            });
            const importData = parseSubOutput(importResult);

            let formatResult: SubResult = { ok: true, output: '{}' };
            if (autoFix) {
                formatResult = await executeAction('workspace_format_code', { path: path || undefined });
            }

            const violationCount = num(complexityData['high_complexity_count']) +
                                   num(deadCodeData['dead_code_count']) +
                                   num(importData['unused_import_count']);

            return safeJson({
                ok:              true,
                path,
                auto_fix:        autoFix,
                violation_count: violationCount,
                complexity:      complexityData,
                dead_code:       deadCodeData,
                imports:         importData,
                format_result:   parseSubOutput(formatResult),
                summary: `Code quality: ${violationCount} issue(s)${autoFix ? ', auto-fixes applied' : ' (dry run)'}.`,
            });
        }

        // ====================================================================
        // workspace_dev_api_design
        // Design an API (OpenAPI / REST / GraphQL) from a requirements description.
        //
        // payload:
        //   description     — natural-language description of the API
        //   format?         — "openapi" | "rest" | "graphql" (default: openapi)
        //   output_file?    — where to write the spec
        // ====================================================================
        case 'workspace_dev_api_design': {
            const description = str(payload['description']);
            const format      = str(payload['format'], 'openapi');
            const outputFile  = str(payload['output_file']);

            if (!description) {
                return { ok: false, output: '', errorOutput: 'payload.description is required for workspace_dev_api_design.' };
            }

            let spec = '';
            if (callLlm) {
                spec = await callLlmSafe(
                    callLlm,
                    `Design a ${format.toUpperCase()} API specification for the following requirements:\n\n${description}\n\nReturn a complete, valid ${format === 'openapi' ? 'OpenAPI 3.1 YAML' : format === 'graphql' ? 'GraphQL schema' : 'REST API spec in markdown'}.`,
                    `You are a senior API architect. Output only the specification, no explanation.`,
                );
            } else {
                // Fallback: generate a minimal skeleton
                spec = generateApiSpecSkeleton(description, format);
            }

            // Write to file if requested
            if (outputFile && spec) {
                await executeAction('workspace_write_file', {
                    file_path: outputFile,
                    content: spec,
                });
            }

            return safeJson({
                ok:          true,
                format,
                spec,
                output_file: outputFile || null,
                summary:     `${format.toUpperCase()} API spec generated for: ${description.slice(0, 80)}.`,
            });
        }

        // ====================================================================
        // workspace_dev_db_migration
        // Plan and optionally generate a database schema migration.
        //
        // payload:
        //   description     — what changes to make
        //   current_schema? — current schema file path or inline DDL
        //   orm?            — "prisma" | "drizzle" | "typeorm" | "sequelize" | "raw"
        //   dry_run?        — plan only
        // ====================================================================
        case 'workspace_dev_db_migration': {
            const description = str(payload['description']);
            const orm         = str(payload['orm'], 'raw');
            const dryRun      = payload['dry_run'] === true;

            if (!description) {
                return { ok: false, output: '', errorOutput: 'payload.description is required for workspace_dev_db_migration.' };
            }

            // Safety check first
            const safetyResult = await executeAction('workspace_migration_safety_check', {
                description,
                orm,
            });
            const safetyData = parseSubOutput(safetyResult);

            if (!dryRun && safetyResult.ok) {
                const genResult = await executeAction('workspace_migration_generate', {
                    description,
                    orm,
                    current_schema: payload['current_schema'],
                });
                const genData = parseSubOutput(genResult);
                return safeJson({
                    ok:             genResult.ok,
                    orm,
                    dry_run:        false,
                    safety_check:   safetyData,
                    migration_file: genData['migration_file'] ?? null,
                    migration_sql:  genData['migration_sql'] ?? null,
                    summary:        genData['summary'] ?? (genResult.ok ? 'Migration generated.' : 'Migration generation failed.'),
                });
            }

            // Dry run or safety check blocked execution
            return safeJson({
                ok:           safetyResult.ok,
                orm,
                dry_run:      true,
                safety_check: safetyData,
                blocked:      !safetyResult.ok,
                summary:      safetyData['summary'] ?? 'Safety check complete.',
            });
        }

        // ====================================================================
        // workspace_dev_onboard_codebase
        // Build a structured understanding of an unfamiliar codebase.
        //
        // payload:
        //   path?       — root path to explore (default: workspace dir)
        //   depth?      — "overview" | "detailed" (default: overview)
        // ====================================================================
        case 'workspace_dev_onboard_codebase': {
            const depth = str(payload['depth'], 'overview');

            // List top-level structure
            const listResult  = await executeAction('workspace_list_files', {
                path:        str(payload['path']),
                max_depth:   depth === 'detailed' ? 4 : 2,
            });

            // Dependency graph
            const depResult = await executeAction('workspace_dependency_tree', {
                path: str(payload['path']) || undefined,
            });
            const depData = parseSubOutput(depResult);

            // Scout for entry points and architecture
            const scoutResult = await executeAction('workspace_scout', {
                path: str(payload['path']) || undefined,
            });

            // Build human-readable summary
            let summary = `Codebase overview:\n${listResult.output.slice(0, 1000)}`;
            if (callLlm) {
                const context = [
                    `File structure:\n${listResult.output.slice(0, 800)}`,
                    `Dependencies:\n${JSON.stringify(depData).slice(0, 600)}`,
                    `Scout notes:\n${scoutResult.output.slice(0, 600)}`,
                ].join('\n\n');

                summary = await callLlmSafe(
                    callLlm,
                    `You are a senior engineer onboarding to a new codebase. Based on the following analysis, write a structured onboarding document with:\n1. What this project does (2–3 sentences)\n2. Key architectural patterns\n3. Entry points (main files to read first)\n4. Development setup steps\n5. Areas to watch out for\n\n${context}`,
                    'Output clean markdown.',
                );
            }

            return safeJson({
                ok:         true,
                depth,
                file_tree:  listResult.output,
                dep_tree:   depData,
                summary,
            });
        }

        // ====================================================================
        // workspace_dev_standup_report
        // Generate a daily standup from episodic memory.
        //
        // payload:
        //   recent_memory?          — string[] of episodic memory records
        //   bot_name?               — display name of the dev agent
        //   team_name?              — display name of the team
        //   ceremony_type?          — "standup" | "planning" | "review" | "retrospective" | "grooming"
        //   sprint_number?          — current sprint number
        //   sprint_goal?            — sprint goal text
        //   sprint_days_remaining?  — calendar days left
        // ====================================================================
        case 'workspace_dev_standup_report': {
            const rawMemory = Array.isArray(payload['recent_memory'])
                ? (payload['recent_memory'] as unknown[]).filter((x): x is string => typeof x === 'string')
                : [];

            const botName  = str(payload['bot_name'],  'Developer Agent');
            const teamName = str(payload['team_name'], 'the team');
            const ceremonyType = (str(payload['ceremony_type'], 'standup')) as SprintCeremonyType | 'standup';

            const sprintContext = {
                sprintNumber:     typeof payload['sprint_number']         === 'number' ? payload['sprint_number']         : undefined,
                sprintGoal:       typeof payload['sprint_goal']           === 'string' ? payload['sprint_goal']           : undefined,
                daysRemaining:    typeof payload['sprint_days_remaining'] === 'number' ? payload['sprint_days_remaining'] : undefined,
                ticketsCompleted: typeof payload['tickets_completed']     === 'number' ? payload['tickets_completed']     : undefined,
            };

            const standupSummary = buildDeveloperStandupSummary(rawMemory, { botName, teamName, sprintContext });

            const validCeremonies: SprintCeremonyType[] = ['planning', 'review', 'retrospective', 'grooming'];
            const ceremonyContext = validCeremonies.includes(ceremonyType as SprintCeremonyType)
                ? buildSprintCeremonyContext(ceremonyType as SprintCeremonyType, { botName, teamName, summary: standupSummary })
                : null;

            return safeJson({
                ok:              true,
                summary:         standupSummary,
                ceremony_context: ceremonyContext,
                bot_name:        botName,
                team_name:       teamName,
            });
        }

        // ====================================================================
        // workspace_dev_incident_response
        // Diagnose and patch a production incident.
        //
        // payload:
        //   error_message   — error text, stack trace, or alert description
        //   service?        — affected service name
        //   severity?       — "critical" | "high" | "medium" | "low"
        //   logs?           — recent log lines
        // ====================================================================
        case 'workspace_dev_incident_response': {
            const errorMsg  = str(payload['error_message']);
            const service   = str(payload['service']);
            const severity  = str(payload['severity'], 'high');
            const logs      = str(payload['logs']);

            if (!errorMsg) {
                return { ok: false, output: '', errorOutput: 'payload.error_message is required for workspace_dev_incident_response.' };
            }

            // Step 1: search codebase for the error
            const grepResult = await executeAction('workspace_grep', {
                pattern: errorMsg.split('\n')[0]?.slice(0, 80) ?? errorMsg.slice(0, 80),
                max_results: 10,
            });

            // Step 2: generate patch with LLM
            let patchPlan = '';
            if (callLlm) {
                patchPlan = await callLlmSafe(
                    callLlm,
                    `PRODUCTION INCIDENT — Severity: ${severity.toUpperCase()}\n\nService: ${service || 'unknown'}\nError: ${errorMsg.slice(0, 400)}\n${logs ? `Recent logs:\n${logs.slice(0, 600)}\n` : ''}Code locations found:\n${grepResult.output.slice(0, 400)}\n\nProvide:\n1. Root cause hypothesis\n2. Immediate mitigation steps (can be done in < 15 min)\n3. Permanent fix (code change)\n4. Rollback plan if fix makes things worse`,
                    'You are a senior on-call engineer. Be direct and action-oriented.',
                );
            }

            // Step 3: try to apply an automated patch pack if available
            const patchResult = await executeAction('workspace_incident_patch_pack', {
                error_message: errorMsg,
                service,
                severity,
            });
            const patchData = parseSubOutput(patchResult);

            return safeJson({
                ok:          true,
                service,
                severity,
                error_message: errorMsg,
                grep_hits:   grepResult.output,
                patch_plan:  patchPlan || (patchData['patch_plan'] ?? ''),
                patch_pack:  patchData,
                summary:     patchData['summary'] ?? `Incident response initiated for ${service || 'service'} (${severity}).`,
            });
        }

        // ====================================================================
        // workspace_dev_tech_spec
        // Generate a technical specification document for a feature.
        //
        // payload:
        //   description     — feature description
        //   title?          — spec title
        //   output_file?    — where to write the spec
        //   author?         — author name
        // ====================================================================
        case 'workspace_dev_tech_spec': {
            const description = str(payload['description']);
            const title       = str(payload['title']);
            const outputFile  = str(payload['output_file']);
            const author      = str(payload['author'], 'AI Developer Agent');

            if (!description && !title) {
                return { ok: false, output: '', errorOutput: 'payload.description or payload.title is required.' };
            }

            const specInput = description || title;
            const outline   = buildTechSpecOutline(specInput, { authorName: author });

            let specContent = outline.sections.join('\n');

            // Enhance with LLM if available
            if (callLlm && description) {
                const enhanced = await callLlmSafe(
                    callLlm,
                    `Fill in the following tech spec template based on this feature description:\n\n${description}\n\nTemplate:\n${outline.sections.join('\n')}`,
                    'You are a senior engineer writing a technical spec. Fill in all _[placeholder]_ sections with specific, actionable content. Return the complete filled spec as markdown.',
                );
                if (enhanced) specContent = enhanced;
            }

            if (outputFile) {
                await executeAction('workspace_write_file', {
                    file_path: outputFile,
                    content:   specContent,
                });
            }

            return safeJson({
                ok:          true,
                title:       title || outline.title,
                spec:        specContent,
                output_file: outputFile || null,
                summary:     `Tech spec generated: ${(title || outline.title).slice(0, 80)}.`,
            });
        }

        default: {
            const exhaustive: never = actionType;
            return { ok: false, output: '', errorOutput: `Unknown developer action type: ${String(exhaustive)}` };
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateApiSpecSkeleton(description: string, format: string): string {
    if (format === 'openapi') {
        return [
            'openapi: "3.1.0"',
            'info:',
            `  title: "${description.slice(0, 60)}"`,
            '  version: "1.0.0"',
            'paths:',
            '  /resource:',
            '    get:',
            '      summary: "List resources"',
            '      responses:',
            '        "200":',
            '          description: "Success"',
        ].join('\n');
    }
    if (format === 'graphql') {
        return `type Query {\n  # ${description.slice(0, 60)}\n  items: [Item]\n}\n\ntype Item {\n  id: ID!\n  name: String!\n}\n`;
    }
    return `# REST API: ${description.slice(0, 60)}\n\n## Endpoints\n\n### GET /resource\nList all resources.\n`;
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onDeveloperImplementationApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    implTitle: string; documentType: import('./developer-rag-retriever.js').DevDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedImplementation } = await import('./developer-rag-retriever.js');
        await ingestApprovedImplementation({ ...params });
    } catch { /* non-fatal */ }
}

export async function onDeveloperFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; prId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { buildDeveloperEpisodicPattern } = await import('./developer-rag-retriever.js');
        // Lessons are stored directly via episodic hooks (developer-episodic-hooks.ts)
        // This hook records the feedback as a lesson pattern for RAG retrieval
        const base = params.gatewayBaseUrl.replace(/\/+$/, '');
        for (const reason of params.feedbackReasons) {
            await fetch(`${base}/v1/memory/patterns`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${params.serviceToken}` },
                body: JSON.stringify({
                    tenantId: params.tenantId,
                    workspaceId: params.workspaceId,
                    pattern: `dev:review:feedback:${params.prId}`,
                    summary: reason.slice(0, 200),
                    confidence: 0.7,
                    observedCount: 1,
                    lastSeen: new Date().toISOString(),
                }),
                signal: AbortSignal.timeout(10_000),
            }).catch(() => undefined);
        }
        void buildDeveloperEpisodicPattern; // referenced to avoid unused-import lint
    } catch { /* non-fatal */ }
}
