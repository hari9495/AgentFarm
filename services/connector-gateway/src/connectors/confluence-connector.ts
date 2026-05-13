/**
 * Confluence Documentation Connector
 *
 * Provides integration with Atlassian Confluence for reading and writing
 * documentation spaces, pages, blog posts, and comments.
 *
 * Supports both Confluence Cloud (api.atlassian.com) and Confluence Server.
 * Requires CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN.
 */

export type ConfluenceConnectorConfig = {
    baseUrl: string;
    email: string;
    apiToken: string;
    defaultSpaceKey?: string;
};

export type ConfluencePage = {
    id: string;
    title: string;
    space_key: string;
    version: number;
    status: 'current' | 'trashed' | 'draft';
    body_view: string;
    created_at: string;
    updated_at: string;
    author: string;
    url: string;
    ancestors: { id: string; title: string }[];
};

export type ConfluenceSpace = {
    key: string;
    name: string;
    type: 'global' | 'personal';
    status: 'current' | 'archived';
    homepage_id: string;
    url: string;
};

export type ConfluenceComment = {
    id: string;
    body: string;
    author: string;
    created_at: string;
    updated_at: string;
};

export type ConfluenceSearchResult = {
    pages: ConfluencePage[];
    total_size: number;
    start: number;
    limit: number;
};

export type CreatePageInput = {
    title: string;
    body: string;
    space_key?: string;
    parent_id?: string;
    is_draft?: boolean;
};

export type ConfluenceQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
};

// ---------------------------------------------------------------------------
// ConfluenceConnector
// ---------------------------------------------------------------------------

export class ConfluenceConnector {
    private readonly config: ConfluenceConnectorConfig;

    constructor(config: ConfluenceConnectorConfig) {
        if (!config.baseUrl || !config.email || !config.apiToken) {
            throw new Error('ConfluenceConnector: baseUrl, email, and apiToken are required');
        }
        // Strip trailing slash from baseUrl
        this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, '') };
    }

    static fromEnv(): ConfluenceConnector {
        const baseUrl = process.env['CONFLUENCE_BASE_URL'];
        const email = process.env['CONFLUENCE_EMAIL'];
        const apiToken = process.env['CONFLUENCE_API_TOKEN'];
        if (!baseUrl || !email || !apiToken) {
            throw new Error('ConfluenceConnector.fromEnv: CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN required');
        }
        return new ConfluenceConnector({
            baseUrl,
            email,
            apiToken,
            defaultSpaceKey: process.env['CONFLUENCE_DEFAULT_SPACE'],
        });
    }

    private get authHeader(): string {
        const encoded = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
        return `Basic ${encoded}`;
    }

    private get headers(): Record<string, string> {
        return {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
    }

    private get apiBase(): string {
        return `${this.config.baseUrl}/wiki/rest/api`;
    }

    /** Internal HTTP helper — throws on network errors; maps HTTP errors to result. */
    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<ConfluenceQueryResult<T>> {
        const url = `${this.apiBase}${path}`;
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
            const msg = (json as Record<string, unknown>)?.['message']
                ?? (json as Record<string, unknown>)?.['errorMessage']
                ?? `HTTP ${response.status}`;
            return { ok: false, error: String(msg) };
        }

        return { ok: true, data: json as T };
    }

    // ── Spaces ─────────────────────────────────────────────────────────────

    async listSpaces(limit = 25): Promise<ConfluenceQueryResult<ConfluenceSpace[]>> {
        const result = await this.request<{ results?: RawConfluenceSpace[] }>('GET', `/space?limit=${limit}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: (result.data.results ?? []).map(s => mapConfluenceSpace(s, this.config.baseUrl)) };
    }

    async getSpace(spaceKey: string): Promise<ConfluenceQueryResult<ConfluenceSpace>> {
        if (!spaceKey) return { ok: false, error: 'spaceKey is required' };
        const result = await this.request<RawConfluenceSpace>('GET', `/space/${encodeURIComponent(spaceKey)}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapConfluenceSpace(result.data, this.config.baseUrl) };
    }

    // ── Pages ──────────────────────────────────────────────────────────────

    async createPage(input: CreatePageInput): Promise<ConfluenceQueryResult<ConfluencePage>> {
        const spaceKey = input.space_key ?? this.config.defaultSpaceKey;
        if (!spaceKey) return { ok: false, error: 'space_key is required' };

        const body: Record<string, unknown> = {
            type: 'page',
            title: input.title.slice(0, 255),
            space: { key: spaceKey },
            status: input.is_draft ? 'draft' : 'current',
            body: {
                storage: { value: input.body.slice(0, 65536), representation: 'storage' },
            },
        };

        if (input.parent_id) {
            body['ancestors'] = [{ id: input.parent_id }];
        }

        const result = await this.request<RawConfluencePage>('POST', '/content', body);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapConfluencePage(result.data, this.config.baseUrl) };
    }

    async getPage(pageId: string): Promise<ConfluenceQueryResult<ConfluencePage>> {
        if (!pageId) return { ok: false, error: 'pageId is required' };
        const result = await this.request<RawConfluencePage>('GET', `/content/${encodeURIComponent(pageId)}?expand=body.view,version,ancestors,space`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapConfluencePage(result.data, this.config.baseUrl) };
    }

    async updatePage(pageId: string, title: string, body: string, currentVersion: number): Promise<ConfluenceQueryResult<{ version: number }>> {
        if (!pageId) return { ok: false, error: 'pageId is required' };
        const newVersion = currentVersion + 1;
        const result = await this.request<{ version?: { number?: number } }>('PUT', `/content/${encodeURIComponent(pageId)}`, {
            type: 'page',
            title: title.slice(0, 255),
            version: { number: newVersion },
            body: {
                storage: { value: body.slice(0, 65536), representation: 'storage' },
            },
        });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { version: result.data?.version?.number ?? newVersion } };
    }

    async deletePage(pageId: string): Promise<ConfluenceQueryResult<{ deleted: boolean }>> {
        if (!pageId) return { ok: false, error: 'pageId is required' };
        const result = await this.request<unknown>('DELETE', `/content/${encodeURIComponent(pageId)}`);
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: { deleted: true } };
    }

    async getPagesBySpace(spaceKey: string, limit = 25, start = 0): Promise<ConfluenceQueryResult<ConfluencePage[]>> {
        if (!spaceKey) return { ok: false, error: 'spaceKey is required' };
        const qs = new URLSearchParams({ type: 'page', spaceKey, limit: String(limit), start: String(start) }).toString();
        const result = await this.request<{ results?: RawConfluencePage[] }>('GET', `/content?${qs}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: (result.data.results ?? []).map(p => mapConfluencePage(p, this.config.baseUrl)) };
    }

    async getChildPages(parentPageId: string): Promise<ConfluenceQueryResult<ConfluencePage[]>> {
        if (!parentPageId) return { ok: false, error: 'parentPageId is required' };
        const result = await this.request<{ results?: RawConfluencePage[] }>('GET', `/content/${encodeURIComponent(parentPageId)}/child/page`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: (result.data.results ?? []).map(p => mapConfluencePage(p, this.config.baseUrl)) };
    }

    // ── Comments ───────────────────────────────────────────────────────────

    async addPageComment(pageId: string, body: string): Promise<ConfluenceQueryResult<ConfluenceComment>> {
        if (!pageId || !body) return { ok: false, error: 'pageId and body are required' };
        const result = await this.request<RawConfluenceComment>('POST', '/content', {
            type: 'comment',
            container: { key: pageId, type: 'page' },
            body: {
                storage: { value: body.slice(0, 32768), representation: 'storage' },
            },
        });
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: mapConfluenceComment(result.data) };
    }

    async getPageComments(pageId: string): Promise<ConfluenceQueryResult<ConfluenceComment[]>> {
        if (!pageId) return { ok: false, error: 'pageId is required' };
        const result = await this.request<{ results?: RawConfluenceComment[] }>('GET', `/content/${encodeURIComponent(pageId)}/child/comment?expand=body.view`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };
        return { ok: true, data: (result.data.results ?? []).map(mapConfluenceComment) };
    }

    // ── Search ─────────────────────────────────────────────────────────────

    async search(query: string, spaceKey?: string, limit = 25): Promise<ConfluenceQueryResult<ConfluenceSearchResult>> {
        if (!query || query.trim().length === 0) return { ok: false, error: 'query is required' };

        let cql = `type=page AND text~"${query.replace(/"/g, '\\"')}"`;
        if (spaceKey) cql += ` AND space="${spaceKey}"`;

        const qs = new URLSearchParams({ cql, limit: String(limit) }).toString();
        const result = await this.request<{ results?: RawConfluencePage[]; totalSize?: number; start?: number; limit?: number }>('GET', `/content/search?${qs}`);
        if (!result.ok || !result.data) return { ok: result.ok, error: result.error };

        return {
            ok: true,
            data: {
                pages: (result.data.results ?? []).map(p => mapConfluencePage(p, this.config.baseUrl)),
                total_size: result.data.totalSize ?? 0,
                start: result.data.start ?? 0,
                limit: result.data.limit ?? limit,
            },
        };
    }

    // ── Health check ───────────────────────────────────────────────────────

    async ping(): Promise<{ reachable: boolean; latency_ms: number }> {
        const start = Date.now();
        const result = await this.request<unknown>('GET', '/space?limit=1');
        return { reachable: result.ok, latency_ms: Date.now() - start };
    }
}

// ── Raw response types ────────────────────────────────────────────────────────

type RawConfluenceSpace = {
    key?: string;
    name?: string;
    type?: string;
    status?: string;
    _links?: { homepageId?: string; webui?: string };
    homepageId?: string;
};

type RawConfluencePage = {
    id?: string;
    title?: string;
    space?: { key?: string };
    version?: { number?: number };
    status?: string;
    body?: { view?: { value?: string }; storage?: { value?: string } };
    history?: { createdDate?: string; createdBy?: { displayName?: string } };
    version_date?: string;
    lastUpdated?: string;
    ancestors?: Array<{ id?: string; title?: string }>;
    _links?: { webui?: string };
};

type RawConfluenceComment = {
    id?: string;
    body?: { view?: { value?: string }; storage?: { value?: string } };
    history?: { createdDate?: string; createdBy?: { displayName?: string }; lastUpdated?: { when?: string } };
    created?: string;
    updated?: string;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapConfluenceSpace(raw: RawConfluenceSpace, baseUrl: string): ConfluenceSpace {
    return {
        key: raw.key ?? '',
        name: raw.name ?? '',
        type: (raw.type as ConfluenceSpace['type']) ?? 'global',
        status: (raw.status as ConfluenceSpace['status']) ?? 'current',
        homepage_id: raw.homepageId ?? raw._links?.homepageId ?? '',
        url: raw._links?.webui ? `${baseUrl}/wiki${raw._links.webui}` : `${baseUrl}/wiki/spaces/${raw.key ?? ''}`,
    };
}

function mapConfluencePage(raw: RawConfluencePage, baseUrl: string): ConfluencePage {
    const now = new Date().toISOString();
    return {
        id: raw.id ?? '',
        title: raw.title ?? '',
        space_key: raw.space?.key ?? '',
        version: raw.version?.number ?? 1,
        status: (raw.status as ConfluencePage['status']) ?? 'current',
        body_view: raw.body?.view?.value ?? raw.body?.storage?.value ?? '',
        created_at: raw.history?.createdDate ?? now,
        updated_at: raw.version_date ?? raw.lastUpdated ?? now,
        author: raw.history?.createdBy?.displayName ?? 'unknown',
        url: raw._links?.webui ? `${baseUrl}/wiki${raw._links.webui}` : `${baseUrl}/wiki/pages/${raw.id ?? ''}`,
        ancestors: (raw.ancestors ?? []).map(a => ({ id: a.id ?? '', title: a.title ?? '' })),
    };
}

function mapConfluenceComment(raw: RawConfluenceComment): ConfluenceComment {
    const now = new Date().toISOString();
    return {
        id: raw.id ?? '',
        body: raw.body?.view?.value ?? raw.body?.storage?.value ?? '',
        author: raw.history?.createdBy?.displayName ?? 'unknown',
        created_at: raw.history?.createdDate ?? raw.created ?? now,
        updated_at: raw.history?.lastUpdated?.when ?? raw.updated ?? now,
    };
}
