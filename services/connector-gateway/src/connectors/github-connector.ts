/**
 * GitHub REST API Connector
 *
 * Provides full GitHub integration: issues, pull requests, commits,
 * reviews, workflow runs, repository metadata, and webhook management.
 *
 * Requires GITHUB_TOKEN in environment (classic PAT or fine-grained).
 * All requests use the Accept: application/vnd.github+json header.
 * Responses are typed and validated before being returned to callers.
 */

export type GitHubConnectorConfig = {
    token: string;
    owner: string;
    repo: string;
    baseUrl?: string;
    rateLimitPerHour?: number;
};

export type GitHubIssue = {
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    labels: string[];
    assignees: string[];
    created_at: string;
    updated_at: string;
    html_url: string;
    author: string;
};

export type CreateIssueInput = {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
};

export type GitHubPR = {
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed' | 'merged';
    base_branch: string;
    head_branch: string;
    draft: boolean;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    updated_at: string;
    merged_at?: string;
    html_url: string;
    author: string;
    reviewers: string[];
};

export type GitHubCommit = {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
};

export type GitHubWorkflowRun = {
    id: number;
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
    head_branch: string;
    head_sha: string;
    created_at: string;
    updated_at: string;
    html_url: string;
};

export type GitHubReview = {
    id: number;
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED';
    body: string;
    author: string;
    submitted_at: string;
};

export type GitHubComment = {
    id: number;
    body: string;
    author: string;
    created_at: string;
    updated_at: string;
    html_url: string;
};

export type GitHubQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    rate_limit_remaining?: number;
    rate_limit_reset_at?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeBody(text: string, maxLength = 65536): string {
    // Strip script tags, limit length
    return text.replace(/<script[^>]*>.*?<\/script>/gi, '').slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Raw GitHub API response shapes (subset used for mapping)
// ---------------------------------------------------------------------------

type RawGHIssue = {
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: { name: string }[];
    assignees: { login: string }[];
    created_at: string;
    updated_at: string;
    html_url: string;
    user: { login: string } | null;
};

type RawGHPR = {
    number: number;
    title: string;
    body: string | null;
    state: string;
    base: { ref: string };
    head: { ref: string };
    draft: boolean;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
    html_url: string;
    user: { login: string } | null;
    requested_reviewers: { login: string }[];
};

type RawGHCommit = {
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
    html_url: string;
};

type RawGHWorkflowRun = {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    head_branch: string;
    head_sha: string;
    created_at: string;
    updated_at: string;
    html_url: string;
};

type RawGHReview = {
    id: number;
    state: string;
    body: string;
    user: { login: string } | null;
    submitted_at: string;
};

type RawGHComment = {
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    updated_at: string;
    html_url: string;
};

// ---------------------------------------------------------------------------
// GitHubConnector
// ---------------------------------------------------------------------------

export class GitHubConnector {
    private readonly config: GitHubConnectorConfig;
    private readonly baseUrl: string;

    constructor(config: GitHubConnectorConfig) {
        if (!config.token || config.token.trim().length === 0) {
            throw new Error('GitHubConnector: token is required');
        }
        if (!config.owner || !config.repo) {
            throw new Error('GitHubConnector: owner and repo are required');
        }
        this.config = config;
        this.baseUrl = config.baseUrl ?? 'https://api.github.com';
    }

    static fromEnv(): GitHubConnector {
        const token = process.env['GITHUB_TOKEN'];
        const owner = process.env['GITHUB_OWNER'];
        const repo = process.env['GITHUB_REPO'];
        if (!token || !owner || !repo) {
            throw new Error('GitHubConnector.fromEnv: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO required');
        }
        return new GitHubConnector({ token, owner, repo });
    }

    private get headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.config.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        };
    }

    private repoBase(): string {
        return `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}`;
    }

    /** Core fetch helper — reads rate-limit headers and maps errors to result shape. */
    private async request<T>(
        method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<GitHubQueryResult<T>> {
        const url = `${this.baseUrl}${path}`;
        const response = await fetch(url, {
            method,
            headers: this.headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');

        const rateMeta = {
            rate_limit_remaining: remaining !== null ? Number(remaining) : undefined,
            rate_limit_reset_at: reset !== null ? new Date(Number(reset) * 1000).toISOString() : undefined,
        };

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}) as Record<string, unknown>) as { message?: string };
            return {
                ok: false,
                error: `GitHub API error ${response.status}: ${errBody.message ?? response.statusText}`,
                ...rateMeta,
            };
        }

        if (response.status === 204) {
            return { ok: true, ...rateMeta };
        }

        const json = await response.json() as T;
        return { ok: true, data: json, ...rateMeta };
    }

    // ── Mappers ────────────────────────────────────────────────────────────

    private mapIssue(r: RawGHIssue): GitHubIssue {
        return {
            number: r.number,
            title: r.title,
            body: r.body ?? '',
            state: (r.state === 'closed' ? 'closed' : 'open') as 'open' | 'closed',
            labels: r.labels.map(l => l.name),
            assignees: r.assignees.map(a => a.login),
            created_at: r.created_at,
            updated_at: r.updated_at,
            html_url: r.html_url,
            author: r.user?.login ?? 'unknown',
        };
    }

    private mapPR(r: RawGHPR): GitHubPR {
        const stateMap: Record<string, GitHubPR['state']> = { open: 'open', closed: 'closed' };
        return {
            number: r.number,
            title: r.title,
            body: r.body ?? '',
            state: r.merged_at ? 'merged' : (stateMap[r.state] ?? 'open'),
            base_branch: r.base.ref,
            head_branch: r.head.ref,
            draft: r.draft,
            additions: r.additions,
            deletions: r.deletions,
            changed_files: r.changed_files,
            created_at: r.created_at,
            updated_at: r.updated_at,
            merged_at: r.merged_at ?? undefined,
            html_url: r.html_url,
            author: r.user?.login ?? 'unknown',
            reviewers: r.requested_reviewers.map(rv => rv.login),
        };
    }

    private mapCommit(r: RawGHCommit): GitHubCommit {
        return {
            sha: r.sha,
            message: r.commit.message,
            author: r.commit.author.name,
            date: r.commit.author.date,
            url: r.html_url,
        };
    }

    private mapWorkflowRun(r: RawGHWorkflowRun): GitHubWorkflowRun {
        const statusMap: Record<string, GitHubWorkflowRun['status']> = {
            queued: 'queued',
            in_progress: 'in_progress',
            completed: 'completed',
        };
        return {
            id: r.id,
            name: r.name,
            status: statusMap[r.status] ?? 'completed',
            conclusion: r.conclusion as GitHubWorkflowRun['conclusion'],
            head_branch: r.head_branch,
            head_sha: r.head_sha,
            created_at: r.created_at,
            updated_at: r.updated_at,
            html_url: r.html_url,
        };
    }

    private mapReview(r: RawGHReview): GitHubReview {
        const validStates = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING', 'DISMISSED']);
        return {
            id: r.id,
            state: (validStates.has(r.state) ? r.state : 'COMMENTED') as GitHubReview['state'],
            body: r.body,
            author: r.user?.login ?? 'unknown',
            submitted_at: r.submitted_at,
        };
    }

    private mapComment(r: RawGHComment): GitHubComment {
        return {
            id: r.id,
            body: r.body,
            author: r.user?.login ?? 'unknown',
            created_at: r.created_at,
            updated_at: r.updated_at,
            html_url: r.html_url,
        };
    }

    // ── Issues ─────────────────────────────────────────────────────────────

    async createIssue(input: CreateIssueInput): Promise<GitHubQueryResult<GitHubIssue>> {
        const result = await this.request<RawGHIssue>('POST', `/repos/${this.config.owner}/${this.config.repo}/issues`, {
            title: input.title.slice(0, 256),
            body: sanitizeBody(input.body),
            labels: input.labels ?? [],
            assignees: input.assignees ?? [],
            ...(input.milestone !== undefined && { milestone: input.milestone }),
        });
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubIssue>;
        return { ok: true, data: this.mapIssue(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async getIssue(issueNumber: number): Promise<GitHubQueryResult<GitHubIssue>> {
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
            return { ok: false, error: 'Invalid issue number' };
        }
        const result = await this.request<RawGHIssue>('GET', `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubIssue>;
        return { ok: true, data: this.mapIssue(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async listOpenIssues(page = 1, perPage = 30): Promise<GitHubQueryResult<GitHubIssue[]>> {
        const safePerPage = Math.min(perPage, 100);
        const result = await this.request<RawGHIssue[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/issues?state=open&page=${page}&per_page=${safePerPage}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubIssue[]>;
        return { ok: true, data: result.data.map(r => this.mapIssue(r)), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async closeIssue(issueNumber: number): Promise<GitHubQueryResult<{ closed: boolean }>> {
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
            return { ok: false, error: 'Invalid issue number' };
        }
        const result = await this.request<RawGHIssue>('PATCH', `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`, { state: 'closed' });
        if (!result.ok) return result as GitHubQueryResult<{ closed: boolean }>;
        return { ok: true, data: { closed: true }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async addIssueComment(issueNumber: number, body: string): Promise<GitHubQueryResult<GitHubComment>> {
        const result = await this.request<RawGHComment>('POST', `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/comments`, { body: sanitizeBody(body) });
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubComment>;
        return { ok: true, data: this.mapComment(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    // ── Pull Requests ──────────────────────────────────────────────────────

    async getPR(prNumber: number): Promise<GitHubQueryResult<GitHubPR>> {
        if (!Number.isInteger(prNumber) || prNumber <= 0) {
            return { ok: false, error: 'Invalid PR number' };
        }
        const result = await this.request<RawGHPR>('GET', `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubPR>;
        return { ok: true, data: this.mapPR(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async listOpenPRs(page = 1, perPage = 30): Promise<GitHubQueryResult<GitHubPR[]>> {
        const safePerPage = Math.min(perPage, 100);
        const result = await this.request<RawGHPR[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/pulls?state=open&page=${page}&per_page=${safePerPage}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubPR[]>;
        return { ok: true, data: result.data.map(r => this.mapPR(r)), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async postPRComment(prNumber: number, body: string): Promise<GitHubQueryResult<GitHubComment>> {
        return this.addIssueComment(prNumber, body);
    }

    async createPR(input: {
        title: string;
        body: string;
        head: string;
        base: string;
        draft?: boolean;
    }): Promise<GitHubQueryResult<GitHubPR>> {
        const result = await this.request<RawGHPR>('POST', `/repos/${this.config.owner}/${this.config.repo}/pulls`, {
            title: input.title.slice(0, 256),
            body: sanitizeBody(input.body),
            head: input.head,
            base: input.base,
            draft: input.draft ?? false,
        });
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubPR>;
        return { ok: true, data: this.mapPR(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async requestPRReview(prNumber: number, reviewers: string[]): Promise<GitHubQueryResult<{ requested: string[] }>> {
        const result = await this.request<{ requested_reviewers: { login: string }[] }>('POST', `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/requested_reviewers`, { reviewers: reviewers.slice(0, 15) });
        if (!result.ok) return result as GitHubQueryResult<{ requested: string[] }>;
        return { ok: true, data: { requested: (result.data?.requested_reviewers ?? []).map(r => r.login) }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async listPRReviews(prNumber: number): Promise<GitHubQueryResult<GitHubReview[]>> {
        const result = await this.request<RawGHReview[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/reviews`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubReview[]>;
        return { ok: true, data: result.data.map(r => this.mapReview(r)), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    // ── Commits ────────────────────────────────────────────────────────────

    async listCommits(branch = 'main', perPage = 20): Promise<GitHubQueryResult<GitHubCommit[]>> {
        const safePerPage = Math.min(perPage, 100);
        const result = await this.request<RawGHCommit[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${safePerPage}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubCommit[]>;
        return { ok: true, data: result.data.map(r => this.mapCommit(r)), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async getCommit(sha: string): Promise<GitHubQueryResult<GitHubCommit>> {
        if (!sha || sha.length < 7) {
            return { ok: false, error: 'Invalid SHA' };
        }
        const result = await this.request<RawGHCommit>('GET', `/repos/${this.config.owner}/${this.config.repo}/commits/${encodeURIComponent(sha)}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubCommit>;
        return { ok: true, data: this.mapCommit(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    // ── Workflow Runs ──────────────────────────────────────────────────────

    async triggerWorkflow(workflowId: string, ref: string, inputs?: Record<string, string>): Promise<GitHubQueryResult<{ triggered: boolean }>> {
        if (!workflowId || !ref) {
            return { ok: false, error: 'workflowId and ref are required' };
        }
        const result = await this.request<undefined>('POST', `/repos/${this.config.owner}/${this.config.repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, { ref, inputs: inputs ?? {} });
        if (!result.ok) return result as GitHubQueryResult<{ triggered: boolean }>;
        return { ok: true, data: { triggered: true }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async listWorkflowRuns(workflowId: string, page = 1): Promise<GitHubQueryResult<GitHubWorkflowRun[]>> {
        const result = await this.request<{ workflow_runs: RawGHWorkflowRun[] }>('GET', `/repos/${this.config.owner}/${this.config.repo}/actions/workflows/${encodeURIComponent(workflowId)}/runs?page=${page}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubWorkflowRun[]>;
        return { ok: true, data: result.data.workflow_runs.map(r => this.mapWorkflowRun(r)), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async getWorkflowRun(runId: number): Promise<GitHubQueryResult<GitHubWorkflowRun>> {
        const result = await this.request<RawGHWorkflowRun>('GET', `/repos/${this.config.owner}/${this.config.repo}/actions/runs/${runId}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<GitHubWorkflowRun>;
        return { ok: true, data: this.mapWorkflowRun(result.data), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    // ── Webhooks ───────────────────────────────────────────────────────────

    async listWebhooks(): Promise<GitHubQueryResult<{ id: number; url: string; events: string[] }[]>> {
        const result = await this.request<{ id: number; config: { url: string }; events: string[] }[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/hooks`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<{ id: number; url: string; events: string[] }[]>;
        return { ok: true, data: result.data.map(h => ({ id: h.id, url: h.config.url, events: h.events })), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async createWebhook(input: {
        url: string;
        events: string[];
        secret?: string;
    }): Promise<GitHubQueryResult<{ id: number; url: string; active: boolean }>> {
        if (!input.url.startsWith('https://')) {
            return { ok: false, error: 'Webhook URL must use HTTPS' };
        }
        const result = await this.request<{ id: number; config: { url: string }; active: boolean }>('POST', `/repos/${this.config.owner}/${this.config.repo}/hooks`, {
            name: 'web',
            active: true,
            events: input.events,
            config: {
                url: input.url,
                content_type: 'json',
                ...(input.secret ? { secret: input.secret } : {}),
            },
        });
        if (!result.ok || !result.data) return result as GitHubQueryResult<{ id: number; url: string; active: boolean }>;
        return { ok: true, data: { id: result.data.id, url: result.data.config.url, active: result.data.active }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async deleteWebhook(hookId: number): Promise<GitHubQueryResult<{ deleted: boolean }>> {
        const result = await this.request<undefined>('DELETE', `/repos/${this.config.owner}/${this.config.repo}/hooks/${hookId}`);
        if (!result.ok) return result as GitHubQueryResult<{ deleted: boolean }>;
        return { ok: true, data: { deleted: true }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    // ── Repository metadata ────────────────────────────────────────────────

    async getRepoInfo(): Promise<GitHubQueryResult<{ full_name: string; default_branch: string; private: boolean; stargazers_count: number }>> {
        const result = await this.request<{ full_name: string; default_branch: string; private: boolean; stargazers_count: number }>('GET', `/repos/${this.config.owner}/${this.config.repo}`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<{ full_name: string; default_branch: string; private: boolean; stargazers_count: number }>;
        return { ok: true, data: { full_name: result.data.full_name, default_branch: result.data.default_branch, private: result.data.private, stargazers_count: result.data.stargazers_count }, rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }

    async listBranches(): Promise<GitHubQueryResult<{ name: string; protected: boolean }[]>> {
        const result = await this.request<{ name: string; protected: boolean }[]>('GET', `/repos/${this.config.owner}/${this.config.repo}/branches`);
        if (!result.ok || !result.data) return result as GitHubQueryResult<{ name: string; protected: boolean }[]>;
        return { ok: true, data: result.data.map(b => ({ name: b.name, protected: b.protected })), rate_limit_remaining: result.rate_limit_remaining, rate_limit_reset_at: result.rate_limit_reset_at };
    }
}
