import type { CRMConfig, CRMVendor } from '@agentfarm/shared-types';

/**
 * Load CRM configuration from environment variables.
 * Returns undefined when CRM_VENDOR is not set.
 *
 * Supported env vars:
 *   CRM_VENDOR            — 'salesforce' | 'hubspot' | 'zoho' | 'dynamics' | 'pipedrive'
 *   CRM_ACCESS_TOKEN      — Bearer access token
 *   CRM_INSTANCE_URL      — Salesforce / Dynamics instance URL
 *   CRM_BASE_URL          — Optional override API base URL
 *   CRM_CLIENT_ID         — OAuth2 client ID
 *   CRM_CLIENT_SECRET     — OAuth2 client secret
 *   CRM_API_KEY           — API key (Pipedrive api_token)
 */
export function loadCRMConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CRMConfig | undefined {
    const vendor = env['CRM_VENDOR'] as CRMVendor | undefined;
    if (!vendor) return undefined;

    const config: CRMConfig = {
        vendor,
        accessToken: env['CRM_ACCESS_TOKEN'],
        instanceUrl: env['CRM_INSTANCE_URL'],
        baseUrl: env['CRM_BASE_URL'],
        clientId: env['CRM_CLIENT_ID'],
        clientSecret: env['CRM_CLIENT_SECRET'],
        apiKey: env['CRM_API_KEY'],
    };

    // Strip undefined keys
    (Object.keys(config) as Array<keyof CRMConfig>).forEach(k => {
        if (config[k] === undefined) delete config[k];
    });

    return config;
}
