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
 *
 * All actions accept a typed payload object (see ActionPayload* below).
 */

import type { SecretStore } from './secret-store.js';

// ---------------------------------------------------------------------------
// Re-exported types that connector-actions.ts uses
// ---------------------------------------------------------------------------

export type ConnectorType = 'jira' | 'teams' | 'github' | 'email' | 'custom_api' | 'slack';
export type ConnectorActionType =
    | 'read_task'
    | 'create_comment'
    | 'update_status'
    | 'send_message'
    | 'create_pr_comment'
    | 'create_pr'
    | 'merge_pr'
    | 'list_prs'
    | 'send_email';

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

    // Determine HTTP method and path from payload or action type defaults
    const method = String(payload['method'] ?? 'POST').toUpperCase();
    const path = String(payload['path'] ?? `/${actionType}`);
    const body = payload['body'] !== undefined ? payload['body'] : payload;
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

    return { outcome: 'ok', message: `No live probe implemented for ${connectorType}` };
};
