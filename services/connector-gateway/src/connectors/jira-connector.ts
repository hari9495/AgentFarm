/**
 * Jira REST API v3 Connector
 *
 * Provides full Jira integration: issues, transitions, comments,
 * project and user management, and issue assignments.
 *
 * Auth: HTTP Basic — base64(email:apiToken) per Atlassian documentation.
 * All requests target https://{JIRA_BASE_URL}/rest/api/3.
 *
 * Required env vars: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JiraConnectorConfig = {
    baseUrl: string;
    userEmail: string;
    apiToken: string;
};

export type JiraIssue = {
    id: string;
    key: string;
    summary: string;
    description: string | null;
    status: string;
    issueType: string;
    priority: string | null;
    assignee: string | null;
    reporter: string | null;
    created: string;
    updated: string;
    projectKey: string;
};

export type JiraComment = {
    id: string;
    body: string;
    author: string;
    created: string;
    updated: string;
};

export type JiraTransition = {
    id: string;
    name: string;
    toStatus: string;
};

export type JiraProject = {
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
    lead: string | null;
};

export type JiraUser = {
    accountId: string;
    displayName: string;
    emailAddress: string | null;
    active: boolean;
};

export type JiraQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    status?: number;
};

export type JiraIssueFilters = {
    status?: string;
    assignee?: string;
    priority?: string;
    maxResults?: number;
    startAt?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeJiraBody(text: string, maxLength = 32768): string {
    return text.replace(/<script[^>]*>.*?<\/script>/gi, '').slice(0, maxLength);
}

function buildBasicAuthHeader(email: string, apiToken: string): string {
    const credentials = `${email}:${apiToken}`;
    return `Basic ${Buffer.from(credentials, 'utf-8').toString('base64')}`;
}

// ---------------------------------------------------------------------------
// JiraConnector
// ---------------------------------------------------------------------------

export class JiraConnector {
    private readonly config: JiraConnectorConfig;
    private readonly baseUrl: string;

    constructor(config: JiraConnectorConfig) {
        if (!config.baseUrl || config.baseUrl.trim().length === 0) {
            throw new Error('JiraConnector: baseUrl is required (JIRA_BASE_URL)');
        }
        if (!config.userEmail || config.userEmail.trim().length === 0) {
            throw new Error('JiraConnector: userEmail is required (JIRA_USER_EMAIL)');
        }
        if (!config.apiToken || config.apiToken.trim().length === 0) {
            throw new Error('JiraConnector: apiToken is required (JIRA_API_TOKEN)');
        }
        this.config = config;
        // Normalise: strip trailing slash
        this.baseUrl = `https://${config.baseUrl.trim().replace(/\/$/, '')}/rest/api/3`;
    }

    static fromEnv(): JiraConnector {
        const baseUrl = process.env['JIRA_BASE_URL'];
        const userEmail = process.env['JIRA_USER_EMAIL'];
        const apiToken = process.env['JIRA_API_TOKEN'];
        if (!baseUrl || !userEmail || !apiToken) {
            throw new Error('JiraConnector.fromEnv: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN are required');
        }
        return new JiraConnector({ baseUrl, userEmail, apiToken });
    }

    private get headers(): Record<string, string> {
        return {
            Authorization: buildBasicAuthHeader(this.config.userEmail, this.config.apiToken),
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<JiraQueryResult<T>> {
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
                error: `Jira API returned ${response.status}: ${text.slice(0, 256)}`,
                status: response.status,
            };
        }

        // 204 No Content — no body to parse
        if (response.status === 204) {
            return { ok: true, status: 204 };
        }

        const json = await response.json() as T;
        return { ok: true, data: json, status: response.status };
    }

    // ── Issues ─────────────────────────────────────────────────────────────

    async listIssues(projectKey: string, filters: JiraIssueFilters = {}): Promise<JiraQueryResult<JiraIssue[]>> {
        const maxResults = Math.min(filters.maxResults ?? 50, 100);
        const startAt = filters.startAt ?? 0;

        const jqlParts = [`project = "${projectKey}"`];
        if (filters.status) jqlParts.push(`status = "${filters.status}"`);
        if (filters.assignee) jqlParts.push(`assignee = "${filters.assignee}"`);
        if (filters.priority) jqlParts.push(`priority = "${filters.priority}"`);
        const jql = encodeURIComponent(jqlParts.join(' AND '));

        const result = await this.request<{
            issues: Array<{
                id: string;
                key: string;
                fields: {
                    summary: string;
                    description?: { content?: unknown[] } | string | null;
                    status: { name: string };
                    issuetype: { name: string };
                    priority: { name: string } | null;
                    assignee: { displayName: string } | null;
                    reporter: { displayName: string } | null;
                    created: string;
                    updated: string;
                    project: { key: string };
                };
            }>;
        }>('GET', `/search?jql=${jql}&maxResults=${maxResults}&startAt=${startAt}&fields=summary,description,status,issuetype,priority,assignee,reporter,created,updated,project`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const issues: JiraIssue[] = result.data.issues.map((raw) => ({
            id: raw.id,
            key: raw.key,
            summary: raw.fields.summary,
            description: typeof raw.fields.description === 'string'
                ? raw.fields.description
                : null,
            status: raw.fields.status.name,
            issueType: raw.fields.issuetype.name,
            priority: raw.fields.priority?.name ?? null,
            assignee: raw.fields.assignee?.displayName ?? null,
            reporter: raw.fields.reporter?.displayName ?? null,
            created: raw.fields.created,
            updated: raw.fields.updated,
            projectKey: raw.fields.project.key,
        }));

        return { ok: true, data: issues };
    }

    async getIssue(issueKey: string): Promise<JiraQueryResult<JiraIssue>> {
        if (!issueKey || issueKey.trim().length === 0) {
            return { ok: false, error: 'issueKey is required' };
        }

        const result = await this.request<{
            id: string;
            key: string;
            fields: {
                summary: string;
                description?: string | null;
                status: { name: string };
                issuetype: { name: string };
                priority: { name: string } | null;
                assignee: { displayName: string } | null;
                reporter: { displayName: string } | null;
                created: string;
                updated: string;
                project: { key: string };
            };
        }>('GET', `/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,issuetype,priority,assignee,reporter,created,updated,project`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        const raw = result.data;
        return {
            ok: true,
            data: {
                id: raw.id,
                key: raw.key,
                summary: raw.fields.summary,
                description: raw.fields.description ?? null,
                status: raw.fields.status.name,
                issueType: raw.fields.issuetype.name,
                priority: raw.fields.priority?.name ?? null,
                assignee: raw.fields.assignee?.displayName ?? null,
                reporter: raw.fields.reporter?.displayName ?? null,
                created: raw.fields.created,
                updated: raw.fields.updated,
                projectKey: raw.fields.project.key,
            },
        };
    }

    async createIssue(
        projectKey: string,
        summary: string,
        description: string,
        issueType = 'Task',
        priority?: string,
    ): Promise<JiraQueryResult<JiraIssue>> {
        if (!projectKey || !summary) {
            return { ok: false, error: 'projectKey and summary are required' };
        }

        const sanitizedDescription = sanitizeJiraBody(description);
        const body: Record<string, unknown> = {
            fields: {
                project: { key: projectKey },
                summary: summary.slice(0, 255),
                description: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: sanitizedDescription }],
                        },
                    ],
                },
                issuetype: { name: issueType },
                ...(priority ? { priority: { name: priority } } : {}),
            },
        };

        const result = await this.request<{ id: string; key: string; self: string }>('POST', '/issue', body);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        // Fetch the full issue to return a complete JiraIssue shape
        return this.getIssue(result.data.key);
    }

    async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<JiraQueryResult<{ updated: boolean }>> {
        if (!issueKey || issueKey.trim().length === 0) {
            return { ok: false, error: 'issueKey is required' };
        }

        const result = await this.request<void>('PUT', `/issue/${encodeURIComponent(issueKey)}`, { fields });

        if (!result.ok) {
            return { ok: false, error: result.error, status: result.status };
        }

        return { ok: true, data: { updated: true }, status: result.status };
    }

    // ── Comments ───────────────────────────────────────────────────────────

    async addComment(issueKey: string, body: string): Promise<JiraQueryResult<JiraComment>> {
        if (!issueKey || !body) {
            return { ok: false, error: 'issueKey and body are required' };
        }

        const sanitized = sanitizeJiraBody(body, 32768);
        const payload = {
            body: {
                type: 'doc',
                version: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: sanitized }],
                    },
                ],
            },
        };

        const result = await this.request<{
            id: string;
            body: unknown;
            author: { displayName: string };
            created: string;
            updated: string;
        }>('POST', `/issue/${encodeURIComponent(issueKey)}/comment`, payload);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                body: sanitized,
                author: result.data.author.displayName,
                created: result.data.created,
                updated: result.data.updated,
            },
        };
    }

    // ── Transitions ────────────────────────────────────────────────────────

    async listTransitions(issueKey: string): Promise<JiraQueryResult<JiraTransition[]>> {
        if (!issueKey || issueKey.trim().length === 0) {
            return { ok: false, error: 'issueKey is required' };
        }

        const result = await this.request<{
            transitions: Array<{ id: string; name: string; to: { name: string } }>;
        }>('GET', `/issue/${encodeURIComponent(issueKey)}/transitions`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.transitions.map((t) => ({
                id: t.id,
                name: t.name,
                toStatus: t.to.name,
            })),
        };
    }

    async transitionIssue(issueKey: string, transitionId: string): Promise<JiraQueryResult<{ transitioned: boolean }>> {
        if (!issueKey || !transitionId) {
            return { ok: false, error: 'issueKey and transitionId are required' };
        }

        const result = await this.request<void>('POST', `/issue/${encodeURIComponent(issueKey)}/transitions`, {
            transition: { id: transitionId },
        });

        if (!result.ok) {
            return { ok: false, error: result.error, status: result.status };
        }

        return { ok: true, data: { transitioned: true } };
    }

    // ── Assignments ────────────────────────────────────────────────────────

    async assignIssue(issueKey: string, accountId: string): Promise<JiraQueryResult<{ assigned: boolean }>> {
        if (!issueKey || !accountId) {
            return { ok: false, error: 'issueKey and accountId are required' };
        }

        const result = await this.request<void>('PUT', `/issue/${encodeURIComponent(issueKey)}/assignee`, {
            accountId,
        });

        if (!result.ok) {
            return { ok: false, error: result.error, status: result.status };
        }

        return { ok: true, data: { assigned: true } };
    }

    // ── Projects ───────────────────────────────────────────────────────────

    async listProjects(): Promise<JiraQueryResult<JiraProject[]>> {
        const result = await this.request<Array<{
            id: string;
            key: string;
            name: string;
            projectTypeKey: string;
            lead?: { displayName: string };
        }>>('GET', '/project?expand=lead');

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((p) => ({
                id: p.id,
                key: p.key,
                name: p.name,
                projectTypeKey: p.projectTypeKey,
                lead: p.lead?.displayName ?? null,
            })),
        };
    }

    // ── Users ──────────────────────────────────────────────────────────────

    async searchUsers(query: string): Promise<JiraQueryResult<JiraUser[]>> {
        if (!query || query.trim().length === 0) {
            return { ok: false, error: 'query is required' };
        }

        const result = await this.request<Array<{
            accountId: string;
            displayName: string;
            emailAddress?: string;
            active: boolean;
        }>>('GET', `/user/search?query=${encodeURIComponent(query)}&maxResults=50`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.map((u) => ({
                accountId: u.accountId,
                displayName: u.displayName,
                emailAddress: u.emailAddress ?? null,
                active: u.active,
            })),
        };
    }
}
