// ============================================================================
// OAUTH CONNECTOR STATUS CONTRACTS
// Frozen Sprint 11 — connector health summary and token retrieval shapes
// ============================================================================

export type OAuthConnectorStatus =
    | 'auth_initiated'
    | 'token_received'
    | 'connected'
    | 'consent_pending'
    | 'token_expired'
    | 'degraded'
    | 'revoked'
    | 'disconnected'
    | 'not_configured'
    | 'permission_invalid';

export type OAuthConnectorType = 'jira' | 'teams' | 'github' | 'email';

export interface OAuthConnectorStatusRecord {
    connector_id: string;
    connector_type: OAuthConnectorType | string;
    tenant_id: string;
    workspace_id: string;
    status: OAuthConnectorStatus | string;
    scope_status: 'full' | 'partial' | 'insufficient' | null;
    token_expires_at: string | null;
    last_refresh_at: string | null;
    last_error_class: string | null;
    is_connected: boolean;
}

export interface ConnectorHealthSummaryResponse {
    connectors: OAuthConnectorStatusRecord[];
}

export interface ConnectorTokenResponse {
    connector_id: string;
    connector_type: string;
    credentials: Record<string, string>;
    token_expires_at: string | null;
}
