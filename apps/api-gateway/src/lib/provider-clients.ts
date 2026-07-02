/**
 * Real connector provider clients.
 *
 * Exports:
 *  - createRealProviderExecutor(secretStore, fetch?)  → ProviderExecutor
 *  - createRealConnectorHealthProbe(secretStore, fetch?) → ConnectorHealthProbe
 *
 * Credential format (JSON stored in Key Vault / SecretStore):
 *
 *   Jira:   { "access_token": "...", "base_url": "https://yoursite.atlassian.net" }
 *   Teams:  { "access_token": "..." }          (Microsoft Graph Bearer)
 *   GitHub: { "access_token": "..." }          (OAuth or PAT)
 *   Email:  { "type": "smtp", "smtp_host": "...", "smtp_port": 587, "smtp_user": "...",
 *              "smtp_pass": "...", "from_address": "..." }
 *         | { "type": "sendgrid", "api_key": "...", "from_address": "..." }
 *   Custom: { "base_url": "https://api.example.com", "auth_type": "api_key|bearer_token|basic_auth|none",
 *              "api_key"?: "...", "api_key_header"?: "X-API-Key",
 *              "bearer_token"?: "...", "basic_user"?: "...", "basic_pass"?: "..." }
 *   Slack:  { "botToken": "xoxb-...", "defaultChannel"?: "#general" }
 *   Gmail:  { "access_token": "..." }          (Google OAuth bearer)
 *   Outlook:{ "access_token": "..." }          (Microsoft Graph bearer)
 *   HubSpot:{ "access_token": "..." }          (private-app token, Bearer)
 *   Salesforce: { "access_token": "...", "instance_url": "https://org.my.salesforce.com" }
 *   Greenhouse: { "api_key": "...", "on_behalf_of"?: "<harvest user id, required for writes>" }
 *   WordPress: { "base_url": "https://blog.example.com", "username": "...", "app_password": "..." }
 *
 * All actions accept a typed payload object (see ActionPayload* below).
 */

import type { SecretStore } from './secret-store.js';
import { resolveOperation, type CustomApiTool } from './openapi-catalog.js';

// ---------------------------------------------------------------------------
// Re-exported types that connector-actions.ts uses
// ---------------------------------------------------------------------------

export type ConnectorType =
    | 'jira'
    | 'teams'
    | 'github'
    | 'email'
    | 'custom_api'
    | 'slack'
    | 'gitlab'
    | 'linear'
    | 'asana'
    | 'trello'
    | 'clickup'
    | 'azure_devops'
    | 'gmail'
    | 'outlook'
    | 'hubspot'
    | 'salesforce'
    | 'greenhouse'
    | 'wordpress';
export type ConnectorActionType =
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'create_pr'
    | 'merge_pr'
    | 'list_prs'
    | 'send_email'
    | 'list_emails'
    | 'read_email'
    | 'reply_email'
    | 'read_thread'
    | 'get_record'
    | 'search_records'
    | 'create_record'
    | 'update_record'
    | 'log_activity'
    | 'get_content'
    | 'list_content'
    | 'publish_content'
    | 'update_content';

export type ConnectorActionErrorCode =
    | 'rate_limit'
    | 'timeout'
    | 'provider_unavailable'
    | 'permission_denied'
    | 'invalid_format'
    | 'unsupported_action'
    | 'upgrade_required';

export type ProviderExecutionResult = {
    ok: boolean;
    providerResponseCode: string;
    resultSummary: string;
    transient?: boolean;
    errorCode?: ConnectorActionErrorCode;
    errorMessage?: string;
    remediationHint?: string;
};

export type HealthProbeResult = {
    outcome: 'ok' | 'auth_failure' | 'rate_limited' | 'network_timeout';
    message: string;
};

export type ConnectorAuthMetadata = {
    connectorId: string;
    connectorType: string;
    secretRefId: string | null;
    status: string;
    scopeStatus: 'full' | 'partial' | 'insufficient' | null;
    lastErrorClass: string | null;
};

export type ProviderExecutor = (input: {
    connectorType: ConnectorType;
    actionType: ConnectorActionType;
    payload: Record<string, unknown>;
    attempt: number;
    secretRefId: string | null;
}) => Promise<ProviderExecutionResult>;

export type ConnectorHealthProbe = (input: {
    connectorType: ConnectorType;
    metadata: ConnectorAuthMetadata;
}) => Promise<HealthProbeResult>;

// ---------------------------------------------------------------------------
// Internal credential types
// ---------------------------------------------------------------------------

type JiraCredentials = { access_token: string; base_url: string };
type TeamsCredentials = { access_token: string };
type GitHubCredentials = { access_token: string };
type SlackCredentials = { botToken: string; defaultChannel?: string };
type SmtpCredentials = {
    type: 'smtp';
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass: string;
    from_address: string;
};
type SendGridCredentials = {
    type: 'sendgrid';
    api_key: string;
    from_address: string;
};
type EmailCredentials = SmtpCredentials | SendGridCredentials;

type CustomApiAuthType = 'none' | 'api_key' | 'bearer_token' | 'basic_auth';
type CustomApiCredentials = {
    base_url: string;
    auth_type?: CustomApiAuthType;
    api_key?: string;
    api_key_header?: string;  // defaults to 'X-API-Key'
    bearer_token?: string;
    basic_user?: string;
    basic_pass?: string;
};

// GitLab: PAT or OAuth token. base_url optional for self-hosted (defaults to gitlab.com).
type GitLabCredentials = { access_token: string; base_url?: string };
// Linear: personal API key (sent as the raw Authorization header value).
type LinearCredentials = { api_key: string };
// Asana: Personal Access Token (Bearer). base_url optional (defaults to public API).
type AsanaCredentials = { access_token: string; base_url?: string };
// Trello: API key + token, both sent as query params on every request.
type TrelloCredentials = { api_key: string; token: string };
// ClickUp: personal API token (sent as the raw Authorization header value).
type ClickUpCredentials = { api_key: string };
// Azure DevOps: PAT (HTTP Basic with empty user) + organization; project from payload.
type AzureDevOpsCredentials = { access_token: string; organization: string };
type GmailCredentials = { access_token: string };
type OutlookCredentials = { access_token: string };
type HubSpotCredentials = { access_token: string };
type SalesforceCredentials = { access_token: string; instance_url: string };
type GreenhouseCredentials = { api_key: string; on_behalf_of?: string };
type WordPressCredentials = { base_url: string; username: string; app_password: string };

type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

const parseCredentials = <T>(raw: string | null): T | null => {
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const classifyHttpError = (status: number): {
    errorCode: ConnectorActionErrorCode;
    transient: boolean;
    remediationHint: string;
} => {
    if (status === 401 || status === 403) {
        return {
            errorCode: 'permission_denied',
            transient: false,
            remediationHint: 'Re-consent connector scopes or refresh the access token.',
        };
    }
    if (status === 429) {
        return {
            errorCode: 'rate_limit',
            transient: true,
            remediationHint: 'Retry later with exponential backoff.',
        };
    }
    if (status === 422 || status === 400) {
        return {
            errorCode: 'invalid_format',
            transient: false,
            remediationHint: 'Check payload fields match provider schema.',
        };
    }
    if (status >= 500) {
        return {
            errorCode: 'provider_unavailable',
            transient: true,
            remediationHint: 'Provider is temporarily unavailable. Retry with backoff.',
        };
    }
    return {
        errorCode: 'provider_unavailable',
        transient: false,
        remediationHint: 'Unexpected provider response.',
    };
};

const failFromStatus = (
    status: number,
    summary: string,
    detail?: string,
): ProviderExecutionResult => {
    const { errorCode, transient, remediationHint } = classifyHttpError(status);
    return {
        ok: false,
        providerResponseCode: String(status),
        resultSummary: summary,
        transient,
        errorCode,
        errorMessage: detail ?? summary,
        remediationHint,
    };
};

// ---------------------------------------------------------------------------
// Jira connector
// ---------------------------------------------------------------------------

const executeJira = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: JiraCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const baseUrl = credentials.base_url.replace(/\/$/, '');
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    if (actionType === 'read_task') {
        const issueKey = String(payload['issue_key'] ?? '').trim();
        if (!issueKey) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required field: issue_key',
                errorCode: 'invalid_format',
                errorMessage: 'issue_key is required for read_task',
                remediationHint: 'Provide issue_key (e.g. "PROJ-123") in the payload.',
            };
        }

        const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
        let res: Response;
        try {
            res = await fetcher(url, { headers });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching Jira',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to the Jira instance.',
            };
        }

        if (!res.ok) {
            return failFromStatus(res.status, `Jira returned ${res.status} for issue ${issueKey}`);
        }

        const data = (await res.json()) as { key: string; fields?: { summary?: string; status?: { name?: string } } };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Issue ${data.key}: ${data.fields?.summary ?? '(no summary)'} [${data.fields?.status?.name ?? 'unknown'}]`,
        };
    }

    if (actionType === 'create_comment') {
        const issueKey = String(payload['issue_key'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (!issueKey || !body) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: issue_key, body',
                errorCode: 'invalid_format',
                errorMessage: 'Both issue_key and body are required for create_comment',
                remediationHint: 'Provide issue_key and body in the payload.',
            };
        }

        const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
        const commentBody = {
            body: {
                type: 'doc',
                version: 1,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
            },
        };

        let res: Response;
        try {
            res = await fetcher(url, { method: 'POST', headers, body: JSON.stringify(commentBody) });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching Jira',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to the Jira instance.',
            };
        }

        if (!res.ok) {
            return failFromStatus(res.status, `Jira comment creation failed with ${res.status}`);
        }

        const comment = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Comment ${comment.id ?? 'created'} added to ${issueKey}`,
        };
    }

    if (actionType === 'update_status') {
        const issueKey = String(payload['issue_key'] ?? '').trim();
        const transitionName = String(payload['transition_name'] ?? '').trim();
        if (!issueKey || !transitionName) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: issue_key, transition_name',
                errorCode: 'invalid_format',
                errorMessage: 'Both issue_key and transition_name are required for update_status',
                remediationHint: 'Provide issue_key and transition_name in the payload.',
            };
        }

        // Step 1: Get available transitions
        const transitionsUrl = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
        let transRes: Response;
        try {
            transRes = await fetcher(transitionsUrl, { headers });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching Jira',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to the Jira instance.',
            };
        }

        if (!transRes.ok) {
            return failFromStatus(transRes.status, `Failed to fetch Jira transitions for ${issueKey}`);
        }

        const { transitions } = (await transRes.json()) as {
            transitions: Array<{ id: string; name: string }>;
        };
        const transition = transitions.find(
            (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
        );

        if (!transition) {
            return {
                ok: false,
                providerResponseCode: '422',
                resultSummary: `Transition "${transitionName}" not found on issue ${issueKey}`,
                errorCode: 'invalid_format',
                errorMessage: `Available transitions: ${transitions.map((t) => t.name).join(', ')}`,
                remediationHint: 'Use an available transition name for this issue.',
            };
        }

        // Step 2: Apply the transition
        let applyRes: Response;
        try {
            applyRes = await fetcher(transitionsUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ transition: { id: transition.id } }),
            });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching Jira',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to the Jira instance.',
            };
        }

        if (!applyRes.ok) {
            return failFromStatus(applyRes.status, `Jira transition failed for ${issueKey}`);
        }

        return {
            ok: true,
            providerResponseCode: String(applyRes.status),
            resultSummary: `Issue ${issueKey} transitioned to "${transitionName}"`,
        };
    }

    return {
        ok: false,
        providerResponseCode: '400',
        resultSummary: `Action ${actionType} is not supported by the Jira connector`,
        errorCode: 'unsupported_action',
        errorMessage: `Jira supports: read_task, create_comment, update_status`,
    };
};

// ---------------------------------------------------------------------------
// Teams connector (Microsoft Graph)
// ---------------------------------------------------------------------------

const executeTeams = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: TeamsCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    if (actionType !== 'send_message') {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: `Action ${actionType} is not supported by the Teams connector`,
            errorCode: 'unsupported_action',
            errorMessage: `Teams supports: send_message`,
        };
    }

    const teamId = String(payload['team_id'] ?? '').trim();
    const channelId = String(payload['channel_id'] ?? '').trim();
    const text = String(payload['text'] ?? '').trim();
    if (!teamId || !channelId || !text) {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: 'Missing required fields: team_id, channel_id, text',
            errorCode: 'invalid_format',
            errorMessage: 'team_id, channel_id, and text are required for send_message',
            remediationHint: 'Provide team_id, channel_id, and text in the payload.',
        };
    }

    const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`;
    const messageBody = {
        body: { contentType: 'html', content: text },
    };

    let res: Response;
    try {
        res = await fetcher(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody),
        });
    } catch (err) {
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'Network error reaching Microsoft Graph',
            transient: true,
            errorCode: 'provider_unavailable',
            errorMessage: String(err),
            remediationHint: 'Check network connectivity.',
        };
    }

    if (!res.ok) {
        return failFromStatus(res.status, `Teams message failed with ${res.status}`);
    }

    const msg = (await res.json()) as { id?: string };
    return {
        ok: true,
        providerResponseCode: String(res.status),
        resultSummary: `Message ${msg.id ?? 'sent'} posted to Teams channel ${channelId}`,
    };
};

// ---------------------------------------------------------------------------
// GitHub connector
// ---------------------------------------------------------------------------

const executeGitHub = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: GitHubCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    if (actionType === 'create_pr') {
        const owner = String(payload['owner'] ?? '').trim();
        const repo = String(payload['repo'] ?? '').trim();
        const title = String(payload['title'] ?? '').trim();
        const head = String(payload['head'] ?? '').trim();
        const base = String(payload['base'] ?? '').trim();
        const body = payload['body'] !== undefined ? String(payload['body']) : undefined;
        const draft = typeof payload['draft'] === 'boolean' ? payload['draft'] : undefined;

        if (!owner || !repo || !title || !head || !base) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: owner, repo, title, head, base',
                errorCode: 'invalid_format',
                errorMessage: 'owner, repo, title, head, and base are required for create_pr',
                remediationHint: 'Provide owner, repo, title, head, and base in the payload.',
            };
        }

        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;
        const requestBody: Record<string, unknown> = { title, head, base };
        if (body !== undefined) {
            requestBody['body'] = body;
        }
        if (draft !== undefined) {
            requestBody['draft'] = draft;
        }

        let res: Response;
        try {
            res = await fetcher(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching GitHub',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to api.github.com.',
            };
        }

        if (!res.ok) {
            return failFromStatus(res.status, `GitHub create PR failed with ${res.status}`);
        }

        const created = (await res.json()) as { number?: number; html_url?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `PR #${created.number ?? 'created'} opened for ${owner}/${repo}`,
        };
    }

    if (actionType === 'merge_pr') {
        const owner = String(payload['owner'] ?? '').trim();
        const repo = String(payload['repo'] ?? '').trim();
        const pullNumber = Number(payload['pull_number']);
        const commitTitle = payload['commit_title'] !== undefined ? String(payload['commit_title']) : undefined;
        const commitMessage = payload['commit_message'] !== undefined ? String(payload['commit_message']) : undefined;
        const mergeMethod = payload['merge_method'] !== undefined ? String(payload['merge_method']) : undefined;

        if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber <= 0) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: owner, repo, pull_number (integer)',
                errorCode: 'invalid_format',
                errorMessage: 'owner, repo, and pull_number are required for merge_pr',
                remediationHint: 'Provide owner, repo, and pull_number in the payload.',
            };
        }

        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/merge`;
        const requestBody: Record<string, unknown> = {};
        if (commitTitle !== undefined) {
            requestBody['commit_title'] = commitTitle;
        }
        if (commitMessage !== undefined) {
            requestBody['commit_message'] = commitMessage;
        }
        if (mergeMethod !== undefined) {
            requestBody['merge_method'] = mergeMethod;
        }

        let res: Response;
        try {
            res = await fetcher(url, {
                method: 'PUT',
                headers,
                body: JSON.stringify(requestBody),
            });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching GitHub',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to api.github.com.',
            };
        }

        if (!res.ok) {
            return failFromStatus(res.status, `GitHub merge PR failed with ${res.status}`);
        }

        const merged = (await res.json()) as { sha?: string; merged?: boolean };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `PR #${pullNumber} merged for ${owner}/${repo} (${merged.sha ?? 'no sha'})`,
        };
    }

    if (actionType === 'list_prs') {
        const owner = String(payload['owner'] ?? '').trim();
        const repo = String(payload['repo'] ?? '').trim();
        const state = payload['state'] !== undefined ? String(payload['state']).trim() : 'open';

        if (!owner || !repo) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: owner, repo',
                errorCode: 'invalid_format',
                errorMessage: 'owner and repo are required for list_prs',
                remediationHint: 'Provide owner and repo in the payload.',
            };
        }

        const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`);
        url.searchParams.set('state', state || 'open');

        let res: Response;
        try {
            res = await fetcher(url.toString(), {
                method: 'GET',
                headers,
            });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching GitHub',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to api.github.com.',
            };
        }

        if (!res.ok) {
            return failFromStatus(res.status, `GitHub list PRs failed with ${res.status}`);
        }

        const prs = (await res.json()) as Array<{ number?: number }>;
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Fetched ${prs.length} pull request(s) for ${owner}/${repo}`,
        };
    }

    if (actionType !== 'create_pr_comment') {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: `Action ${actionType} is not supported by the GitHub connector`,
            errorCode: 'unsupported_action',
            errorMessage: 'GitHub supports: create_pr_comment, create_pr, merge_pr, list_prs',
        };
    }

    const owner = String(payload['owner'] ?? '').trim();
    const repo = String(payload['repo'] ?? '').trim();
    const pullNumber = Number(payload['pull_number']);
    const body = String(payload['body'] ?? '').trim();

    if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber <= 0 || !body) {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: 'Missing required fields: owner, repo, pull_number (integer), body',
            errorCode: 'invalid_format',
            errorMessage: 'owner, repo, pull_number, and body are required for create_pr_comment',
            remediationHint: 'Provide owner, repo, pull_number, and body in the payload.',
        };
    }

    // Optional inline comment fields
    const commitId = payload['commit_id'] !== undefined ? String(payload['commit_id']) : undefined;
    const path = payload['path'] !== undefined ? String(payload['path']) : undefined;
    const position = payload['position'] !== undefined ? Number(payload['position']) : undefined;

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/comments`;

    const commentBody: Record<string, unknown> = { body };
    if (commitId !== undefined) {
        commentBody['commit_id'] = commitId;
    }
    if (path !== undefined) {
        commentBody['path'] = path;
    }
    if (position !== undefined) {
        commentBody['position'] = position;
    }

    let res: Response;
    try {
        res = await fetcher(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(commentBody),
        });
    } catch (err) {
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'Network error reaching GitHub',
            transient: true,
            errorCode: 'provider_unavailable',
            errorMessage: String(err),
            remediationHint: 'Check network connectivity to api.github.com.',
        };
    }

    if (!res.ok) {
        return failFromStatus(res.status, `GitHub PR comment failed with ${res.status}`);
    }

    const comment = (await res.json()) as { id?: number; html_url?: string };
    return {
        ok: true,
        providerResponseCode: String(res.status),
        resultSummary: `Comment ${comment.id ?? 'created'} added to PR #${pullNumber} (${owner}/${repo})`,
    };
};

// ---------------------------------------------------------------------------
// GitLab connector (merge requests + issues; REST v4)
// Action mapping (reuses the shared ConnectorActionType vocabulary):
//   create_pr        → create merge request
//   merge_pr         → merge merge request
//   list_prs         → list merge requests
//   create_pr_comment/create_comment → add a note to a merge request
//   read_task        → read an issue
// payload.project_id accepts a numeric id or a URL-encodable "namespace/project" path.
// ---------------------------------------------------------------------------

const gitlabApiBase = (credentials: GitLabCredentials): string =>
    (credentials.base_url?.replace(/\/$/, '') ?? 'https://gitlab.com') + '/api/v4';

const executeGitLab = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: GitLabCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const apiBase = gitlabApiBase(credentials);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const projectId = String(payload['project_id'] ?? '').trim();
    const requireProject = (): ProviderExecutionResult | null =>
        projectId
            ? null
            : {
                  ok: false,
                  providerResponseCode: '400',
                  resultSummary: 'Missing required field: project_id',
                  errorCode: 'invalid_format',
                  errorMessage: 'project_id is required (numeric id or "namespace/project").',
                  remediationHint: 'Provide project_id in the payload.',
              };
    const networkError = (err: unknown): ProviderExecutionResult => ({
        ok: false,
        providerResponseCode: '0',
        resultSummary: 'Network error reaching GitLab',
        transient: true,
        errorCode: 'provider_unavailable',
        errorMessage: String(err),
        remediationHint: 'Check network connectivity to the GitLab instance.',
    });
    const proj = encodeURIComponent(projectId);

    if (actionType === 'create_pr') {
        const missing = requireProject();
        if (missing) return missing;
        const sourceBranch = String(payload['head'] ?? payload['source_branch'] ?? '').trim();
        const targetBranch = String(payload['base'] ?? payload['target_branch'] ?? '').trim();
        const title = String(payload['title'] ?? '').trim();
        if (!sourceBranch || !targetBranch || !title) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: head/source_branch, base/target_branch, title',
                errorCode: 'invalid_format',
                errorMessage: 'source_branch, target_branch, and title are required for create_pr.',
                remediationHint: 'Provide head, base, and title in the payload.',
            };
        }
        const body: Record<string, unknown> = {
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title,
        };
        if (payload['body'] !== undefined) body['description'] = String(payload['body']);
        let res: Response;
        try {
            res = await fetcher(`${apiBase}/projects/${proj}/merge_requests`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
        } catch (err) {
            return networkError(err);
        }
        if (!res.ok) return failFromStatus(res.status, `GitLab create MR failed with ${res.status}`);
        const created = (await res.json()) as { iid?: number; web_url?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `MR !${created.iid ?? 'created'} opened for project ${projectId}`,
        };
    }

    if (actionType === 'merge_pr') {
        const missing = requireProject();
        if (missing) return missing;
        const mrIid = Number(payload['pull_number'] ?? payload['merge_request_iid']);
        if (!Number.isInteger(mrIid) || mrIid <= 0) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required field: pull_number (merge request iid)',
                errorCode: 'invalid_format',
                errorMessage: 'pull_number (the MR iid) is required for merge_pr.',
                remediationHint: 'Provide pull_number in the payload.',
            };
        }
        let res: Response;
        try {
            res = await fetcher(`${apiBase}/projects/${proj}/merge_requests/${mrIid}/merge`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({}),
            });
        } catch (err) {
            return networkError(err);
        }
        if (!res.ok) return failFromStatus(res.status, `GitLab merge MR failed with ${res.status}`);
        const merged = (await res.json()) as { sha?: string; state?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `MR !${mrIid} merged for project ${projectId} (${merged.sha ?? merged.state ?? 'ok'})`,
        };
    }

    if (actionType === 'list_prs') {
        const missing = requireProject();
        if (missing) return missing;
        const state = payload['state'] !== undefined ? String(payload['state']).trim() : 'opened';
        const url = new URL(`${apiBase}/projects/${proj}/merge_requests`);
        url.searchParams.set('state', state || 'opened');
        let res: Response;
        try {
            res = await fetcher(url.toString(), { method: 'GET', headers });
        } catch (err) {
            return networkError(err);
        }
        if (!res.ok) return failFromStatus(res.status, `GitLab list MRs failed with ${res.status}`);
        const mrs = (await res.json()) as Array<{ iid?: number }>;
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Fetched ${mrs.length} merge request(s) for project ${projectId}`,
        };
    }

    if (actionType === 'create_pr_comment' || actionType === 'create_comment') {
        const missing = requireProject();
        if (missing) return missing;
        const mrIid = Number(payload['pull_number'] ?? payload['merge_request_iid']);
        const note = String(payload['body'] ?? '').trim();
        if (!Number.isInteger(mrIid) || mrIid <= 0 || !note) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: pull_number, body',
                errorCode: 'invalid_format',
                errorMessage: 'pull_number (MR iid) and body are required to add a note.',
                remediationHint: 'Provide pull_number and body in the payload.',
            };
        }
        let res: Response;
        try {
            res = await fetcher(`${apiBase}/projects/${proj}/merge_requests/${mrIid}/notes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ body: note }),
            });
        } catch (err) {
            return networkError(err);
        }
        if (!res.ok) return failFromStatus(res.status, `GitLab MR note failed with ${res.status}`);
        const comment = (await res.json()) as { id?: number };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Note ${comment.id ?? 'created'} added to MR !${mrIid} (project ${projectId})`,
        };
    }

    if (actionType === 'read_task') {
        const missing = requireProject();
        if (missing) return missing;
        const issueIid = Number(payload['issue_iid'] ?? payload['issue_key']);
        if (!Number.isInteger(issueIid) || issueIid <= 0) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required field: issue_iid',
                errorCode: 'invalid_format',
                errorMessage: 'issue_iid is required for read_task.',
                remediationHint: 'Provide issue_iid in the payload.',
            };
        }
        let res: Response;
        try {
            res = await fetcher(`${apiBase}/projects/${proj}/issues/${issueIid}`, { method: 'GET', headers });
        } catch (err) {
            return networkError(err);
        }
        if (!res.ok) return failFromStatus(res.status, `GitLab read issue failed with ${res.status}`);
        const issue = (await res.json()) as { iid?: number; title?: string; state?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Issue #${issue.iid ?? issueIid}: ${issue.title ?? '(no title)'} [${issue.state ?? 'unknown'}]`,
        };
    }

    return {
        ok: false,
        providerResponseCode: '400',
        resultSummary: `Action ${actionType} is not supported by the GitLab connector`,
        errorCode: 'unsupported_action',
        errorMessage: 'GitLab supports: create_pr, merge_pr, list_prs, create_pr_comment, create_comment, read_task',
    };
};

// ---------------------------------------------------------------------------
// Linear connector (GraphQL). Issue tracker — no PR concept.
//   read_task      → issue(id) query
//   create_comment → commentCreate mutation
//   update_status  → issueUpdate(stateId) mutation
// ---------------------------------------------------------------------------

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

const executeLinear = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: LinearCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: credentials.api_key,
        'Content-Type': 'application/json',
    };
    const post = async (query: string, variables: Record<string, unknown>): Promise<ProviderExecutionResult | { data: unknown }> => {
        let res: Response;
        try {
            res = await fetcher(LINEAR_GRAPHQL_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, variables }),
            });
        } catch (err) {
            return {
                ok: false,
                providerResponseCode: '0',
                resultSummary: 'Network error reaching Linear',
                transient: true,
                errorCode: 'provider_unavailable',
                errorMessage: String(err),
                remediationHint: 'Check network connectivity to api.linear.app.',
            };
        }
        if (!res.ok) return failFromStatus(res.status, `Linear GraphQL returned ${res.status}`);
        const json = (await res.json()) as { data?: unknown; errors?: Array<{ message?: string }> };
        if (json.errors?.length) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Linear GraphQL error',
                errorCode: 'invalid_format',
                errorMessage: json.errors.map((e) => e.message).join('; '),
                remediationHint: 'Check the issue id / field values in the payload.',
            };
        }
        return { data: json.data };
    };
    const isResult = (v: unknown): v is ProviderExecutionResult =>
        typeof v === 'object' && v !== null && 'ok' in v;

    if (actionType === 'read_task') {
        const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '').trim();
        if (!issueId) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required field: issue_id',
                errorCode: 'invalid_format',
                errorMessage: 'issue_id is required for read_task.',
                remediationHint: 'Provide issue_id in the payload.',
            };
        }
        const out = await post(
            'query($id:String!){ issue(id:$id){ identifier title state{ name } } }',
            { id: issueId },
        );
        if (isResult(out)) return out;
        const issue = (out.data as { issue?: { identifier?: string; title?: string; state?: { name?: string } } }).issue;
        return {
            ok: true,
            providerResponseCode: '200',
            resultSummary: `Issue ${issue?.identifier ?? issueId}: ${issue?.title ?? '(no title)'} [${issue?.state?.name ?? 'unknown'}]`,
        };
    }

    if (actionType === 'create_comment') {
        const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (!issueId || !body) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: issue_id, body',
                errorCode: 'invalid_format',
                errorMessage: 'issue_id and body are required for create_comment.',
                remediationHint: 'Provide issue_id and body in the payload.',
            };
        }
        const out = await post(
            'mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success comment{ id } } }',
            { input: { issueId, body } },
        );
        if (isResult(out)) return out;
        const created = (out.data as { commentCreate?: { success?: boolean; comment?: { id?: string } } }).commentCreate;
        return {
            ok: true,
            providerResponseCode: '200',
            resultSummary: `Comment ${created?.comment?.id ?? 'created'} added to Linear issue ${issueId}`,
        };
    }

    if (actionType === 'update_status') {
        const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '').trim();
        const stateId = String(payload['state_id'] ?? payload['status'] ?? '').trim();
        if (!issueId || !stateId) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Missing required fields: issue_id, state_id',
                errorCode: 'invalid_format',
                errorMessage: 'issue_id and state_id (Linear workflow state id) are required for update_status.',
                remediationHint: 'Provide issue_id and state_id in the payload.',
            };
        }
        const out = await post(
            'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success } }',
            { id: issueId, input: { stateId } },
        );
        if (isResult(out)) return out;
        return {
            ok: true,
            providerResponseCode: '200',
            resultSummary: `Linear issue ${issueId} status updated`,
        };
    }

    return {
        ok: false,
        providerResponseCode: '400',
        resultSummary: `Action ${actionType} is not supported by the Linear connector`,
        errorCode: 'unsupported_action',
        errorMessage: 'Linear supports: read_task, create_comment, update_status',
    };
};

// ---------------------------------------------------------------------------
// Shared helpers for the task-tracker / code connectors below
// ---------------------------------------------------------------------------

const networkError = (provider: string, host: string, err: unknown): ProviderExecutionResult => ({
    ok: false,
    providerResponseCode: '0',
    resultSummary: `Network error reaching ${provider}`,
    transient: true,
    errorCode: 'provider_unavailable',
    errorMessage: String(err),
    remediationHint: `Check network connectivity to ${host}.`,
});

const missingFields = (fields: string, detail: string): ProviderExecutionResult => ({
    ok: false,
    providerResponseCode: '400',
    resultSummary: `Missing required field(s): ${fields}`,
    errorCode: 'invalid_format',
    errorMessage: detail,
    remediationHint: `Provide ${fields} in the payload.`,
});

const unsupported = (provider: string, supported: string): ProviderExecutionResult => ({
    ok: false,
    providerResponseCode: '400',
    resultSummary: `Action is not supported by the ${provider} connector`,
    errorCode: 'unsupported_action',
    errorMessage: `${provider} supports: ${supported}`,
});

// ---------------------------------------------------------------------------
// Asana connector (REST, Personal Access Token)
// ---------------------------------------------------------------------------

const executeAsana = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: AsanaCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const baseUrl = (credentials.base_url ?? 'https://app.asana.com/api/1.0').replace(/\/$/, '');
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const taskGid = String(payload['task_gid'] ?? payload['issue_key'] ?? payload['issue_id'] ?? '').trim();

    if (actionType === 'read_task') {
        if (!taskGid) return missingFields('task_gid', 'task_gid is required for read_task.');
        let res: Response;
        try {
            res = await fetcher(`${baseUrl}/tasks/${encodeURIComponent(taskGid)}`, { headers });
        } catch (err) {
            return networkError('Asana', 'app.asana.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Asana returned ${res.status} for task ${taskGid}`);
        const json = (await res.json()) as { data?: { name?: string; completed?: boolean } };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Task ${taskGid}: ${json.data?.name ?? '(no name)'} [${json.data?.completed ? 'completed' : 'open'}]`,
        };
    }

    if (actionType === 'create_comment') {
        const body = String(payload['body'] ?? '').trim();
        if (!taskGid || !body) return missingFields('task_gid, body', 'task_gid and body are required for create_comment.');
        let res: Response;
        try {
            res = await fetcher(`${baseUrl}/tasks/${encodeURIComponent(taskGid)}/stories`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ data: { text: body } }),
            });
        } catch (err) {
            return networkError('Asana', 'app.asana.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Asana comment creation failed with ${res.status}`);
        const json = (await res.json()) as { data?: { gid?: string } };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Comment ${json.data?.gid ?? 'created'} added to Asana task ${taskGid}`,
        };
    }

    if (actionType === 'update_status') {
        if (!taskGid) return missingFields('task_gid', 'task_gid is required for update_status.');
        // Asana models open/done as the boolean `completed`. Accept completed|status.
        const raw = payload['completed'] ?? payload['status'];
        const completed = typeof raw === 'boolean' ? raw : String(raw ?? '').toLowerCase() === 'completed';
        let res: Response;
        try {
            res = await fetcher(`${baseUrl}/tasks/${encodeURIComponent(taskGid)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ data: { completed } }),
            });
        } catch (err) {
            return networkError('Asana', 'app.asana.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Asana status update failed for ${taskGid}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Asana task ${taskGid} marked ${completed ? 'completed' : 'open'}`,
        };
    }

    return unsupported('Asana', 'read_task, create_comment, update_status');
};

// ---------------------------------------------------------------------------
// Trello connector (REST, key+token query params)
// ---------------------------------------------------------------------------

const executeTrello = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: TrelloCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const auth = `key=${encodeURIComponent(credentials.api_key)}&token=${encodeURIComponent(credentials.token)}`;
    const cardId = String(payload['card_id'] ?? payload['issue_key'] ?? payload['issue_id'] ?? '').trim();

    if (actionType === 'read_task') {
        if (!cardId) return missingFields('card_id', 'card_id is required for read_task.');
        let res: Response;
        try {
            res = await fetcher(`https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?${auth}`);
        } catch (err) {
            return networkError('Trello', 'api.trello.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Trello returned ${res.status} for card ${cardId}`);
        const json = (await res.json()) as { name?: string; idList?: string; closed?: boolean };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Card ${cardId}: ${json.name ?? '(no name)'} [list ${json.idList ?? 'unknown'}${json.closed ? ', archived' : ''}]`,
        };
    }

    if (actionType === 'create_comment') {
        const body = String(payload['body'] ?? '').trim();
        if (!cardId || !body) return missingFields('card_id, body', 'card_id and body are required for create_comment.');
        let res: Response;
        try {
            res = await fetcher(
                `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}/actions/comments?text=${encodeURIComponent(body)}&${auth}`,
                { method: 'POST' },
            );
        } catch (err) {
            return networkError('Trello', 'api.trello.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Trello comment creation failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Comment ${json.id ?? 'created'} added to Trello card ${cardId}`,
        };
    }

    if (actionType === 'update_status') {
        // Trello status == which list the card sits in. Require target list id.
        const idList = String(payload['list_id'] ?? payload['status'] ?? '').trim();
        if (!cardId || !idList) return missingFields('card_id, list_id', 'card_id and list_id are required for update_status.');
        let res: Response;
        try {
            res = await fetcher(
                `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?idList=${encodeURIComponent(idList)}&${auth}`,
                { method: 'PUT' },
            );
        } catch (err) {
            return networkError('Trello', 'api.trello.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Trello status update failed for ${cardId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Trello card ${cardId} moved to list ${idList}`,
        };
    }

    return unsupported('Trello', 'read_task, create_comment, update_status');
};

// ---------------------------------------------------------------------------
// ClickUp connector (REST, personal API token in Authorization header)
// ---------------------------------------------------------------------------

const executeClickUp = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: ClickUpCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: credentials.api_key,
        'Content-Type': 'application/json',
    };
    const taskId = String(payload['task_id'] ?? payload['issue_key'] ?? payload['issue_id'] ?? '').trim();

    if (actionType === 'read_task') {
        if (!taskId) return missingFields('task_id', 'task_id is required for read_task.');
        let res: Response;
        try {
            res = await fetcher(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, { headers });
        } catch (err) {
            return networkError('ClickUp', 'api.clickup.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `ClickUp returned ${res.status} for task ${taskId}`);
        const json = (await res.json()) as { name?: string; status?: { status?: string } };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Task ${taskId}: ${json.name ?? '(no name)'} [${json.status?.status ?? 'unknown'}]`,
        };
    }

    if (actionType === 'create_comment') {
        const body = String(payload['body'] ?? '').trim();
        if (!taskId || !body) return missingFields('task_id, body', 'task_id and body are required for create_comment.');
        let res: Response;
        try {
            res = await fetcher(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ comment_text: body }),
            });
        } catch (err) {
            return networkError('ClickUp', 'api.clickup.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `ClickUp comment creation failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Comment ${json.id ?? 'created'} added to ClickUp task ${taskId}`,
        };
    }

    if (actionType === 'update_status') {
        const status = String(payload['status'] ?? '').trim();
        if (!taskId || !status) return missingFields('task_id, status', 'task_id and status are required for update_status.');
        let res: Response;
        try {
            res = await fetcher(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ status }),
            });
        } catch (err) {
            return networkError('ClickUp', 'api.clickup.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `ClickUp status update failed for ${taskId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `ClickUp task ${taskId} status set to "${status}"`,
        };
    }

    return unsupported('ClickUp', 'read_task, create_comment, update_status');
};

// ---------------------------------------------------------------------------
// Azure DevOps connector (REST, PAT via HTTP Basic; work-item API)
// ---------------------------------------------------------------------------

const AZDO_API_VERSION = '7.0';

const executeAzureDevOps = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: AzureDevOpsCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const org = credentials.organization.replace(/\/$/, '');
    const project = String(payload['project'] ?? '').trim();
    const workItemId = String(payload['work_item_id'] ?? payload['issue_key'] ?? payload['issue_id'] ?? '').trim();
    // Azure DevOps PAT auth: HTTP Basic with empty username.
    const basic = Buffer.from(`:${credentials.access_token}`).toString('base64');
    const authHeader = `Basic ${basic}`;
    const base = org.startsWith('http') ? org : `https://dev.azure.com/${encodeURIComponent(org)}`;

    if (!project) return missingFields('project', 'project is required for Azure DevOps actions.');

    if (actionType === 'read_task') {
        if (!workItemId) return missingFields('work_item_id', 'work_item_id is required for read_task.');
        let res: Response;
        try {
            res = await fetcher(
                `${base}/${encodeURIComponent(project)}/_apis/wit/workitems/${encodeURIComponent(workItemId)}?api-version=${AZDO_API_VERSION}`,
                { headers: { Authorization: authHeader, Accept: 'application/json' } },
            );
        } catch (err) {
            return networkError('Azure DevOps', 'dev.azure.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Azure DevOps returned ${res.status} for work item ${workItemId}`);
        const json = (await res.json()) as { fields?: Record<string, unknown> };
        const title = String(json.fields?.['System.Title'] ?? '(no title)');
        const state = String(json.fields?.['System.State'] ?? 'unknown');
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Work item ${workItemId}: ${title} [${state}]`,
        };
    }

    if (actionType === 'create_comment') {
        const body = String(payload['body'] ?? '').trim();
        if (!workItemId || !body) return missingFields('work_item_id, body', 'work_item_id and body are required for create_comment.');
        let res: Response;
        try {
            res = await fetcher(
                `${base}/${encodeURIComponent(project)}/_apis/wit/workItems/${encodeURIComponent(workItemId)}/comments?api-version=${AZDO_API_VERSION}-preview.3`,
                {
                    method: 'POST',
                    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: body }),
                },
            );
        } catch (err) {
            return networkError('Azure DevOps', 'dev.azure.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Azure DevOps comment creation failed with ${res.status}`);
        const json = (await res.json()) as { id?: number };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Comment ${json.id ?? 'created'} added to work item ${workItemId}`,
        };
    }

    if (actionType === 'update_status') {
        const state = String(payload['state'] ?? payload['status'] ?? '').trim();
        if (!workItemId || !state) return missingFields('work_item_id, state', 'work_item_id and state are required for update_status.');
        let res: Response;
        try {
            res = await fetcher(
                `${base}/${encodeURIComponent(project)}/_apis/wit/workitems/${encodeURIComponent(workItemId)}?api-version=${AZDO_API_VERSION}`,
                {
                    method: 'PATCH',
                    headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json' },
                    body: JSON.stringify([{ op: 'add', path: '/fields/System.State', value: state }]),
                },
            );
        } catch (err) {
            return networkError('Azure DevOps', 'dev.azure.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Azure DevOps status update failed for ${workItemId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Work item ${workItemId} transitioned to "${state}"`,
        };
    }

    return unsupported('Azure DevOps', 'read_task, create_comment, update_status');
};

// ---------------------------------------------------------------------------
// Gmail connector (Gmail REST API, OAuth bearer)
// ---------------------------------------------------------------------------

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name?: string; value?: string };
type GmailMessageMeta = {
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: { headers?: GmailHeader[] };
};

const gmailHeader = (headers: GmailHeader[] | undefined, name: string): string =>
    headers?.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? '';

// Gmail send/reply take a full RFC822 message, base64url-encoded.
const buildRfc822 = (fields: Record<string, string>, body: string): string => {
    const headerLines = Object.entries(fields)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => `${k}: ${v}`);
    return `${headerLines.join('\r\n')}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
};

const executeGmail = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: GmailCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    if (actionType === 'send_email') {
        const to = String(payload['to'] ?? '').trim();
        const subject = String(payload['subject'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (!to || !subject || !body) {
            return missingFields('to, subject, body', 'to, subject, and body are required for send_email.');
        }
        const raw = Buffer.from(buildRfc822({ To: to, Subject: subject }, body)).toString('base64url');
        let res: Response;
        try {
            res = await fetcher(`${GMAIL_BASE}/messages/send`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ raw }),
            });
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Gmail send failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Email ${json.id ?? 'sent'} sent to ${to}`,
        };
    }

    if (actionType === 'list_emails') {
        const query = String(payload['query'] ?? '').trim();
        const maxResults = Number(payload['max_results'] ?? 10);
        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (query) params.set('q', query);
        let res: Response;
        try {
            res = await fetcher(`${GMAIL_BASE}/messages?${params.toString()}`, { headers });
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Gmail list failed with ${res.status}`);
        const json = (await res.json()) as { messages?: Array<{ id?: string }>; resultSizeEstimate?: number };
        const ids = (json.messages ?? []).map((m) => m.id ?? '').filter(Boolean);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${ids.length} message(s)${query ? ` matching "${query}"` : ''}: ${ids.join(', ') || '(none)'}`,
        };
    }

    if (actionType === 'read_email') {
        const messageId = String(payload['message_id'] ?? '').trim();
        if (!messageId) return missingFields('message_id', 'message_id is required for read_email.');
        let res: Response;
        try {
            res = await fetcher(
                `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
                { headers },
            );
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Gmail returned ${res.status} for message ${messageId}`);
        const json = (await res.json()) as GmailMessageMeta;
        const subject = gmailHeader(json.payload?.headers, 'Subject') || '(no subject)';
        const from = gmailHeader(json.payload?.headers, 'From') || '(unknown sender)';
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `"${subject}" from ${from} — ${json.snippet ?? ''}`,
        };
    }

    if (actionType === 'reply_email') {
        const messageId = String(payload['message_id'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (!messageId || !body) {
            return missingFields('message_id, body', 'message_id and body are required for reply_email.');
        }
        // Fetch the original for threading headers, then send within the same thread.
        let metaRes: Response;
        try {
            metaRes = await fetcher(
                `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`,
                { headers },
            );
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!metaRes.ok) return failFromStatus(metaRes.status, `Gmail returned ${metaRes.status} for message ${messageId}`);
        const meta = (await metaRes.json()) as GmailMessageMeta;
        const origSubject = gmailHeader(meta.payload?.headers, 'Subject');
        const origFrom = gmailHeader(meta.payload?.headers, 'From');
        const origMessageId = gmailHeader(meta.payload?.headers, 'Message-ID');
        const replyTo = String(payload['to'] ?? '').trim() || origFrom;
        if (!replyTo) return missingFields('to', 'Original sender unknown; provide "to" explicitly for reply_email.');
        const subject = origSubject.toLowerCase().startsWith('re:') ? origSubject : `Re: ${origSubject}`;
        const raw = Buffer.from(
            buildRfc822(
                { To: replyTo, Subject: subject, 'In-Reply-To': origMessageId, References: origMessageId },
                body,
            ),
        ).toString('base64url');
        let res: Response;
        try {
            res = await fetcher(`${GMAIL_BASE}/messages/send`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ raw, threadId: meta.threadId }),
            });
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Gmail reply failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Reply ${json.id ?? 'sent'} sent to ${replyTo} on thread ${meta.threadId ?? '(unknown)'}`,
        };
    }

    if (actionType === 'read_thread') {
        const threadId = String(payload['thread_id'] ?? '').trim();
        if (!threadId) return missingFields('thread_id', 'thread_id is required for read_thread.');
        let res: Response;
        try {
            res = await fetcher(`${GMAIL_BASE}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Subject`, {
                headers,
            });
        } catch (err) {
            return networkError('Gmail', 'gmail.googleapis.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Gmail returned ${res.status} for thread ${threadId}`);
        const json = (await res.json()) as { messages?: GmailMessageMeta[] };
        const messages = json.messages ?? [];
        const firstSubject = gmailHeader(messages[0]?.payload?.headers, 'Subject') || '(no subject)';
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Thread ${threadId}: ${messages.length} message(s), subject "${firstSubject}"`,
        };
    }

    return unsupported('Gmail', 'send_email, list_emails, read_email, reply_email, read_thread');
};

// ---------------------------------------------------------------------------
// Outlook connector (Microsoft Graph mail, OAuth bearer)
// ---------------------------------------------------------------------------

const GRAPH_MAIL_BASE = 'https://graph.microsoft.com/v1.0/me';

type GraphMessage = {
    id?: string;
    subject?: string;
    bodyPreview?: string;
    from?: { emailAddress?: { address?: string } };
};

const executeOutlook = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: OutlookCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    if (actionType === 'send_email') {
        const toRaw = payload['to'];
        const to = Array.isArray(toRaw) ? (toRaw as unknown[]).map(String) : typeof toRaw === 'string' && toRaw.trim() ? [toRaw.trim()] : [];
        const subject = String(payload['subject'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (to.length === 0 || !subject || !body) {
            return missingFields('to, subject, body', 'to, subject, and body are required for send_email.');
        }
        let res: Response;
        try {
            res = await fetcher(`${GRAPH_MAIL_BASE}/sendMail`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: {
                        subject,
                        body: { contentType: 'Text', content: body },
                        toRecipients: to.map((address) => ({ emailAddress: { address } })),
                    },
                }),
            });
        } catch (err) {
            return networkError('Outlook', 'graph.microsoft.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Outlook send failed with ${res.status}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Email sent to ${to.join(', ')}`,
        };
    }

    if (actionType === 'list_emails') {
        const maxResults = Number(payload['max_results'] ?? 10);
        let res: Response;
        try {
            res = await fetcher(
                `${GRAPH_MAIL_BASE}/messages?$top=${maxResults}&$select=id,subject,from,receivedDateTime`,
                { headers },
            );
        } catch (err) {
            return networkError('Outlook', 'graph.microsoft.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Outlook list failed with ${res.status}`);
        const json = (await res.json()) as { value?: GraphMessage[] };
        const items = (json.value ?? []).map(
            (m) => `"${m.subject ?? '(no subject)'}" from ${m.from?.emailAddress?.address ?? '(unknown)'}`,
        );
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${items.length} message(s): ${items.join('; ') || '(none)'}`,
        };
    }

    if (actionType === 'read_email') {
        const messageId = String(payload['message_id'] ?? '').trim();
        if (!messageId) return missingFields('message_id', 'message_id is required for read_email.');
        let res: Response;
        try {
            res = await fetcher(
                `${GRAPH_MAIL_BASE}/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,bodyPreview,receivedDateTime`,
                { headers },
            );
        } catch (err) {
            return networkError('Outlook', 'graph.microsoft.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Outlook returned ${res.status} for message ${messageId}`);
        const json = (await res.json()) as GraphMessage;
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `"${json.subject ?? '(no subject)'}" from ${json.from?.emailAddress?.address ?? '(unknown)'} — ${json.bodyPreview ?? ''}`,
        };
    }

    if (actionType === 'reply_email') {
        const messageId = String(payload['message_id'] ?? '').trim();
        const body = String(payload['body'] ?? '').trim();
        if (!messageId || !body) {
            return missingFields('message_id, body', 'message_id and body are required for reply_email.');
        }
        let res: Response;
        try {
            res = await fetcher(`${GRAPH_MAIL_BASE}/messages/${encodeURIComponent(messageId)}/reply`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ comment: body }),
            });
        } catch (err) {
            return networkError('Outlook', 'graph.microsoft.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Outlook reply failed with ${res.status}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Reply sent on message ${messageId}`,
        };
    }

    if (actionType === 'read_thread') {
        const conversationId = String(payload['conversation_id'] ?? payload['thread_id'] ?? '').trim();
        if (!conversationId) return missingFields('conversation_id', 'conversation_id is required for read_thread.');
        let res: Response;
        try {
            res = await fetcher(
                `${GRAPH_MAIL_BASE}/messages?$filter=${encodeURIComponent(`conversationId eq '${conversationId}'`)}&$select=id,subject,from`,
                { headers },
            );
        } catch (err) {
            return networkError('Outlook', 'graph.microsoft.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Outlook returned ${res.status} for conversation ${conversationId}`);
        const json = (await res.json()) as { value?: GraphMessage[] };
        const messages = json.value ?? [];
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Conversation ${conversationId}: ${messages.length} message(s), latest "${messages[messages.length - 1]?.subject ?? '(no subject)'}"`,
        };
    }

    return unsupported('Outlook', 'send_email, list_emails, read_email, reply_email, read_thread');
};

// ---------------------------------------------------------------------------
// HubSpot connector (CRM v3 objects API, private-app Bearer token)
// ---------------------------------------------------------------------------

const HUBSPOT_BASE = 'https://api.hubapi.com';

// Note→record association type ids (HUBSPOT_DEFINED).
const HUBSPOT_NOTE_ASSOCIATION: Record<string, number> = {
    contacts: 202,
    companies: 190,
    deals: 214,
    tickets: 228,
};

const executeHubSpot = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: HubSpotCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const recordType = String(payload['record_type'] ?? '').trim().toLowerCase();
    const recordId = String(payload['record_id'] ?? '').trim();

    if (actionType === 'get_record') {
        if (!recordType || !recordId) {
            return missingFields('record_type, record_id', 'record_type and record_id are required for get_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${HUBSPOT_BASE}/crm/v3/objects/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, { headers });
        } catch (err) {
            return networkError('HubSpot', 'api.hubapi.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `HubSpot returned ${res.status} for ${recordType}/${recordId}`);
        const json = (await res.json()) as { id?: string; properties?: Record<string, unknown> };
        const props = Object.entries(json.properties ?? {})
            .filter(([, v]) => v !== null && v !== '')
            .slice(0, 8)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(', ');
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${recordType} ${json.id ?? recordId}: ${props || '(no properties)'}`,
        };
    }

    if (actionType === 'search_records') {
        const query = String(payload['query'] ?? '').trim();
        if (!recordType || !query) {
            return missingFields('record_type, query', 'record_type and query are required for search_records.');
        }
        const limit = Number(payload['limit'] ?? 10);
        let res: Response;
        try {
            res = await fetcher(`${HUBSPOT_BASE}/crm/v3/objects/${encodeURIComponent(recordType)}/search`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, limit }),
            });
        } catch (err) {
            return networkError('HubSpot', 'api.hubapi.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `HubSpot search failed with ${res.status}`);
        const json = (await res.json()) as { total?: number; results?: Array<{ id?: string }> };
        const ids = (json.results ?? []).map((r) => r.id ?? '').filter(Boolean);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${json.total ?? ids.length} ${recordType} matching "${query}": ${ids.join(', ') || '(none)'}`,
        };
    }

    if (actionType === 'create_record') {
        const properties = payload['properties'];
        if (!recordType || !properties || typeof properties !== 'object') {
            return missingFields('record_type, properties', 'record_type and properties are required for create_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${HUBSPOT_BASE}/crm/v3/objects/${encodeURIComponent(recordType)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ properties }),
            });
        } catch (err) {
            return networkError('HubSpot', 'api.hubapi.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `HubSpot create failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Created ${recordType} ${json.id ?? '(id unknown)'}`,
        };
    }

    if (actionType === 'update_record') {
        const properties = payload['properties'];
        if (!recordType || !recordId || !properties || typeof properties !== 'object') {
            return missingFields('record_type, record_id, properties', 'record_type, record_id, and properties are required for update_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${HUBSPOT_BASE}/crm/v3/objects/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ properties }),
            });
        } catch (err) {
            return networkError('HubSpot', 'api.hubapi.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `HubSpot update failed with ${res.status} for ${recordType}/${recordId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Updated ${recordType} ${recordId}`,
        };
    }

    if (actionType === 'log_activity') {
        const body = String(payload['body'] ?? '').trim();
        if (!recordType || !recordId || !body) {
            return missingFields('record_type, record_id, body', 'record_type, record_id, and body are required for log_activity.');
        }
        const associationTypeId = HUBSPOT_NOTE_ASSOCIATION[recordType];
        if (!associationTypeId) {
            return missingFields('record_type', `log_activity supports record_type: ${Object.keys(HUBSPOT_NOTE_ASSOCIATION).join(', ')}.`);
        }
        let res: Response;
        try {
            res = await fetcher(`${HUBSPOT_BASE}/crm/v3/objects/notes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
                    associations: [
                        {
                            to: { id: recordId },
                            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId }],
                        },
                    ],
                }),
            });
        } catch (err) {
            return networkError('HubSpot', 'api.hubapi.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `HubSpot note creation failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Activity note ${json.id ?? 'created'} logged on ${recordType} ${recordId}`,
        };
    }

    return unsupported('HubSpot', 'get_record, search_records, create_record, update_record, log_activity');
};

// ---------------------------------------------------------------------------
// Salesforce connector (REST sobjects + SOQL, OAuth bearer + instance_url)
// ---------------------------------------------------------------------------

const SALESFORCE_API_VERSION = 'v61.0';

const escapeSoqlLiteral = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const executeSalesforce = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: SalesforceCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const base = `${credentials.instance_url.replace(/\/$/, '')}/services/data/${SALESFORCE_API_VERSION}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const recordType = String(payload['record_type'] ?? '').trim();
    const recordId = String(payload['record_id'] ?? '').trim();

    if (actionType === 'get_record') {
        if (!recordType || !recordId) {
            return missingFields('record_type, record_id', 'record_type and record_id are required for get_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${base}/sobjects/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, { headers });
        } catch (err) {
            return networkError('Salesforce', 'salesforce.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Salesforce returned ${res.status} for ${recordType}/${recordId}`);
        const json = (await res.json()) as Record<string, unknown>;
        const fields = Object.entries(json)
            .filter(([k, v]) => k !== 'attributes' && v !== null && v !== '')
            .slice(0, 8)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(', ');
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${recordType} ${recordId}: ${fields || '(no fields)'}`,
        };
    }

    if (actionType === 'search_records') {
        const rawSoql = String(payload['soql'] ?? '').trim();
        let soql = rawSoql;
        if (!soql) {
            const query = String(payload['query'] ?? '').trim();
            if (!recordType || !query) {
                return missingFields('record_type, query (or soql)', 'Provide soql, or record_type + query, for search_records.');
            }
            const limit = Number(payload['limit'] ?? 10);
            soql = `SELECT Id, Name FROM ${recordType} WHERE Name LIKE '%${escapeSoqlLiteral(query)}%' LIMIT ${limit}`;
        }
        let res: Response;
        try {
            res = await fetcher(`${base}/query?q=${encodeURIComponent(soql)}`, { headers });
        } catch (err) {
            return networkError('Salesforce', 'salesforce.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Salesforce query failed with ${res.status}`);
        const json = (await res.json()) as { totalSize?: number; records?: Array<{ Id?: string }> };
        const ids = (json.records ?? []).map((r) => r.Id ?? '').filter(Boolean);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${json.totalSize ?? ids.length} record(s): ${ids.join(', ') || '(none)'}`,
        };
    }

    if (actionType === 'create_record') {
        const fields = payload['fields'];
        if (!recordType || !fields || typeof fields !== 'object') {
            return missingFields('record_type, fields', 'record_type and fields are required for create_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${base}/sobjects/${encodeURIComponent(recordType)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(fields),
            });
        } catch (err) {
            return networkError('Salesforce', 'salesforce.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Salesforce create failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Created ${recordType} ${json.id ?? '(id unknown)'}`,
        };
    }

    if (actionType === 'update_record') {
        const fields = payload['fields'];
        if (!recordType || !recordId || !fields || typeof fields !== 'object') {
            return missingFields('record_type, record_id, fields', 'record_type, record_id, and fields are required for update_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${base}/sobjects/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(fields),
            });
        } catch (err) {
            return networkError('Salesforce', 'salesforce.com', err);
        }
        // Salesforce PATCH returns 204 No Content on success.
        if (!res.ok) return failFromStatus(res.status, `Salesforce update failed with ${res.status} for ${recordType}/${recordId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Updated ${recordType} ${recordId}`,
        };
    }

    if (actionType === 'log_activity') {
        const body = String(payload['body'] ?? '').trim();
        if (!recordId || !body) {
            return missingFields('record_id, body', 'record_id and body are required for log_activity.');
        }
        const subject = String(payload['subject'] ?? '').trim() || 'Activity logged by AgentFarm';
        let res: Response;
        try {
            res = await fetcher(`${base}/sobjects/Task`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    Subject: subject,
                    Description: body,
                    Status: 'Completed',
                    WhatId: recordId,
                }),
            });
        } catch (err) {
            return networkError('Salesforce', 'salesforce.com', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Salesforce activity logging failed with ${res.status}`);
        const json = (await res.json()) as { id?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Activity task ${json.id ?? 'created'} logged on record ${recordId}`,
        };
    }

    return unsupported('Salesforce', 'get_record, search_records, create_record, update_record, log_activity');
};

// ---------------------------------------------------------------------------
// Greenhouse connector (Harvest API, Basic auth: api key as username)
// ---------------------------------------------------------------------------

const GREENHOUSE_BASE = 'https://harvest.greenhouse.io/v1';

const executeGreenhouse = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: GreenhouseCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const headers: Record<string, string> = {
        Authorization: `Basic ${Buffer.from(`${credentials.api_key}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    // Harvest requires the acting user for every write.
    const onBehalfOf = String(credentials.on_behalf_of ?? '').trim();
    const requireOnBehalfOf = (): ProviderExecutionResult | null => {
        if (!onBehalfOf) {
            return missingFields(
                'on_behalf_of',
                'Greenhouse writes require on_behalf_of (Harvest user id) in the connector credentials.',
            );
        }
        headers['On-Behalf-Of'] = onBehalfOf;
        return null;
    };
    const recordType = String(payload['record_type'] ?? '').trim().toLowerCase();
    const recordId = String(payload['record_id'] ?? '').trim();

    if (actionType === 'get_record') {
        if (!recordType || !recordId) {
            return missingFields('record_type, record_id', 'record_type and record_id are required for get_record.');
        }
        let res: Response;
        try {
            res = await fetcher(`${GREENHOUSE_BASE}/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, { headers });
        } catch (err) {
            return networkError('Greenhouse', 'harvest.greenhouse.io', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Greenhouse returned ${res.status} for ${recordType}/${recordId}`);
        const json = (await res.json()) as Record<string, unknown>;
        const name = [json['first_name'], json['last_name']].filter(Boolean).join(' ') || (json['name'] as string | undefined) || '';
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${recordType} ${recordId}: ${name || '(unnamed)'}${json['title'] ? ` — ${String(json['title'])}` : ''}`,
        };
    }

    if (actionType === 'search_records') {
        const query = String(payload['query'] ?? '').trim();
        if (!recordType || !query) {
            return missingFields('record_type, query', 'record_type and query are required for search_records.');
        }
        const limit = Number(payload['limit'] ?? 10);
        // Harvest list endpoints filter by exact email; that is the reliable search key.
        const params = new URLSearchParams({ per_page: String(limit) });
        if (query.includes('@')) params.set('email', query);
        else params.set('candidate_ids', query);
        let res: Response;
        try {
            res = await fetcher(`${GREENHOUSE_BASE}/${encodeURIComponent(recordType)}?${params.toString()}`, { headers });
        } catch (err) {
            return networkError('Greenhouse', 'harvest.greenhouse.io', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Greenhouse search failed with ${res.status}`);
        const json = (await res.json()) as Array<Record<string, unknown>>;
        const items = (json ?? []).map((r) => `${String(r['id'] ?? '?')} (${[r['first_name'], r['last_name']].filter(Boolean).join(' ') || '(unnamed)'})`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${items.length} ${recordType} matching "${query}": ${items.join(', ') || '(none)'}`,
        };
    }

    if (actionType === 'create_record') {
        const fields = payload['fields'];
        if (!recordType || !fields || typeof fields !== 'object') {
            return missingFields('record_type, fields', 'record_type and fields are required for create_record.');
        }
        const gate = requireOnBehalfOf();
        if (gate) return gate;
        let res: Response;
        try {
            res = await fetcher(`${GREENHOUSE_BASE}/${encodeURIComponent(recordType)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(fields),
            });
        } catch (err) {
            return networkError('Greenhouse', 'harvest.greenhouse.io', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Greenhouse create failed with ${res.status}`);
        const json = (await res.json()) as { id?: number };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Created ${recordType} ${json.id ?? '(id unknown)'}`,
        };
    }

    if (actionType === 'update_record') {
        const fields = payload['fields'];
        if (!recordType || !recordId || !fields || typeof fields !== 'object') {
            return missingFields('record_type, record_id, fields', 'record_type, record_id, and fields are required for update_record.');
        }
        const gate = requireOnBehalfOf();
        if (gate) return gate;
        // Applications move between stages via a dedicated endpoint.
        const fieldRecord = fields as Record<string, unknown>;
        const isStageMove = recordType === 'applications' && fieldRecord['to_stage_id'] !== undefined;
        const url = isStageMove
            ? `${GREENHOUSE_BASE}/applications/${encodeURIComponent(recordId)}/move`
            : `${GREENHOUSE_BASE}/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`;
        let res: Response;
        try {
            res = await fetcher(url, {
                method: isStageMove ? 'POST' : 'PATCH',
                headers,
                body: JSON.stringify(fields),
            });
        } catch (err) {
            return networkError('Greenhouse', 'harvest.greenhouse.io', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Greenhouse update failed with ${res.status} for ${recordType}/${recordId}`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: isStageMove
                ? `Application ${recordId} moved to stage ${String(fieldRecord['to_stage_id'])}`
                : `Updated ${recordType} ${recordId}`,
        };
    }

    if (actionType === 'log_activity') {
        const body = String(payload['body'] ?? '').trim();
        if (!recordId || !body) {
            return missingFields('record_id, body', 'record_id and body are required for log_activity.');
        }
        const gate = requireOnBehalfOf();
        if (gate) return gate;
        let res: Response;
        try {
            res = await fetcher(`${GREENHOUSE_BASE}/candidates/${encodeURIComponent(recordId)}/activity_feed/notes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ user_id: onBehalfOf, body, visibility: 'admin_only' }),
            });
        } catch (err) {
            return networkError('Greenhouse', 'harvest.greenhouse.io', err);
        }
        if (!res.ok) return failFromStatus(res.status, `Greenhouse note creation failed with ${res.status}`);
        const json = (await res.json()) as { id?: number };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Note ${json.id ?? 'created'} logged on candidate ${recordId}`,
        };
    }

    return unsupported('Greenhouse', 'get_record, search_records, create_record, update_record, log_activity');
};

// ---------------------------------------------------------------------------
// WordPress connector (REST v2 posts, Application Password Basic auth)
// ---------------------------------------------------------------------------

const executeWordPress = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: WordPressCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const base = `${credentials.base_url.replace(/\/$/, '')}/wp-json/wp/v2`;
    const headers: Record<string, string> = {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.app_password}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const contentId = String(payload['content_id'] ?? '').trim();

    if (actionType === 'publish_content') {
        const title = String(payload['title'] ?? '').trim();
        const content = String(payload['content'] ?? '').trim();
        if (!title || !content) {
            return missingFields('title, content', 'title and content are required for publish_content.');
        }
        const status = String(payload['status'] ?? 'publish').trim();
        let res: Response;
        try {
            res = await fetcher(`${base}/posts`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ title, content, status }),
            });
        } catch (err) {
            return networkError('WordPress', credentials.base_url, err);
        }
        if (!res.ok) return failFromStatus(res.status, `WordPress publish failed with ${res.status}`);
        const json = (await res.json()) as { id?: number; link?: string; status?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Post ${json.id ?? '(id unknown)'} ${json.status ?? status}: ${json.link ?? '(no link)'}`,
        };
    }

    if (actionType === 'update_content') {
        if (!contentId) return missingFields('content_id', 'content_id is required for update_content.');
        const updates: Record<string, unknown> = {};
        for (const key of ['title', 'content', 'status', 'excerpt'] as const) {
            const value = payload[key];
            if (typeof value === 'string' && value.trim()) updates[key] = value;
        }
        if (Object.keys(updates).length === 0) {
            return missingFields('title|content|status|excerpt', 'Provide at least one field to update.');
        }
        let res: Response;
        try {
            res = await fetcher(`${base}/posts/${encodeURIComponent(contentId)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(updates),
            });
        } catch (err) {
            return networkError('WordPress', credentials.base_url, err);
        }
        if (!res.ok) return failFromStatus(res.status, `WordPress update failed with ${res.status} for post ${contentId}`);
        const json = (await res.json()) as { id?: number; link?: string };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Post ${json.id ?? contentId} updated: ${json.link ?? '(no link)'}`,
        };
    }

    if (actionType === 'get_content') {
        if (!contentId) return missingFields('content_id', 'content_id is required for get_content.');
        let res: Response;
        try {
            res = await fetcher(`${base}/posts/${encodeURIComponent(contentId)}?context=edit`, { headers });
        } catch (err) {
            return networkError('WordPress', credentials.base_url, err);
        }
        if (!res.ok) return failFromStatus(res.status, `WordPress returned ${res.status} for post ${contentId}`);
        const json = (await res.json()) as { id?: number; status?: string; title?: { rendered?: string; raw?: string } };
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `Post ${json.id ?? contentId} [${json.status ?? 'unknown'}]: ${json.title?.raw ?? json.title?.rendered ?? '(no title)'}`,
        };
    }

    if (actionType === 'list_content') {
        const limit = Number(payload['max_results'] ?? 10);
        const status = String(payload['status'] ?? '').trim();
        const params = new URLSearchParams({ per_page: String(limit), context: 'edit' });
        if (status) params.set('status', status);
        let res: Response;
        try {
            res = await fetcher(`${base}/posts?${params.toString()}`, { headers });
        } catch (err) {
            return networkError('WordPress', credentials.base_url, err);
        }
        if (!res.ok) return failFromStatus(res.status, `WordPress list failed with ${res.status}`);
        const json = (await res.json()) as Array<{ id?: number; status?: string; title?: { rendered?: string; raw?: string } }>;
        const items = (json ?? []).map((p) => `${p.id} [${p.status}] "${p.title?.raw ?? p.title?.rendered ?? '(no title)'}"`);
        return {
            ok: true,
            providerResponseCode: String(res.status),
            resultSummary: `${items.length} post(s): ${items.join('; ') || '(none)'}`,
        };
    }

    return unsupported('WordPress', 'get_content, list_content, publish_content, update_content');
};

// ---------------------------------------------------------------------------
// Email connector (SendGrid + SMTP fallback via nodemailer-style validation)
// ---------------------------------------------------------------------------

const executeEmailSendGrid = async (
    payload: Record<string, unknown>,
    credentials: SendGridCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const toRaw = payload['to'];
    const to = Array.isArray(toRaw)
        ? (toRaw as unknown[]).map(String)
        : typeof toRaw === 'string'
            ? [toRaw]
            : [];

    const subject = String(payload['subject'] ?? '').trim();
    const body = String(payload['body'] ?? '').trim();

    if (to.length === 0 || !subject || !body) {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: 'Missing required fields: to, subject, body',
            errorCode: 'invalid_format',
            errorMessage: 'to, subject, and body are required for send_email',
            remediationHint: 'Provide to (array of email addresses), subject, and body.',
        };
    }

    const sgBody = {
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: credentials.from_address },
        subject,
        content: [{ type: 'text/plain', value: body }],
    };

    let res: Response;
    try {
        res = await fetcher('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sgBody),
        });
    } catch (err) {
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'Network error reaching SendGrid',
            transient: true,
            errorCode: 'provider_unavailable',
            errorMessage: String(err),
            remediationHint: 'Check network connectivity to api.sendgrid.com.',
        };
    }

    if (!res.ok) {
        return failFromStatus(res.status, `SendGrid returned ${res.status}`);
    }

    return {
        ok: true,
        providerResponseCode: String(res.status),
        resultSummary: `Email sent to ${to.join(', ')} via SendGrid`,
    };
};

const executeEmailSmtp = async (
    payload: Record<string, unknown>,
    credentials: SmtpCredentials,
): Promise<ProviderExecutionResult> => {
    // SMTP sending requires nodemailer or a Node.js net/tls implementation.
    // Import lazily to avoid pulling it into the bundle if not used.
    const toRaw = payload['to'];
    const to = Array.isArray(toRaw)
        ? (toRaw as unknown[]).map(String)
        : typeof toRaw === 'string'
            ? [toRaw]
            : [];
    const subject = String(payload['subject'] ?? '').trim();
    const body = String(payload['body'] ?? '').trim();

    if (to.length === 0 || !subject || !body) {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: 'Missing required fields: to, subject, body',
            errorCode: 'invalid_format',
            errorMessage: 'to, subject, and body are required for send_email',
            remediationHint: 'Provide to (array of email addresses), subject, and body.',
        };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — nodemailer is an optional runtime dependency for SMTP
        const nodemailer = await import('nodemailer') as { createTransport(opts: unknown): { sendMail(opts: unknown): Promise<{ messageId?: string }> } };
        const transporter = nodemailer.createTransport({
            host: credentials.smtp_host,
            port: credentials.smtp_port,
            secure: credentials.smtp_port === 465,
            auth: { user: credentials.smtp_user, pass: credentials.smtp_pass },
        });

        const info = await transporter.sendMail({
            from: credentials.from_address,
            to: to.join(', '),
            subject,
            text: body,
        }) as { messageId?: string };

        return {
            ok: true,
            providerResponseCode: '250',
            resultSummary: `Email sent to ${to.join(', ')} via SMTP (messageId=${info.messageId ?? 'n/a'})`,
        };
    } catch (err) {
        const message = String(err);
        const isAuth = message.includes('535') || message.includes('534') || message.includes('authentication');
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'SMTP send failed',
            transient: !isAuth,
            errorCode: isAuth ? 'permission_denied' : 'provider_unavailable',
            errorMessage: message,
            remediationHint: isAuth
                ? 'Check SMTP credentials.'
                : 'SMTP server temporarily unavailable; retry with backoff.',
        };
    }
};

const executeEmail = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: EmailCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    if (actionType !== 'send_email') {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: `Action ${actionType} is not supported by the Email connector`,
            errorCode: 'unsupported_action',
            errorMessage: `Email connector supports: send_email`,
        };
    }

    if (credentials.type === 'sendgrid') {
        return executeEmailSendGrid(payload, credentials, fetcher);
    }

    return executeEmailSmtp(payload, credentials);
};

// ---------------------------------------------------------------------------
// Slack connector
// ---------------------------------------------------------------------------

const executeSlack = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: SlackCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    if (actionType !== 'send_message') {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: `Action ${actionType} is not supported by the Slack connector`,
            errorCode: 'unsupported_action',
            errorMessage: 'Slack connector supports: send_message',
        };
    }

    const text = String(payload['text'] ?? '').trim();
    if (!text) {
        return {
            ok: false,
            providerResponseCode: '400',
            resultSummary: 'Missing required field: text',
            errorCode: 'invalid_format',
            errorMessage: 'text is required for send_message',
            remediationHint: 'Provide a non-empty text field in the payload.',
        };
    }

    const channel =
        (typeof payload['channel'] === 'string' && payload['channel'].trim())
            ? payload['channel'].trim()
            : (credentials.defaultChannel ?? '#general');

    let res: Response;
    try {
        res = await fetcher('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ channel, text }),
        });
    } catch (err) {
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'Network error reaching Slack',
            transient: true,
            errorCode: 'provider_unavailable',
            errorMessage: String(err),
            remediationHint: 'Check network connectivity to slack.com.',
        };
    }

    if (!res.ok) {
        return failFromStatus(res.status, `Slack API returned HTTP ${res.status}`);
    }

    // Slack always returns 200 with an ok/error field in the JSON body.
    const body = (await res.json()) as { ok: boolean; ts?: string; error?: string };
    if (!body.ok) {
        return {
            ok: false,
            providerResponseCode: '200',
            resultSummary: `Slack message failed: ${body.error ?? 'slack_error'}`,
            errorCode: 'provider_unavailable',
            errorMessage: body.error ?? 'slack_error',
            remediationHint: 'Check bot token scopes and channel membership.',
        };
    }

    return {
        ok: true,
        providerResponseCode: '200',
        resultSummary: `Slack message posted to ${channel} (ts=${body.ts ?? 'n/a'})`,
    };
};

// ---------------------------------------------------------------------------
// Health probe helpers
// ---------------------------------------------------------------------------

const probeJira = async (
    credentials: JiraCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    const url = `${credentials.base_url.replace(/\/$/, '')}/rest/api/3/myself`;
    try {
        const res = await fetcher(url, {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        if (res.ok) {
            return { outcome: 'ok', message: 'Jira /myself returned 200' };
        }
        if (res.status === 401 || res.status === 403) {
            return { outcome: 'auth_failure', message: `Jira auth check returned ${res.status}` };
        }
        if (res.status === 429) {
            return { outcome: 'rate_limited', message: 'Jira rate limit reached' };
        }
        return { outcome: 'network_timeout', message: `Jira health check returned ${res.status}` };
    } catch {
        return { outcome: 'network_timeout', message: 'Jira unreachable' };
    }
};

const probeTeams = async (
    credentials: TeamsCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${credentials.access_token}` },
        });
        if (res.ok) {
            return { outcome: 'ok', message: 'Graph /me returned 200' };
        }
        if (res.status === 401 || res.status === 403) {
            return { outcome: 'auth_failure', message: `Graph auth check returned ${res.status}` };
        }
        if (res.status === 429) {
            return { outcome: 'rate_limited', message: 'Microsoft Graph rate limit reached' };
        }
        return { outcome: 'network_timeout', message: `Graph health check returned ${res.status}` };
    } catch {
        return { outcome: 'network_timeout', message: 'Microsoft Graph unreachable' };
    }
};

const probeGitHub = async (
    credentials: GitHubCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher('https://api.github.com/rate_limit', {
            headers: {
                Authorization: `Bearer ${credentials.access_token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (res.ok) {
            return { outcome: 'ok', message: 'GitHub rate_limit probe returned 200' };
        }
        if (res.status === 401) {
            return { outcome: 'auth_failure', message: 'GitHub auth check returned 401' };
        }
        if (res.status === 403) {
            // Could be secondary rate limit or forbidden
            const remaining = res.headers.get('x-ratelimit-remaining');
            if (remaining === '0') {
                return { outcome: 'rate_limited', message: 'GitHub rate limit exhausted' };
            }
            return { outcome: 'auth_failure', message: 'GitHub auth check returned 403' };
        }
        return { outcome: 'network_timeout', message: `GitHub health check returned ${res.status}` };
    } catch {
        return { outcome: 'network_timeout', message: 'GitHub unreachable' };
    }
};

const probeGitLab = async (
    credentials: GitLabCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(`${gitlabApiBase(credentials)}/user`, {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        if (res.ok) return { outcome: 'ok', message: 'GitLab /user probe returned 200' };
        if (res.status === 401 || res.status === 403) {
            return { outcome: 'auth_failure', message: `GitLab auth check returned ${res.status}` };
        }
        if (res.status === 429) return { outcome: 'rate_limited', message: 'GitLab rate limit reached' };
        return { outcome: 'network_timeout', message: `GitLab health check returned ${res.status}` };
    } catch {
        return { outcome: 'network_timeout', message: 'GitLab unreachable' };
    }
};

const probeLinear = async (
    credentials: LinearCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(LINEAR_GRAPHQL_URL, {
            method: 'POST',
            headers: { Authorization: credentials.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ viewer { id } }' }),
        });
        if (res.ok) return { outcome: 'ok', message: 'Linear viewer probe returned 200' };
        if (res.status === 401 || res.status === 403) {
            return { outcome: 'auth_failure', message: `Linear auth check returned ${res.status}` };
        }
        if (res.status === 429) return { outcome: 'rate_limited', message: 'Linear rate limit reached' };
        return { outcome: 'network_timeout', message: `Linear health check returned ${res.status}` };
    } catch {
        return { outcome: 'network_timeout', message: 'Linear unreachable' };
    }
};

const probeEmail = async (
    credentials: EmailCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    if (credentials.type === 'sendgrid') {
        try {
            const res = await fetcher('https://api.sendgrid.com/v3/user/profile', {
                headers: { Authorization: `Bearer ${credentials.api_key}` },
            });
            if (res.ok) {
                return { outcome: 'ok', message: 'SendGrid profile probe returned 200' };
            }
            if (res.status === 401 || res.status === 403) {
                return { outcome: 'auth_failure', message: `SendGrid auth check returned ${res.status}` };
            }
            if (res.status === 429) {
                return { outcome: 'rate_limited', message: 'SendGrid rate limit reached' };
            }
            return { outcome: 'network_timeout', message: `SendGrid returned ${res.status}` };
        } catch {
            return { outcome: 'network_timeout', message: 'SendGrid unreachable' };
        }
    }

    // SMTP: attempt a TCP connection validation via a lightweight nodemailer verify
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — nodemailer is an optional runtime dependency for SMTP
        const nodemailer = await import('nodemailer') as { createTransport(opts: unknown): { verify(): Promise<void> } };
        const transporter = nodemailer.createTransport({
            host: credentials.smtp_host,
            port: credentials.smtp_port,
            secure: credentials.smtp_port === 465,
            auth: { user: credentials.smtp_user, pass: credentials.smtp_pass },
        });
        await transporter.verify();
        return { outcome: 'ok', message: 'SMTP connection verified' };
    } catch (err) {
        const msg = String(err);
        const isAuth = msg.includes('535') || msg.includes('authentication');
        return {
            outcome: isAuth ? 'auth_failure' : 'network_timeout',
            message: isAuth ? 'SMTP authentication failed' : 'SMTP server unreachable',
        };
    }
};

// ---------------------------------------------------------------------------
// Custom API connector
// ---------------------------------------------------------------------------

const buildCustomApiHeaders = (creds: CustomApiCredentials): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authType = creds.auth_type ?? 'none';
    if (authType === 'api_key' && creds.api_key) {
        const headerName = creds.api_key_header ?? 'X-API-Key';
        headers[headerName] = creds.api_key;
    } else if (authType === 'bearer_token' && creds.bearer_token) {
        headers['Authorization'] = `Bearer ${creds.bearer_token}`;
    } else if (authType === 'basic_auth' && creds.basic_user && creds.basic_pass) {
        const encoded = Buffer.from(`${creds.basic_user}:${creds.basic_pass}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
    }
    return headers;
};

const executeCustomApi = async (
    actionType: ConnectorActionType,
    payload: Record<string, unknown>,
    credentials: CustomApiCredentials,
    fetcher: FetchFn,
): Promise<ProviderExecutionResult> => {
    const baseUrl = credentials.base_url.replace(/\/$/, '');
    const headers = buildCustomApiHeaders(credentials);

    // Determine HTTP method, path and body. Two modes:
    //  (1) Self-describing (C6): the agent picked an OpenAPI operation. payload.openapi_operation
    //      is a CustomApiTool from the connector's catalog; payload.args are its arguments.
    //      We resolve them (path params, query string, body) via the shared resolver.
    //  (2) Raw: caller supplies method/path/body directly (back-compat default).
    let method: string;
    let path: string;
    let body: unknown;
    const opCandidate = payload['openapi_operation'];
    if (opCandidate && typeof opCandidate === 'object' && !Array.isArray(opCandidate)) {
        const args =
            payload['args'] && typeof payload['args'] === 'object' && !Array.isArray(payload['args'])
                ? (payload['args'] as Record<string, unknown>)
                : {};
        const resolved = resolveOperation(opCandidate as CustomApiTool, args);
        if (!resolved.ok) {
            return {
                ok: false,
                providerResponseCode: '400',
                resultSummary: 'Custom API operation could not be resolved',
                errorCode: 'invalid_format',
                errorMessage: resolved.error,
                remediationHint: 'Provide all required parameters for the selected operation.',
            };
        }
        method = resolved.request.method.toUpperCase();
        path = resolved.request.path;
        body = resolved.request.body;
    } else {
        method = String(payload['method'] ?? 'POST').toUpperCase();
        path = String(payload['path'] ?? `/${actionType}`);
        body = payload['body'] !== undefined ? payload['body'] : payload;
    }
    const url = `${baseUrl}${path}`;

    let response: Response;
    try {
        response = await fetcher(url, {
            method,
            headers,
            body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : undefined,
        });
    } catch (err) {
        return {
            ok: false,
            providerResponseCode: '0',
            resultSummary: 'Custom API unreachable',
            transient: true,
            errorCode: 'timeout',
            errorMessage: String(err),
            remediationHint: 'Check base_url is reachable and network connectivity.',
        };
    }

    if (!response.ok) {
        return failFromStatus(
            response.status,
            `Custom API returned ${response.status} for ${method} ${path}`,
        );
    }

    return {
        ok: true,
        providerResponseCode: String(response.status),
        resultSummary: `Custom API ${method} ${path} succeeded`,
    };
};

const probeCustomApi = async (
    credentials: CustomApiCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    const baseUrl = credentials.base_url.replace(/\/$/, '');
    const headers = buildCustomApiHeaders(credentials);

    // Try a HEAD request to the base URL as a lightweight liveness check
    let response: Response;
    try {
        response = await fetcher(`${baseUrl}/`, { method: 'HEAD', headers });
    } catch {
        // Some APIs don't allow HEAD; fall back to GET
        try {
            response = await fetcher(`${baseUrl}/`, { method: 'GET', headers });
        } catch (err) {
            return { outcome: 'network_timeout', message: `Custom API unreachable: ${String(err)}` };
        }
    }

    if (response.status === 401 || response.status === 403) {
        return { outcome: 'auth_failure', message: `Custom API responded with ${response.status} — check credentials.` };
    }
    if (response.status === 429) {
        return { outcome: 'rate_limited', message: 'Custom API is rate-limiting requests.' };
    }
    if (response.status >= 500) {
        return { outcome: 'network_timeout', message: `Custom API server error ${response.status}.` };
    }
    return { outcome: 'ok', message: `Custom API health check passed (${response.status}).` };
};

const probeSlack = async (
    credentials: SlackCredentials,
    fetcher: FetchFn,
): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher('https://slack.com/api/auth.test', {
            headers: { Authorization: `Bearer ${credentials.botToken}` },
        });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                return { outcome: 'auth_failure', message: `Slack auth.test returned HTTP ${res.status}` };
            }
            if (res.status === 429) {
                return { outcome: 'rate_limited', message: 'Slack rate limit reached' };
            }
            return { outcome: 'network_timeout', message: `Slack auth.test returned HTTP ${res.status}` };
        }
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (body.ok) {
            return { outcome: 'ok', message: 'Slack auth.test passed' };
        }
        return { outcome: 'auth_failure', message: `Slack auth.test failed: ${body.error ?? 'unknown'}` };
    } catch {
        return { outcome: 'network_timeout', message: 'Slack unreachable' };
    }
};

// ---------------------------------------------------------------------------
// Credential-absent fallback (health probe with no credentials)
// ---------------------------------------------------------------------------

const classifyProbeStatus = (provider: string, status: number, okIsOk = true): HealthProbeResult => {
    if (status >= 200 && status < 300 && okIsOk) {
        return { outcome: 'ok', message: `${provider} auth probe returned ${status}` };
    }
    if (status === 401 || status === 403) {
        return { outcome: 'auth_failure', message: `${provider} auth check returned ${status}` };
    }
    if (status === 429) {
        return { outcome: 'rate_limited', message: `${provider} rate limit reached` };
    }
    return { outcome: 'network_timeout', message: `${provider} health check returned ${status}` };
};

const probeAsana = async (credentials: AsanaCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    const baseUrl = (credentials.base_url ?? 'https://app.asana.com/api/1.0').replace(/\/$/, '');
    try {
        const res = await fetcher(`${baseUrl}/users/me`, {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        return classifyProbeStatus('Asana', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Asana unreachable' };
    }
};

const probeTrello = async (credentials: TrelloCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(
            `https://api.trello.com/1/members/me?key=${encodeURIComponent(credentials.api_key)}&token=${encodeURIComponent(credentials.token)}`,
        );
        return classifyProbeStatus('Trello', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Trello unreachable' };
    }
};

const probeClickUp = async (credentials: ClickUpCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher('https://api.clickup.com/api/v2/user', {
            headers: { Authorization: credentials.api_key },
        });
        return classifyProbeStatus('ClickUp', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'ClickUp unreachable' };
    }
};

const probeAzureDevOps = async (credentials: AzureDevOpsCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    const org = credentials.organization.replace(/\/$/, '');
    const base = org.startsWith('http') ? org : `https://dev.azure.com/${encodeURIComponent(org)}`;
    const basic = Buffer.from(`:${credentials.access_token}`).toString('base64');
    try {
        const res = await fetcher(`${base}/_apis/projects?api-version=${AZDO_API_VERSION}`, {
            headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
        });
        return classifyProbeStatus('Azure DevOps', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Azure DevOps unreachable' };
    }
};

const probeGmail = async (credentials: GmailCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(`${GMAIL_BASE}/profile`, {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        return classifyProbeStatus('Gmail', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Gmail unreachable' };
    }
};

const probeOutlook = async (credentials: OutlookCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        return classifyProbeStatus('Outlook', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Outlook unreachable' };
    }
};

const probeHubSpot = async (credentials: HubSpotCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(`${HUBSPOT_BASE}/account-info/v3/details`, {
            headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' },
        });
        return classifyProbeStatus('HubSpot', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'HubSpot unreachable' };
    }
};

const probeSalesforce = async (credentials: SalesforceCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(
            `${credentials.instance_url.replace(/\/$/, '')}/services/data/${SALESFORCE_API_VERSION}/limits`,
            { headers: { Authorization: `Bearer ${credentials.access_token}`, Accept: 'application/json' } },
        );
        return classifyProbeStatus('Salesforce', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Salesforce unreachable' };
    }
};

const probeGreenhouse = async (credentials: GreenhouseCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(`${GREENHOUSE_BASE}/user_roles`, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${credentials.api_key}:`).toString('base64')}`,
                Accept: 'application/json',
            },
        });
        return classifyProbeStatus('Greenhouse', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'Greenhouse unreachable' };
    }
};

const probeWordPress = async (credentials: WordPressCredentials, fetcher: FetchFn): Promise<HealthProbeResult> => {
    try {
        const res = await fetcher(`${credentials.base_url.replace(/\/$/, '')}/wp-json/wp/v2/users/me`, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.app_password}`).toString('base64')}`,
                Accept: 'application/json',
            },
        });
        return classifyProbeStatus('WordPress', res.status);
    } catch {
        return { outcome: 'network_timeout', message: 'WordPress unreachable' };
    }
};

const probeWithoutCredentials = (connectorType: ConnectorType, metadata: ConnectorAuthMetadata): HealthProbeResult => {
    if (metadata.status === 'permission_invalid' || metadata.status === 'consent_pending') {
        return { outcome: 'auth_failure', message: `${connectorType} connector auth is invalid — re-authenticate required.` };
    }
    if (metadata.lastErrorClass === 'provider_rate_limited') {
        return { outcome: 'rate_limited', message: `${connectorType} reports rate limiting.` };
    }
    if (metadata.lastErrorClass === 'provider_unavailable' || metadata.lastErrorClass === 'secret_store_unavailable') {
        return { outcome: 'network_timeout', message: `${connectorType} currently unavailable or timed out.` };
    }
    return { outcome: 'ok', message: `${connectorType} connector health probe passed (no live check — missing credentials).` };
};

// ---------------------------------------------------------------------------
// Factory: createRealProviderExecutor
// ---------------------------------------------------------------------------

export const createRealProviderExecutor = (
    secretStore: SecretStore,
    fetcher: FetchFn = globalThis.fetch,
): ProviderExecutor => async ({ connectorType, actionType, payload, secretRefId }) => {
    if (!secretRefId) {
        return {
            ok: false,
            providerResponseCode: '401',
            resultSummary: 'No credentials reference found for connector',
            errorCode: 'upgrade_required',
            errorMessage: 'secretRefId is null — connector requires re-authentication.',
            remediationHint: 'Re-initiate OAuth flow for this connector.',
        };
    }

    const rawSecret = await secretStore.getSecret(secretRefId);
    if (!rawSecret) {
        return {
            ok: false,
            providerResponseCode: '401',
            resultSummary: 'Credentials not found in secret store',
            errorCode: 'upgrade_required',
            errorMessage: `Secret not found for ref: ${secretRefId}`,
            remediationHint: 'Re-initiate OAuth flow or check Key Vault configuration.',
        };
    }

    if (connectorType === 'jira') {
        const creds = parseCredentials<JiraCredentials>(rawSecret);
        if (!creds?.access_token || !creds?.base_url) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Jira credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Jira credentials must include access_token and base_url.',
                remediationHint: 'Re-authenticate the Jira connector.',
            };
        }
        return executeJira(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'teams') {
        const creds = parseCredentials<TeamsCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Teams credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Teams credentials must include access_token.',
                remediationHint: 'Re-authenticate the Teams connector.',
            };
        }
        return executeTeams(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'github') {
        const creds = parseCredentials<GitHubCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid GitHub credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'GitHub credentials must include access_token.',
                remediationHint: 'Re-authenticate the GitHub connector.',
            };
        }
        return executeGitHub(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'email') {
        const creds = parseCredentials<EmailCredentials>(rawSecret);
        if (!creds?.type) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid email credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Email credentials must include type ("smtp" or "sendgrid").',
                remediationHint: 'Re-configure the email connector.',
            };
        }
        return executeEmail(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'custom_api') {
        const creds = parseCredentials<CustomApiCredentials>(rawSecret);
        if (!creds?.base_url) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid custom_api credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Custom API credentials must include base_url.',
                remediationHint: 'Update credentials with a valid base_url.',
            };
        }
        return executeCustomApi(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'slack') {
        const creds = parseCredentials<SlackCredentials>(rawSecret);
        if (!creds?.botToken) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Slack credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Slack credentials must include botToken.',
                remediationHint: 'Re-configure the Slack connector with a valid bot token.',
            };
        }
        return executeSlack(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'gitlab') {
        const creds = parseCredentials<GitLabCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid GitLab credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'GitLab credentials must include access_token.',
                remediationHint: 'Re-authenticate the GitLab connector.',
            };
        }
        return executeGitLab(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'linear') {
        const creds = parseCredentials<LinearCredentials>(rawSecret);
        if (!creds?.api_key) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Linear credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Linear credentials must include api_key.',
                remediationHint: 'Re-configure the Linear connector with a valid API key.',
            };
        }
        return executeLinear(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'asana') {
        const creds = parseCredentials<AsanaCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Asana credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Asana credentials must include access_token.',
                remediationHint: 'Re-authenticate the Asana connector.',
            };
        }
        return executeAsana(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'trello') {
        const creds = parseCredentials<TrelloCredentials>(rawSecret);
        if (!creds?.api_key || !creds?.token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Trello credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Trello credentials must include api_key and token.',
                remediationHint: 'Re-configure the Trello connector with a valid key and token.',
            };
        }
        return executeTrello(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'clickup') {
        const creds = parseCredentials<ClickUpCredentials>(rawSecret);
        if (!creds?.api_key) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid ClickUp credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'ClickUp credentials must include api_key.',
                remediationHint: 'Re-configure the ClickUp connector with a valid API token.',
            };
        }
        return executeClickUp(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'azure_devops') {
        const creds = parseCredentials<AzureDevOpsCredentials>(rawSecret);
        if (!creds?.access_token || !creds?.organization) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Azure DevOps credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Azure DevOps credentials must include access_token and organization.',
                remediationHint: 'Re-authenticate the Azure DevOps connector.',
            };
        }
        return executeAzureDevOps(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'gmail') {
        const creds = parseCredentials<GmailCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Gmail credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Gmail credentials must include access_token.',
                remediationHint: 'Re-initiate the Google OAuth flow for this connector.',
            };
        }
        return executeGmail(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'outlook') {
        const creds = parseCredentials<OutlookCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Outlook credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Outlook credentials must include access_token.',
                remediationHint: 'Re-initiate the Microsoft OAuth flow for this connector.',
            };
        }
        return executeOutlook(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'hubspot') {
        const creds = parseCredentials<HubSpotCredentials>(rawSecret);
        if (!creds?.access_token) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid HubSpot credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'HubSpot credentials must include access_token.',
                remediationHint: 'Re-configure the HubSpot connector with a valid private-app token.',
            };
        }
        return executeHubSpot(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'salesforce') {
        const creds = parseCredentials<SalesforceCredentials>(rawSecret);
        if (!creds?.access_token || !creds?.instance_url) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Salesforce credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Salesforce credentials must include access_token and instance_url.',
                remediationHint: 'Re-initiate the Salesforce OAuth flow for this connector.',
            };
        }
        return executeSalesforce(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'greenhouse') {
        const creds = parseCredentials<GreenhouseCredentials>(rawSecret);
        if (!creds?.api_key) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid Greenhouse credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'Greenhouse credentials must include api_key (Harvest API key).',
                remediationHint: 'Re-configure the Greenhouse connector with a valid Harvest API key.',
            };
        }
        return executeGreenhouse(actionType, payload, creds, fetcher);
    }

    if (connectorType === 'wordpress') {
        const creds = parseCredentials<WordPressCredentials>(rawSecret);
        if (!creds?.base_url || !creds?.username || !creds?.app_password) {
            return {
                ok: false,
                providerResponseCode: '401',
                resultSummary: 'Invalid WordPress credentials format',
                errorCode: 'upgrade_required',
                errorMessage: 'WordPress credentials must include base_url, username, and app_password.',
                remediationHint: 'Re-configure the WordPress connector with an Application Password.',
            };
        }
        return executeWordPress(actionType, payload, creds, fetcher);
    }

    return {
        ok: false,
        providerResponseCode: '400',
        resultSummary: `Unsupported connector type: ${connectorType}`,
        errorCode: 'unsupported_action',
        errorMessage: `Connector type ${connectorType} is not handled by realProviderExecutor.`,
    };
};

// ---------------------------------------------------------------------------
// Factory: createRealConnectorHealthProbe
// ---------------------------------------------------------------------------

export const createRealConnectorHealthProbe = (
    secretStore: SecretStore,
    fetcher: FetchFn = globalThis.fetch,
): ConnectorHealthProbe => async ({ connectorType, metadata }) => {
    const secretRefId = metadata.secretRefId;
    if (!secretRefId) {
        return probeWithoutCredentials(connectorType, metadata);
    }

    const rawSecret = await secretStore.getSecret(secretRefId);
    if (!rawSecret) {
        return probeWithoutCredentials(connectorType, metadata);
    }

    if (connectorType === 'jira') {
        const creds = parseCredentials<JiraCredentials>(rawSecret);
        if (!creds) {
            return { outcome: 'auth_failure', message: 'Jira credentials could not be parsed' };
        }
        return probeJira(creds, fetcher);
    }

    if (connectorType === 'teams') {
        const creds = parseCredentials<TeamsCredentials>(rawSecret);
        if (!creds) {
            return { outcome: 'auth_failure', message: 'Teams credentials could not be parsed' };
        }
        return probeTeams(creds, fetcher);
    }

    if (connectorType === 'github') {
        const creds = parseCredentials<GitHubCredentials>(rawSecret);
        if (!creds) {
            return { outcome: 'auth_failure', message: 'GitHub credentials could not be parsed' };
        }
        return probeGitHub(creds, fetcher);
    }

    if (connectorType === 'email') {
        const creds = parseCredentials<EmailCredentials>(rawSecret);
        if (!creds) {
            return { outcome: 'auth_failure', message: 'Email credentials could not be parsed' };
        }
        return probeEmail(creds, fetcher);
    }

    if (connectorType === 'custom_api') {
        const creds = parseCredentials<CustomApiCredentials>(rawSecret);
        if (!creds?.base_url) {
            return { outcome: 'auth_failure', message: 'Custom API credentials missing base_url' };
        }
        return probeCustomApi(creds, fetcher);
    }

    if (connectorType === 'slack') {
        const creds = parseCredentials<SlackCredentials>(rawSecret);
        if (!creds?.botToken) {
            return { outcome: 'auth_failure', message: 'Slack credentials missing botToken' };
        }
        return probeSlack(creds, fetcher);
    }

    if (connectorType === 'gitlab') {
        const creds = parseCredentials<GitLabCredentials>(rawSecret);
        if (!creds?.access_token) {
            return { outcome: 'auth_failure', message: 'GitLab credentials missing access_token' };
        }
        return probeGitLab(creds, fetcher);
    }

    if (connectorType === 'linear') {
        const creds = parseCredentials<LinearCredentials>(rawSecret);
        if (!creds?.api_key) {
            return { outcome: 'auth_failure', message: 'Linear credentials missing api_key' };
        }
        return probeLinear(creds, fetcher);
    }

    if (connectorType === 'asana') {
        const creds = parseCredentials<AsanaCredentials>(rawSecret);
        if (!creds?.access_token) {
            return { outcome: 'auth_failure', message: 'Asana credentials missing access_token' };
        }
        return probeAsana(creds, fetcher);
    }

    if (connectorType === 'trello') {
        const creds = parseCredentials<TrelloCredentials>(rawSecret);
        if (!creds?.api_key || !creds?.token) {
            return { outcome: 'auth_failure', message: 'Trello credentials missing api_key or token' };
        }
        return probeTrello(creds, fetcher);
    }

    if (connectorType === 'clickup') {
        const creds = parseCredentials<ClickUpCredentials>(rawSecret);
        if (!creds?.api_key) {
            return { outcome: 'auth_failure', message: 'ClickUp credentials missing api_key' };
        }
        return probeClickUp(creds, fetcher);
    }

    if (connectorType === 'azure_devops') {
        const creds = parseCredentials<AzureDevOpsCredentials>(rawSecret);
        if (!creds?.access_token || !creds?.organization) {
            return { outcome: 'auth_failure', message: 'Azure DevOps credentials missing access_token or organization' };
        }
        return probeAzureDevOps(creds, fetcher);
    }

    if (connectorType === 'gmail') {
        const creds = parseCredentials<GmailCredentials>(rawSecret);
        if (!creds?.access_token) {
            return { outcome: 'auth_failure', message: 'Gmail credentials missing access_token' };
        }
        return probeGmail(creds, fetcher);
    }

    if (connectorType === 'outlook') {
        const creds = parseCredentials<OutlookCredentials>(rawSecret);
        if (!creds?.access_token) {
            return { outcome: 'auth_failure', message: 'Outlook credentials missing access_token' };
        }
        return probeOutlook(creds, fetcher);
    }

    if (connectorType === 'hubspot') {
        const creds = parseCredentials<HubSpotCredentials>(rawSecret);
        if (!creds?.access_token) {
            return { outcome: 'auth_failure', message: 'HubSpot credentials missing access_token' };
        }
        return probeHubSpot(creds, fetcher);
    }

    if (connectorType === 'salesforce') {
        const creds = parseCredentials<SalesforceCredentials>(rawSecret);
        if (!creds?.access_token || !creds?.instance_url) {
            return { outcome: 'auth_failure', message: 'Salesforce credentials missing access_token or instance_url' };
        }
        return probeSalesforce(creds, fetcher);
    }

    if (connectorType === 'greenhouse') {
        const creds = parseCredentials<GreenhouseCredentials>(rawSecret);
        if (!creds?.api_key) {
            return { outcome: 'auth_failure', message: 'Greenhouse credentials missing api_key' };
        }
        return probeGreenhouse(creds, fetcher);
    }

    if (connectorType === 'wordpress') {
        const creds = parseCredentials<WordPressCredentials>(rawSecret);
        if (!creds?.base_url || !creds?.username || !creds?.app_password) {
            return { outcome: 'auth_failure', message: 'WordPress credentials missing base_url, username, or app_password' };
        }
        return probeWordPress(creds, fetcher);
    }

    return { outcome: 'ok', message: `No live probe implemented for ${connectorType}` };
};
