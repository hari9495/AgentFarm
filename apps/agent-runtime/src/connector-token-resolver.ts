/**
 * Sprint 11 — Connector Token Resolver
 *
 * Fetches active OAuth credentials for a connector type from the API gateway.
 * Called at task-start to inject live tokens into the task payload before execution.
 * Non-throwing: returns null on any failure and logs a warning.
 */

export type ConnectorCredentials = Record<string, string>;

export type ResolveConnectorTokenOptions = {
    /** Base URL of the API gateway (e.g. http://localhost:3000) */
    gatewayUrl: string;
    /** Bearer token for the internal runtime session */
    sessionToken: string;
    /** Optional custom fetch implementation (for tests) */
    fetcher?: typeof globalThis.fetch;
};

/**
 * Fetch active OAuth credentials for a connector from the gateway token endpoint.
 * Returns null if the connector is not configured or the request fails.
 */
export async function resolveConnectorToken(
    connectorType: string,
    workspaceId: string,
    options: ResolveConnectorTokenOptions,
): Promise<ConnectorCredentials | null> {
    const { gatewayUrl, sessionToken, fetcher = globalThis.fetch } = options;

    const url = new URL('/v1/connectors/token', gatewayUrl);
    url.searchParams.set('connector_type', connectorType);
    url.searchParams.set('workspace_id', workspaceId);

    try {
        const response = await fetcher(url.toString(), {
            headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (response.status === 404 || response.status === 409) {
            // Not configured or not yet connected — expected, not an error
            return null;
        }

        if (!response.ok) {
            return null;
        }

        const data = (await response.json()) as { credentials?: ConnectorCredentials };
        return data.credentials ?? null;
    } catch {
        // Network failure or parse error — non-blocking
        return null;
    }
}

/**
 * Resolve tokens for all requested connector types in parallel.
 * Returns a map of connectorType → credentials (only for connectors with active tokens).
 */
export async function resolveAllConnectorTokens(
    connectorTypes: readonly string[],
    workspaceId: string,
    options: ResolveConnectorTokenOptions,
): Promise<Record<string, ConnectorCredentials>> {
    const pairs = await Promise.all(
        connectorTypes.map(async (type) => {
            const credentials = await resolveConnectorToken(type, workspaceId, options);
            return [type, credentials] as const;
        }),
    );

    const result: Record<string, ConnectorCredentials> = {};
    for (const [type, credentials] of pairs) {
        if (credentials !== null) {
            result[type] = credentials;
        }
    }
    return result;
}
