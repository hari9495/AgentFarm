// ── CLI configuration helpers ─────────────────────────────────────────────────

export interface CliConfig {
    baseUrl: string;
    token: string | null;
    tenantId: string | null;
}

export function loadConfig(): CliConfig {
    return {
        baseUrl: process.env['AF_BASE_URL'] ?? 'http://localhost:3000',
        token: process.env['AF_TOKEN'] ?? null,
        tenantId: process.env['AF_TENANT_ID'] ?? null,
    };
}
