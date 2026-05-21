/**
 * Sales Rep MCP Session Provisioner
 * Sprint 19 — Sales Rep vertical (2026-05-21)
 *
 * Wires the Sales Rep role's allowed connectors to live MCP server instances.
 * On first call for a tenant, this module:
 *   1. Fetches the tenant's registered MCP servers from the gateway.
 *   2. For any connector in SALES_REP_ROLE_ALLOWED_CONNECTORS that is NOT yet
 *      registered and has a known default URL, auto-registers it.
 *   3. Returns a map of connectorId → McpProtocolClient for the session.
 *
 * Default MCP server URLs are driven by environment variables so they can be
 * overridden per deployment without code changes.
 *
 * Environment variables (all optional — connectors without a URL are skipped):
 *   MCP_HUBSPOT_URL, MCP_SALESFORCE_URL,
 *   MCP_APOLLO_URL, MCP_HUNTER_URL, MCP_LINKEDIN_URL,
 *   MCP_EMAIL_URL, MCP_TEAMS_URL, MCP_SLACK_URL,
 *   MCP_JIRA_URL, MCP_LINEAR_URL,
 *   MCP_ZOOM_URL, MCP_GOOGLE_MEET_URL, MCP_MICROSOFT_TEAMS_URL,
 *   MCP_CALENDAR_URL
 */

import { McpProtocolClient } from './mcp-protocol-client.js';
import { getTenantMcpServers, registerMcpServer } from './mcp-registry-client.js';
import { SALES_REP_ROLE_ALLOWED_CONNECTORS } from './sales-rep-agent-profile.js';

// ---------------------------------------------------------------------------
// Default MCP server URL map
// ---------------------------------------------------------------------------

/**
 * Mapping from Sales Rep connector ID → env var name that holds its MCP server
 * URL. Connectors whose env var is unset are simply unavailable for the session.
 */
const SALES_REP_MCP_ENV_MAP: Record<string, string> = {
    // CRM platforms
    hubspot: 'MCP_HUBSPOT_URL',
    salesforce: 'MCP_SALESFORCE_URL',
    // Prospecting / enrichment
    apollo: 'MCP_APOLLO_URL',
    hunter: 'MCP_HUNTER_URL',
    linkedin: 'MCP_LINKEDIN_URL',
    // Communication
    email: 'MCP_EMAIL_URL',
    teams: 'MCP_TEAMS_URL',
    slack: 'MCP_SLACK_URL',
    // Pipeline tracking
    jira: 'MCP_JIRA_URL',
    linear: 'MCP_LINEAR_URL',
    // Meeting platforms
    zoom: 'MCP_ZOOM_URL',
    google_meet: 'MCP_GOOGLE_MEET_URL',
    microsoft_teams: 'MCP_MICROSOFT_TEAMS_URL',
    // Calendar
    calendar: 'MCP_CALENDAR_URL',
};

/** Resolve the default URL for a connector from env, or null if not set. */
function getDefaultMcpUrl(connectorId: string): string | null {
    const envKey = SALES_REP_MCP_ENV_MAP[connectorId];
    if (!envKey) return null;
    const url = (process.env[envKey] ?? '').trim();
    return url || null;
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

interface SalesRepMcpSession {
    /** connectorId → live McpProtocolClient (initialized) */
    clients: Map<string, McpProtocolClient>;
    createdAt: string;
}

/** In-process cache: tenantId → session. Cleared on process restart. */
const _sessionCache = new Map<string, SalesRepMcpSession>();
const SESSION_TTL_MS = 10 * 60 * 1_000; // 10 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure MCP servers for all Sales Rep connectors are registered for the tenant.
 *
 * For each connector in SALES_REP_ROLE_ALLOWED_CONNECTORS:
 *   - If an MCP server with that name already exists → skip.
 *   - If a default URL is configured via env var and no server exists → auto-register.
 *
 * This is idempotent — calling it multiple times is safe.
 */
export async function ensureSalesRepMcpServers(tenantId: string, workspaceId?: string): Promise<void> {
    const existing = await getTenantMcpServers(tenantId);
    const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

    const registrationPromises: Promise<void>[] = [];

    for (const connectorId of SALES_REP_ROLE_ALLOWED_CONNECTORS) {
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
                        `[sales-rep-mcp-provisioner] Auto-registered MCP server "${connectorId}" ` +
                        `at ${defaultUrl} for tenant ${tenantId}.`,
                    );
                }
            }).catch((err) => {
                console.warn(
                    `[sales-rep-mcp-provisioner] Failed to auto-register "${connectorId}" for tenant ${tenantId}:`,
                    String(err),
                );
            }),
        );
    }

    await Promise.all(registrationPromises);
}

/**
 * Build and cache a map of initialized McpProtocolClient instances for the
 * Sales Rep role. Clients are only created for connectors that have an MCP
 * server registered (or a default URL configured) AND pass a health check.
 *
 * Returns a map of connectorId → McpProtocolClient.
 * An empty map is valid — it means no CRM/outreach MCP servers are reachable.
 */
export async function getSalesRepMcpClients(
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
    await ensureSalesRepMcpServers(tenantId, workspaceId);

    // Fetch the (now-complete) server list and build client map
    const servers = await getTenantMcpServers(tenantId);
    const allowedConnectors = new Set(
        SALES_REP_ROLE_ALLOWED_CONNECTORS.map((c) => c.toLowerCase()),
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
                        `[sales-rep-mcp-provisioner] MCP server "${server.name}" is unhealthy — skipping.`,
                    );
                    return;
                }
                await client.initialize();
                clients.set(server.name.toLowerCase(), client);
            } catch (err) {
                console.warn(
                    `[sales-rep-mcp-provisioner] Could not initialise MCP client for "${server.name}":`,
                    String(err),
                );
            }
        });

    await Promise.all(initPromises);

    // Store in cache
    _sessionCache.set(tenantId, { clients, createdAt: new Date().toISOString() });

    console.info(
        `[sales-rep-mcp-provisioner] Sales Rep MCP session for tenant ${tenantId}: ` +
        `${clients.size} connector(s) live: [${[...clients.keys()].join(', ')}]`,
    );

    return clients;
}

/**
 * Invalidate the cached MCP session for a tenant.
 * Call when connector config changes or when the bot is re-provisioned.
 */
export function invalidateSalesRepMcpSession(tenantId: string): void {
    _sessionCache.delete(tenantId);
}
