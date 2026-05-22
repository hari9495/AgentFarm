/**
 * Corporate Assistant MCP Session Provisioner
 *
 * Wires the Corporate Assistant role's allowed connectors to live MCP server
 * instances. On first call for a tenant, this module:
 *   1. Fetches the tenant's registered MCP servers from the gateway.
 *   2. For any connector in CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS that
 *      is NOT yet registered and has a known default URL, auto-registers it.
 *   3. Returns a map of connectorId → McpProtocolClient for the session.
 *
 * Default MCP server URLs are driven by environment variables so they can be
 * overridden per deployment without code changes.
 *
 * Environment variables (all optional — connectors without a URL are skipped):
 *   MCP_GMAIL_URL, MCP_OUTLOOK_URL, MCP_SMTP_URL,
 *   MCP_GOOGLE_CALENDAR_URL, MCP_OUTLOOK_CALENDAR_URL,
 *   MCP_TEAMS_URL, MCP_SLACK_URL,
 *   MCP_GOOGLE_DRIVE_URL, MCP_CONFLUENCE_URL,
 *   MCP_GOOGLE_MEET_URL, MCP_MICROSOFT_TEAMS_URL, MCP_ZOOM_URL
 */

import { McpProtocolClient } from './mcp-protocol-client.js';
import { getTenantMcpServers, registerMcpServer } from './mcp-registry-client.js';
import { CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS } from './corporate-assistant-agent-profile.js';

// ---------------------------------------------------------------------------
// Default MCP server URL map
// ---------------------------------------------------------------------------

/**
 * Mapping from corporate assistant connector ID → env var that holds its URL.
 * Connectors whose env var is unset are simply unavailable for the session.
 */
const CORPORATE_ASSISTANT_MCP_ENV_MAP: Record<string, string> = {
    gmail: 'MCP_GMAIL_URL',
    outlook: 'MCP_OUTLOOK_URL',
    smtp: 'MCP_SMTP_URL',
    google_calendar: 'MCP_GOOGLE_CALENDAR_URL',
    outlook_calendar: 'MCP_OUTLOOK_CALENDAR_URL',
    teams: 'MCP_TEAMS_URL',
    slack: 'MCP_SLACK_URL',
    google_drive: 'MCP_GOOGLE_DRIVE_URL',
    confluence: 'MCP_CONFLUENCE_URL',
    google_meet: 'MCP_GOOGLE_MEET_URL',
    microsoft_teams: 'MCP_MICROSOFT_TEAMS_URL',
    zoom: 'MCP_ZOOM_URL',
};

/** Resolve the default URL for a connector from env, or null if not set. */
function getDefaultMcpUrl(connectorId: string): string | null {
    const envKey = CORPORATE_ASSISTANT_MCP_ENV_MAP[connectorId];
    if (!envKey) return null;
    const url = (process.env[envKey] ?? '').trim();
    return url || null;
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

interface CorporateAssistantMcpSession {
    /** connectorId → live McpProtocolClient (initialized) */
    clients: Map<string, McpProtocolClient>;
    createdAt: string;
}

/** In-process cache: tenantId → session. Cleared on process restart. */
const _sessionCache = new Map<string, CorporateAssistantMcpSession>();
const SESSION_TTL_MS = 10 * 60 * 1_000; // 10 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure MCP servers for all corporate assistant connectors are registered
 * for the tenant.
 *
 * For each connector in CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS:
 *   - If an MCP server with that name already exists → skip.
 *   - If a default URL is configured via env var and no server exists → auto-register.
 *
 * This is idempotent — calling it multiple times is safe.
 */
export async function ensureCorporateAssistantMcpServers(
    tenantId: string,
    workspaceId?: string,
): Promise<void> {
    const existing = await getTenantMcpServers(tenantId);
    const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

    const registrationPromises: Promise<void>[] = [];

    for (const connectorId of CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS) {
        if (existingNames.has(connectorId.toLowerCase())) continue;

        const defaultUrl = getDefaultMcpUrl(connectorId);
        if (!defaultUrl) continue;

        registrationPromises.push(
            registerMcpServer(tenantId, {
                name: connectorId,
                url: defaultUrl,
                workspaceId,
            }).then((result) => {
                if (result) {
                    console.info(
                        `[ca-mcp-provisioner] Auto-registered MCP server "${connectorId}" ` +
                        `at ${defaultUrl} for tenant ${tenantId}.`,
                    );
                }
            }).catch((err) => {
                console.warn(
                    `[ca-mcp-provisioner] Failed to auto-register "${connectorId}" ` +
                    `for tenant ${tenantId}:`,
                    String(err),
                );
            }),
        );
    }

    await Promise.all(registrationPromises);
}

/**
 * Build and cache a map of initialized McpProtocolClient instances for the
 * corporate assistant role. Clients are only created for connectors that have
 * an MCP server registered (or a default URL configured) AND pass a health check.
 *
 * Returns a map of connectorId → McpProtocolClient.
 * An empty map is valid — it means no corporate assistant MCP servers are reachable.
 */
export async function getCorporateAssistantMcpClients(
    tenantId: string,
    workspaceId?: string,
): Promise<Map<string, McpProtocolClient>> {
    // Return cached session if still fresh
    const cached = _sessionCache.get(tenantId);
    if (cached) {
        const ageMs = Date.now() - new Date(cached.createdAt).getTime();
        if (ageMs < SESSION_TTL_MS) return cached.clients;
    }

    // Ensure all default servers are registered
    await ensureCorporateAssistantMcpServers(tenantId, workspaceId);

    // Fetch the (now-complete) server list and build client map
    const servers = await getTenantMcpServers(tenantId);
    const allowedConnectors = new Set(
        CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS.map((c) => c.toLowerCase()),
    );

    const clients = new Map<string, McpProtocolClient>();

    const initPromises = servers
        .filter((s) => allowedConnectors.has(s.name.toLowerCase()) && s.isActive)
        .map(async (server) => {
            const client = new McpProtocolClient(server.url, server.headers ?? undefined);
            try {
                const healthy = await client.healthCheck();
                if (!healthy) {
                    console.warn(
                        `[ca-mcp-provisioner] MCP server "${server.name}" is unhealthy — skipping.`,
                    );
                    return;
                }
                await client.initialize();
                clients.set(server.name.toLowerCase(), client);
            } catch (err) {
                console.warn(
                    `[ca-mcp-provisioner] Could not initialise MCP client for "${server.name}":`,
                    String(err),
                );
            }
        });

    await Promise.all(initPromises);

    // Store in cache
    _sessionCache.set(tenantId, { clients, createdAt: new Date().toISOString() });

    console.info(
        `[ca-mcp-provisioner] Corporate Assistant MCP session for tenant ${tenantId}: ` +
        `${clients.size} connector(s) live: [${[...clients.keys()].join(', ')}]`,
    );

    return clients;
}

/**
 * Invalidate the cached MCP session for a tenant.
 * Call when connector config changes or when the bot is re-provisioned.
 */
export function invalidateCorporateAssistantMcpSession(tenantId: string): void {
    _sessionCache.delete(tenantId);
}
