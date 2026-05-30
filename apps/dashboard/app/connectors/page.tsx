import { redirect } from 'next/navigation';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import ConnectorsHubClient from './connectors-hub-client';

type ConnectorSummary = {
    connector_id: string;
    connector_type: 'jira' | 'teams' | 'github' | 'email' | 'custom_api';
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_healthcheck_at: string | null;
    remediation: string;
};

const API_BASE = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

const FALLBACK_CONNECTORS: ConnectorSummary[] = [
    { connector_id: 'con_jira_001',    connector_type: 'jira',       status: 'connected',    scope_status: 'full', last_error_class: null, last_healthcheck_at: new Date(Date.now() - 5 * 60_000).toISOString(), remediation: 'none' },
    { connector_id: 'con_github_001',  connector_type: 'github',     status: 'connected',    scope_status: 'full', last_error_class: null, last_healthcheck_at: new Date(Date.now() - 3 * 60_000).toISOString(), remediation: 'none' },
    { connector_id: 'con_teams_001',   connector_type: 'teams',      status: 'disconnected', scope_status: null,   last_error_class: null, last_healthcheck_at: null, remediation: 'none' },
    { connector_id: 'con_custom_001',  connector_type: 'custom_api', status: 'disconnected', scope_status: null,   last_error_class: null, last_healthcheck_at: null, remediation: 'none' },
];

async function fetchConnectors(workspaceId: string, authHeader: string): Promise<ConnectorSummary[]> {
    try {
        const res = await fetch(
            `${API_BASE}/v1/connectors/health/summary?workspace_id=${encodeURIComponent(workspaceId)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        if (!res.ok) return FALLBACK_CONNECTORS;
        const data = await res.json() as { connectors?: ConnectorSummary[] };
        return data.connectors ?? FALLBACK_CONNECTORS;
    } catch {
        return FALLBACK_CONNECTORS;
    }
}

export default async function ConnectorsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/connectors');

    const workspaceId = session.workspaceIds?.[0] ?? '';
    const authHeader  = await getInternalSessionAuthHeader();

    const connectors = authHeader && workspaceId
        ? await fetchConnectors(workspaceId, authHeader)
        : FALLBACK_CONNECTORS;

    return (
        <ConnectorsHubClient
            workspaceId={workspaceId}
            tenantId={session.tenantId}
            apiBase={API_BASE}
            initialConnectors={connectors}
        />
    );
}
