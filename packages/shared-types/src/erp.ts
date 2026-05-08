// ============================================================================
// ERP types — pluggable outbound ERP adapter abstraction
// ============================================================================

export type ERPVendor = 'sap' | 'oracle' | 'dynamics365' | 'netsuite' | 'odoo';

export type ERPConfig = {
    vendor: ERPVendor;
    /** Base URL for the ERP instance */
    baseUrl: string;
    username?: string;
    password?: string;
    /** Short-lived access / Bearer token */
    accessToken?: string;
    /** OAuth2 client ID */
    clientId?: string;
    /** OAuth2 client secret */
    clientSecret?: string;
    /** Company / org identifier (NetSuite, Odoo, etc.) */
    companyId?: string;
    /** Odoo API key */
    apiKey?: string;
};

export type ERPDocument = {
    id: string;
    docType: string;
    fields: Record<string, unknown>;
    vendor: ERPVendor;
    rawResponse?: unknown;
};

export type ERPQuery = {
    docType: string;
    filters?: Record<string, unknown>;
    limit?: number;
    fields?: string[];
};

export type ERPWritePayload = {
    docType: string;
    fields: Record<string, unknown>;
};

export type ERPResult<T> = {
    success: boolean;
    data?: T;
    error?: string;
    vendor: ERPVendor;
};

export type CustomerERPConfig = {
    customerId: string;
    config: ERPConfig;
};
