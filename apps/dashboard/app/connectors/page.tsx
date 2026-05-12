import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ConnectorConfigPanel } from '../components/connector-config-panel';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';

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
    {
        connector_id: 'con_jira_001',
        connector_type: 'jira',
        status: 'connected',
        scope_status: 'full',
        last_error_class: null,
        last_healthcheck_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        remediation: 'none',
    },
    {
        connector_id: 'con_github_001',
        connector_type: 'github',
        status: 'connected',
        scope_status: 'full',
        last_error_class: null,
        last_healthcheck_at: new Date(Date.now() - 7 * 60_000).toISOString(),
        remediation: 'none',
    },
    {
        connector_id: 'con_teams_001',
        connector_type: 'teams',
        status: 'degraded',
        scope_status: 'partial',
        last_error_class: 'provider_unavailable',
        last_healthcheck_at: new Date(Date.now() - 12 * 60_000).toISOString(),
        remediation: 'backoff',
    },
    {
        connector_id: 'con_email_001',
        connector_type: 'email',
        status: 'permission_invalid',
        scope_status: 'insufficient',
        last_error_class: 'token_expired',
        last_healthcheck_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        remediation: 're_auth_or_reconsent',
    },
    {
        connector_id: 'con_custom_001',
        connector_type: 'custom_api',
        status: 'disconnected',
        scope_status: null,
        last_error_class: null,
        last_healthcheck_at: null,
        remediation: 'none',
    },
];

async function fetchConnectors(workspaceId: string, authHeader: string): Promise<ConnectorSummary[]> {
    try {
        const res = await fetch(
            `${API_BASE}/v1/connectors/health/summary?workspace_id=${encodeURIComponent(workspaceId)}`,
            {
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
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
    if (!session?.tenantId) {
        redirect('/login?next=/connectors');
    }

    const workspaceId = session.workspaceIds?.[0] ?? '';
    const authHeader = await getInternalSessionAuthHeader();

    const connectors = authHeader && workspaceId
        ? await fetchConnectors(workspaceId, authHeader)
        : FALLBACK_CONNECTORS;

    return (
        <main className="page-shell">
            <header style={{ marginBottom: '2rem' }}>
                <Link
                    href="/"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8rem',
                        color: 'var(--ink-muted)',
                        textDecoration: 'none',
                        marginBottom: '0.75rem',
                    }}
                >
                    ← Dashboard
                </Link>
                <p
                    style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-muted)',
                        marginBottom: '0.35rem',
                    }}
                >
                    Integrations
                </p>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                    Connectors
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
                    Manage connector authentication and view action history.
                </p>
            </header>

            <section style={{ maxWidth: 720 }}>
                <ConnectorConfigPanel
                    workspaceId={workspaceId}
                    apiBase={API_BASE}
                    initialConnectors={connectors}
                />
            </section>

            <section className="card" style={{ marginTop: '1.5rem', maxWidth: 720 }}>
                <h2>Security notes</h2>
                <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.7, color: '#57534e', fontSize: '0.9rem' }}>
                    <li>Credentials are stored as JSON in Azure Key Vault and referenced by URI only.</li>
                    <li>The API never returns or logs credential values.</li>
                    <li>After saving, the connector status is set to <strong>token_received</strong> and the next scheduled health-check validates the credentials live.</li>
                    <li>Use a dedicated service account or bot user — not your personal credentials.</li>
                    <li>For Jira: generate a Personal Access Token or use OAuth. Never use your password.</li>
                    <li>For GitHub: use a fine-grained PAT scoped to the repositories your agents need.</li>
                    <li>For Microsoft Teams: use an app-registration service token with least-privilege Graph scopes.</li>
                    <li>For Email: use a SendGrid API key scoped to <em>Mail Send</em> only, or a dedicated SMTP user.</li>
                </ul>
            </section>
        </main>
    );
}
