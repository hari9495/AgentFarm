/**
 * Tester MCP Session Provisioner
 *
 * Wires the Tester role's allowed connectors to live MCP server instances.
 * On first call for a tenant, this module:
 *   1. Fetches the tenant's registered MCP servers from the gateway.
 *   2. For any connector in TESTER_ROLE_ALLOWED_CONNECTORS that is NOT yet
 *      registered and has a known default URL, auto-registers it.
 *   3. Returns a map of connectorId → McpProtocolClient for the session.
 *
 * Default MCP server URLs are driven by environment variables so they can be
 * overridden per deployment without code changes.
 *
 * Environment variables (all optional — connectors without a URL are skipped):
 *   MCP_JIRA_URL, MCP_LINEAR_URL, MCP_GITHUB_URL, MCP_GITLAB_URL,
 *   MCP_TEAMS_URL, MCP_SLACK_URL, MCP_EMAIL_URL,
 *   MCP_JENKINS_URL, MCP_CIRCLECI_URL,
 *   MCP_SELENIUM_URL, MCP_PLAYWRIGHT_URL, MCP_CYPRESS_URL, MCP_APPIUM_URL,
 *   MCP_JMETER_URL, MCP_POSTMAN_URL, MCP_SOAPUI_URL,
 *   MCP_TESTRAIL_URL, MCP_ZEPHYR_URL,
 *   MCP_BURPSUITE_URL, MCP_OWASP_ZAP_URL
 */

import { McpProtocolClient } from '../../mcp-protocol-client.js';
import { getTenantMcpServers, registerMcpServer } from '../../mcp-registry-client.js';
import { TESTER_ROLE_ALLOWED_CONNECTORS } from './tester-agent-profile.js';

// ---------------------------------------------------------------------------
// Default MCP server URL map
// ---------------------------------------------------------------------------

/**
 * Mapping from tester connector ID → env var name that holds its MCP server URL.
 * Connectors whose env var is unset are simply unavailable for the session.
 */
const TESTER_MCP_ENV_MAP: Record<string, string> = {
    jira: 'MCP_JIRA_URL',
    linear: 'MCP_LINEAR_URL',
    github: 'MCP_GITHUB_URL',
    gitlab: 'MCP_GITLAB_URL',
    teams: 'MCP_TEAMS_URL',
    slack: 'MCP_SLACK_URL',
    email: 'MCP_EMAIL_URL',
    jenkins: 'MCP_JENKINS_URL',
    circleci: 'MCP_CIRCLECI_URL',
    selenium: 'MCP_SELENIUM_URL',
    playwright: 'MCP_PLAYWRIGHT_URL',
    cypress: 'MCP_CYPRESS_URL',
    appium: 'MCP_APPIUM_URL',
    jmeter: 'MCP_JMETER_URL',
    postman: 'MCP_POSTMAN_URL',
    soapui: 'MCP_SOAPUI_URL',
    testrail: 'MCP_TESTRAIL_URL',
    zephyr: 'MCP_ZEPHYR_URL',
    burpsuite: 'MCP_BURPSUITE_URL',
    owasp_zap: 'MCP_OWASP_ZAP_URL',
};

/** Resolve the default URL for a connector from env, or null if not set. */
function getDefaultMcpUrl(connectorId: string): string | null {
    const envKey = TESTER_MCP_ENV_MAP[connectorId];
    if (!envKey) return null;
    const url = (process.env[envKey] ?? '').trim();
    return url || null;
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

interface TesterMcpSession {
    /** connectorId → live McpProtocolClient (initialized) */
    clients: Map<string, McpProtocolClient>;
    createdAt: string;
}

/** In-process cache: tenantId → session. Cleared on process restart. */
const _sessionCache = new Map<string, TesterMcpSession>();
const SESSION_TTL_MS = 10 * 60 * 1_000; // 10 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure MCP servers for all tester connectors are registered for the tenant.
 *
 * For each connector in TESTER_ROLE_ALLOWED_CONNECTORS:
 *   - If an MCP server with that name already exists → skip.
 *   - If a default URL is configured via env var and no server exists → auto-register.
 *
 * This is idempotent — calling it multiple times is safe.
 */
export async function ensureTesterMcpServers(tenantId: string, workspaceId?: string): Promise<void> {
    const existing = await getTenantMcpServers(tenantId);
    const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

    const registrationPromises: Promise<void>[] = [];

    for (const connectorId of TESTER_ROLE_ALLOWED_CONNECTORS) {
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
                        `[tester-mcp-provisioner] Auto-registered MCP server "${connectorId}" ` +
                        `at ${defaultUrl} for tenant ${tenantId}.`,
                    );
                }
            }).catch((err) => {
                console.warn(
                    `[tester-mcp-provisioner] Failed to auto-register "${connectorId}" for tenant ${tenantId}:`,
                    String(err),
                );
            }),
        );
    }

    await Promise.all(registrationPromises);
}

/**
 * Build and cache a map of initialized McpProtocolClient instances for the
 * tester role. Clients are only created for connectors that have an MCP server
 * registered (or a default URL configured) AND pass a health check.
 *
 * Returns a map of connectorId → McpProtocolClient.
 * An empty map is valid — it means no test-tool MCP servers are reachable.
 */
export async function getTesterMcpClients(
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
    await ensureTesterMcpServers(tenantId, workspaceId);

    // Fetch the (now-complete) server list and build client map
    const servers = await getTenantMcpServers(tenantId);
    const allowedConnectors = new Set(
        TESTER_ROLE_ALLOWED_CONNECTORS.map((c) => c.toLowerCase()),
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
                        `[tester-mcp-provisioner] MCP server "${server.name}" is unhealthy — skipping.`,
                    );
                    return;
                }
                await client.initialize();
                clients.set(server.name.toLowerCase(), client);
            } catch (err) {
                console.warn(
                    `[tester-mcp-provisioner] Could not initialise MCP client for "${server.name}":`,
                    String(err),
                );
            }
        });

    await Promise.all(initPromises);

    // Store in cache
    _sessionCache.set(tenantId, { clients, createdAt: new Date().toISOString() });

    console.info(
        `[tester-mcp-provisioner] Tester MCP session for tenant ${tenantId}: ` +
        `${clients.size} connector(s) live: [${[...clients.keys()].join(', ')}]`,
    );

    return clients;
}

/**
 * Invalidate the cached MCP session for a tenant.
 * Call when connector config changes or when the bot is re-provisioned.
 */
export function invalidateTesterMcpSession(tenantId: string): void {
    _sessionCache.delete(tenantId);
}
