// ============================================================================
// CRM types — pluggable outbound CRM adapter abstraction
// ============================================================================

export type CRMVendor = 'salesforce' | 'hubspot' | 'zoho' | 'dynamics' | 'pipedrive';

export type CRMConfig = {
    vendor: CRMVendor;
    /** Base API URL (optional — some adapters derive it from instanceUrl) */
    baseUrl?: string;
    /** OAuth2 client ID */
    clientId?: string;
    /** OAuth2 client secret */
    clientSecret?: string;
    /** Short-lived access token (Bearer) */
    accessToken?: string;
    /** Salesforce / Dynamics instance root URL */
    instanceUrl?: string;
    /** API key — used by Pipedrive (api_token query param) */
    apiKey?: string;
};

export type CRMRecord = {
    id: string;
    type: string;
    fields: Record<string, unknown>;
    vendor: CRMVendor;
    rawResponse?: unknown;
};

export type CRMQuery = {
    type: string;
    filters?: Record<string, unknown>;
    limit?: number;
    fields?: string[];
};

export type CRMWritePayload = {
    type: string;
    fields: Record<string, unknown>;
};

export type CRMResult<T> = {
    success: boolean;
    data?: T;
    error?: string;
    vendor: CRMVendor;
};

export type CustomerCRMConfig = {
    customerId: string;
    config: CRMConfig;
};
