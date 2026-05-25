/**
 * Pre-task codebase scout.
 *
 * Before the LLM classifies and plans any code-touching task, this module runs a
 * lightweight scout of the workspace so the LLM receives real codebase context —
 * not just the raw payload.  A human developer always reads the repo before coding;
 * this module gives the agent the same affordance.
 */

/** Action types that warrant a codebase scout before LLM classification. */
export const SCOUT_TRIGGER_ACTIONS = new Set([
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'workspace_bulk_refactor',
    'workspace_atomic_edit_set',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'create_pr_from_workspace',
    'workspace_create_pr',
    'workspace_pr_review_poll',
    'autonomous_loop',
    'workspace_github_issue_fix',
    'workspace_generate_from_template',
    // FIX 8a: The primary coding entry-point for developer tasks.
    'workspace_subagent_spawn',
]);

/** Regex that matches coding-related action_type values not already in the set. */
const CODING_ACTION_REGEX = /(fix|bug|edit|refactor|update|add|create|implement|code|test|patch|feature)/i;

/**
 * Scout the codebase before the LLM sees the task.
 *
 * Runs workspace_scout → workspace_grep → workspace_list_files in sequence and
 * returns a single formatted string capped at 4 000 characters.  Returns an empty
 * string if the action type does not warrant scouting or if all scout calls fail.
 *
 * @param task          The task envelope (or any object with a `payload` property).
 * @param executeAction Bound reference to `executeLocalWorkspaceAction`.
 */
export async function preTaskScout(
    task: { taskId: string; payload: Record<string, unknown> },
    executeAction: (input: {
        tenantId: string;
        botId: string;
        taskId: string;
        actionType: string;
        payload: Record<string, unknown>;
    }) => Promise<{ ok: boolean; output: string; errorOutput?: string }>,
): Promise<string> {
    const actionType =
        typeof task.payload['action_type'] === 'string'
            ? task.payload['action_type'].trim().toLowerCase()
            : '';

    // FIX 8b: Trigger scout when:
    //   (a) action_type is in the explicit set, OR
    //   (b) action_type matches coding keywords (fix_bug, add_feature, refactor, etc.), OR
    //   (c) payload has a non-empty target_files array or a target string
    const hasTargetFiles =
        (Array.isArray(task.payload['target_files']) && (task.payload['target_files'] as unknown[]).length > 0) ||
        (typeof task.payload['target'] === 'string' && task.payload['target'].trim().length > 0);

    const shouldScout =
        SCOUT_TRIGGER_ACTIONS.has(actionType) ||
        CODING_ACTION_REGEX.test(actionType) ||
        hasTargetFiles;

    if (!shouldScout) {
        return '';
    }

    const tenantId =
        typeof task.payload['tenantId'] === 'string' && task.payload['tenantId'].trim()
            ? task.payload['tenantId'].trim()
            : 'default';
    const botId =
        typeof task.payload['botId'] === 'string' && task.payload['botId'].trim()
            ? task.payload['botId'].trim()
            : 'default';
    const scoutTaskId = `${task.taskId}:scout`;

    const parts: string[] = [];

    // 1. Structural overview of the workspace
    try {
        const scoutResult = await executeAction({
            tenantId,
            botId,
            taskId: scoutTaskId,
            actionType: 'workspace_scout',
            payload: { ...task.payload },
        });
        if (scoutResult.ok && scoutResult.output.trim()) {
            parts.push(`=== CODEBASE SCOUT ===\n${scoutResult.output.trim()}`);
        }
    } catch {
        // Scout is best-effort; failure must not break classification
    }

    // 2. Grep for keywords extracted from the task summary
    const summary =
        typeof task.payload['summary'] === 'string' ? task.payload['summary'].trim() : '';
    if (summary.length >= 3) {
        // Use first three non-trivial words as grep pattern
        const keywords = summary
            .split(/\s+/)
            .filter((w) => w.length > 2)
            .slice(0, 3)
            .join('|');
        if (keywords) {
            try {
                const grepResult = await executeAction({
                    tenantId,
                    botId,
                    taskId: scoutTaskId,
                    actionType: 'workspace_grep',
                    payload: { ...task.payload, pattern: keywords },
                });
                if (grepResult.ok && grepResult.output.trim()) {
                    parts.push(`=== GREP MATCHES ===\n${grepResult.output.trim()}`);
                }
            } catch {
                // Best-effort
            }
        }
    }

    // 3. Full file tree listing
    try {
        const listResult = await executeAction({
            tenantId,
            botId,
            taskId: scoutTaskId,
            actionType: 'workspace_list_files',
            payload: { ...task.payload },
        });
        if (listResult.ok && listResult.output.trim()) {
            parts.push(`=== FILE TREE ===\n${listResult.output.trim()}`);
        }
    } catch {
        // Best-effort
    }

    // 4. FIX 8c: Read actual content of target_files so the LLM sees real code
    //    before it generates initial_plan. Without this, the LLM classifies
    //    blindly and code_edit_patch steps reference lines/symbols it cannot see.
    const rawTargetFiles = Array.isArray(task.payload['target_files'])
        ? (task.payload['target_files'] as unknown[]).filter((f): f is string => typeof f === 'string')
        : typeof task.payload['target'] === 'string' && task.payload['target'].trim()
            ? [task.payload['target'].trim()]
            : [];

    // Gap 8 LARGE_CODEBASE FIX: when no explicit target_files given, discover
    // relevant source files from the task keywords using grep-based scoring.
    if (rawTargetFiles.length === 0) {
        const taskText = [
            typeof task.payload['summary'] === 'string' ? task.payload['summary'] : '',
            typeof task.payload['prompt'] === 'string' ? task.payload['prompt'] : '',
            typeof task.payload['description'] === 'string' ? task.payload['description'] : '',
        ].join(' ').trim();

        if (taskText.length >= 5) {
            // Extract the 5 most significant words to grep for relevant files
            const keywords = taskText
                .split(/\s+/)
                .filter((w) => w.length > 3 && !/^(the|and|for|with|that|this|from|into|when|have|will|your|their|then|than|some|more|also|been|were|what|which|should|would|could|about)$/i.test(w))
                .slice(0, 5);

            if (keywords.length > 0) {
                try {
                    const relGrepResult = await executeAction({
                        tenantId,
                        botId,
                        taskId: scoutTaskId,
                        actionType: 'workspace_grep',
                        payload: {
                            ...task.payload,
                            pattern: keywords.join('|'),
                            include: '*.{ts,tsx,js,jsx,py,go,java,cs,rs}',
                        },
                    });
                    if (relGrepResult.ok && relGrepResult.output.trim()) {
                        // Extract file names from grep output (format: "file:line:content")
                        const relevantFiles = [...new Set(
                            relGrepResult.output
                                .split('\n')
                                .map((l) => l.split(':')[0] ?? '')
                                .filter((f) => f.length > 0 && !f.includes('node_modules') && !f.includes('.git'))
                        )].slice(0, 6);
                        rawTargetFiles.push(...relevantFiles);
                    }
                } catch { /* best-effort */ }
            }
        }
    }

    if (rawTargetFiles.length > 0) {
        const FILE_CONTENT_CAP = 5000;
        const fileParts: string[] = [];
        const loadedFiles = new Set<string>();

        for (const filePath of rawTargetFiles.slice(0, 8)) {
            if (loadedFiles.has(filePath)) continue;
            loadedFiles.add(filePath);
            try {
                const readResult = await executeAction({
                    tenantId,
                    botId,
                    taskId: scoutTaskId,
                    actionType: 'workspace_read_file',
                    payload: { ...task.payload, file_path: filePath },
                });
                if (readResult.ok && readResult.output.trim()) {
                    const truncated = readResult.output.slice(0, FILE_CONTENT_CAP);
                    fileParts.push(`--- ${filePath} ---\n${truncated}`);

                    // Gap 8 IMPORT HOP: for TypeScript/JavaScript files, extract
                    // import paths and load 1 hop of local dependencies so the LLM
                    // understands the full call graph — not just one file in isolation.
                    if (/\.[jt]sx?$/.test(filePath)) {
                        const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
                        let m: RegExpExecArray | null;
                        const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
                        const importedPaths: string[] = [];
                        while ((m = importRe.exec(readResult.output)) !== null) {
                            const rel = m[1]!;
                            // Resolve to likely file path (try .ts, .tsx, .js extensions)
                            const base = dir ? `${dir}/${rel.replace(/^\.\//, '')}` : rel.replace(/^\.\//, '');
                            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
                                const candidate = ext ? (base.endsWith(ext) ? base : `${base}${ext}`) : base;
                                if (!loadedFiles.has(candidate)) {
                                    importedPaths.push(candidate);
                                    break;
                                }
                            }
                        }
                        // Load up to 3 imported deps (short excerpts — just types/exports)
                        for (const importedFile of importedPaths.slice(0, 3)) {
                            if (loadedFiles.has(importedFile)) continue;
                            try {
                                const depResult = await executeAction({
                                    tenantId,
                                    botId,
                                    taskId: scoutTaskId,
                                    actionType: 'workspace_read_file',
                                    payload: { ...task.payload, file_path: importedFile },
                                });
                                if (depResult.ok && depResult.output.trim()) {
                                    loadedFiles.add(importedFile);
                                    // Only show the first 1500 chars of deps (types/exports)
                                    fileParts.push(`--- ${importedFile} (dep) ---\n${depResult.output.slice(0, 1500)}`);
                                }
                            } catch { /* dep file may not exist */ }
                        }
                    }
                }
            } catch {
                // Best-effort — file may not exist in workspace yet
            }
        }
        if (fileParts.length > 0) {
            parts.push(`=== TARGET FILE CONTENTS ===\n${fileParts.join('\n\n')}`);
        }
    }

    const full = parts.join('\n\n');
    return full.slice(0, 10000);
}

