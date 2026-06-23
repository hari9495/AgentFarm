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
