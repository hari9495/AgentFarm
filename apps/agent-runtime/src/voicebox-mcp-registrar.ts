/**
 * Voicebox MCP registrar.
 *
 * Ensures the Voicebox MCP server entry exists in the gateway registry for the
 * given tenant.  The operation is idempotent — if a server named "voicebox" is
 * already registered the function returns without making a second call.
 */

const gatewayUrl = (): string => (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

interface McpServerEntry {
    name: string;
    [key: string]: unknown;
}

/**
 * Register the Voicebox MCP server for `tenantId` if it is not already listed.
 *
 * Uses `API_GATEWAY_URL` for all gateway calls.  Silently no-ops when the URL
 * is not configured (dev environments that don't run the gateway).
 */
export async function ensureVoiceboxRegistered(tenantId: string): Promise<void> {
    const base = gatewayUrl();
    if (!base) {
        console.warn('[voicebox-registrar] API_GATEWAY_URL is not set; skipping Voicebox MCP registration.');
        return;
    }

    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
    };

    // List existing servers and check for an existing "voicebox" entry
    const listResponse = await fetch(`${base}/v1/mcp/tenant/${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
    });

    if (listResponse.ok) {
        const servers = (await listResponse.json()) as McpServerEntry[];
        if (Array.isArray(servers) && servers.some((s) => s.name === 'voicebox')) {
            return; // Already registered — idempotent exit
        }
    }

    // Register the Voicebox MCP server
    const registerResponse = await fetch(
        `${base}/v1/mcp/tenant/${encodeURIComponent(tenantId)}/register`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'voicebox',
                url: `${process.env['VOICEBOX_URL'] ?? 'http://localhost:17493'}/mcp`,
                description: 'Voice I/O \u2014 transcription and speech synthesis',
                authType: 'none',
            }),
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!registerResponse.ok) {
        const text = await registerResponse.text().catch(() => '');
        throw new Error(
            `[voicebox-registrar] Registration failed with HTTP ${registerResponse.status}: ${text}`,
        );
    }

    console.log(`[voicebox-registrar] Voicebox MCP server registered for tenant ${tenantId}`);
}
