/**
 * Custom API (OpenAPI) catalog client for agent-runtime (C6.2).
 *
 * Mirrors mcp-registry-client: fetches the tenant's stored Custom API tool catalogs from
 * the gateway and formats them into a planner block. With this, the agent can autonomously
 * drive ANY REST API the customer described via OpenAPI — the self-describing equivalent of
 * MCP's tools/list, for plain REST.
 *
 * Fire-safe: all errors are logged and empty values returned; nothing throws.
 */

export interface CustomApiCatalogTool {
    name: string;
    description: string;
    method: string;
    path: string;
    pathParams?: string[];
    queryParams?: string[];
    requiredParams?: string[];
    hasBody?: boolean;
}

export interface CustomApiConnectorCatalog {
    connectorId: string;
    displayName: string | null;
    catalog: CustomApiCatalogTool[];
}

const CATALOG_MAX_CHARS = 6000;
const TOOL_DESC_MAX = 140;

const gatewayUrl = (): string => (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

const serviceToken = (): string =>
    process.env['AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN']
    ?? process.env['CONNECTOR_EXEC_SHARED_TOKEN']
    ?? process.env['AGENTFARM_RUNTIME_TASK_SHARED_TOKEN']
    ?? process.env['RUNTIME_TASK_SHARED_TOKEN']
    ?? '';

const truncate = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/**
 * Fetch all stored Custom API catalogs for a tenant. Returns [] on any error.
 */
export async function getCustomApiCatalogs(
    tenantId: string,
    workspaceId?: string,
    fetcher: typeof fetch = fetch,
): Promise<CustomApiConnectorCatalog[]> {
    const base = gatewayUrl();
    if (!base) {
        console.warn('[custom-api-catalog-client] API_GATEWAY_URL is not set; skipping.');
        return [];
    }
    const token = serviceToken();
    if (!token) {
        console.warn('[custom-api-catalog-client] no connector-exec service token configured; skipping.');
        return [];
    }
    try {
        const url = new URL(`${base}/v1/connectors/custom-api-catalog`);
        if (workspaceId) url.searchParams.set('workspace_id', workspaceId);
        const res = await fetcher(url.toString(), {
            method: 'GET',
            headers: {
                'x-tenant-id': tenantId,
                'content-type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            console.warn(`[custom-api-catalog-client] gateway returned HTTP ${res.status} for tenant ${tenantId}.`);
            return [];
        }
        const data = (await res.json()) as { connectors?: CustomApiConnectorCatalog[] };
        return Array.isArray(data.connectors) ? data.connectors : [];
    } catch (err) {
        console.warn(`[custom-api-catalog-client] fetch failed for tenant ${tenantId}:`, String(err));
        return [];
    }
}

/**
 * Pure formatter — turns stored catalogs into the planner block. Unit-testable without network.
 * Tells the planner exactly how to invoke a Custom API operation via the custom_api connector.
 */
export function formatCustomApiCatalog(connectors: CustomApiConnectorCatalog[]): string {
    const lines: string[] = [];
    let truncated = false;

    for (const conn of connectors) {
        if (!Array.isArray(conn.catalog) || conn.catalog.length === 0) continue;
        for (const tool of conn.catalog) {
            const desc = tool.description ? ` — ${truncate(tool.description.trim(), TOOL_DESC_MAX)}` : '';
            const required = (tool.requiredParams ?? []).join(', ') || 'none';
            const entry =
                `- connector="${conn.connectorId}" operation="${tool.name}" (${tool.method} ${tool.path})${desc}\n` +
                `    required args: ${required}`;
            const projected = lines.join('\n').length + entry.length + 200;
            if (projected > CATALOG_MAX_CHARS) {
                truncated = true;
                break;
            }
            lines.push(entry);
        }
        if (truncated) break;
    }

    if (lines.length === 0) return '';

    return (
        '## Available Custom API operations (self-describing REST connectors)\n' +
        'To call one, choose actionType="mcp_tool_call" is NOT used here — instead use a connector action ' +
        'with connector_type="custom_api", and payload { openapi_operation: <the operation>, args: {...} }.\n' +
        lines.join('\n') +
        (truncated ? '\n- … (catalog truncated)' : '')
    );
}

/**
 * Build the Custom API planner catalog block for a tenant. Fire-safe (returns '' on failure).
 */
export async function buildCustomApiToolCatalog(
    tenantId: string,
    workspaceId?: string,
): Promise<string> {
    try {
        const connectors = await getCustomApiCatalogs(tenantId, workspaceId);
        return formatCustomApiCatalog(connectors);
    } catch (err) {
        console.warn('[custom-api-catalog-client] buildCustomApiToolCatalog failed:', String(err));
        return '';
    }
}
