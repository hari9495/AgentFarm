/**
 * GitLab REST API v4 Connector
 *
 * Provides GitLab integration: issues, merge requests, pipelines,
 * projects, commits, and note/comment management.
 *
 * Auth: Personal Access Token (preferred) or OAuth Bearer token.
 * Header: PRIVATE-TOKEN: {GITLAB_TOKEN}
 * OR:     Authorization: Bearer {GITLAB_OAUTH_TOKEN}
 * When both env vars are set, PRIVATE-TOKEN takes precedence.
 *
 * Required env vars (one of):
 *   GITLAB_TOKEN        — Personal Access Token (preferred)
 *   GITLAB_OAUTH_TOKEN  — OAuth Bearer token (fallback)
 *
 * Optional:
 *   GITLAB_HOST         — default: gitlab.com (supports self-hosted)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GitLabConnectorConfig = {
    token: string;
    tokenType: 'private' | 'oauth';
    host: string;
};

export type GitLabIssue = {
    iid: number;
    id: number;
    title: string;
    description: string | null;
    state: 'opened' | 'closed';
    labels: string[];
    assignees: string[];
    created_at: string;
    updated_at: string;
    web_url: string;
    author: string;
};

export type GitLabMergeRequest = {
    iid: number;
    id: number;
    title: string;
    description: string | null;
    state: 'opened' | 'closed' | 'merged' | 'locked';
    source_branch: string;
    target_branch: string;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
    web_url: string;
    author: string;
};

export type GitLabPipeline = {
    id: number;
    iid: number;
    status: string;
    ref: string;
    sha: string;
    created_at: string;
    updated_at: string;
    web_url: string;
};

export type GitLabProject = {
    id: number;
    name: string;
    name_with_namespace: string;
    path_with_namespace: string;
    default_branch: string;
    visibility: string;
    web_url: string;
};

export type GitLabCommit = {
    id: string;
    short_id: string;
    title: string;
    message: string;
    author_name: string;
    authored_date: string;
    web_url: string;
};

export type GitLabNote = {
    id: number;
    body: string;
    author: string;
    created_at: string;
    updated_at: string;
};

export type GitLabQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    status?: number;
};

export type GitLabIssueFilters = {
    state?: 'opened' | 'closed' | 'all';
    labels?: string;
    assignee_id?: number;
    milestone?: string;
};

export type GitLabMRFilters = {
    state?: 'opened' | 'closed' | 'merged' | 'all';
    target_branch?: string;
};

export type GitLabPipelineFilters = {
    status?: string;
    ref?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeBody(text: string, maxLength = 65536): string {
    return text.replace(/<script[^>]*>.*?<\/script>/gi, '').slice(0, maxLength);
}

function encodeProjectId(projectId: string | number): string {
    if (typeof projectId === 'number') return String(projectId);
    // Numeric string — pass through; path like "group/repo" — URL-encode
    return /^\d+$/.test(projectId) ? projectId : encodeURIComponent(projectId);
}

// ---------------------------------------------------------------------------
// GitLabConnector
// ---------------------------------------------------------------------------

export class GitLabConnector {
    private readonly config: GitLabConnectorConfig;
    private readonly baseUrl: string;

    constructor(config: GitLabConnectorConfig) {
        if (!config.token || config.token.trim().length === 0) {
            throw new Error('GitLabConnector: token is required (GITLAB_TOKEN or GITLAB_OAUTH_TOKEN)');
        }
        if (!config.host || config.host.trim().length === 0) {
            throw new Error('GitLabConnector: host is required');
        }
        this.config = config;
        this.baseUrl = `https://${config.host.trim().replace(/\/$/, '')}/api/v4`;
    }

    static fromEnv(): GitLabConnector {
        const patToken = process.env['GITLAB_TOKEN'];
        const oauthToken = process.env['GITLAB_OAUTH_TOKEN'];
        const host = process.env['GITLAB_HOST'] ?? 'gitlab.com';

        // PAT preferred; OAuth is fallback
        if (patToken) {
            return new GitLabConnector({ token: patToken, tokenType: 'private', host });
        }
        if (oauthToken) {
            return new GitLabConnector({ token: oauthToken, tokenType: 'oauth', host });
        }
        throw new Error('GitLabConnector.fromEnv: GITLAB_TOKEN or GITLAB_OAUTH_TOKEN is required');
    }

    private get headers(): Record<string, string> {
        const authHeader: Record<string, string> =
            this.config.tokenType === 'private'
                ? { 'PRIVATE-TOKEN': this.config.token }
                : { Authorization: `Bearer ${this.config.token}` };

        return {
            ...authHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<GitLabQueryResult<T>> {
        const url = `${this.baseUrl}${path}`;
        const response = await fetch(url, {
            method,
            headers: this.headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                ok: false,
                error: `GitLab API returned ${response.status}: ${text.slice(0, 256)}`,
                status: response.status,
            };
        }

        // 201 Created and 204 No Content may have no body
        if (response.status === 204) {
            return { ok: true, status: 204 };
        }

        const json = await response.json() as T;
        return { ok: true, data: json, status: response.status };
    }

    // ── Issues ─────────────────────────────────────────────────────────────

    async listIssues(
        projectId: string | number,
        filters: GitLabIssueFilters = {},
    ): Promise<GitLabQueryResult<GitLabIssue[]>> {
        const params = new URLSearchParams();
        if (filters.state) params.set('state', filters.state);
        if (filters.labels) params.set('labels', filters.labels);
        if (filters.assignee_id !== undefined) params.set('assignee_id', String(filters.assignee_id));
        if (filters.milestone) params.set('milestone', filters.milestone);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const result = await this.request<Array<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed';
            labels: string[];
            assignees: Array<{ username: string }>;
            created_at: string;
            updated_at: string;
            web_url: string;
            author: { username: string };
        }>>('GET', `/projects/${encodeProjectId(projectId)}/issues${qs}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((raw) => ({
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                labels: raw.labels,
                assignees: raw.assignees.map((a) => a.username),
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
                author: raw.author.username,
            })),
        };
    }

    async getIssue(
        projectId: string | number,
        issueIid: number,
    ): Promise<GitLabQueryResult<GitLabIssue>> {
        if (!Number.isInteger(issueIid) || issueIid <= 0) {
            return { ok: false, error: 'Invalid issue iid' };
        }

        const result = await this.request<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed';
            labels: string[];
            assignees: Array<{ username: string }>;
            created_at: string;
            updated_at: string;
            web_url: string;
            author: { username: string };
        }>('GET', `/projects/${encodeProjectId(projectId)}/issues/${issueIid}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                labels: raw.labels,
                assignees: raw.assignees.map((a) => a.username),
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
                author: raw.author.username,
            },
        };
    }

    async createIssue(
        projectId: string | number,
        title: string,
        description: string,
        labels?: string[],
        assigneeIds?: number[],
    ): Promise<GitLabQueryResult<GitLabIssue>> {
        if (!title || title.trim().length === 0) {
            return { ok: false, error: 'title is required' };
        }

        const payload: Record<string, unknown> = {
            title: title.slice(0, 255),
            description: sanitizeBody(description),
        };
        if (labels && labels.length > 0) payload['labels'] = labels.join(',');
        if (assigneeIds && assigneeIds.length > 0) payload['assignee_ids'] = assigneeIds;

        const result = await this.request<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed';
            labels: string[];
            assignees: Array<{ username: string }>;
            created_at: string;
            updated_at: string;
            web_url: string;
            author: { username: string };
        }>('POST', `/projects/${encodeProjectId(projectId)}/issues`, payload);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                labels: raw.labels,
                assignees: raw.assignees.map((a) => a.username),
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
                author: raw.author.username,
            },
        };
    }

    async updateIssue(
        projectId: string | number,
        issueIid: number,
        fields: Record<string, unknown>,
    ): Promise<GitLabQueryResult<GitLabIssue>> {
        if (!Number.isInteger(issueIid) || issueIid <= 0) {
            return { ok: false, error: 'Invalid issue iid' };
        }

        const result = await this.request<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed';
            labels: string[];
            assignees: Array<{ username: string }>;
            created_at: string;
            updated_at: string;
            web_url: string;
            author: { username: string };
        }>('PUT', `/projects/${encodeProjectId(projectId)}/issues/${issueIid}`, fields);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                labels: raw.labels,
                assignees: raw.assignees.map((a) => a.username),
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
                author: raw.author.username,
            },
        };
    }

    async addComment(
        projectId: string | number,
        issueIid: number,
        body: string,
    ): Promise<GitLabQueryResult<GitLabNote>> {
        if (!body || body.trim().length === 0) {
            return { ok: false, error: 'body is required' };
        }

        const sanitized = sanitizeBody(body);
        const result = await this.request<{
            id: number;
            body: string;
            author: { username: string };
            created_at: string;
            updated_at: string;
        }>('POST', `/projects/${encodeProjectId(projectId)}/issues/${issueIid}/notes`, { body: sanitized });

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                body: result.data.body,
                author: result.data.author.username,
                created_at: result.data.created_at,
                updated_at: result.data.updated_at,
            },
        };
    }

    // ── Merge Requests ─────────────────────────────────────────────────────

    async listMergeRequests(
        projectId: string | number,
        filters: GitLabMRFilters = {},
    ): Promise<GitLabQueryResult<GitLabMergeRequest[]>> {
        const params = new URLSearchParams();
        if (filters.state) params.set('state', filters.state);
        if (filters.target_branch) params.set('target_branch', filters.target_branch);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const result = await this.request<Array<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed' | 'merged' | 'locked';
            source_branch: string;
            target_branch: string;
            created_at: string;
            updated_at: string;
            merged_at: string | null;
            web_url: string;
            author: { username: string };
        }>>('GET', `/projects/${encodeProjectId(projectId)}/merge_requests${qs}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((raw) => ({
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                source_branch: raw.source_branch,
                target_branch: raw.target_branch,
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                merged_at: raw.merged_at,
                web_url: raw.web_url,
                author: raw.author.username,
            })),
        };
    }

    async getMergeRequest(
        projectId: string | number,
        mrIid: number,
    ): Promise<GitLabQueryResult<GitLabMergeRequest>> {
        if (!Number.isInteger(mrIid) || mrIid <= 0) {
            return { ok: false, error: 'Invalid merge request iid' };
        }

        const result = await this.request<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed' | 'merged' | 'locked';
            source_branch: string;
            target_branch: string;
            created_at: string;
            updated_at: string;
            merged_at: string | null;
            web_url: string;
            author: { username: string };
        }>('GET', `/projects/${encodeProjectId(projectId)}/merge_requests/${mrIid}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                source_branch: raw.source_branch,
                target_branch: raw.target_branch,
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                merged_at: raw.merged_at,
                web_url: raw.web_url,
                author: raw.author.username,
            },
        };
    }

    async createMergeRequest(
        projectId: string | number,
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<GitLabQueryResult<GitLabMergeRequest>> {
        if (!sourceBranch || !targetBranch || !title) {
            return { ok: false, error: 'sourceBranch, targetBranch, and title are required' };
        }

        const payload: Record<string, unknown> = {
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title: title.slice(0, 255),
        };
        if (description) payload['description'] = sanitizeBody(description);

        const result = await this.request<{
            iid: number;
            id: number;
            title: string;
            description: string | null;
            state: 'opened' | 'closed' | 'merged' | 'locked';
            source_branch: string;
            target_branch: string;
            created_at: string;
            updated_at: string;
            merged_at: string | null;
            web_url: string;
            author: { username: string };
        }>('POST', `/projects/${encodeProjectId(projectId)}/merge_requests`, payload);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                iid: raw.iid,
                id: raw.id,
                title: raw.title,
                description: raw.description,
                state: raw.state,
                source_branch: raw.source_branch,
                target_branch: raw.target_branch,
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                merged_at: raw.merged_at,
                web_url: raw.web_url,
                author: raw.author.username,
            },
        };
    }

    async approveMergeRequest(
        projectId: string | number,
        mrIid: number,
    ): Promise<GitLabQueryResult<{ approved: boolean }>> {
        if (!Number.isInteger(mrIid) || mrIid <= 0) {
            return { ok: false, error: 'Invalid merge request iid' };
        }

        const result = await this.request<unknown>(
            'POST',
            `/projects/${encodeProjectId(projectId)}/merge_requests/${mrIid}/approve`,
        );

        if (!result.ok) {
            return { ok: false, error: result.error, status: result.status };
        }

        return { ok: true, data: { approved: true }, status: result.status };
    }

    // ── Pipelines ──────────────────────────────────────────────────────────

    async listPipelines(
        projectId: string | number,
        filters: GitLabPipelineFilters = {},
    ): Promise<GitLabQueryResult<GitLabPipeline[]>> {
        const params = new URLSearchParams();
        if (filters.status) params.set('status', filters.status);
        if (filters.ref) params.set('ref', filters.ref);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const result = await this.request<Array<{
            id: number;
            iid: number;
            status: string;
            ref: string;
            sha: string;
            created_at: string;
            updated_at: string;
            web_url: string;
        }>>('GET', `/projects/${encodeProjectId(projectId)}/pipelines${qs}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((raw) => ({
                id: raw.id,
                iid: raw.iid,
                status: raw.status,
                ref: raw.ref,
                sha: raw.sha,
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
            })),
        };
    }

    async triggerPipeline(
        projectId: string | number,
        ref: string,
        variables?: Record<string, string>,
    ): Promise<GitLabQueryResult<GitLabPipeline>> {
        if (!ref || ref.trim().length === 0) {
            return { ok: false, error: 'ref is required' };
        }

        const payload: Record<string, unknown> = { ref };
        if (variables && Object.keys(variables).length > 0) {
            payload['variables'] = Object.entries(variables).map(([key, value]) => ({ key, value }));
        }

        const result = await this.request<{
            id: number;
            iid: number;
            status: string;
            ref: string;
            sha: string;
            created_at: string;
            updated_at: string;
            web_url: string;
        }>('POST', `/projects/${encodeProjectId(projectId)}/pipeline`, payload);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                id: raw.id,
                iid: raw.iid,
                status: raw.status,
                ref: raw.ref,
                sha: raw.sha,
                created_at: raw.created_at,
                updated_at: raw.updated_at,
                web_url: raw.web_url,
            },
        };
    }

    // ── Projects ───────────────────────────────────────────────────────────

    async listProjects(search?: string): Promise<GitLabQueryResult<GitLabProject[]>> {
        const params = new URLSearchParams({ membership: 'true' });
        if (search && search.trim().length > 0) params.set('search', search.trim());

        const result = await this.request<Array<{
            id: number;
            name: string;
            name_with_namespace: string;
            path_with_namespace: string;
            default_branch: string;
            visibility: string;
            web_url: string;
        }>>('GET', `/projects?${params.toString()}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((raw) => ({
                id: raw.id,
                name: raw.name,
                name_with_namespace: raw.name_with_namespace,
                path_with_namespace: raw.path_with_namespace,
                default_branch: raw.default_branch,
                visibility: raw.visibility,
                web_url: raw.web_url,
            })),
        };
    }

    async getProject(projectId: string | number): Promise<GitLabQueryResult<GitLabProject>> {
        const result = await this.request<{
            id: number;
            name: string;
            name_with_namespace: string;
            path_with_namespace: string;
            default_branch: string;
            visibility: string;
            web_url: string;
        }>('GET', `/projects/${encodeProjectId(projectId)}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                id: raw.id,
                name: raw.name,
                name_with_namespace: raw.name_with_namespace,
                path_with_namespace: raw.path_with_namespace,
                default_branch: raw.default_branch,
                visibility: raw.visibility,
                web_url: raw.web_url,
            },
        };
    }

    // ── Commits ────────────────────────────────────────────────────────────

    async listCommits(
        projectId: string | number,
        ref?: string,
        since?: string,
        until?: string,
    ): Promise<GitLabQueryResult<GitLabCommit[]>> {
        const params = new URLSearchParams();
        if (ref) params.set('ref_name', ref);
        if (since) params.set('since', since);
        if (until) params.set('until', until);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const result = await this.request<Array<{
            id: string;
            short_id: string;
            title: string;
            message: string;
            author_name: string;
            authored_date: string;
            web_url: string;
        }>>('GET', `/projects/${encodeProjectId(projectId)}/repository/commits${qs}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((raw) => ({
                id: raw.id,
                short_id: raw.short_id,
                title: raw.title,
                message: raw.message,
                author_name: raw.author_name,
                authored_date: raw.authored_date,
                web_url: raw.web_url,
            })),
        };
    }
}
