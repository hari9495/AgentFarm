// ============================================================================
// DEVOPS BACKSTAGE BUILDER
//
// Builders for Backstage Software Catalog API operations used by the
// workspace_devops_backstage action.
//
// Sub-actions:
//   entity_get        — GET  /api/catalog/entities/by-name/{kind}/{namespace}/{name}
//   entity_list       — GET  /api/catalog/entities  (filter by kind/owner/lifecycle)
//   entity_search     — GET  /api/catalog/entities/by-query  (full-text search)
//   entity_ref        — GET  /api/catalog/entities/by-refs  (batch ref lookup)
//   component_info    — Convenience: entity_get for kind=Component
//   owner_components  — Convenience: entity_list filtered by owner
//   api_list          — Convenience: entity_list for kind=API
//   resource_list     — Convenience: entity_list for kind=Resource
//   system_list       — Convenience: entity_list for kind=System
//   techdocs_get      — GET  /api/techdocs/static/docs/{namespace}/{kind}/{name}/index.html
//   health            — GET  /healthcheck
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackstageEntity {
    kind:        string;
    name:        string;
    namespace:   string;
    title?:      string;
    description?: string;
    owner?:      string;
    lifecycle?:  'production' | 'experimental' | 'deprecated' | string;
    type?:       string;
    tags?:       string[];
    links?:      Array<{ url: string; title?: string; icon?: string }>;
    annotations?: Record<string, string>;
    relations?:  Array<{ type: string; targetRef: string }>;
}

export interface BackstageComponent extends BackstageEntity {
    kind:       'Component';
    type?:      'service' | 'website' | 'library' | 'grpc' | string;
    system?:    string;
    subcomponentOf?: string;
    providesApis?: string[];
    consumesApis?: string[];
    dependsOn?:  string[];
}

export interface BackstageApi extends BackstageEntity {
    kind:       'API';
    type?:      'openapi' | 'asyncapi' | 'grpc' | 'graphql' | string;
    lifecycle?:  string;
    definition?: string;
}

export interface BackstageSearchResult {
    type:        string;
    document: {
        title:       string;
        text:        string;
        location:    string;
        kind?:       string;
        namespace?:  string;
        name?:       string;
        owner?:      string;
        lifecycle?:  string;
    };
}

// ---------------------------------------------------------------------------
// Curl-based builders (Backstage REST API)
// ---------------------------------------------------------------------------

function backstageCurlBase(baseUrl: string, token?: string): string[] {
    const cmd = ['curl', '-s', '-H', 'Content-Type: application/json'];
    if (token) { cmd.push('-H', `Authorization: Bearer ${token}`); }
    return cmd;
}

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
}

export function buildBackstageEntityGetArgs(params: {
    baseUrl:    string;
    kind:       string;
    name:       string;
    namespace?: string;
    token?:     string;
}): string[] {
    const ns  = (params.namespace ?? 'default').toLowerCase();
    const url = `${stripTrailingSlash(params.baseUrl)}/api/catalog/entities/by-name/${params.kind.toLowerCase()}/${ns}/${params.name}`;
    return [...backstageCurlBase(params.baseUrl, params.token), url];
}

export function buildBackstageEntityListArgs(params: {
    baseUrl:    string;
    kind?:      string;
    owner?:     string;
    lifecycle?: string;
    type?:      string;
    namespace?: string;
    limit?:     number;
    token?:     string;
}): string[] {
    const filters: string[] = [];
    if (params.kind)      { filters.push(`kind=${params.kind}`); }
    if (params.owner)     { filters.push(`spec.owner=${params.owner}`); }
    if (params.lifecycle) { filters.push(`spec.lifecycle=${params.lifecycle}`); }
    if (params.type)      { filters.push(`spec.type=${params.type}`); }
    if (params.namespace) { filters.push(`metadata.namespace=${params.namespace}`); }

    const qs = [
        ...filters.map((f) => `filter=${encodeURIComponent(f)}`),
        ...(params.limit ? [`limit=${params.limit}`] : []),
    ].join('&');

    const url = `${stripTrailingSlash(params.baseUrl)}/api/catalog/entities${qs ? `?${qs}` : ''}`;
    return [...backstageCurlBase(params.baseUrl, params.token), url];
}

export function buildBackstageEntitySearchArgs(params: {
    baseUrl:    string;
    query:      string;
    kind?:      string;
    limit?:     number;
    token?:     string;
}): string[] {
    const qs = [
        `term=${encodeURIComponent(params.query)}`,
        ...(params.kind  ? [`filters[kind]=${params.kind}`] : []),
        ...(params.limit ? [`pageLimit=${params.limit}`]    : []),
    ].join('&');
    const url = `${stripTrailingSlash(params.baseUrl)}/api/catalog/entities/by-query?${qs}`;
    return [...backstageCurlBase(params.baseUrl, params.token), url];
}

export function buildBackstageEntityRefArgs(params: {
    baseUrl: string;
    refs:    string[];   // e.g. ['component:default/my-svc', 'api:default/my-api']
    token?:  string;
}): string[] {
    const body = JSON.stringify({ entityRefs: params.refs, fields: [] });
    const url  = `${stripTrailingSlash(params.baseUrl)}/api/catalog/entities/by-refs`;
    return [
        ...backstageCurlBase(params.baseUrl, params.token),
        '-X', 'POST',
        '-d', body,
        url,
    ];
}

export function buildBackstageComponentInfoArgs(params: {
    baseUrl:    string;
    name:       string;
    namespace?: string;
    token?:     string;
}): string[] {
    return buildBackstageEntityGetArgs({ ...params, kind: 'Component' });
}

export function buildBackstageOwnerComponentsArgs(params: {
    baseUrl: string;
    owner:   string;
    token?:  string;
}): string[] {
    return buildBackstageEntityListArgs({ ...params, kind: 'Component' });
}

export function buildBackstageApiListArgs(params: {
    baseUrl:    string;
    lifecycle?: string;
    token?:     string;
}): string[] {
    return buildBackstageEntityListArgs({ ...params, kind: 'API' });
}

export function buildBackstageResourceListArgs(params: {
    baseUrl: string;
    type?:   string;
    token?:  string;
}): string[] {
    return buildBackstageEntityListArgs({ ...params, kind: 'Resource' });
}

export function buildBackstageSystemListArgs(params: {
    baseUrl: string;
    token?:  string;
}): string[] {
    return buildBackstageEntityListArgs({ ...params, kind: 'System' });
}

export function buildBackstageTechDocsArgs(params: {
    baseUrl:    string;
    kind:       string;
    name:       string;
    namespace?: string;
    token?:     string;
}): string[] {
    const ns  = (params.namespace ?? 'default').toLowerCase();
    const url = `${stripTrailingSlash(params.baseUrl)}/api/techdocs/static/docs/${ns}/${params.kind.toLowerCase()}/${params.name}/index.html`;
    return [...backstageCurlBase(params.baseUrl, params.token), url];
}

export function buildBackstageHealthArgs(params: { baseUrl: string }): string[] {
    return ['curl', '-s', `${stripTrailingSlash(params.baseUrl)}/healthcheck`];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function extractMetaSpec(raw: unknown): BackstageEntity | null {
    if (!raw || typeof raw !== 'object') return null;
    const j   = raw as Record<string, unknown>;
    const meta = (j['metadata'] as Record<string, unknown>) ?? {};
    const spec = (j['spec'] as Record<string, unknown>)     ?? {};
    const relations = Array.isArray(j['relations'])
        ? (j['relations'] as unknown[]).map((r: unknown) => {
              const rr = r as Record<string, unknown>;
              return { type: String(rr['type'] ?? ''), targetRef: String(rr['targetRef'] ?? '') };
          })
        : [];

    return {
        kind:        String(j['kind']       ?? ''),
        name:        String(meta['name']    ?? ''),
        namespace:   String(meta['namespace'] ?? 'default'),
        title:       meta['title']          ? String(meta['title'])       : undefined,
        description: meta['description']    ? String(meta['description']) : undefined,
        owner:       spec['owner']          ? String(spec['owner'])       : undefined,
        lifecycle:   spec['lifecycle']      ? String(spec['lifecycle'])   : undefined,
        type:        spec['type']           ? String(spec['type'])        : undefined,
        tags:        Array.isArray(meta['tags']) ? (meta['tags'] as unknown[]).map(String) : [],
        annotations: (meta['annotations'] as Record<string, string>) || {},
        relations,
    };
}

export function parseBackstageEntity(raw: string): BackstageEntity | null {
    try {
        const j = JSON.parse(raw);
        return extractMetaSpec(j);
    } catch { return null; }
}

export function parseBackstageEntityList(raw: string): BackstageEntity[] {
    try {
        const j = JSON.parse(raw);
        const items: unknown[] = Array.isArray(j) ? j : (j['items'] ?? []) as unknown[];
        return (items as unknown[]).map(extractMetaSpec).filter((e): e is BackstageEntity => e !== null);
    } catch { return []; }
}

export function parseBackstageSearchResults(raw: string): BackstageSearchResult[] {
    try {
        const j = JSON.parse(raw);
        const results: unknown[] = j?.results ?? [];
        return (results as unknown[]).map((r: unknown) => {
            const rr = r as Record<string, unknown>;
            const doc = (rr['document'] as Record<string, unknown>) ?? {};
            return {
                type:     String(rr['type'] ?? ''),
                document: {
                    title:     String(doc['title']     ?? ''),
                    text:      String(doc['text']      ?? ''),
                    location:  String(doc['location']  ?? ''),
                    kind:      doc['kind']      ? String(doc['kind'])      : undefined,
                    namespace: doc['namespace'] ? String(doc['namespace']) : undefined,
                    name:      doc['name']      ? String(doc['name'])      : undefined,
                    owner:     doc['owner']     ? String(doc['owner'])     : undefined,
                    lifecycle: doc['lifecycle'] ? String(doc['lifecycle']) : undefined,
                },
            };
        });
    } catch { return []; }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatBackstageEntityReport(entity: BackstageEntity): string {
    const lines = [
        `# ${entity.kind}: ${entity.title ?? entity.name}`,
        `- **Ref:** \`${entity.kind.toLowerCase()}:${entity.namespace}/${entity.name}\``,
    ];
    if (entity.owner)       { lines.push(`- **Owner:** ${entity.owner}`); }
    if (entity.lifecycle)   { lines.push(`- **Lifecycle:** ${entity.lifecycle}`); }
    if (entity.type)        { lines.push(`- **Type:** ${entity.type}`); }
    if (entity.description) { lines.push(`- **Description:** ${entity.description}`); }
    if (entity.tags?.length) { lines.push(`- **Tags:** ${entity.tags.join(', ')}`); }

    const deps = entity.relations?.filter((r) => r.type === 'dependsOn') ?? [];
    if (deps.length) {
        lines.push('', '## Dependencies', ...deps.map((d) => `- \`${d.targetRef}\``));
    }
    const apis = entity.relations?.filter((r) => r.type === 'providesApi' || r.type === 'consumesApi') ?? [];
    if (apis.length) {
        lines.push('', '## APIs', ...apis.map((a) => `- [${a.type}] \`${a.targetRef}\``));
    }
    const links = entity.links ?? [];
    if (links.length) {
        lines.push('', '## Links', ...links.map((l) => `- [${l.title ?? l.url}](${l.url})`));
    }
    return lines.join('\n');
}

export function formatBackstageEntityListReport(entities: BackstageEntity[]): string {
    if (entities.length === 0) return '# Backstage Catalog\nNo entities found.';
    const lines = [
        `# Backstage Catalog — ${entities.length} entities`,
        '',
        '| Kind | Name | Owner | Lifecycle | Type |',
        '|------|------|-------|-----------|------|',
    ];
    for (const e of entities.slice(0, 30)) {
        lines.push(`| ${e.kind} | ${e.name} | ${e.owner ?? '-'} | ${e.lifecycle ?? '-'} | ${e.type ?? '-'} |`);
    }
    if (entities.length > 30) { lines.push(`\n_...and ${entities.length - 30} more_`); }
    return lines.join('\n');
}

export function buildBackstageContextPrompt(entity: BackstageEntity): string {
    return [
        `# Backstage Context for ${entity.kind}: ${entity.name}`,
        formatBackstageEntityReport(entity),
        '',
        'Use this service catalog information to inform your operations:',
        `- Owner: ${entity.owner ?? 'unknown'} — escalate to them for approvals`,
        `- Lifecycle: ${entity.lifecycle ?? 'unknown'} — ${entity.lifecycle === 'production' ? 'PRODUCTION: apply caution' : 'non-production environment'}`,
        ...(entity.annotations?.['pagerduty.com/service-id']
            ? [`- PagerDuty service ID: ${entity.annotations['pagerduty.com/service-id']}`] : []),
        ...(entity.annotations?.['backstage.io/source-location']
            ? [`- Source: ${entity.annotations['backstage.io/source-location']}`] : []),
    ].join('\n');
}
