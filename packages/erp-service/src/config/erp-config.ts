import type { ERPConfig, ERPVendor } from '@agentfarm/shared-types';

/**
 * Load ERP configuration from environment variables.
 * Returns undefined when ERP_VENDOR is not set.
 *
 * Supported env vars:
 *   ERP_VENDOR            — 'sap' | 'oracle' | 'dynamics365' | 'netsuite' | 'odoo'
 *   ERP_BASE_URL          — Base URL for the ERP instance (required)
 *   ERP_ACCESS_TOKEN      — Bearer access token
 *   ERP_USERNAME          — Username (Oracle Basic auth, Odoo)
 *   ERP_PASSWORD          — Password (Oracle Basic auth, Odoo)
 *   ERP_CLIENT_ID         — OAuth2 client ID
 *   ERP_CLIENT_SECRET     — OAuth2 client secret
 *   ERP_COMPANY_ID        — Company / org ID (Odoo, NetSuite)
 *   ERP_API_KEY           — API key (Odoo password field alternative)
 */
export function loadERPConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ERPConfig | undefined {
    const vendor = env['ERP_VENDOR'] as ERPVendor | undefined;
    const baseUrl = env['ERP_BASE_URL'];
    if (!vendor || !baseUrl) return undefined;

    const config: ERPConfig = {
        vendor,
        baseUrl,
        accessToken: env['ERP_ACCESS_TOKEN'],
        username: env['ERP_USERNAME'],
        password: env['ERP_PASSWORD'],
        clientId: env['ERP_CLIENT_ID'],
        clientSecret: env['ERP_CLIENT_SECRET'],
        companyId: env['ERP_COMPANY_ID'],
        apiKey: env['ERP_API_KEY'],
    };

    // Strip undefined keys
    (Object.keys(config) as Array<keyof ERPConfig>).forEach(k => {
        if (config[k] === undefined) delete config[k];
    });

    return config;
}
