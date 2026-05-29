/**
 * MCP Provisioner Factory
 *
 * Creates a fully-wired MCP provisioner for any agent role from three inputs:
 *   - agentName      — used in log messages (e.g. "developer")
 *   - allowedConnectors — the role's connector allowlist
 *   - envMap         — connector-id → env-var-name holding the default MCP URL
 *
 * Every generated provisioner exposes the same three functions:
 *   ensureServers(tenantId, workspaceId?)  — idempotently auto-register missing servers
 *   getClients(tenantId, workspaceId?)     — return initialised client map (10-min cache)
 *   invalidateSession(tenantId)            — clear the tenant's cached session
 */

import { McpProtocolClient } from './mcp-protocol-client.js';
import { getTenantMcpServers, registerMcpServer } from './mcp-registry-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpProvisioner {
    ensureServers(tenantId: string, workspaceId?: string): Promise<void>;
    getClients(tenantId: string, workspaceId?: string): Promise<Map<string, McpProtocolClient>>;
    invalidateSession(tenantId: string): void;
}

interface McpSession {
    clients: Map<string, McpProtocolClient>;
    createdAt: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 10 * 60 * 1_000; // 10 minutes

export function createMcpProvisioner(
    agentName: string,
    allowedConnectors: readonly string[],
    envMap: Record<string, string>,
): McpProvisioner {
    const tag = `[${agentName}-mcp-provisioner]`;
    const cache = new Map<string, McpSession>();

    function resolveDefaultUrl(connectorId: string): string | null {
        const envKey = envMap[connectorId];
        if (!envKey) return null;
        const url = (process.env[envKey] ?? '').trim();
        return url || null;
    }

    async function ensureServers(tenantId: string, workspaceId?: string): Promise<void> {
        const existing = await getTenantMcpServers(tenantId);
        const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

        const registrations = allowedConnectors
            .filter((id) => !existingNames.has(id.toLowerCase()))
            .map((id) => {
                const url = resolveDefaultUrl(id);
                if (!url) return Promise.resolve();
                return registerMcpServer(tenantId, { name: id, url, workspaceId })
                    .then(() => console.info(`${tag} Auto-registered "${id}" at ${url} for tenant ${tenantId}`))
                    .catch((err: unknown) => console.warn(`${tag} Failed to register "${id}" for tenant ${tenantId}:`, String(err)));
            });

        await Promise.all(registrations);
    }

    async function getClients(
        tenantId: string,
        workspaceId?: string,
    ): Promise<Map<string, McpProtocolClient>> {
        const cached = cache.get(tenantId);
        if (cached && Date.now() - cached.createdAt < SESSION_TTL_MS) {
            return cached.clients;
        }

        await ensureServers(tenantId, workspaceId);

        const servers = await getTenantMcpServers(tenantId);
        const allowed = new Set(allowedConnectors.map((c) => c.toLowerCase()));
        const clients = new Map<string, McpProtocolClient>();

        await Promise.all(
            servers
                .filter((s) => allowed.has(s.name.toLowerCase()) && s.isActive)
                .map(async (server) => {
                    const client = new McpProtocolClient(server.url, server.headers ?? undefined);
                    try {
                        const healthy = await client.healthCheck();
                        if (!healthy) {
                            console.warn(`${tag} Server "${server.name}" is unhealthy — skipping`);
                            return;
                        }
                        await client.initialize();
                        clients.set(server.name.toLowerCase(), client);
                    } catch (err: unknown) {
                        console.warn(`${tag} Could not initialise client for "${server.name}":`, String(err));
                    }
                }),
        );

        cache.set(tenantId, { clients, createdAt: Date.now() });
        console.info(`${tag} Session for tenant ${tenantId}: ${clients.size} connector(s) live: [${[...clients.keys()].join(', ')}]`);
        return clients;
    }

    function invalidateSession(tenantId: string): void {
        cache.delete(tenantId);
    }

    return { ensureServers, getClients, invalidateSession };
}
