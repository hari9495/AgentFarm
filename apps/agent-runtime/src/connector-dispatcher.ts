/**
 * connector-dispatcher.ts
 *
 * Unified HTTP connector layer for GitHub and Jira. Handles:
 *   - GitHub REST API: create_pr, add_pr_comment, merge_pr, list_prs
 *   - Jira REST API v3: get_task, create_task, update_task_status,
 *     add_comment, assign_task, list_tasks
 *   - OAuth 2.0 token refresh (in-process cache, automatic retry)
 *
 * Token resolution order:
 *   1. payload.credentials object (test injection / API gateway forwarding)
 *   2. Environment variables (GITHUB_TOKEN, JIRA_API_TOKEN, etc.)
 *
 * All functions accept an optional `fetchImpl` for unit-test injection.
 */

// ─── OAuth token store ────────────────────────────────────────────────────────

export interface OAuthTokenRecord {
    accessToken: string;
    refreshToken: string;
    /** Unix epoch milliseconds */
    expiresAt: number;
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
}

/** How many milliseconds before expiry we proactively refresh. */
const REFRESH_BUFFER_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * In-process OAuth token cache keyed by `tenantId:connectorId`.
 * In a multi-replica deployment each replica maintains its own cache;
 * that's acceptable — the worst case is one extra refresh per replica.
 */
const tokenCache = new Map<string, OAuthTokenRecord>();

export class OAuthTokenManager {
    static store(cacheKey: string, record: OAuthTokenRecord): void {
        tokenCache.set(cacheKey, record);
    }

    static evict(cacheKey: string): void {
        tokenCache.delete(cacheKey);
    }

    /**
     * Return a valid access token, refreshing automatically if < REFRESH_BUFFER_MS
     * until expiry.
     */
    static async getValidToken(
        cacheKey: string,
        fetchImpl: typeof fetch = fetch,
    ): Promise<string> {
        const record = tokenCache.get(cacheKey);
        if (!record) {
            throw new Error(`OAuthTokenManager: no token stored for key "${cacheKey}"`);
        }

        const needsRefresh = Date.now() >= record.expiresAt - REFRESH_BUFFER_MS;
        if (!needsRefresh) return record.accessToken;

        return OAuthTokenManager.refresh(cacheKey, fetchImpl);
    }

    static async refresh(
        cacheKey: string,
        fetchImpl: typeof fetch = fetch,
    ): Promise<string> {
        const record = tokenCache.get(cacheKey);
        if (!record) {
            throw new Error(`OAuthTokenManager: cannot refresh — no record for "${cacheKey}"`);
        }

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: record.refreshToken,
            client_id: record.clientId,
            client_secret: record.clientSecret,
        });

        const response = await fetchImpl(record.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `OAuthTokenManager: refresh failed (${response.status}): ${text.slice(0, 200)}`,
            );
        }

        const json = await response.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
        };

        const updated: OAuthTokenRecord = {
            ...record,
            accessToken: json.access_token,
            refreshToken: json.refresh_token ?? record.refreshToken,
            expiresAt: Date.now() + (json.expires_in ?? 3600) * 1_000,
        };
        tokenCache.set(cacheKey, updated);
        return updated.accessToken;
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

type JsonResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function jsonFetch<T>(
    url: string,
    init: RequestInit,
    fetchImpl: typeof fetch,
): Promise<JsonResponse<T>> {
    try {
        const response = await fetchImpl(url, {
            ...init,
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                ok: false,
                error: `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 300)}`,
            };
        }
        const data = (await response.json()) as T;
        return { ok: true, data };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// ─── GitHub connector ─────────────────────────────────────────────────────────

export interface GitHubCredentials {
    token: string;
    owner: string;
    repo: string;
    /** Override for GitHub Enterprise; defaults to https://api.github.com */
    baseUrl?: string;
}

const GH_DEFAULT_BASE = 'https://api.github.com';
const GH_ACCEPT = 'application/vnd.github+json';
const GH_API_VERSION = '2022-11-28';

function ghHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: GH_ACCEPT,
        'X-GitHub-Api-Version': GH_API_VERSION,
        'Content-Type': 'application/json',
    };
}

interface GitHubPR {
    number: number;
    html_url: string;
    title: string;
    state: string;
    draft: boolean;
    head: { ref: string };
    base: { ref: string };
    created_at: string;
    updated_at: string;
}

interface GitHubComment {
    id: number;
    html_url: string;
    body: string;
    created_at: string;
}

interface GitHubMergeResult {
    sha: string;
    merged: boolean;
    message: string;
}

export class GitHubConnector {
    private readonly base: string;
    private readonly creds: GitHubCredentials;
    private readonly fetchImpl: typeof fetch;

    constructor(creds: GitHubCredentials, fetchImpl: typeof fetch = fetch) {
        this.creds = creds;
        this.base = (creds.baseUrl ?? GH_DEFAULT_BASE).replace(/\/$/, '');
        this.fetchImpl = fetchImpl;
    }

    async createPR(params: {
        title: string;
        body: string;
        head: string;
        base: string;
        draft?: boolean;
    }): Promise<JsonResponse<GitHubPR>> {
        const { token, owner, repo } = this.creds;
        return jsonFetch<GitHubPR>(
            `${this.base}/repos/${owner}/${repo}/pulls`,
            {
                method: 'POST',
                headers: ghHeaders(token),
                body: JSON.stringify({
                    title: params.title,
                    body: params.body,
                    head: params.head,
                    base: params.base,
                    draft: params.draft ?? false,
                }),
            },
            this.fetchImpl,
        );
    }

    async addPRComment(params: {
        pullNumber: number;
        body: string;
    }): Promise<JsonResponse<GitHubComment>> {
        const { token, owner, repo } = this.creds;
        // Issues endpoint is used for PR-level (non-inline) comments
        return jsonFetch<GitHubComment>(
            `${this.base}/repos/${owner}/${repo}/issues/${params.pullNumber}/comments`,
            {
                method: 'POST',
                headers: ghHeaders(token),
                body: JSON.stringify({ body: params.body }),
            },
            this.fetchImpl,
        );
    }

    async mergePR(params: {
        pullNumber: number;
        commitTitle?: string;
        commitMessage?: string;
        mergeMethod?: 'merge' | 'squash' | 'rebase';
    }): Promise<JsonResponse<GitHubMergeResult>> {
        const { token, owner, repo } = this.creds;
        return jsonFetch<GitHubMergeResult>(
            `${this.base}/repos/${owner}/${repo}/pulls/${params.pullNumber}/merge`,
            {
                method: 'PUT',
                headers: ghHeaders(token),
                body: JSON.stringify({
                    commit_title: params.commitTitle,
                    commit_message: params.commitMessage,
                    merge_method: params.mergeMethod ?? 'merge',
                }),
            },
            this.fetchImpl,
        );
    }

    async listPRs(params?: {
        state?: 'open' | 'closed' | 'all';
        head?: string;
        base?: string;
        perPage?: number;
        page?: number;
    }): Promise<JsonResponse<GitHubPR[]>> {
        const { token, owner, repo } = this.creds;
        const qs = new URLSearchParams({
            state: params?.state ?? 'open',
            per_page: String(params?.perPage ?? 30),
            page: String(params?.page ?? 1),
            ...(params?.head ? { head: params.head } : {}),
            ...(params?.base ? { base: params.base } : {}),
        });
        return jsonFetch<GitHubPR[]>(
            `${this.base}/repos/${owner}/${repo}/pulls?${qs}`,
            { method: 'GET', headers: ghHeaders(token) },
            this.fetchImpl,
        );
    }
}

// ─── Jira connector ───────────────────────────────────────────────────────────

export interface JiraCredentials {
    /** e.g. https://mycompany.atlassian.net */
    baseUrl: string;
    email: string;
    apiToken: string;
    /** Default project key for task creation, e.g. "ENG" */
    projectKey?: string;
}

function jiraHeaders(email: string, apiToken: string): Record<string, string> {
    const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return {
        Authorization: `Basic ${encoded}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
}

interface JiraIssue {
    id: string;
    key: string;
    self: string;
    fields: Record<string, unknown>;
}

interface JiraSearchResult {
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
}

interface JiraTransition {
    id: string;
    name: string;
    to: { name: string; statusCategory: { key: string } };
}

export class JiraConnector {
    private readonly creds: JiraCredentials;
    private readonly base: string;
    private readonly fetchImpl: typeof fetch;

    constructor(creds: JiraCredentials, fetchImpl: typeof fetch = fetch) {
        this.creds = creds;
        this.base = creds.baseUrl.replace(/\/$/, '');
        this.fetchImpl = fetchImpl;
    }

    private headers(): Record<string, string> {
        return jiraHeaders(this.creds.email, this.creds.apiToken);
    }

    async getTask(issueKey: string): Promise<JsonResponse<JiraIssue>> {
        return jsonFetch<JiraIssue>(
            `${this.base}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async createTask(params: {
        summary: string;
        description?: string;
        issueType?: string;
        projectKey?: string;
        priority?: string;
        assigneeAccountId?: string;
        labels?: string[];
    }): Promise<JsonResponse<{ id: string; key: string; self: string }>> {
        const projectKey = params.projectKey ?? this.creds.projectKey;
        if (!projectKey) {
            return { ok: false, error: 'Jira createTask: projectKey is required' };
        }
        const body: Record<string, unknown> = {
            fields: {
                project: { key: projectKey },
                summary: params.summary,
                issuetype: { name: params.issueType ?? 'Task' },
                ...(params.description
                    ? {
                        description: {
                            type: 'doc',
                            version: 1,
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [{ type: 'text', text: params.description }],
                                },
                            ],
                        },
                    }
                    : {}),
                ...(params.priority ? { priority: { name: params.priority } } : {}),
                ...(params.assigneeAccountId
                    ? { assignee: { accountId: params.assigneeAccountId } }
                    : {}),
                ...(params.labels ? { labels: params.labels } : {}),
            },
        };
        return jsonFetch<{ id: string; key: string; self: string }>(
            `${this.base}/rest/api/3/issue`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    /**
     * Transition an issue to a new status.
     * First fetches available transitions to find the matching transition ID.
     */
    async updateTaskStatus(params: {
        issueKey: string;
        targetStatus: string;
        comment?: string;
    }): Promise<JsonResponse<null>> {
        // 1. Get available transitions
        const transResult = await jsonFetch<{ transitions: JiraTransition[] }>(
            `${this.base}/rest/api/3/issue/${encodeURIComponent(params.issueKey)}/transitions`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
        if (!transResult.ok) return { ok: false, error: transResult.error };

        const transitions = transResult.data.transitions;
        const match = transitions.find(
            (t) => t.name.toLowerCase() === params.targetStatus.toLowerCase(),
        );
        if (!match) {
            const available = transitions.map((t) => t.name).join(', ');
            return {
                ok: false,
                error: `Jira: no transition named "${params.targetStatus}". Available: ${available}`,
            };
        }

        // 2. Apply the transition
        const body: Record<string, unknown> = {
            transition: { id: match.id },
            ...(params.comment
                ? {
                    update: {
                        comment: [
                            {
                                add: {
                                    body: {
                                        type: 'doc',
                                        version: 1,
                                        content: [
                                            {
                                                type: 'paragraph',
                                                content: [
                                                    { type: 'text', text: params.comment },
                                                ],
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                }
                : {}),
        };
        return jsonFetch<null>(
            `${this.base}/rest/api/3/issue/${encodeURIComponent(params.issueKey)}/transitions`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    async addComment(params: {
        issueKey: string;
        body: string;
    }): Promise<JsonResponse<{ id: string; self: string }>> {
        const commentBody = {
            body: {
                type: 'doc',
                version: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: params.body }],
                    },
                ],
            },
        };
        return jsonFetch<{ id: string; self: string }>(
            `${this.base}/rest/api/3/issue/${encodeURIComponent(params.issueKey)}/comment`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(commentBody) },
            this.fetchImpl,
        );
    }

    async assignTask(params: {
        issueKey: string;
        accountId: string | null;
    }): Promise<JsonResponse<null>> {
        return jsonFetch<null>(
            `${this.base}/rest/api/3/issue/${encodeURIComponent(params.issueKey)}/assignee`,
            {
                method: 'PUT',
                headers: this.headers(),
                body: JSON.stringify({ accountId: params.accountId }),
            },
            this.fetchImpl,
        );
    }

    /**
     * List tasks using JQL search.
     * @param jql Jira Query Language string, e.g. `project = ENG AND status = "In Progress"`
     */
    async listTasks(params: {
        jql: string;
        maxResults?: number;
        startAt?: number;
        fields?: string[];
    }): Promise<JsonResponse<JiraSearchResult>> {
        const body = {
            jql: params.jql,
            maxResults: params.maxResults ?? 50,
            startAt: params.startAt ?? 0,
            fields: params.fields ?? ['summary', 'status', 'assignee', 'priority', 'issuetype'],
        };
        return jsonFetch<JiraSearchResult>(
            `${this.base}/rest/api/3/search`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }
}

// ─── Credential resolution ────────────────────────────────────────────────────

function resolveGitHubCreds(
    payload: Record<string, unknown>,
): GitHubCredentials | null {
    // Prefer explicit credentials passed in the payload (test injection / gateway forwarding)
    const creds = payload['credentials'] as Record<string, unknown> | undefined;
    const token =
        (typeof creds?.['github_token'] === 'string' ? creds['github_token'] : null) ??
        (typeof creds?.['token'] === 'string' ? creds['token'] : null) ??
        process.env['GITHUB_TOKEN'] ??
        null;
    const owner =
        (typeof creds?.['owner'] === 'string' ? creds['owner'] : null) ??
        (typeof payload['owner'] === 'string' ? payload['owner'] : null) ??
        process.env['GITHUB_OWNER'] ??
        null;
    const repo =
        (typeof creds?.['repo'] === 'string' ? creds['repo'] : null) ??
        (typeof payload['repo'] === 'string' ? payload['repo'] : null) ??
        process.env['GITHUB_REPO'] ??
        null;
    if (!token || !owner || !repo) return null;
    return {
        token,
        owner,
        repo,
        baseUrl: typeof creds?.['base_url'] === 'string' ? creds['base_url'] : undefined,
    };
}

function resolveJiraCreds(
    payload: Record<string, unknown>,
): JiraCredentials | null {
    const creds = payload['credentials'] as Record<string, unknown> | undefined;
    const baseUrl =
        (typeof creds?.['jira_base_url'] === 'string' ? creds['jira_base_url'] : null) ??
        (typeof creds?.['base_url'] === 'string' ? creds['base_url'] : null) ??
        process.env['JIRA_BASE_URL'] ??
        null;
    const email =
        (typeof creds?.['jira_email'] === 'string' ? creds['jira_email'] : null) ??
        (typeof creds?.['email'] === 'string' ? creds['email'] : null) ??
        process.env['JIRA_EMAIL'] ??
        null;
    const apiToken =
        (typeof creds?.['jira_api_token'] === 'string' ? creds['jira_api_token'] : null) ??
        (typeof creds?.['api_token'] === 'string' ? creds['api_token'] : null) ??
        process.env['JIRA_API_TOKEN'] ??
        null;
    if (!baseUrl || !email || !apiToken) return null;
    const projectKey =
        (typeof creds?.['project_key'] === 'string' ? creds['project_key'] : null) ??
        (typeof payload['projectKey'] === 'string' ? payload['projectKey'] : null) ??
        process.env['JIRA_PROJECT_KEY'] ??
        undefined;
    return { baseUrl, email, apiToken, projectKey };
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export type ConnectorDispatchResult =
    | { ok: true; data: unknown }
    | { ok: false; error: string };

/**
 * Dispatch a normalized connector action to the appropriate HTTP backend.
 *
 * @param connector  Tool slug: 'github' | 'jira'
 * @param actionType Normalized action type string (from shared contract)
 * @param payload    Full task payload — carries credential hints and action params
 * @param fetchImpl  Optional fetch override for unit testing
 */
export async function dispatchConnectorAction(
    connector: string,
    actionType: string,
    payload: Record<string, unknown>,
    fetchImpl: typeof fetch = fetch,
): Promise<ConnectorDispatchResult> {
    if (connector === 'github') {
        const creds = resolveGitHubCreds(payload);
        if (!creds) {
            return {
                ok: false,
                error: 'GitHub: missing credentials. Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO or pass payload.credentials.',
            };
        }
        const gh = new GitHubConnector(creds, fetchImpl);
        return dispatchGitHub(gh, actionType, payload);
    }

    if (connector === 'jira') {
        const creds = resolveJiraCreds(payload);
        if (!creds) {
            return {
                ok: false,
                error: 'Jira: missing credentials. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN or pass payload.credentials.',
            };
        }
        const jira = new JiraConnector(creds, fetchImpl);
        return dispatchJira(jira, actionType, payload);
    }

    return { ok: false, error: `dispatchConnectorAction: unsupported connector "${connector}"` };
}

// ─── GitHub action dispatch ───────────────────────────────────────────────────

async function dispatchGitHub(
    gh: GitHubConnector,
    actionType: string,
    payload: Record<string, unknown>,
): Promise<ConnectorDispatchResult> {
    switch (actionType) {
        case 'create_pr': {
            const result = await gh.createPR({
                title: String(payload['title'] ?? 'New Pull Request'),
                body: String(payload['body'] ?? ''),
                head: String(payload['head'] ?? payload['branch'] ?? ''),
                base: String(payload['base'] ?? process.env['GITHUB_DEFAULT_BASE_BRANCH'] ?? 'main'),
                draft: payload['draft'] === true,
            });
            return result;
        }
        case 'add_pr_comment': {
            const prNumber = Number(payload['pull_number'] ?? payload['pr_number']);
            if (!Number.isInteger(prNumber) || prNumber <= 0) {
                return { ok: false, error: 'GitHub add_pr_comment: pull_number must be a positive integer' };
            }
            const result = await gh.addPRComment({
                pullNumber: prNumber,
                body: String(payload['body'] ?? payload['comment'] ?? ''),
            });
            return result;
        }
        case 'merge_pr': {
            const prNumber = Number(payload['pull_number'] ?? payload['pr_number']);
            if (!Number.isInteger(prNumber) || prNumber <= 0) {
                return { ok: false, error: 'GitHub merge_pr: pull_number must be a positive integer' };
            }
            const mergeMethod = (['merge', 'squash', 'rebase'] as const).find(
                (m) => m === payload['merge_method'],
            );
            const result = await gh.mergePR({
                pullNumber: prNumber,
                commitTitle: typeof payload['commit_title'] === 'string' ? payload['commit_title'] : undefined,
                commitMessage: typeof payload['commit_message'] === 'string' ? payload['commit_message'] : undefined,
                mergeMethod: mergeMethod ?? 'merge',
            });
            return result;
        }
        case 'list_prs': {
            const stateRaw = payload['state'];
            const state = (['open', 'closed', 'all'] as const).find((s) => s === stateRaw);
            const result = await gh.listPRs({
                state: state ?? 'open',
                head: typeof payload['head'] === 'string' ? payload['head'] : undefined,
                base: typeof payload['base'] === 'string' ? payload['base'] : undefined,
                perPage: typeof payload['per_page'] === 'number' ? payload['per_page'] : undefined,
                page: typeof payload['page'] === 'number' ? payload['page'] : undefined,
            });
            return result;
        }
        default:
            return { ok: false, error: `GitHub connector does not support action "${actionType}"` };
    }
}

// ─── Jira action dispatch ─────────────────────────────────────────────────────

async function dispatchJira(
    jira: JiraConnector,
    actionType: string,
    payload: Record<string, unknown>,
): Promise<ConnectorDispatchResult> {
    switch (actionType) {
        case 'get_task': {
            const issueKey = String(payload['issue_key'] ?? payload['issueKey'] ?? '');
            if (!issueKey) return { ok: false, error: 'Jira get_task: issue_key is required' };
            return jira.getTask(issueKey);
        }
        case 'create_task': {
            const summary = String(payload['summary'] ?? payload['title'] ?? '');
            if (!summary) return { ok: false, error: 'Jira create_task: summary is required' };
            return jira.createTask({
                summary,
                description: typeof payload['description'] === 'string' ? payload['description'] : undefined,
                issueType: typeof payload['issue_type'] === 'string' ? payload['issue_type'] : undefined,
                projectKey: typeof payload['project_key'] === 'string' ? payload['project_key'] : undefined,
                priority: typeof payload['priority'] === 'string' ? payload['priority'] : undefined,
                assigneeAccountId: typeof payload['assignee_account_id'] === 'string' ? payload['assignee_account_id'] : undefined,
                labels: Array.isArray(payload['labels']) ? (payload['labels'] as string[]) : undefined,
            });
        }
        case 'update_task_status': {
            const issueKey = String(payload['issue_key'] ?? payload['issueKey'] ?? '');
            const targetStatus = String(payload['status'] ?? payload['target_status'] ?? '');
            if (!issueKey) return { ok: false, error: 'Jira update_task_status: issue_key is required' };
            if (!targetStatus) return { ok: false, error: 'Jira update_task_status: status is required' };
            return jira.updateTaskStatus({
                issueKey,
                targetStatus,
                comment: typeof payload['comment'] === 'string' ? payload['comment'] : undefined,
            });
        }
        case 'add_comment': {
            const issueKey = String(payload['issue_key'] ?? payload['issueKey'] ?? '');
            const body = String(payload['body'] ?? payload['comment'] ?? '');
            if (!issueKey) return { ok: false, error: 'Jira add_comment: issue_key is required' };
            if (!body) return { ok: false, error: 'Jira add_comment: body is required' };
            return jira.addComment({ issueKey, body });
        }
        case 'assign_task': {
            const issueKey = String(payload['issue_key'] ?? payload['issueKey'] ?? '');
            if (!issueKey) return { ok: false, error: 'Jira assign_task: issue_key is required' };
            const accountId =
                payload['account_id'] === null
                    ? null
                    : typeof payload['account_id'] === 'string'
                        ? payload['account_id']
                        : null;
            return jira.assignTask({ issueKey, accountId });
        }
        case 'list_tasks': {
            const jql = String(payload['jql'] ?? '');
            if (!jql) return { ok: false, error: 'Jira list_tasks: jql is required' };
            return jira.listTasks({
                jql,
                maxResults: typeof payload['max_results'] === 'number' ? payload['max_results'] : undefined,
                startAt: typeof payload['start_at'] === 'number' ? payload['start_at'] : undefined,
                fields: Array.isArray(payload['fields']) ? (payload['fields'] as string[]) : undefined,
            });
        }
        default:
            return { ok: false, error: `Jira connector does not support action "${actionType}"` };
    }
}
