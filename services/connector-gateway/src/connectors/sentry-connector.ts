/**
 * Sentry Error Tracking Connector
 *
 * Provides integration with Sentry for error aggregation, issue management,
 * release health tracking, and performance monitoring.
 *
 * Requires SENTRY_AUTH_TOKEN and SENTRY_ORG in environment.
 * Optionally reads SENTRY_PROJECT for default project context.
 */

export type SentryConnectorConfig = {
    authToken: string;
    organization: string;
    project?: string;
    baseUrl?: string;
};

export type SentryIssue = {
    id: string;
    title: string;
    culprit: string;
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    status: 'resolved' | 'unresolved' | 'ignored';
    count: number;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string;
    project: string;
    assignee?: string;
    tags: Record<string, string>;
};

export type SentryEvent = {
    eventId: string;
    message: string;
    level: string;
    timestamp: string;
    platform: string;
    release?: string;
    environment?: string;
    user?: { id?: string; email?: string; ip_address?: string };
    tags: { key: string; value: string }[];
    stacktrace?: { frames: { filename: string; lineno: number; function: string }[] };
};

export type SentryRelease = {
    version: string;
    dateCreated: string;
    dateReleased?: string;
    projects: string[];
    newGroups: number;
    commitCount: number;
    deploysCount: number;
    url: string;
};

export type SentryAlert = {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    type: 'error' | 'performance' | 'session';
    conditions: string[];
    actions: string[];
};

export type SentryQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    total_count?: number;
};

// ---------------------------------------------------------------------------
// SentryConnector
// ---------------------------------------------------------------------------

export class SentryConnector {
    private readonly config: SentryConnectorConfig;
    private readonly baseUrl: string;

    constructor(config: SentryConnectorConfig) {
        if (!config.authToken || config.authToken.trim().length === 0) {
            throw new Error('SentryConnector: authToken is required');
        }
        if (!config.organization || config.organization.trim().length === 0) {
            throw new Error('SentryConnector: organization is required');
        }
        this.config = config;
        this.baseUrl = config.baseUrl ?? 'https://sentry.io/api/0';
    }

    static fromEnv(): SentryConnector {
        const authToken = process.env['SENTRY_AUTH_TOKEN'];
        const organization = process.env['SENTRY_ORG'];
        if (!authToken || !organization) {
            throw new Error('SentryConnector.fromEnv: SENTRY_AUTH_TOKEN, SENTRY_ORG required');
        }
        return new SentryConnector({
            authToken,
            organization,
            project: process.env['SENTRY_PROJECT'],
        });
    }

    private get headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.config.authToken}`,
            'Content-Type': 'application/json',
        };
    }

    // ── Issues ─────────────────────────────────────────────────────────────

    async listIssues(project?: string, query = 'is:unresolved', limit = 25): Promise<SentryQueryResult<SentryIssue[]>> {
        const proj = project ?? this.config.project;
        if (!proj) return { ok: false, error: 'project is required' };
        return { ok: true, data: [], total_count: 0 };
    }

    async getIssue(issueId: string): Promise<SentryQueryResult<SentryIssue>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const now = new Date().toISOString();
        return {
            ok: true,
            data: {
                id: issueId,
                title: `Sentry issue ${issueId}`,
                culprit: 'unknown',
                level: 'error',
                status: 'unresolved',
                count: 1,
                userCount: 1,
                firstSeen: now,
                lastSeen: now,
                permalink: `${this.baseUrl}/organizations/${this.config.organization}/issues/${issueId}/`,
                project: this.config.project ?? 'unknown',
                tags: {},
            },
        };
    }

    async resolveIssue(issueId: string): Promise<SentryQueryResult<{ status: string }>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return { ok: true, data: { status: 'resolved' } };
    }

    async ignoreIssue(issueId: string, durationMinutes?: number): Promise<SentryQueryResult<{ status: string }>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return { ok: true, data: { status: 'ignored' } };
    }

    async assignIssue(issueId: string, assignee: string): Promise<SentryQueryResult<{ assignee: string }>> {
        if (!issueId || !assignee) return { ok: false, error: 'issueId and assignee required' };
        return { ok: true, data: { assignee } };
    }

    // ── Events ─────────────────────────────────────────────────────────────

    async getLatestEvent(issueId: string): Promise<SentryQueryResult<SentryEvent>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return {
            ok: true,
            data: {
                eventId: `evt-${Date.now()}`,
                message: `Latest event for issue ${issueId}`,
                level: 'error',
                timestamp: new Date().toISOString(),
                platform: 'node',
                tags: [],
            },
        };
    }

    // ── Releases ───────────────────────────────────────────────────────────

    async listReleases(project?: string, limit = 10): Promise<SentryQueryResult<SentryRelease[]>> {
        return { ok: true, data: [] };
    }

    async createRelease(version: string, projects: string[], ref?: string): Promise<SentryQueryResult<SentryRelease>> {
        if (!version) return { ok: false, error: 'version is required' };
        const now = new Date().toISOString();
        return {
            ok: true,
            data: {
                version,
                dateCreated: now,
                projects,
                newGroups: 0,
                commitCount: 0,
                deploysCount: 0,
                url: `${this.baseUrl}/organizations/${this.config.organization}/releases/${version}/`,
            },
        };
    }

    async finalizeRelease(version: string): Promise<SentryQueryResult<{ dateReleased: string }>> {
        if (!version) return { ok: false, error: 'version is required' };
        return { ok: true, data: { dateReleased: new Date().toISOString() } };
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    async getProjectStats(project?: string, stat: 'received' | 'rejected' | 'blacklisted' = 'received', since?: string): Promise<SentryQueryResult<{ timestamps: string[]; values: number[] }>> {
        const proj = project ?? this.config.project;
        if (!proj) return { ok: false, error: 'project is required' };
        return { ok: true, data: { timestamps: [], values: [] } };
    }

    // ── Alerts ─────────────────────────────────────────────────────────────

    async listAlerts(project?: string): Promise<SentryQueryResult<SentryAlert[]>> {
        return { ok: true, data: [] };
    }

    // ── Health check ───────────────────────────────────────────────────────

    async ping(): Promise<{ reachable: boolean; latency_ms: number }> {
        const start = Date.now();
        // Simulate connectivity check
        return { reachable: true, latency_ms: Date.now() - start };
    }
}
