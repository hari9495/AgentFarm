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

    /** Internal HTTP helper — throws on network errors; maps HTTP errors to result. */
    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<SentryQueryResult<T>> {
        const url = `${this.baseUrl}${path}`;
        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers: this.headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
        }

        if (response.status === 204) {
            return { ok: true, data: undefined as unknown as T };
        }

        let json: unknown;
        try { json = await response.json(); } catch { json = {}; }

        if (!response.ok) {
            const msg = (json as Record<string, unknown>)?.['detail']
                ?? (json as Record<string, unknown>)?.['error']
                ?? `HTTP ${response.status}`;
            return { ok: false, error: String(msg) };
        }

        // Sentry list responses include pagination header X-Hits
        const totalCount = response.headers.get('X-Hits');

        return {
            ok: true,
            data: json as T,
            ...(totalCount !== null ? { total_count: Number(totalCount) } : {}),
        };
    }

    // ── Issues ─────────────────────────────────────────────────────────────

    async listIssues(project?: string, query = 'is:unresolved', limit = 25): Promise<SentryQueryResult<SentryIssue[]>> {
        const proj = project ?? this.config.project;
        if (!proj) return { ok: false, error: 'project is required' };
        const org = this.config.organization;
        const qs = new URLSearchParams({ query, limit: String(limit) }).toString();
        const result = await this.request<RawSentryIssue[]>('GET', `/projects/${org}/${proj}/issues/?${qs}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return {
            ok: true,
            data: result.data.map(mapSentryIssue),
            total_count: result.total_count,
        };
    }

    async getIssue(issueId: string): Promise<SentryQueryResult<SentryIssue>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const result = await this.request<RawSentryIssue>('GET', `/issues/${issueId}/`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapSentryIssue(result.data) };
    }

    async resolveIssue(issueId: string): Promise<SentryQueryResult<{ status: string }>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const result = await this.request<{ status: string }>('PUT', `/issues/${issueId}/`, { status: 'resolved' });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { status: result.data?.status ?? 'resolved' } };
    }

    async ignoreIssue(issueId: string, durationMinutes?: number): Promise<SentryQueryResult<{ status: string }>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const body: Record<string, unknown> = { status: 'ignored' };
        if (durationMinutes !== undefined) {
            body['ignoreDuration'] = durationMinutes;
        }
        const result = await this.request<{ status: string }>('PUT', `/issues/${issueId}/`, body);
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { status: result.data?.status ?? 'ignored' } };
    }

    async assignIssue(issueId: string, assignee: string): Promise<SentryQueryResult<{ assignee: string }>> {
        if (!issueId || !assignee) return { ok: false, error: 'issueId and assignee required' };
        const result = await this.request<{ assignedTo?: string | null }>('PUT', `/issues/${issueId}/`, { assignedTo: assignee });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { assignee: result.data?.assignedTo ?? assignee } };
    }

    // ── Events ─────────────────────────────────────────────────────────────

    async getLatestEvent(issueId: string): Promise<SentryQueryResult<SentryEvent>> {
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const result = await this.request<RawSentryEvent>('GET', `/issues/${issueId}/events/latest/`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapSentryEvent(result.data) };
    }

    // ── Releases ───────────────────────────────────────────────────────────

    async listReleases(project?: string, limit = 10): Promise<SentryQueryResult<SentryRelease[]>> {
        const proj = project ?? this.config.project;
        const org = this.config.organization;
        const qs = new URLSearchParams({ limit: String(limit) });
        if (proj) qs.set('project', proj);
        const result = await this.request<RawSentryRelease[]>('GET', `/organizations/${org}/releases/?${qs.toString()}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: result.data.map(mapSentryRelease), total_count: result.total_count };
    }

    async createRelease(version: string, projects: string[], ref?: string): Promise<SentryQueryResult<SentryRelease>> {
        if (!version) return { ok: false, error: 'version is required' };
        const org = this.config.organization;
        const body: Record<string, unknown> = { version, projects: projects.map(p => ({ slug: p })) };
        if (ref) body['refs'] = [{ repository: ref, commit: 'HEAD' }];
        const result = await this.request<RawSentryRelease>('POST', `/organizations/${org}/releases/`, body);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapSentryRelease(result.data) };
    }

    async finalizeRelease(version: string): Promise<SentryQueryResult<{ dateReleased: string }>> {
        if (!version) return { ok: false, error: 'version is required' };
        const org = this.config.organization;
        const dateReleased = new Date().toISOString();
        const result = await this.request<{ dateReleased?: string }>('PUT', `/organizations/${org}/releases/${encodeURIComponent(version)}/`, { dateReleased });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { dateReleased: result.data?.dateReleased ?? dateReleased } };
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    async getProjectStats(project?: string, stat: 'received' | 'rejected' | 'blacklisted' = 'received', since?: string): Promise<SentryQueryResult<{ timestamps: string[]; values: number[] }>> {
        const proj = project ?? this.config.project;
        if (!proj) return { ok: false, error: 'project is required' };
        const org = this.config.organization;
        const qs = new URLSearchParams({ stat });
        if (since) qs.set('since', since);
        const result = await this.request<Array<[number, number]>>('GET', `/projects/${org}/${proj}/stats/?${qs.toString()}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        const timestamps: string[] = [];
        const values: number[] = [];
        for (const [ts, v] of result.data) {
            timestamps.push(new Date(ts * 1000).toISOString());
            values.push(v);
        }
        return { ok: true, data: { timestamps, values } };
    }

    // ── Alerts ─────────────────────────────────────────────────────────────

    async listAlerts(project?: string): Promise<SentryQueryResult<SentryAlert[]>> {
        const proj = project ?? this.config.project;
        if (!proj) return { ok: false, error: 'project is required' };
        const org = this.config.organization;
        const result = await this.request<RawSentryAlertRule[]>('GET', `/projects/${org}/${proj}/alert-rules/`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: result.data.map(mapSentryAlert) };
    }

    // ── Health check ───────────────────────────────────────────────────────

    async ping(): Promise<{ reachable: boolean; latency_ms: number }> {
        const start = Date.now();
        const org = this.config.organization;
        const result = await this.request<unknown>('GET', `/organizations/${org}/`);
        return { reachable: result.ok, latency_ms: Date.now() - start };
    }
}

// ── Raw response types ────────────────────────────────────────────────────────

type RawSentryIssue = {
    id: string;
    title?: string;
    culprit?: string;
    level?: string;
    status?: string;
    count?: string | number;
    userCount?: number;
    firstSeen?: string;
    lastSeen?: string;
    permalink?: string;
    project?: { slug?: string };
    assignedTo?: { name?: string; email?: string } | null;
    tags?: Record<string, string>;
};

type RawSentryEvent = {
    eventID?: string;
    message?: string;
    level?: string;
    dateCreated?: string;
    platform?: string;
    release?: string;
    environment?: string;
    user?: { id?: string; email?: string; ip_address?: string };
    tags?: { key: string; value: string }[];
    entries?: Array<{ type: string; data?: { frames?: { filename: string; lineno: number; function: string }[] } }>;
};

type RawSentryRelease = {
    version?: string;
    dateCreated?: string;
    dateReleased?: string;
    projects?: Array<{ slug?: string }>;
    newGroups?: number;
    commitCount?: number;
    deploysCount?: number;
    url?: string;
};

type RawSentryAlertRule = {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    conditions?: Array<Record<string, unknown>>;
    actions?: Array<Record<string, unknown>>;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapSentryIssue(raw: RawSentryIssue): SentryIssue {
    const now = new Date().toISOString();
    return {
        id: raw.id,
        title: raw.title ?? '',
        culprit: raw.culprit ?? '',
        level: (raw.level as SentryIssue['level']) ?? 'error',
        status: (raw.status as SentryIssue['status']) ?? 'unresolved',
        count: Number(raw.count ?? 0),
        userCount: raw.userCount ?? 0,
        firstSeen: raw.firstSeen ?? now,
        lastSeen: raw.lastSeen ?? now,
        permalink: raw.permalink ?? '',
        project: raw.project?.slug ?? 'unknown',
        assignee: raw.assignedTo?.name ?? raw.assignedTo?.email,
        tags: raw.tags ?? {},
    };
}

function mapSentryEvent(raw: RawSentryEvent): SentryEvent {
    const stacktraceEntry = raw.entries?.find(e => e.type === 'exception');
    return {
        eventId: raw.eventID ?? '',
        message: raw.message ?? '',
        level: raw.level ?? 'error',
        timestamp: raw.dateCreated ?? new Date().toISOString(),
        platform: raw.platform ?? 'unknown',
        release: raw.release,
        environment: raw.environment,
        user: raw.user,
        tags: raw.tags ?? [],
        stacktrace: stacktraceEntry?.data?.frames
            ? { frames: stacktraceEntry.data.frames }
            : undefined,
    };
}

function mapSentryRelease(raw: RawSentryRelease): SentryRelease {
    return {
        version: raw.version ?? '',
        dateCreated: raw.dateCreated ?? new Date().toISOString(),
        dateReleased: raw.dateReleased,
        projects: (raw.projects ?? []).map(p => p.slug ?? '').filter(Boolean),
        newGroups: raw.newGroups ?? 0,
        commitCount: raw.commitCount ?? 0,
        deploysCount: raw.deploysCount ?? 0,
        url: raw.url ?? '',
    };
}

function mapSentryAlert(raw: RawSentryAlertRule): SentryAlert {
    return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        status: (raw.status as SentryAlert['status']) ?? 'inactive',
        type: (raw.type as SentryAlert['type']) ?? 'error',
        conditions: (raw.conditions ?? []).map(c => JSON.stringify(c)),
        actions: (raw.actions ?? []).map(a => JSON.stringify(a)),
    };
}
