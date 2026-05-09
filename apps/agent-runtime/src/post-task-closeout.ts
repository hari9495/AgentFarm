/**
 * Post-task close-out.
 *
 * After a task completes (success or failure), a human developer closes out the
 * work: updates the ticket, notifies the team, and writes a real PR description.
 * This module gives the agent the same discipline.
 *
 * Integrations are strictly opt-in via payload fields and environment variables.
 * Any failure in a close-out step is logged but never propagates to the caller.
 */

/**
 * Build a plain-text comment suitable for posting to a ticket or chat thread.
 * Describes what changed and the outcome in one concise paragraph.
 */
export function buildCloseOutComment(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string },
): string {
    const summary = typeof task.payload['summary'] === 'string' ? task.payload['summary'].trim() : '(no summary)';
    const outcome = result.status === 'success' ? 'completed successfully' : `failed — ${result.errorMessage ?? 'unknown error'}`;
    return `[AgentFarm] Task ${task.taskId} ${outcome}.\nSummary: ${summary}`;
}

/**
 * Build a one-line plain-text status summary for internal logging or Slack.
 */
export function buildCloseOutSummary(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; attempts?: number },
): string {
    const actionType = typeof task.payload['action_type'] === 'string' ? task.payload['action_type'] : 'task';
    const attempts = typeof result.attempts === 'number' ? result.attempts : 1;
    const statusEmoji = result.status === 'success' ? '✅' : '❌';
    return `${statusEmoji} ${actionType} | task ${task.taskId} | status: ${result.status} | attempts: ${attempts}`;
}

/**
 * Build a structured PR description from the task metadata and result.
 * Follows the conventional PR template: summary, motivation, changes, test evidence.
 */
export function buildPRDescription(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string },
): string {
    const summary = typeof task.payload['summary'] === 'string' ? task.payload['summary'].trim() : '(no summary)';
    const jiraKey = typeof task.payload['jira_issue_key'] === 'string' ? task.payload['jira_issue_key'].trim() : null;
    const actionType = typeof task.payload['action_type'] === 'string' ? task.payload['action_type'] : 'task';
    const issueRef = jiraKey ? `\nFixes: ${jiraKey}` : '';

    return [
        `## Summary`,
        summary,
        ``,
        `## Motivation`,
        `This change was triggered by AgentFarm task \`${task.taskId}\` (action: \`${actionType}\`).${issueRef}`,
        ``,
        `## Changes`,
        `- Task classification: \`${actionType}\``,
        `- Execution outcome: \`${result.status}\``,
        result.errorMessage ? `- Error: ${result.errorMessage}` : null,
        ``,
        `## Test Evidence`,
        result.status === 'success'
            ? `All post-change quality gates passed. See action result log for details.`
            : `Task did not complete successfully. Review required before merge.`,
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}

// ---------------------------------------------------------------------------
// Internal HTTP helpers
// ---------------------------------------------------------------------------

async function postJSON(url: string, headers: Record<string, string>, body: unknown): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

async function patchJSON(url: string, headers: Record<string, string>, body: unknown): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

async function maybeUpdateJira(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string },
): Promise<void> {
    const jiraKey = typeof task.payload['jira_issue_key'] === 'string' ? task.payload['jira_issue_key'].trim() : '';
    if (!jiraKey) return;

    const baseUrl = (process.env['JIRA_BASE_URL'] ?? '').replace(/\/+$/, '');
    const token = process.env['JIRA_API_TOKEN'] ?? '';
    const email = process.env['JIRA_USER_EMAIL'] ?? '';
    if (!baseUrl || !token || !email) return;

    const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
    const comment = buildCloseOutComment(task, result);

    // Post a comment to the Jira issue
    await postJSON(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(jiraKey)}/comment`,
        { authorization: authHeader },
        { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }] } },
    );
}

async function maybeNotifySlack(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; attempts?: number },
): Promise<void> {
    if (task.payload['notify_on_complete'] !== true) return;

    const webhookUrl = process.env['SLACK_WEBHOOK_URL'] ?? '';
    if (!webhookUrl) return;

    const text = buildCloseOutSummary(task, result);
    await postJSON(webhookUrl, {}, { text });
}

async function maybeUpdateGitHubPR(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string; pr_url?: string; pr_number?: number },
): Promise<void> {
    const prNumber = typeof result.pr_number === 'number' ? result.pr_number : null;
    const prUrl = typeof result.pr_url === 'string' ? result.pr_url.trim() : '';
    if (!prNumber || !prUrl) return;

    const token = process.env['GITHUB_TOKEN'] ?? '';
    const owner = process.env['GITHUB_OWNER'] ?? '';
    const repo = process.env['GITHUB_REPO'] ?? '';
    if (!token || !owner || !repo) return;

    const description = buildPRDescription(task, result);

    await patchJSON(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
        {
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28',
            'user-agent': 'agentfarm-runtime',
        },
        { body: description },
    );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Perform post-task close-out steps after the task result is finalised.
 *
 * All three integrations (Jira, Slack, GitHub PR) are strictly opt-in and
 * run concurrently.  Failures in any integration are swallowed so close-out
 * never blocks result persistence.
 *
 * @param task          The task envelope.
 * @param result        The finalised task result.
 * @param _executeAction Reserved for future workspace close-out actions (unused today).
 */
export async function postTaskCloseOut(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string; attempts?: number; pr_url?: string; pr_number?: number },
    _executeAction?: unknown,
): Promise<void> {
    try {
        await Promise.all([
            maybeUpdateJira(task, result),
            maybeNotifySlack(task, result),
            maybeUpdateGitHubPR(task, result),
        ]);
    } catch {
        // Close-out failures must never surface to the caller
    }
}
