/**
 * Marketing Specialist MCP Session Provisioner
 *
 * Wires the Marketing Specialist role's allowed connectors to live MCP server
 * instances. Auto-registers connectors that have a known default URL via env vars.
 *
 * Environment variables (all optional):
 *   MCP_GOOGLE_ANALYTICS_URL, MCP_GOOGLE_ADS_URL, MCP_META_ADS_URL,
 *   MCP_LINKEDIN_ADS_URL, MCP_HUBSPOT_URL, MCP_MAILCHIMP_URL,
 *   MCP_SEMRUSH_URL, MCP_HOOTSUITE_URL, MCP_GOOGLE_DRIVE_URL,
 *   MCP_SLACK_URL, MCP_TEAMS_URL, MCP_GMAIL_URL
 */

import { McpProtocolClient } from '../../mcp-protocol-client.js';
import { getTenantMcpServers, registerMcpServer } from '../../mcp-registry-client.js';
import { MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS } from './marketing-specialist-agent-profile.js';

const MARKETING_SPECIALIST_MCP_ENV_MAP: Record<string, string> = {
    google_analytics: 'MCP_GOOGLE_ANALYTICS_URL',
    google_ads: 'MCP_GOOGLE_ADS_URL',
    meta_ads: 'MCP_META_ADS_URL',
    linkedin_ads: 'MCP_LINKEDIN_ADS_URL',
    hubspot: 'MCP_HUBSPOT_URL',
    mailchimp: 'MCP_MAILCHIMP_URL',
    semrush: 'MCP_SEMRUSH_URL',
    hootsuite: 'MCP_HOOTSUITE_URL',
    google_drive: 'MCP_GOOGLE_DRIVE_URL',
    slack: 'MCP_SLACK_URL',
    microsoft_teams: 'MCP_TEAMS_URL',
    gmail: 'MCP_GMAIL_URL',
};

function getDefaultMcpUrl(connectorId: string): string | null {
    const envKey = MARKETING_SPECIALIST_MCP_ENV_MAP[connectorId];
    if (!envKey) return null;
    const url = (process.env[envKey] ?? '').trim();
    return url || null;
}

interface MarketingSpecialistMcpSession {
    clients: Map<string, McpProtocolClient>;
    createdAt: string;
}

const _sessionCache = new Map<string, MarketingSpecialistMcpSession>();
const SESSION_TTL_MS = 10 * 60 * 1_000;

export async function ensureMarketingSpecialistMcpServers(
    tenantId: string,
    workspaceId?: string,
): Promise<void> {
    const existing = await getTenantMcpServers(tenantId);
    const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

    const promises: Promise<void>[] = [];

    for (const connectorId of MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS) {
        if (existingNames.has(connectorId.toLowerCase())) continue;
        const defaultUrl = getDefaultMcpUrl(connectorId);
        if (!defaultUrl) continue;

        promises.push(
            registerMcpServer(tenantId, { name: connectorId, url: defaultUrl, workspaceId })
                .then((result) => {
                    if (result) {
                        console.info(`[ms-mcp-provisioner] Auto-registered "${connectorId}" for tenant ${tenantId}.`);
                    }
                })
                .catch((err) => {
                    console.warn(`[ms-mcp-provisioner] Failed to register "${connectorId}":`, String(err));
                }),
        );
    }

    await Promise.all(promises);
}

export async function getMarketingSpecialistMcpClients(
    tenantId: string,
    workspaceId?: string,
): Promise<Map<string, McpProtocolClient>> {
    const cached = _sessionCache.get(tenantId);
    if (cached) {
        const ageMs = Date.now() - new Date(cached.createdAt).getTime();
        if (ageMs < SESSION_TTL_MS) return cached.clients;
    }

    await ensureMarketingSpecialistMcpServers(tenantId, workspaceId);

    const servers = await getTenantMcpServers(tenantId);
    const allowedConnectors = new Set(
        MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS.map((c) => c.toLowerCase()),
    );

    const clients = new Map<string, McpProtocolClient>();

    await Promise.all(
        servers
            .filter((s) => allowedConnectors.has(s.name.toLowerCase()) && s.isActive)
            .map(async (server) => {
                const client = new McpProtocolClient(server.url, server.headers ?? undefined);
                try {
                    const healthy = await client.healthCheck();
                    if (!healthy) {
                        console.warn(`[ms-mcp-provisioner] "${server.name}" unhealthy — skipping.`);
                        return;
                    }
                    await client.initialize();
                    clients.set(server.name.toLowerCase(), client);
                } catch (err) {
                    console.warn(`[ms-mcp-provisioner] Could not init "${server.name}":`, String(err));
                }
            }),
    );

    _sessionCache.set(tenantId, { clients, createdAt: new Date().toISOString() });

    console.info(
        `[ms-mcp-provisioner] Marketing Specialist MCP session for tenant ${tenantId}: ` +
        `${clients.size} connector(s) live: [${[...clients.keys()].join(', ')}]`,
    );

    return clients;
}

export function invalidateMarketingSpecialistMcpSession(tenantId: string): void {
    _sessionCache.delete(tenantId);
}
