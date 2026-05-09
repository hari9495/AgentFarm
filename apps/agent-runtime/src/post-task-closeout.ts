import { executeBrowserAction } from './browser-action-executor.js';
import { resolveLanguage, getOutputLanguage, type LanguageContext } from './language-resolver.js';

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

async function resolveTaskLanguage(
    task: { taskId: string; payload: Record<string, unknown> },
): Promise<string> {
    const ctx: LanguageContext = {
        tenantId: String(task.payload['tenantId'] ?? ''),
        workspaceId: task.payload['workspaceId'] as string | undefined,
        userId: task.payload['userId'] as string | undefined,
        inputText: task.payload['lastUserMessage'] as string | undefined,
    };
    // If tenantId is missing, skip resolution — return 'en'
    if (!ctx.tenantId) return 'en';
    const resolved = await resolveLanguage(ctx);
    return resolved.language;
}

/**
 * Build a plain-text comment suitable for posting to a ticket or chat thread.
 * Describes what changed and the outcome in one concise paragraph.
 */
export function buildCloseOutComment(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string },
    language?: string,
): string {
    const summary = typeof task.payload['summary'] === 'string' ? task.payload['summary'].trim() : '(no summary)';
    const outcome = result.status === 'success' ? 'completed successfully' : `failed — ${result.errorMessage ?? 'unknown error'}`;
    const base = `[AgentFarm] Task ${task.taskId} ${outcome}.\nSummary: ${summary}`;
    if (language && language !== 'en') {
        return `${base}\n[Language: ${language}]`;
    }
    return base;
}

/**
 * Build a one-line plain-text status summary for internal logging or Slack.
 */
export function buildCloseOutSummary(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; attempts?: number },
    language?: string,
): string {
    const actionType = typeof task.payload['action_type'] === 'string' ? task.payload['action_type'] : 'task';
    const attempts = typeof result.attempts === 'number' ? result.attempts : 1;
    const statusEmoji = result.status === 'success' ? '✅' : '❌';
    const base = `${statusEmoji} ${actionType} | task ${task.taskId} | status: ${result.status} | attempts: ${attempts}`;
    if (language && language !== 'en') {
        return `${base}\n_[Response language: ${language}]_`;
    }
    return base;
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

// ---------------------------------------------------------------------------
// V2 – connector-metadata-driven dispatch
// ---------------------------------------------------------------------------

/**
 * Connector auth entry passed from the gateway after OAuth completion.
 * Matches the shape used by the connector-auth route.
 */
export type ConnectorAuthMetadata = {
    connectorId: string;
    tenantId: string;
    /** Provider identifier – matches ConnectorType in provider-clients. */
    provider: 'jira' | 'teams' | 'github' | 'email';
    status: string;
    /** Key Vault / SecretStore reference ID for the connector credentials. */
    secretRef: string | null;
};

/**
 * Executor function type – structurally compatible with ProviderExecutor from
 * provider-clients.ts. Kept as a local alias so agent-runtime does not need a
 * direct import from api-gateway.
 *
 * At the call site, pass `createRealProviderExecutor(secretStore)` from
 * `apps/api-gateway/src/lib/provider-clients.ts`.
 */
export type CloseOutExecutor = (input: {
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
    attempt: number;
    secretRefId: string | null;
}) => Promise<{ ok: boolean; resultSummary: string }>;

async function maybeJiraViaConnector(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string },
    meta: ConnectorAuthMetadata,
    executor: CloseOutExecutor,
    language?: string,
): Promise<void> {
    const jiraKey = typeof task.payload['jira_issue_key'] === 'string' ? task.payload['jira_issue_key'].trim() : '';
    if (!jiraKey) return;

    const comment = buildCloseOutComment(task, result, language);
    await executor({
        connectorType: 'jira',
        actionType: 'create_comment',
        payload: { issue_key: jiraKey, body: comment },
        attempt: 1,
        secretRefId: meta.secretRef,
    });
}

async function maybeTeamsViaConnector(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; attempts?: number },
    meta: ConnectorAuthMetadata,
    executor: CloseOutExecutor,
): Promise<void> {
    if (task.payload['notify_on_complete'] !== true) return;

    const teamId = typeof task.payload['teams_team_id'] === 'string' ? task.payload['teams_team_id'].trim() : '';
    const channelId = typeof task.payload['teams_channel_id'] === 'string' ? task.payload['teams_channel_id'].trim() : '';
    if (!teamId || !channelId) return;

    const text = buildCloseOutSummary(task, result);
    await executor({
        connectorType: 'teams',
        actionType: 'send_message',
        payload: { team_id: teamId, channel_id: channelId, text },
        attempt: 1,
        secretRefId: meta.secretRef,
    });
}

async function maybeGitHubViaConnector(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string; pr_url?: string; pr_number?: number },
    meta: ConnectorAuthMetadata,
    executor: CloseOutExecutor,
): Promise<void> {
    const prNumber = typeof result.pr_number === 'number' ? result.pr_number : null;
    if (!prNumber) return;

    const owner = typeof task.payload['github_owner'] === 'string' ? task.payload['github_owner'].trim() : '';
    const repo = typeof task.payload['github_repo'] === 'string' ? task.payload['github_repo'].trim() : '';
    if (!owner || !repo) return;

    const description = buildPRDescription(task, result);
    await executor({
        connectorType: 'github',
        actionType: 'create_pr_comment',
        payload: { owner, repo, pull_number: prNumber, body: description },
        attempt: 1,
        secretRefId: meta.secretRef,
    });
}

/**
 * Post-task close-out V2 – connector-metadata-driven dispatch.
 *
 * When `connectorMeta` is non-empty AND an `executor` is supplied, close-out
 * integrations are dispatched through the executor (connector path):
 *   - Jira comment  → first entry where provider === 'jira'
 *   - Teams message → first entry where provider === 'teams'
 *   - GitHub PR comment → first entry where provider === 'github'
 *
 * When `connectorMeta` is absent/empty OR no executor is provided, the
 * function falls back to the original env-var path (maybeUpdateJira /
 * maybeNotifySlack / maybeUpdateGitHubPR). Existing callers are unaffected.
 *
 * All close-out failures are swallowed — this function never rejects.
 *
 * @param task          The task envelope.
 * @param result        The finalised task result.
 * @param connectorMeta Optional connector auth entries from the gateway.
 * @param executor      Optional ProviderExecutor. Pass the return value of
 *                      `createRealProviderExecutor(secretStore)` from
 *                      `apps/api-gateway/src/lib/provider-clients.ts`.
 *                      When absent, falls back to env-var path.
 */
export async function postTaskCloseOutV2(
    task: { taskId: string; payload: Record<string, unknown> },
    result: { status: string; errorMessage?: string; attempts?: number; pr_url?: string; pr_number?: number },
    connectorMeta?: ConnectorAuthMetadata[],
    executor?: CloseOutExecutor,
): Promise<{ resolvedLanguage: string } | undefined> {
    try {
        const outputLang = await resolveTaskLanguage(task).catch(() => 'en');
        const summary = buildCloseOutSummary(task, result, outputLang);
        if (connectorMeta && connectorMeta.length > 0 && executor) {
            const jiraMeta = connectorMeta.find((m) => m.provider === 'jira');
            const teamsMeta = connectorMeta.find((m) => m.provider === 'teams');
            const githubMeta = connectorMeta.find((m) => m.provider === 'github');
            await Promise.all([
                jiraMeta ? maybeJiraViaConnector(task, result, jiraMeta, executor, outputLang).catch(() => { }) : Promise.resolve(),
                teamsMeta ? maybeTeamsViaConnector(task, result, teamsMeta, executor).catch(() => { }) : Promise.resolve(),
                githubMeta ? maybeGitHubViaConnector(task, result, githubMeta, executor).catch(() => { }) : Promise.resolve(),
            ]);

            for (const meta of connectorMeta) {
                if (['jira', 'teams', 'github'].includes(meta.provider)) continue;
                // Unknown provider — use browser automation as fallback.
                const taskExt = task as {
                    taskId: string;
                    payload: Record<string, unknown>;
                    context?: { url?: string };
                    workspace_url?: string;
                };
                const url =
                    taskExt.context?.url ??
                    taskExt.workspace_url ??
                    (typeof task.payload['url'] === 'string' ? task.payload['url'] : '');
                if (!url) {
                    console.warn(`[closeout] browser fallback skipped for provider ${meta.provider}: no url on task ${task.taskId}`);
                    continue;
                }
                const summary =
                    typeof task.payload['summary'] === 'string'
                        ? task.payload['summary'].trim()
                        : `${meta.provider} action`;
                const instructions = `${meta.provider} action for task ${task.taskId}: ${summary}`.trim();
                console.log(`[closeout] browser fallback attempt for provider ${meta.provider}, task ${task.taskId}, url ${url}`);
                executeBrowserAction({ url, instructions, taskId: task.taskId })
                    .then((r) => {
                        if (!r.ok) {
                            console.warn(`[closeout] browser fallback failed for ${meta.provider}: ${r.reason ?? 'unknown'}`);
                        } else {
                            console.log(`[closeout] browser fallback succeeded for ${meta.provider}: ${r.output}`);
                        }
                    })
                    .catch(() => undefined);
            }

            return { resolvedLanguage: outputLang };
        }

        // Env-var fallback path
        await Promise.all([
            maybeUpdateJira(task, result),
            maybeNotifySlack(task, result),
            maybeUpdateGitHubPR(task, result),
        ]);
        return { resolvedLanguage: outputLang };
    } catch {
        // Close-out failures must never surface to the caller
    }
}
