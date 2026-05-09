/**
 * MCP Registry client for agent-runtime.
 *
 * Provides typed helpers for listing and registering MCP servers via the
 * api-gateway MCP registry endpoints. All functions are fire-safe — errors
 * are logged and empty/null values are returned; nothing is thrown.
 */

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
            headers: {
                'x-tenant-id': tenantId,
                'content-type': 'application/json',
            },
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
            headers: {
                'x-tenant-id': tenantId,
                'content-type': 'application/json',
            },
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
