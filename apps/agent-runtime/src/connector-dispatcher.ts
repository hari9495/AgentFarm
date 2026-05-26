/**
 * connector-dispatcher.ts
 *
 * Unified HTTP connector layer for GitHub, Jira, TestRail, and Zephyr Scale.
 * Handles:
 *   - GitHub REST API: create_pr, add_pr_comment, merge_pr, list_prs,
 *     list_pr_review_comments, list_pr_reviews, reply_to_review_comment
 *   - Jira REST API v3: get_task, create_task, update_task_status,
 *     add_comment, assign_task, list_tasks
 *   - TestRail REST API v2: get_cases, add_run, add_results_for_cases,
 *     close_run, get_runs, get_results
 *   - Zephyr Scale REST API: get_test_cases, create_test_cycle,
 *     update_test_execution, get_test_executions
 *   - OAuth 2.0 token refresh (in-process cache, automatic retry)
 *
 * Token resolution order:
 *   1. payload.credentials object (test injection / API gateway forwarding)
 *   2. Environment variables (GITHUB_TOKEN, JIRA_API_TOKEN, TESTRAIL_URL, etc.)
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

interface GitHubReviewComment {
    id: number;
    html_url: string;
    body: string;
    path: string;
    line: number | null;
    original_line: number | null;
    diff_hunk: string;
    user: { login: string };
    created_at: string;
    updated_at: string;
    in_reply_to_id?: number;
}

interface GitHubReview {
    id: number;
    user: { login: string };
    body: string;
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
    submitted_at: string;
    html_url: string;
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

    /** List inline review comments on a pull request. */
    async listPRReviewComments(params: {
        pullNumber: number;
        perPage?: number;
        page?: number;
    }): Promise<JsonResponse<GitHubReviewComment[]>> {
        const { token, owner, repo } = this.creds;
        const qs = new URLSearchParams({
            per_page: String(params.perPage ?? 100),
            page: String(params.page ?? 1),
        });
        return jsonFetch<GitHubReviewComment[]>(
            `${this.base}/repos/${owner}/${repo}/pulls/${params.pullNumber}/comments?${qs}`,
            { method: 'GET', headers: ghHeaders(token) },
            this.fetchImpl,
        );
    }

    /** List all reviews (approved, change-requested, commented) on a pull request. */
    async listPRReviews(params: {
        pullNumber: number;
        perPage?: number;
        page?: number;
    }): Promise<JsonResponse<GitHubReview[]>> {
        const { token, owner, repo } = this.creds;
        const qs = new URLSearchParams({
            per_page: String(params.perPage ?? 100),
            page: String(params.page ?? 1),
        });
        return jsonFetch<GitHubReview[]>(
            `${this.base}/repos/${owner}/${repo}/pulls/${params.pullNumber}/reviews?${qs}`,
            { method: 'GET', headers: ghHeaders(token) },
            this.fetchImpl,
        );
    }

    /** Reply to an existing inline review comment on a pull request. */
    async replyToReviewComment(params: {
        pullNumber: number;
        commentId: number;
        body: string;
    }): Promise<JsonResponse<GitHubReviewComment>> {
        const { token, owner, repo } = this.creds;
        return jsonFetch<GitHubReviewComment>(
            `${this.base}/repos/${owner}/${repo}/pulls/${params.pullNumber}/comments/${params.commentId}/replies`,
            {
                method: 'POST',
                headers: ghHeaders(token),
                body: JSON.stringify({ body: params.body }),
            },
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

    // ── Sprint management (Jira Agile REST API) ──────────────────────────────

    async createSprint(params: {
        boardId: number;
        name: string;
        startDate?: string;
        endDate?: string;
        goal?: string;
    }): Promise<JsonResponse<{ id: number; name: string; state: string; startDate?: string; endDate?: string }>> {
        const body: Record<string, unknown> = {
            name: params.name,
            originBoardId: params.boardId,
            ...(params.startDate ? { startDate: params.startDate } : {}),
            ...(params.endDate ? { endDate: params.endDate } : {}),
            ...(params.goal ? { goal: params.goal } : {}),
        };
        return jsonFetch(
            `${this.base}/rest/agile/1.0/sprint`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    async updateSprintStatus(params: {
        sprintId: number;
        state: 'active' | 'closed';
    }): Promise<JsonResponse<{ id: number; state: string }>> {
        return jsonFetch(
            `${this.base}/rest/agile/1.0/sprint/${params.sprintId}`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify({ state: params.state }) },
            this.fetchImpl,
        );
    }

    async addIssueToSprint(params: {
        sprintId: number;
        issueKeys: string[];
    }): Promise<JsonResponse<null>> {
        return jsonFetch<null>(
            `${this.base}/rest/agile/1.0/sprint/${params.sprintId}/issue`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify({ issues: params.issueKeys }) },
            this.fetchImpl,
        );
    }

    async getSprintIssues(params: {
        sprintId: number;
        maxResults?: number;
        startAt?: number;
    }): Promise<JsonResponse<{ issues: Array<Record<string, unknown>>; total: number }>> {
        const qs = new URLSearchParams({
            maxResults: String(params.maxResults ?? 100),
            ...(params.startAt ? { startAt: String(params.startAt) } : {}),
        });
        return jsonFetch(
            `${this.base}/rest/agile/1.0/sprint/${params.sprintId}/issue?${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async listSprints(params: {
        boardId: number;
        state?: 'active' | 'future' | 'closed';
        maxResults?: number;
    }): Promise<JsonResponse<{ values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }> }>> {
        const qs = new URLSearchParams({
            maxResults: String(params.maxResults ?? 50),
            ...(params.state ? { state: params.state } : {}),
        });
        return jsonFetch(
            `${this.base}/rest/agile/1.0/board/${params.boardId}/sprint?${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }
}

// ─── Linear connector ─────────────────────────────────────────────────────────

interface LinearCredentials {
    apiKey: string;
    teamId?: string;
}

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

function linearHeaders(apiKey: string): Record<string, string> {
    return {
        Authorization: apiKey,
        'Content-Type': 'application/json',
    };
}

async function linearGraphQL<T>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown>,
    fetchImpl: typeof fetch,
): Promise<JsonResponse<T>> {
    const result = await jsonFetch<{ data?: T; errors?: Array<{ message: string }> }>(
        LINEAR_GRAPHQL_URL,
        {
            method: 'POST',
            headers: linearHeaders(apiKey),
            body: JSON.stringify({ query, variables }),
        },
        fetchImpl,
    );
    if (!result.ok) return result as { ok: false; error: string };
    if (result.data.errors?.length) {
        return { ok: false, error: result.data.errors.map((e) => e.message).join('; ') };
    }
    return { ok: true, data: result.data.data as T };
}

function resolveLinearCreds(payload: Record<string, unknown>): LinearCredentials | null {
    const creds = payload['credentials'] as Record<string, unknown> | undefined;
    const apiKey =
        (typeof creds?.['linear_api_key'] === 'string' ? creds['linear_api_key'] : null) ??
        (typeof creds?.['api_key'] === 'string' ? creds['api_key'] : null) ??
        process.env['LINEAR_API_KEY'] ??
        null;
    if (!apiKey) return null;
    const teamId =
        (typeof creds?.['team_id'] === 'string' ? creds['team_id'] : null) ??
        (typeof payload['team_id'] === 'string' ? payload['team_id'] : null) ??
        process.env['LINEAR_TEAM_ID'] ??
        undefined;
    return { apiKey, teamId };
}

async function dispatchLinear(
    creds: LinearCredentials,
    actionType: string,
    payload: Record<string, unknown>,
    fetchImpl: typeof fetch,
): Promise<ConnectorDispatchResult> {
    const { apiKey, teamId } = creds;
    const resolvedTeamId = (typeof payload['team_id'] === 'string' ? payload['team_id'] : null) ?? teamId;

    switch (actionType) {
        case 'create_sprint': {
            if (!resolvedTeamId) return { ok: false, error: 'Linear create_sprint: team_id is required' };
            const name = String(payload['name'] ?? `Sprint ${new Date().toLocaleDateString()}`);
            const mutation = `
                mutation CycleCreate($input: CycleCreateInput!) {
                    cycleCreate(input: $input) {
                        success
                        cycle { id number name startsAt endsAt }
                    }
                }`;
            return linearGraphQL<{ cycleCreate: { success: boolean; cycle: { id: string; number: number; name: string } } }>(
                apiKey, mutation,
                {
                    input: {
                        teamId: resolvedTeamId,
                        name,
                        ...(typeof payload['start_date'] === 'string' ? { startsAt: payload['start_date'] } : {}),
                        ...(typeof payload['end_date'] === 'string' ? { endsAt: payload['end_date'] } : {}),
                    },
                },
                fetchImpl,
            );
        }
        case 'update_sprint_status': {
            const cycleId = String(payload['sprint_id'] ?? payload['cycle_id'] ?? '');
            if (!cycleId) return { ok: false, error: 'Linear update_sprint_status: sprint_id is required' };
            const completedAt = payload['state'] === 'closed' ? new Date().toISOString() : undefined;
            const mutation = `
                mutation CycleUpdate($id: String!, $input: CycleUpdateInput!) {
                    cycleUpdate(id: $id, input: $input) {
                        success
                        cycle { id name }
                    }
                }`;
            return linearGraphQL(apiKey, mutation, { id: cycleId, input: { ...(completedAt ? { completedAt } : {}) } }, fetchImpl);
        }
        case 'add_issue_to_sprint': {
            const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '');
            const cycleId = String(payload['sprint_id'] ?? payload['cycle_id'] ?? '');
            if (!issueId) return { ok: false, error: 'Linear add_issue_to_sprint: issue_id is required' };
            if (!cycleId) return { ok: false, error: 'Linear add_issue_to_sprint: sprint_id is required' };
            const mutation = `
                mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) {
                        success
                        issue { id identifier title }
                    }
                }`;
            return linearGraphQL(apiKey, mutation, { id: issueId, input: { cycleId } }, fetchImpl);
        }
        case 'list_sprints': {
            if (!resolvedTeamId) return { ok: false, error: 'Linear list_sprints: team_id is required' };
            const query = `
                query ListCycles($teamId: String!) {
                    cycles(filter: { team: { id: { eq: $teamId } } }) {
                        nodes { id number name startsAt endsAt completedAt }
                    }
                }`;
            return linearGraphQL(apiKey, query, { teamId: resolvedTeamId }, fetchImpl);
        }
        case 'get_sprint_issues': {
            const cycleId = String(payload['sprint_id'] ?? payload['cycle_id'] ?? '');
            if (!cycleId) return { ok: false, error: 'Linear get_sprint_issues: sprint_id (cycle_id) is required' };
            const query = `
                query GetCycleIssues($cycleId: String!) {
                    cycle(id: $cycleId) {
                        id number name
                        issues {
                            nodes {
                                id
                                identifier
                                title
                                state { name type }
                                assignee { name }
                                estimate
                                labels { nodes { name } }
                            }
                        }
                    }
                }`;
            return linearGraphQL(apiKey, query, { cycleId }, fetchImpl);
        }
        case 'get_task': {
            const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '');
            if (!issueId) return { ok: false, error: 'Linear get_task: issue_id is required' };
            const query = `
                query GetIssue($id: String!) {
                    issue(id: $id) { id identifier title description state { name } assignee { name } priority createdAt updatedAt }
                }`;
            return linearGraphQL(apiKey, query, { id: issueId }, fetchImpl);
        }
        case 'create_task': {
            if (!resolvedTeamId) return { ok: false, error: 'Linear create_task: team_id is required' };
            const title = String(payload['title'] ?? payload['summary'] ?? '');
            if (!title) return { ok: false, error: 'Linear create_task: title is required' };
            const mutation = `
                mutation IssueCreate($input: IssueCreateInput!) {
                    issueCreate(input: $input) {
                        success
                        issue { id identifier title }
                    }
                }`;
            return linearGraphQL(apiKey, mutation, {
                input: {
                    teamId: resolvedTeamId,
                    title,
                    ...(typeof payload['description'] === 'string' ? { description: payload['description'] } : {}),
                    ...(typeof payload['assignee_id'] === 'string' ? { assigneeId: payload['assignee_id'] } : {}),
                    ...(typeof payload['priority'] === 'number' ? { priority: payload['priority'] } : {}),
                },
            }, fetchImpl);
        }
        case 'update_task_status': {
            const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '');
            const stateId = String(payload['state_id'] ?? payload['status_id'] ?? '');
            if (!issueId) return { ok: false, error: 'Linear update_task_status: issue_id is required' };
            if (!stateId) return { ok: false, error: 'Linear update_task_status: state_id is required' };
            const mutation = `
                mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) { success issue { id identifier title } }
                }`;
            return linearGraphQL(apiKey, mutation, { id: issueId, input: { stateId } }, fetchImpl);
        }
        case 'add_comment': {
            const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '');
            const body = String(payload['body'] ?? payload['comment'] ?? '');
            if (!issueId) return { ok: false, error: 'Linear add_comment: issue_id is required' };
            if (!body) return { ok: false, error: 'Linear add_comment: body is required' };
            const mutation = `
                mutation CommentCreate($input: CommentCreateInput!) {
                    commentCreate(input: $input) { success comment { id body } }
                }`;
            return linearGraphQL(apiKey, mutation, { input: { issueId, body } }, fetchImpl);
        }
        case 'assign_task': {
            const issueId = String(payload['issue_id'] ?? payload['issue_key'] ?? '');
            const assigneeId = typeof payload['assignee_id'] === 'string' ? payload['assignee_id'] : null;
            if (!issueId) return { ok: false, error: 'Linear assign_task: issue_id is required' };
            const mutation = `
                mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) { success issue { id identifier } }
                }`;
            return linearGraphQL(apiKey, mutation, { id: issueId, input: { assigneeId } }, fetchImpl);
        }
        case 'list_tasks': {
            if (!resolvedTeamId) return { ok: false, error: 'Linear list_tasks: team_id is required' };
            const query = `
                query ListIssues($teamId: String!, $first: Int) {
                    issues(filter: { team: { id: { eq: $teamId } } }, first: $first) {
                        nodes { id identifier title state { name } assignee { name } priority createdAt updatedAt }
                    }
                }`;
            return linearGraphQL(apiKey, query, { teamId: resolvedTeamId, first: Number(payload['max_results'] ?? 50) }, fetchImpl);
        }
        default:
            return { ok: false, error: `Linear connector does not support action "${actionType}"` };
    }
}

// ─── Credential resolution ────────────────────────────────────────────────────

// ─── TestRail connector ───────────────────────────────────────────────────────

export interface TestRailCredentials {
    /** e.g. https://yourorg.testrail.io */
    baseUrl: string;
    /** TestRail account email */
    email: string;
    /** TestRail API key or password */
    apiKey: string;
    /** Default project ID */
    projectId?: number;
}

interface TestRailCase {
    id: number;
    title: string;
    section_id: number;
    template_id: number;
    type_id: number;
    priority_id: number;
    estimate?: string;
    custom_fields?: Record<string, unknown>;
}

interface TestRailRun {
    id: number;
    name: string;
    description?: string;
    project_id: number;
    suite_id?: number;
    is_completed: boolean;
    created_on: number;
    url: string;
}

interface TestRailResult {
    id: number;
    test_id: number;
    status_id: number; // 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed
    comment?: string;
    elapsed?: string;
    defects?: string;
    created_on: number;
}

export class TestRailConnector {
    private readonly creds: TestRailCredentials;
    private readonly base: string;
    private readonly fetchImpl: typeof fetch;

    constructor(creds: TestRailCredentials, fetchImpl: typeof fetch = fetch) {
        this.creds = creds;
        this.base = creds.baseUrl.replace(/\/$/, '');
        this.fetchImpl = fetchImpl;
    }

    private headers(): Record<string, string> {
        const encoded = Buffer.from(`${this.creds.email}:${this.creds.apiKey}`).toString('base64');
        return {
            Authorization: `Basic ${encoded}`,
            'Content-Type': 'application/json',
        };
    }

    private url(path: string): string {
        return `${this.base}/index.php?/api/v2/${path}`;
    }

    async getCases(params: {
        projectId?: number;
        suiteId?: number;
        sectionId?: number;
        limit?: number;
        offset?: number;
    }): Promise<JsonResponse<{ cases: TestRailCase[]; _links: unknown }>> {
        const pid = params.projectId ?? this.creds.projectId;
        if (!pid) return { ok: false, error: 'TestRail getCases: projectId is required' };
        const qs = new URLSearchParams({ limit: String(params.limit ?? 250), offset: String(params.offset ?? 0) });
        if (params.suiteId) qs.set('suite_id', String(params.suiteId));
        if (params.sectionId) qs.set('section_id', String(params.sectionId));
        return jsonFetch<{ cases: TestRailCase[]; _links: unknown }>(
            `${this.url(`get_cases/${pid}`)}&${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async addRun(params: {
        projectId?: number;
        suiteId?: number;
        name: string;
        description?: string;
        caseIds?: number[];
        assignedtoId?: number;
    }): Promise<JsonResponse<TestRailRun>> {
        const pid = params.projectId ?? this.creds.projectId;
        if (!pid) return { ok: false, error: 'TestRail addRun: projectId is required' };
        const body: Record<string, unknown> = {
            name: params.name,
            description: params.description ?? '',
            include_all: !params.caseIds || params.caseIds.length === 0,
            ...(params.caseIds && params.caseIds.length > 0 ? { case_ids: params.caseIds } : {}),
            ...(params.suiteId ? { suite_id: params.suiteId } : {}),
            ...(params.assignedtoId ? { assignedto_id: params.assignedtoId } : {}),
        };
        return jsonFetch<TestRailRun>(
            this.url(`add_run/${pid}`),
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    async addResultsForCases(params: {
        runId: number;
        results: Array<{
            case_id: number;
            /** 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed */
            status_id: number;
            comment?: string;
            elapsed?: string;
            defects?: string;
        }>;
    }): Promise<JsonResponse<TestRailResult[]>> {
        return jsonFetch<TestRailResult[]>(
            this.url(`add_results_for_cases/${params.runId}`),
            { method: 'POST', headers: this.headers(), body: JSON.stringify({ results: params.results }) },
            this.fetchImpl,
        );
    }

    async closeRun(runId: number): Promise<JsonResponse<TestRailRun>> {
        return jsonFetch<TestRailRun>(
            this.url(`close_run/${runId}`),
            { method: 'POST', headers: this.headers(), body: '{}' },
            this.fetchImpl,
        );
    }

    async getRuns(params: {
        projectId?: number;
        limit?: number;
        offset?: number;
        isCompleted?: boolean;
    }): Promise<JsonResponse<{ runs: TestRailRun[] }>> {
        const pid = params.projectId ?? this.creds.projectId;
        if (!pid) return { ok: false, error: 'TestRail getRuns: projectId is required' };
        const qs = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
        if (params.isCompleted !== undefined) qs.set('is_completed', params.isCompleted ? '1' : '0');
        return jsonFetch<{ runs: TestRailRun[] }>(
            `${this.url(`get_runs/${pid}`)}&${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async getResults(params: {
        testId: number;
        limit?: number;
    }): Promise<JsonResponse<{ results: TestRailResult[] }>> {
        const qs = new URLSearchParams({ limit: String(params.limit ?? 50) });
        return jsonFetch<{ results: TestRailResult[] }>(
            `${this.url(`get_results/${params.testId}`)}&${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }
}

// ─── Zephyr Scale connector ───────────────────────────────────────────────────

export interface ZephyrCredentials {
    /** e.g. https://api.zephyrscale.smartbear.com/v2 */
    baseUrl: string;
    /** Bearer API token from Zephyr Scale app settings */
    apiToken: string;
    /** Jira project key, e.g. "ENG" */
    projectKey: string;
}

interface ZephyrTestCase {
    id: string;
    key: string;
    name: string;
    status: { name: string };
    priority: { name: string };
    labels: string[];
    folder?: { name: string };
}

interface ZephyrTestCycle {
    id: string;
    key: string;
    name: string;
    status: { name: string };
    projectKey: string;
    createdOn: string;
}

interface ZephyrTestExecution {
    id: string;
    testCaseKey: string;
    testCycleKey: string;
    statusName: string;
    actualEndDate?: string;
    comment?: string;
    executionTime?: number;
}

export class ZephyrConnector {
    private readonly creds: ZephyrCredentials;
    private readonly base: string;
    private readonly fetchImpl: typeof fetch;

    constructor(creds: ZephyrCredentials, fetchImpl: typeof fetch = fetch) {
        this.creds = creds;
        this.base = creds.baseUrl.replace(/\/$/, '');
        this.fetchImpl = fetchImpl;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.creds.apiToken}`,
            'Content-Type': 'application/json',
        };
    }

    async getTestCases(params: {
        folderId?: string;
        maxResults?: number;
        startAt?: number;
    }): Promise<JsonResponse<{ values: ZephyrTestCase[]; total: number }>> {
        const qs = new URLSearchParams({
            projectKey: this.creds.projectKey,
            maxResults: String(params.maxResults ?? 200),
            startAt: String(params.startAt ?? 0),
        });
        if (params.folderId) qs.set('folderId', params.folderId);
        return jsonFetch<{ values: ZephyrTestCase[]; total: number }>(
            `${this.base}/testcases?${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async createTestCycle(params: {
        name: string;
        description?: string;
        statusName?: string;
        plannedStartDate?: string;
        plannedEndDate?: string;
        folderId?: string;
    }): Promise<JsonResponse<ZephyrTestCycle>> {
        const body: Record<string, unknown> = {
            projectKey: this.creds.projectKey,
            name: params.name,
            description: params.description ?? '',
            status: { name: params.statusName ?? 'Not Started' },
            ...(params.plannedStartDate ? { plannedStartDate: params.plannedStartDate } : {}),
            ...(params.plannedEndDate ? { plannedEndDate: params.plannedEndDate } : {}),
            ...(params.folderId ? { folder: { id: params.folderId } } : {}),
        };
        return jsonFetch<ZephyrTestCycle>(
            `${this.base}/testcycles`,
            { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    async getTestExecutions(params: {
        testCycleKey: string;
        maxResults?: number;
        startAt?: number;
    }): Promise<JsonResponse<{ values: ZephyrTestExecution[]; total: number }>> {
        const qs = new URLSearchParams({
            testCycle: params.testCycleKey,
            maxResults: String(params.maxResults ?? 200),
            startAt: String(params.startAt ?? 0),
        });
        return jsonFetch<{ values: ZephyrTestExecution[]; total: number }>(
            `${this.base}/testexecutions?${qs}`,
            { method: 'GET', headers: this.headers() },
            this.fetchImpl,
        );
    }

    async updateTestExecution(params: {
        testExecutionId: string;
        statusName: string;
        comment?: string;
        executionTimeMs?: number;
        actualEndDate?: string;
    }): Promise<JsonResponse<ZephyrTestExecution>> {
        const body: Record<string, unknown> = {
            status: { name: params.statusName },
            ...(params.comment ? { comment: params.comment } : {}),
            ...(params.executionTimeMs ? { executionTime: params.executionTimeMs } : {}),
            ...(params.actualEndDate ? { actualEndDate: params.actualEndDate } : {}),
        };
        return jsonFetch<ZephyrTestExecution>(
            `${this.base}/testexecutions/${encodeURIComponent(params.testExecutionId)}`,
            { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) },
            this.fetchImpl,
        );
    }

    async bulkUpdateExecutions(params: {
        testCycleKey: string;
        results: Array<{
            testCaseKey: string;
            statusName: string;
            comment?: string;
            executionTimeMs?: number;
        }>;
    }): Promise<JsonResponse<{ updated: number; errors: unknown[] }>> {
        // Zephyr Scale doesn't have a native bulk endpoint; we do parallel updates
        const executions = await this.getTestExecutions({ testCycleKey: params.testCycleKey, maxResults: 500 });
        if (!executions.ok) return executions as { ok: false; error: string };

        const execMap = new Map(executions.data.values.map((e) => [e.testCaseKey, e.id]));
        const updatePromises = params.results.map(async (r) => {
            const execId = execMap.get(r.testCaseKey);
            if (!execId) return { ok: false, error: `No execution found for ${r.testCaseKey}` };
            return this.updateTestExecution({
                testExecutionId: execId,
                statusName: r.statusName,
                comment: r.comment,
                executionTimeMs: r.executionTimeMs,
            });
        });

        const outcomes = await Promise.allSettled(updatePromises);
        const errors: unknown[] = [];
        let updated = 0;
        for (const o of outcomes) {
            if (o.status === 'fulfilled' && o.value.ok) updated++;
            else errors.push(o.status === 'rejected' ? o.reason : (o.value as { error: string }).error);
        }
        return { ok: true, data: { updated, errors } };
    }
}

// ─── Credential resolution ────────────────────────────────────────────────────

/**
 * Gap 6 fix: Enforce per-tenant credential isolation.
 *
 * In a multi-tenant environment, every connector request MUST carry explicit
 * credentials scoped to that tenant. Falling back to process-wide environment
 * variables means one tenant could inadvertently act as another — a data
 * isolation and privilege-escalation risk.
 *
 * Enforcement policy:
 *   - If `payload.tenant_id` is set AND does not match a dev/test bypass
 *     marker (dev, test, local, default, ci) AND `payload.credentials` is
 *     absent → reject with CREDENTIAL_ISOLATION_REQUIRED.
 *   - Dev/CI tenants are allowed to fall back to env vars for local testing.
 */
const DEV_TENANT_BYPASS = new Set(['dev', 'test', 'local', 'default', 'ci', 'localhost']);

function assertTenantCredentialIsolation(payload: Record<string, unknown>): void {
    const tenantId = typeof payload['tenant_id'] === 'string' ? payload['tenant_id'].trim() : '';
    if (!tenantId) return; // no tenant context → no enforcement (backwards compat)
    if (DEV_TENANT_BYPASS.has(tenantId.toLowerCase())) return; // dev/test bypass
    const hasExplicitCreds = payload['credentials'] !== undefined && payload['credentials'] !== null;
    if (!hasExplicitCreds) {
        throw new Error(
            `CREDENTIAL_ISOLATION_REQUIRED: tenant "${tenantId}" must supply explicit credentials in payload.credentials. ` +
            `Falling back to process-wide environment variables is not permitted for production tenants.`,
        );
    }
}

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

function resolveTestRailCreds(payload: Record<string, unknown>): TestRailCredentials | null {
    const creds = payload['credentials'] as Record<string, unknown> | undefined;
    const baseUrl =
        (typeof creds?.['testrail_url'] === 'string' ? creds['testrail_url'] : null) ??
        (typeof creds?.['base_url'] === 'string' ? creds['base_url'] : null) ??
        process.env['TESTRAIL_URL'] ?? null;
    const email =
        (typeof creds?.['email'] === 'string' ? creds['email'] : null) ??
        process.env['TESTRAIL_EMAIL'] ?? null;
    const apiKey =
        (typeof creds?.['api_key'] === 'string' ? creds['api_key'] : null) ??
        (typeof creds?.['password'] === 'string' ? creds['password'] : null) ??
        process.env['TESTRAIL_API_KEY'] ?? null;
    if (!baseUrl || !email || !apiKey) return null;
    const projectId = typeof creds?.['project_id'] === 'number'
        ? creds['project_id']
        : (process.env['TESTRAIL_PROJECT_ID'] ? Number(process.env['TESTRAIL_PROJECT_ID']) : undefined);
    return { baseUrl, email, apiKey, projectId };
}

function resolveZephyrCreds(payload: Record<string, unknown>): ZephyrCredentials | null {
    const creds = payload['credentials'] as Record<string, unknown> | undefined;
    const baseUrl =
        (typeof creds?.['zephyr_url'] === 'string' ? creds['zephyr_url'] : null) ??
        (typeof creds?.['base_url'] === 'string' ? creds['base_url'] : null) ??
        process.env['ZEPHYR_BASE_URL'] ?? 'https://api.zephyrscale.smartbear.com/v2';
    const apiToken =
        (typeof creds?.['api_token'] === 'string' ? creds['api_token'] : null) ??
        process.env['ZEPHYR_API_TOKEN'] ?? null;
    const projectKey =
        (typeof creds?.['project_key'] === 'string' ? creds['project_key'] : null) ??
        (typeof payload['projectKey'] === 'string' ? payload['projectKey'] : null) ??
        process.env['ZEPHYR_PROJECT_KEY'] ?? null;
    if (!apiToken || !projectKey) return null;
    return { baseUrl: baseUrl ?? 'https://api.zephyrscale.smartbear.com/v2', apiToken, projectKey };
}

// ─── TestRail dispatch ────────────────────────────────────────────────────────

async function dispatchTestRail(
    tr: TestRailConnector,
    actionType: string,
    payload: Record<string, unknown>,
): Promise<ConnectorDispatchResult> {
    switch (actionType) {
        case 'get_cases':
        case 'sync_test_cases': {
            const result = await tr.getCases({
                projectId: typeof payload['project_id'] === 'number' ? payload['project_id'] : undefined,
                suiteId: typeof payload['suite_id'] === 'number' ? payload['suite_id'] : undefined,
                sectionId: typeof payload['section_id'] === 'number' ? payload['section_id'] : undefined,
                limit: typeof payload['limit'] === 'number' ? payload['limit'] : 250,
                offset: typeof payload['offset'] === 'number' ? payload['offset'] : 0,
            });
            return result;
        }
        case 'add_run':
        case 'publish_test_run': {
            const name = String(payload['name'] ?? `Automated run ${new Date().toISOString()}`);
            const caseIds = Array.isArray(payload['case_ids'])
                ? (payload['case_ids'] as unknown[]).filter((n): n is number => typeof n === 'number')
                : undefined;
            const result = await tr.addRun({
                projectId: typeof payload['project_id'] === 'number' ? payload['project_id'] : undefined,
                suiteId: typeof payload['suite_id'] === 'number' ? payload['suite_id'] : undefined,
                name,
                description: typeof payload['description'] === 'string' ? payload['description'] : undefined,
                caseIds,
                assignedtoId: typeof payload['assignedto_id'] === 'number' ? payload['assignedto_id'] : undefined,
            });
            if (!result.ok) return result;
            // If results are included, add them immediately
            const results = payload['results'] as Array<{ case_id: number; status_id: number; comment?: string; elapsed?: string }> | undefined;
            if (Array.isArray(results) && results.length > 0) {
                const addResult = await tr.addResultsForCases({ runId: result.data.id, results });
                if (!addResult.ok) return addResult;
                if (payload['close_run'] === true) {
                    await tr.closeRun(result.data.id);
                }
            }
            return result;
        }
        case 'add_results': {
            const runId = Number(payload['run_id']);
            if (!Number.isInteger(runId) || runId <= 0) return { ok: false, error: 'TestRail add_results: run_id must be a positive integer' };
            const results = payload['results'] as Array<{ case_id: number; status_id: number; comment?: string }>;
            if (!Array.isArray(results)) return { ok: false, error: 'TestRail add_results: results array is required' };
            return tr.addResultsForCases({ runId, results });
        }
        case 'close_run': {
            const runId = Number(payload['run_id']);
            if (!Number.isInteger(runId) || runId <= 0) return { ok: false, error: 'TestRail close_run: run_id must be a positive integer' };
            return tr.closeRun(runId);
        }
        case 'get_runs': {
            return tr.getRuns({
                projectId: typeof payload['project_id'] === 'number' ? payload['project_id'] : undefined,
                limit: typeof payload['limit'] === 'number' ? payload['limit'] : 50,
                offset: typeof payload['offset'] === 'number' ? payload['offset'] : 0,
                isCompleted: typeof payload['is_completed'] === 'boolean' ? payload['is_completed'] : undefined,
            });
        }
        case 'get_results': {
            const testId = Number(payload['test_id']);
            if (!Number.isInteger(testId) || testId <= 0) return { ok: false, error: 'TestRail get_results: test_id must be a positive integer' };
            return tr.getResults({ testId, limit: typeof payload['limit'] === 'number' ? payload['limit'] : 50 });
        }
        default:
            return { ok: false, error: `TestRail: unsupported action "${actionType}"` };
    }
}

// ─── Zephyr dispatch ──────────────────────────────────────────────────────────

async function dispatchZephyr(
    z: ZephyrConnector,
    actionType: string,
    payload: Record<string, unknown>,
): Promise<ConnectorDispatchResult> {
    switch (actionType) {
        case 'get_test_cases':
        case 'sync_test_cases': {
            return z.getTestCases({
                folderId: typeof payload['folder_id'] === 'string' ? payload['folder_id'] : undefined,
                maxResults: typeof payload['max_results'] === 'number' ? payload['max_results'] : 200,
                startAt: typeof payload['start_at'] === 'number' ? payload['start_at'] : 0,
            });
        }
        case 'create_test_cycle': {
            const name = String(payload['name'] ?? `Automated cycle ${new Date().toISOString()}`);
            return z.createTestCycle({
                name,
                description: typeof payload['description'] === 'string' ? payload['description'] : undefined,
                statusName: typeof payload['status_name'] === 'string' ? payload['status_name'] : 'In Progress',
                plannedStartDate: typeof payload['planned_start_date'] === 'string' ? payload['planned_start_date'] : undefined,
                plannedEndDate: typeof payload['planned_end_date'] === 'string' ? payload['planned_end_date'] : undefined,
                folderId: typeof payload['folder_id'] === 'string' ? payload['folder_id'] : undefined,
            });
        }
        case 'get_executions': {
            const testCycleKey = String(payload['test_cycle_key'] ?? '');
            if (!testCycleKey) return { ok: false, error: 'Zephyr get_executions: test_cycle_key is required' };
            return z.getTestExecutions({
                testCycleKey,
                maxResults: typeof payload['max_results'] === 'number' ? payload['max_results'] : 200,
                startAt: typeof payload['start_at'] === 'number' ? payload['start_at'] : 0,
            });
        }
        case 'update_execution': {
            const execId = String(payload['execution_id'] ?? '');
            if (!execId) return { ok: false, error: 'Zephyr update_execution: execution_id is required' };
            const statusName = String(payload['status_name'] ?? 'Pass');
            return z.updateTestExecution({
                testExecutionId: execId,
                statusName,
                comment: typeof payload['comment'] === 'string' ? payload['comment'] : undefined,
                executionTimeMs: typeof payload['execution_time_ms'] === 'number' ? payload['execution_time_ms'] : undefined,
                actualEndDate: typeof payload['actual_end_date'] === 'string' ? payload['actual_end_date'] : undefined,
            });
        }
        case 'publish_test_run':
        case 'bulk_update_executions': {
            const testCycleKey = String(payload['test_cycle_key'] ?? '');
            if (!testCycleKey) return { ok: false, error: 'Zephyr bulk_update_executions: test_cycle_key is required' };
            const results = payload['results'] as Array<{ testCaseKey: string; statusName: string; comment?: string; executionTimeMs?: number }>;
            if (!Array.isArray(results)) return { ok: false, error: 'Zephyr bulk_update_executions: results array is required' };
            return z.bulkUpdateExecutions({ testCycleKey, results });
        }
        default:
            return { ok: false, error: `Zephyr: unsupported action "${actionType}"` };
    }
}

type ConnectorDispatchResult =
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
    // Gap 6 fix: enforce per-tenant credential isolation before resolving any creds
    try {
        assertTenantCredentialIsolation(payload);
    } catch (err) {
        return { ok: false, error: String(err) };
    }

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

    if (connector === 'testrail') {
        const creds = resolveTestRailCreds(payload);
        if (!creds) {
            return {
                ok: false,
                error: 'TestRail: missing credentials. Set TESTRAIL_URL, TESTRAIL_EMAIL, TESTRAIL_API_KEY or pass payload.credentials.',
            };
        }
        const tr = new TestRailConnector(creds, fetchImpl);
        return dispatchTestRail(tr, actionType, payload);
    }

    if (connector === 'zephyr') {
        const creds = resolveZephyrCreds(payload);
        if (!creds) {
            return {
                ok: false,
                error: 'Zephyr: missing credentials. Set ZEPHYR_API_TOKEN, ZEPHYR_PROJECT_KEY or pass payload.credentials.',
            };
        }
        const z = new ZephyrConnector(creds, fetchImpl);
        return dispatchZephyr(z, actionType, payload);
    }

    if (connector === 'linear') {
        const creds = resolveLinearCreds(payload);
        if (!creds) {
            return {
                ok: false,
                error: 'Linear: missing credentials. Set LINEAR_API_KEY or pass payload.credentials.',
            };
        }
        return dispatchLinear(creds, actionType, payload, fetchImpl);
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
        case 'list_pr_review_comments': {
            const prNumber = Number(payload['pull_number'] ?? payload['pr_number']);
            if (!Number.isInteger(prNumber) || prNumber <= 0) {
                return { ok: false, error: 'GitHub list_pr_review_comments: pull_number must be a positive integer' };
            }
            return gh.listPRReviewComments({
                pullNumber: prNumber,
                perPage: typeof payload['per_page'] === 'number' ? payload['per_page'] : undefined,
                page: typeof payload['page'] === 'number' ? payload['page'] : undefined,
            });
        }
        case 'list_pr_reviews': {
            const prNumber = Number(payload['pull_number'] ?? payload['pr_number']);
            if (!Number.isInteger(prNumber) || prNumber <= 0) {
                return { ok: false, error: 'GitHub list_pr_reviews: pull_number must be a positive integer' };
            }
            return gh.listPRReviews({
                pullNumber: prNumber,
                perPage: typeof payload['per_page'] === 'number' ? payload['per_page'] : undefined,
                page: typeof payload['page'] === 'number' ? payload['page'] : undefined,
            });
        }
        case 'reply_to_review_comment': {
            const prNumber = Number(payload['pull_number'] ?? payload['pr_number']);
            const commentId = Number(payload['comment_id']);
            if (!Number.isInteger(prNumber) || prNumber <= 0) {
                return { ok: false, error: 'GitHub reply_to_review_comment: pull_number must be a positive integer' };
            }
            if (!Number.isInteger(commentId) || commentId <= 0) {
                return { ok: false, error: 'GitHub reply_to_review_comment: comment_id must be a positive integer' };
            }
            const body = String(payload['body'] ?? '');
            if (!body.trim()) {
                return { ok: false, error: 'GitHub reply_to_review_comment: body is required' };
            }
            return gh.replyToReviewComment({ pullNumber: prNumber, commentId, body });
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
        case 'create_sprint': {
            const boardId = Number(payload['board_id']);
            if (!Number.isInteger(boardId) || boardId <= 0) {
                return { ok: false, error: 'Jira create_sprint: board_id must be a positive integer' };
            }
            const name = String(payload['name'] ?? `Sprint ${new Date().toLocaleDateString()}`);
            return jira.createSprint({
                boardId,
                name,
                startDate: typeof payload['start_date'] === 'string' ? payload['start_date'] : undefined,
                endDate: typeof payload['end_date'] === 'string' ? payload['end_date'] : undefined,
                goal: typeof payload['goal'] === 'string' ? payload['goal'] : undefined,
            });
        }
        case 'update_sprint_status': {
            const sprintId = Number(payload['sprint_id']);
            if (!Number.isInteger(sprintId) || sprintId <= 0) {
                return { ok: false, error: 'Jira update_sprint_status: sprint_id must be a positive integer' };
            }
            const state = payload['state'] === 'closed' ? 'closed' : 'active';
            return jira.updateSprintStatus({ sprintId, state });
        }
        case 'add_issue_to_sprint': {
            const sprintId = Number(payload['sprint_id']);
            if (!Number.isInteger(sprintId) || sprintId <= 0) {
                return { ok: false, error: 'Jira add_issue_to_sprint: sprint_id must be a positive integer' };
            }
            const issueKeys = Array.isArray(payload['issue_keys'])
                ? (payload['issue_keys'] as unknown[]).filter((k): k is string => typeof k === 'string')
                : typeof payload['issue_key'] === 'string' ? [payload['issue_key']]
                : [];
            if (issueKeys.length === 0) return { ok: false, error: 'Jira add_issue_to_sprint: issue_keys is required' };
            return jira.addIssueToSprint({ sprintId, issueKeys });
        }
        case 'list_sprints': {
            const boardId = Number(payload['board_id']);
            if (!Number.isInteger(boardId) || boardId <= 0) {
                return { ok: false, error: 'Jira list_sprints: board_id must be a positive integer' };
            }
            const stateRaw = payload['state'];
            const state = (['active', 'future', 'closed'] as const).find((s) => s === stateRaw);
            return jira.listSprints({
                boardId,
                state,
                maxResults: typeof payload['max_results'] === 'number' ? payload['max_results'] : undefined,
            });
        }
        case 'get_sprint_issues': {
            const sprintId = Number(payload['sprint_id'] ?? payload['sprintId']);
            if (!Number.isInteger(sprintId) || sprintId <= 0) {
                return { ok: false, error: 'Jira get_sprint_issues: sprint_id must be a positive integer' };
            }
            return jira.getSprintIssues({
                sprintId,
                maxResults: typeof payload['max_results'] === 'number' ? payload['max_results'] : undefined,
                startAt:    typeof payload['start_at']    === 'number' ? payload['start_at']    : undefined,
            });
        }
        default:
            return { ok: false, error: `Jira connector does not support action "${actionType}"` };
    }
}
