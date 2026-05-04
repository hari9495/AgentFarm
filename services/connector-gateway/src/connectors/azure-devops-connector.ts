/**
 * Azure DevOps Connector
 *
 * Integrates with Azure DevOps REST API for work item management,
 * pipeline monitoring, repository operations, and build status queries.
 *
 * Requires ADO_PAT (Personal Access Token) and ADO_ORGANIZATION in environment.
 */

export type AzureDevOpsConfig = {
    organization: string;
    pat: string;
    project?: string;
};

export type AdoWorkItem = {
    id: number;
    title: string;
    type: string;
    state: string;
    priority?: number;
    assignedTo?: string;
    areaPath?: string;
    iterationPath?: string;
    url: string;
    createdDate: string;
    changedDate: string;
};

export type AdoPipelineRun = {
    id: number;
    name: string;
    status: 'inProgress' | 'completed' | 'canceling' | 'notStarted';
    result?: 'succeeded' | 'failed' | 'canceled' | 'partiallySucceeded' | 'skipped';
    startTime?: string;
    finishTime?: string;
    url: string;
};

export type AdoBuildStatus = {
    id: number;
    buildNumber: string;
    status: string;
    result?: string;
    sourceBranch: string;
    sourceVersion: string;
    requestedFor: string;
    startTime: string;
    finishTime?: string;
    url: string;
};

export type AdoQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApiBase(org: string, project?: string): string {
    const base = `https://dev.azure.com/${encodeURIComponent(org)}`;
    return project ? `${base}/${encodeURIComponent(project)}` : base;
}

function authHeaders(pat: string): Record<string, string> {
    const encoded = Buffer.from(`:${pat}`).toString('base64');
    return {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
}

// ---------------------------------------------------------------------------
// AzureDevOpsConnector class
// ---------------------------------------------------------------------------

export class AzureDevOpsConnector {
    private readonly config: AzureDevOpsConfig;
    private readonly apiBase: string;

    constructor(config: AzureDevOpsConfig) {
        if (!config.organization || !config.pat) {
            throw new Error('AzureDevOpsConnector: organization and pat are required');
        }
        this.config = config;
        this.apiBase = buildApiBase(config.organization, config.project);
    }

    static fromEnv(): AzureDevOpsConnector {
        const pat = process.env['ADO_PAT'];
        const org = process.env['ADO_ORGANIZATION'];
        if (!pat || !org) throw new Error('ADO_PAT and ADO_ORGANIZATION environment variables are required');
        return new AzureDevOpsConnector({ organization: org, pat, project: process.env['ADO_PROJECT'] });
    }

    private async get<T>(path: string): Promise<AdoQueryResult<T>> {
        try {
            const response = await fetch(`${this.apiBase}${path}`, {
                headers: authHeaders(this.config.pat),
            });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
            const data = await response.json() as T;
            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    private async post<T>(path: string, body: unknown): Promise<AdoQueryResult<T>> {
        try {
            const response = await fetch(`${this.apiBase}${path}`, {
                method: 'POST',
                headers: authHeaders(this.config.pat),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
            const data = await response.json() as T;
            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async getWorkItem(id: number): Promise<AdoQueryResult<AdoWorkItem>> {
        type RawWorkItem = { id: number; fields: { 'System.Title': string; 'System.WorkItemType': string; 'System.State': string; 'Microsoft.VSTS.Common.Priority'?: number; 'System.AssignedTo'?: { displayName: string }; 'System.AreaPath': string; 'System.IterationPath': string; 'System.CreatedDate': string; 'System.ChangedDate': string }; _links: { html: { href: string } } };
        const result = await this.get<RawWorkItem>(`/_apis/wit/workitems/${id}?api-version=7.0`);
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        const f = result.data.fields;
        return {
            ok: true,
            data: {
                id: result.data.id,
                title: f['System.Title'],
                type: f['System.WorkItemType'],
                state: f['System.State'],
                priority: f['Microsoft.VSTS.Common.Priority'],
                assignedTo: f['System.AssignedTo']?.displayName,
                areaPath: f['System.AreaPath'],
                iterationPath: f['System.IterationPath'],
                url: result.data._links.html.href,
                createdDate: f['System.CreatedDate'],
                changedDate: f['System.ChangedDate'],
            },
        };
    }

    async createWorkItem(type: string, title: string, description?: string, assignedTo?: string): Promise<AdoQueryResult<AdoWorkItem>> {
        const patchDoc = [
            { op: 'add', path: '/fields/System.Title', value: title },
            ...(description ? [{ op: 'add', path: '/fields/System.Description', value: description }] : []),
            ...(assignedTo ? [{ op: 'add', path: '/fields/System.AssignedTo', value: assignedTo }] : []),
        ];
        const project = this.config.project ?? '_';
        try {
            const response = await fetch(`${this.apiBase}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.0`, {
                method: 'POST',
                headers: { ...authHeaders(this.config.pat), 'Content-Type': 'application/json-patch+json' },
                body: JSON.stringify(patchDoc),
            });
            if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
            const raw = await response.json() as { id: number; fields: Record<string, unknown>; _links: { html: { href: string } } };
            return {
                ok: true,
                data: {
                    id: raw.id,
                    title,
                    type,
                    state: 'New',
                    url: (raw._links?.html?.href as string) ?? `https://dev.azure.com/${this.config.organization}/${project}/_workitems/edit/${raw.id}`,
                    createdDate: new Date().toISOString(),
                    changedDate: new Date().toISOString(),
                },
            };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async getRecentBuilds(top = 10): Promise<AdoQueryResult<AdoBuildStatus[]>> {
        type RawBuilds = { value: Array<{ id: number; buildNumber: string; status: string; result?: string; sourceBranch: string; sourceVersion: string; requestedFor: { displayName: string }; startTime: string; finishTime?: string; _links: { web: { href: string } } }> };
        const result = await this.get<RawBuilds>(`/_apis/build/builds?api-version=7.0&$top=${top}`);
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        return {
            ok: true,
            data: result.data.value.map((b) => ({
                id: b.id,
                buildNumber: b.buildNumber,
                status: b.status,
                result: b.result,
                sourceBranch: b.sourceBranch,
                sourceVersion: b.sourceVersion,
                requestedFor: b.requestedFor.displayName,
                startTime: b.startTime,
                finishTime: b.finishTime,
                url: b._links.web.href,
            })),
        };
    }

    async getPipelineRuns(pipelineId: number, top = 5): Promise<AdoQueryResult<AdoPipelineRun[]>> {
        type RawRuns = { value: Array<{ id: number; name: string; state: string; result?: string; createdDate: string; finishedDate?: string; _links: { web: { href: string } } }> };
        const result = await this.get<RawRuns>(`/_apis/pipelines/${pipelineId}/runs?api-version=7.0&$top=${top}`);
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        return {
            ok: true,
            data: result.data.value.map((r) => ({
                id: r.id,
                name: r.name,
                status: r.state as AdoPipelineRun['status'],
                result: r.result as AdoPipelineRun['result'],
                startTime: r.createdDate,
                finishTime: r.finishedDate,
                url: r._links.web.href,
            })),
        };
    }

    async queueBuild(definitionId: number, sourceBranch = 'refs/heads/main'): Promise<AdoQueryResult<{ id: number; url: string }>> {
        type RawBuild = { id: number; _links: { web: { href: string } } };
        const result = await this.post<RawBuild>('/_apis/build/builds?api-version=7.0', {
            definition: { id: definitionId },
            sourceBranch,
        });
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        return { ok: true, data: { id: result.data.id, url: result.data._links.web.href } };
    }
}
