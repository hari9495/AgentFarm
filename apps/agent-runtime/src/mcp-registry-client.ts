/**
 * MCP Registry client for agent-runtime.
 *
 * Provides typed helpers for listing and registering MCP servers via the
 * api-gateway MCP registry endpoints. All functions are fire-safe — errors
 * are logged and empty/null values are returned; nothing is thrown.
 */

import type { McpServerInfo, McpTool, McpToolCallResult, RoleKey } from '@agentfarm/shared-types';
import { McpProtocolClient } from './mcp-protocol-client.js';
import { getRoleProfile } from './role-profiles/index.js';

export interface TenantMcpServer {
    id: string;
    tenantId: string;
    workspaceId?: string;
    name: string;
    url: string;
    headers?: Record<string, string>;
    isActive: boolean;
}

const gatewayUrl = (): string => (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

/**
 * Shared service token used to authenticate runtime → gateway MCP registry calls.
 * The gateway's /v1/mcp routes accept this token (Bearer) together with an
 * x-tenant-id header in lieu of a browser session. Falls back across the same
 * env vars the gateway checks so a single configured token works for both sides.
 */
const mcpServiceToken = (): string =>
    process.env['AGENTFARM_MCP_REGISTRY_SHARED_TOKEN']
    ?? process.env['AGENTFARM_RUNTIME_TASK_SHARED_TOKEN']
    ?? process.env['RUNTIME_TASK_SHARED_TOKEN']
    ?? process.env['AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN']
    ?? '';

const mcpRegistryHeaders = (tenantId: string): Record<string, string> => {
    const headers: Record<string, string> = {
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
    };
    const token = mcpServiceToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

/**
 * Fetch all active MCP servers for a tenant.
 * Returns [] on any error.
 */
export async function getTenantMcpServers(tenantId: string): Promise<TenantMcpServer[]> {
    const base = gatewayUrl();
    if (!base) {
        console.warn('[mcp-registry-client] API_GATEWAY_URL is not set; skipping getTenantMcpServers.');
        return [];
    }

    try {
        const response = await fetch(`${base}/v1/mcp`, {
            method: 'GET',
            headers: mcpRegistryHeaders(tenantId),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.warn(
                `[mcp-registry-client] getTenantMcpServers returned HTTP ${response.status} for tenant ${tenantId}.`,
            );
            return [];
        }

        const data = (await response.json()) as TenantMcpServer[];
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn(`[mcp-registry-client] getTenantMcpServers failed for tenant ${tenantId}:`, String(err));
        return [];
    }
}

/**
 * Register (or reactivate) an MCP server for a tenant.
 * Returns the created/updated record, or null on any error.
 */
export async function registerMcpServer(
    tenantId: string,
    server: {
        name: string;
        url: string;
        workspaceId?: string;
        headers?: Record<string, string>;
    },
): Promise<TenantMcpServer | null> {
    const base = gatewayUrl();
    if (!base) {
        console.warn('[mcp-registry-client] API_GATEWAY_URL is not set; skipping registerMcpServer.');
        return null;
    }

    try {
        const response = await fetch(`${base}/v1/mcp`, {
            method: 'POST',
            headers: mcpRegistryHeaders(tenantId),
            body: JSON.stringify(server),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.warn(
                `[mcp-registry-client] registerMcpServer returned HTTP ${response.status} for tenant ${tenantId}: ${text}`,
            );
            return null;
        }

        return (await response.json()) as TenantMcpServer;
    } catch (err) {
        console.warn(`[mcp-registry-client] registerMcpServer failed for tenant ${tenantId}:`, String(err));
        return null;
    }
}

// ---------------------------------------------------------------------------
// MCP protocol-level discovery and invocation
// ---------------------------------------------------------------------------

/**
 * Discover all healthy MCP servers for a tenant and return their tool lists.
 *
 * @param tenantId     The tenant whose registered servers to query.
 * @param _baseUrl     Reserved for future use (currently resolved via API_GATEWAY_URL).
 * @param _serviceToken  Reserved for future use (auth token placeholder).
 * @param roleKey      Optional: when provided, only servers whose name matches the
 *                     role's `allowedConnectorTools` list are included.  Servers with
 *                     names not in the allowlist are silently filtered out.
 * @returns Array of McpServerInfo — one per healthy server. Empty on total failure.
 */
export async function discoverMcpTools(
    tenantId: string,
    _baseUrl: string,
    _serviceToken: string,
    roleKey?: RoleKey,
): Promise<McpServerInfo[]> {
    let servers: TenantMcpServer[];
    try {
        servers = await getTenantMcpServers(tenantId);
    } catch (err) {
        console.warn('[mcp-registry-client] discoverMcpTools: getTenantMcpServers threw unexpectedly:', String(err));
        return [];
    }

    if (servers.length === 0) {
        return [];
    }

    // Apply role-based server filter when a roleKey is provided.
    // Only servers whose normalised name appears in the role's connector allowlist are included.
    let filteredServers = servers;
    if (roleKey) {
        const roleProfile = getRoleProfile(roleKey);
        const allowedSet = new Set(
            roleProfile.allowedConnectorTools.map(t => t.toLowerCase()),
        );
        filteredServers = servers.filter(s => allowedSet.has(s.name.toLowerCase()));
        if (filteredServers.length < servers.length) {
            console.info(
                `[mcp-registry-client] discoverMcpTools: role "${roleKey}" — ` +
                `${servers.length - filteredServers.length} server(s) filtered out by role allowlist.`,
            );
        }
    }

    const results: McpServerInfo[] = [];

    for (const server of filteredServers) {
        const client = new McpProtocolClient(server.url, server.headers ?? undefined);

        const healthy = await client.healthCheck();
        if (!healthy) {
            console.warn(
                `[mcp-registry-client] discoverMcpTools: server "${server.name}" (${server.url}) is unhealthy — skipping.`,
            );
            continue;
        }

        let protocolVersion = '2024-11-05';
        let tools: McpTool[] = [];

        try {
            const initResult = await client.initialize();
            protocolVersion = initResult.protocolVersion;
            tools = await client.listTools();
        } catch (err) {
            console.warn(
                `[mcp-registry-client] discoverMcpTools: failed to enumerate tools for server "${server.name}":`,
                String(err),
            );
            // Still include the server — it was healthy, just tool listing failed
        }

        results.push({
            serverId: server.id,
            name: server.name,
            url: server.url,
            protocolVersion,
            tools,
            lastHealthCheck: new Date().toISOString(),
            healthy: true,
        });
    }

    return results;
}

/**
 * Invoke a specific tool on an MCP server.
 * Always calls initialize() first as required by the MCP specification.
 *
 * @param serverUrl  The MCP server endpoint URL.
 * @param headers    HTTP headers to include (e.g. auth tokens).
 * @param toolName   The name of the tool to invoke.
 * @param args       Arguments to pass to the tool.
 * @returns McpToolCallResult from the server.
 * @throws McpProtocolError on protocol-level failures.
 * @throws McpToolError when the server reports isError: true.
 */
export async function invokeMcpTool(
    serverUrl: string,
    headers: Record<string, string>,
    toolName: string,
    args: Record<string, unknown>,
): Promise<McpToolCallResult> {
    const client = new McpProtocolClient(serverUrl, headers);
    // MCP spec requires initialize before any tool calls
    await client.initialize();
    return client.callTool(toolName, args);
}

// ---------------------------------------------------------------------------
// Planner-facing tool catalog
// ---------------------------------------------------------------------------

/**
 * Hard cap on the catalog text so it never blows the decision-LLM prompt budget.
 * Sized to fit a large server (e.g. chrome-devtools ~29 tools) with full arg
 * schemas, since dropping the tool the agent needs is worse than a bigger prompt.
 */
const MCP_CATALOG_MAX_CHARS = 14000;

/** Per-field caps so one verbose tool can't crowd out the rest. */
const TOOL_DESC_MAX = 120;
const ARG_DESC_MAX = 90;

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Render a tool's input schema as a readable arg list with name, type, required
 * flag and description — e.g. `url* (string): The URL to navigate to`. This is
 * what lets the LLM fill toolArgs correctly instead of guessing arg names.
 */
function formatToolArgs(inputSchema: McpTool['inputSchema'] | undefined): string {
    const props = (inputSchema?.properties ?? {}) as Record<string, { type?: string; description?: string }>;
    const required = new Set(inputSchema?.required ?? []);
    const names = Object.keys(props);
    if (names.length === 0) return '(no arguments)';
    return names
        .map((name) => {
            const spec = props[name] ?? {};
            const type = typeof spec.type === 'string' ? spec.type : 'any';
            const req = required.has(name) ? '*' : '';
            const desc = typeof spec.description === 'string' && spec.description.trim()
                ? `: ${truncate(spec.description.trim(), ARG_DESC_MAX)}`
                : '';
            return `${name}${req} (${type})${desc}`;
        })
        .join('; ');
}

/**
 * Build a compact, human-readable catalog of every MCP tool available to a
 * tenant's agents, for injection into the decision-LLM prompt. This is what lets
 * an agent autonomously choose actionType=mcp_tool_call.
 *
 * Design notes:
 *  - Discovers servers WITHOUT a role filter — any server the tenant registered
 *    is offered to every one of that tenant's agents (tenant isolation is the
 *    only boundary; role-based blocking is intentionally not applied).
 *  - Fully fail-safe: returns '' on any error or when nothing is registered, so
 *    a down/misconfigured MCP server can never break task planning.
 *  - Output is bounded to MCP_CATALOG_MAX_CHARS; tools beyond the budget are
 *    dropped with a truncation note rather than overflowing the prompt.
 *
 * @returns A formatted catalog block, or '' when no healthy tools are available.
 */
export async function buildMcpToolCatalog(tenantId: string, workspaceId?: string): Promise<string> {
    let servers: McpServerInfo[];
    try {
        servers = await discoverMcpTools(tenantId, '', '');
    } catch (err) {
        console.warn('[mcp-registry-client] buildMcpToolCatalog: discovery failed:', String(err));
        return '';
    }
    void workspaceId; // reserved: workspace-scoped servers are not yet distinguished
    return formatMcpToolCatalog(servers);
}

/**
 * Pure formatter: turns discovered server info into the planner catalog block.
 * Separated from buildMcpToolCatalog so it can be unit-tested without network.
 */
export function formatMcpToolCatalog(servers: McpServerInfo[]): string {
    const lines: string[] = [];
    let truncated = false;

    for (const server of servers) {
        if (!server.healthy || server.tools.length === 0) continue;
        for (const tool of server.tools) {
            const desc = tool.description ? ` — ${truncate(tool.description.trim(), TOOL_DESC_MAX)}` : '';
            const entry =
                `- server="${server.name}" url="${server.url}" tool="${tool.name}"${desc}\n` +
                `    args: ${formatToolArgs(tool.inputSchema)}`;

            // Stop before exceeding the budget (account for header + footer).
            const projected = lines.join('\n').length + entry.length + 200;
            if (projected > MCP_CATALOG_MAX_CHARS) {
                truncated = true;
                break;
            }
            lines.push(entry);
        }
        if (truncated) break;
    }

    if (lines.length === 0) return '';

    const header =
        'The following MCP tools are registered for this workspace. To use one, set ' +
        'actionType=mcp_tool_call and payloadOverrides={ mcpServerUrl: <url>, toolName: <tool>, ' +
        'toolArgs: { ... } }. Each tool lists its arguments as `name (type): description`; ' +
        'args marked with * are required. Use these EXACT argument names and types — do not invent argument names.';
    const footer = truncated ? '\n- …(additional tools omitted to fit prompt budget)' : '';

    return `${header}\n${lines.join('\n')}${footer}`;
}
