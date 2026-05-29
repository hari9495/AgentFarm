/**
 * In-memory connector store shared across all /api/connectors/* routes.
 *
 * In production, replace with a database-backed implementation that reads/writes
 * to the tenant_connectors table (or equivalent) via the api-gateway.
 *
 * The global variable pattern keeps the map alive across Next.js hot-reloads in dev.
 */
interface TenantConnector {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    tool: string;
    category: string;
    displayName: string;
    status: string;
    authMethod: string;
    secretRefId: string | null;
    baseUrl?: string;
    configValues?: Record<string, string>;
    lastHealthcheckAt: string | null;
    lastErrorClass: string | null;
    createdAt: string;
    updatedAt: string;
}

declare global {
    // eslint-disable-next-line no-var
    var __connectorStore: Map<string, TenantConnector> | undefined;
}

if (!global.__connectorStore) {
    global.__connectorStore = new Map<string, TenantConnector>();
}

export const connectorStore: Map<string, TenantConnector> = global.__connectorStore;
