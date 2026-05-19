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

    if (rawTargetFiles.length > 0) {
        const FILE_CONTENT_CAP = 3000;
        const fileParts: string[] = [];
        for (const filePath of rawTargetFiles.slice(0, 4)) {
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
    return full.slice(0, 4000);
}

