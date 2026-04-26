'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectorType = 'jira' | 'teams' | 'github' | 'email' | 'custom_api';

type ConnectorSummary = {
    connector_id: string;
    connector_type: ConnectorType;
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_healthcheck_at: string | null;
    remediation: string;
};

type FieldDef = {
    key: string;
    label: string;
    type: 'text' | 'url' | 'number' | 'password' | 'select';
    options?: string[];
    placeholder?: string;
    required: boolean;
    dependsOn?: { field: string; value: string };
};

type Props = {
    workspaceId: string;
    apiBase: string;
    initialConnectors: ConnectorSummary[];
};

const isOAuthConnector = (connectorType: ConnectorType): boolean => {
    return connectorType === 'jira' || connectorType === 'teams' || connectorType === 'github';
};

// ---------------------------------------------------------------------------
// Per-connector field definitions
// ---------------------------------------------------------------------------

const JIRA_FIELDS: FieldDef[] = [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'OAuth token or Personal Access Token', required: true },
    { key: 'base_url', label: 'Jira Base URL', type: 'url', placeholder: 'https://yoursite.atlassian.net', required: true },
];

const TEAMS_FIELDS: FieldDef[] = [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Microsoft Graph Bearer token', required: true },
];

const GITHUB_FIELDS: FieldDef[] = [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'OAuth token or Personal Access Token', required: true },
];

const EMAIL_FIELDS: FieldDef[] = [
    {
        key: 'type',
        label: 'Email Provider',
        type: 'select',
        options: ['sendgrid', 'smtp'],
        required: true,
    },
    { key: 'from_address', label: 'From Address', type: 'text', placeholder: 'bot@yourdomain.com', required: true },
    // SendGrid fields
    { key: 'api_key', label: 'SendGrid API Key', type: 'password', placeholder: 'SG.xxxxx', required: true, dependsOn: { field: 'type', value: 'sendgrid' } },
    // SMTP fields
    { key: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.yourdomain.com', required: true, dependsOn: { field: 'type', value: 'smtp' } },
    { key: 'smtp_port', label: 'SMTP Port', type: 'number', placeholder: '587', required: true, dependsOn: { field: 'type', value: 'smtp' } },
    { key: 'smtp_user', label: 'SMTP Username', type: 'text', placeholder: 'bot@yourdomain.com', required: true, dependsOn: { field: 'type', value: 'smtp' } },
    { key: 'smtp_pass', label: 'SMTP Password', type: 'password', placeholder: '', required: true, dependsOn: { field: 'type', value: 'smtp' } },
];

const CUSTOM_API_FIELDS: FieldDef[] = [
    { key: 'base_url', label: 'API Base URL', type: 'url', placeholder: 'https://api.yourservice.com', required: true },
    {
        key: 'auth_type',
        label: 'Authentication Type',
        type: 'select',
        options: ['none', 'api_key', 'bearer_token', 'basic_auth'],
        required: false,
    },
    // API Key fields
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Your API key value', required: true, dependsOn: { field: 'auth_type', value: 'api_key' } },
    { key: 'api_key_header', label: 'API Key Header Name', type: 'text', placeholder: 'X-API-Key', required: false, dependsOn: { field: 'auth_type', value: 'api_key' } },
    // Bearer token fields
    { key: 'bearer_token', label: 'Bearer Token', type: 'password', placeholder: 'Your bearer token', required: true, dependsOn: { field: 'auth_type', value: 'bearer_token' } },
    // Basic auth fields
    { key: 'basic_user', label: 'Username', type: 'text', placeholder: 'API username', required: true, dependsOn: { field: 'auth_type', value: 'basic_auth' } },
    { key: 'basic_pass', label: 'Password', type: 'password', placeholder: 'API password', required: true, dependsOn: { field: 'auth_type', value: 'basic_auth' } },
];

const FIELDS_BY_TYPE: Record<ConnectorType, FieldDef[]> = {
    jira: JIRA_FIELDS,
    teams: TEAMS_FIELDS,
    github: GITHUB_FIELDS,
    email: EMAIL_FIELDS,
    custom_api: CUSTOM_API_FIELDS,
};

const DISPLAY_NAMES: Record<ConnectorType, string> = {
    jira: 'Jira',
    teams: 'Microsoft Teams',
    github: 'GitHub',
    email: 'Email',
    custom_api: 'Custom API',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusBadgeClass = (status: string): string => {
    if (status === 'connected') return 'badge ok';
    if (status === 'token_received' || status === 'validation_in_progress') return 'badge warn';
    if (status === 'degraded' || status === 'token_expired' || status === 'permission_invalid') return 'badge high';
    if (status === 'revoked' || status === 'disconnected') return 'badge neutral';
    return 'badge neutral';
};

const remediationHint = (connector: ConnectorSummary): string | null => {
    if (connector.remediation === 're_auth_or_reconsent') {
        return 'Re-enter credentials or reconnect via OAuth to restore access.';
    }
    if (connector.remediation === 'backoff') {
        return 'Provider is rate-limited or temporarily unavailable. Update credentials if the issue persists.';
    }
    return null;
};

// ---------------------------------------------------------------------------
// Credential form component
// ---------------------------------------------------------------------------

function CredentialForm({
    connector,
    apiBase,
    onSaved,
    onCancel,
}: {
    connector: ConnectorSummary;
    apiBase: string;
    onSaved: (updated: ConnectorSummary) => void;
    onCancel: () => void;
}) {
    const fields = FIELDS_BY_TYPE[connector.connector_type] ?? [];
    const [values, setValues] = useState<Record<string, string>>(() => {
        // Pre-populate the type selector for email to 'sendgrid'
        if (connector.connector_type === 'email') {
            return { type: 'sendgrid' } as Record<string, string>;
        }
        // Pre-populate auth_type for custom_api to 'none'
        if (connector.connector_type === 'custom_api') {
            return { auth_type: 'none' } as Record<string, string>;
        }
        return {} as Record<string, string>;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const visibleFields = fields.filter((f) => {
        if (!f.dependsOn) return true;
        return values[f.dependsOn.field] === f.dependsOn.value;
    });

    const handleChange = (key: string, value: string) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        // Build credential object, coercing smtp_port to number
        const credentials: Record<string, unknown> = { ...values };
        if (connector.connector_type === 'email' && values['smtp_port']) {
            credentials['smtp_port'] = Number(values['smtp_port']);
        }

        try {
            const response = await fetch(
                `${apiBase}/v1/connectors/${connector.connector_id}/credentials`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ credentials }),
                },
            );

            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { message?: string };
                setError(body.message ?? `Server error: ${response.status}`);
                return;
            }

            onSaved({
                ...connector,
                status: 'token_received',
                last_error_class: null,
                remediation: 'none',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error — check your connection.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            {visibleFields.map((field) => (
                <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 600 }}>
                        {field.label}
                        {field.required && <span style={{ color: '#dc2626' }}> *</span>}
                    </span>
                    {field.type === 'select' ? (
                        <select
                            value={values[field.key] ?? ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            required={field.required}
                            style={{ padding: '0.4rem 0.5rem', borderRadius: 4, border: '1px solid #d6d3d1', background: 'white' }}
                        >
                            {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type={field.type}
                            value={values[field.key] ?? ''}
                            placeholder={field.placeholder}
                            required={field.required}
                            autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            style={{ padding: '0.4rem 0.5rem', borderRadius: 4, border: '1px solid #d6d3d1', fontFamily: field.type === 'password' ? 'monospace' : 'inherit' }}
                        />
                    )}
                </label>
            ))}

            {error && (
                <p role="alert" style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>
                    {error}
                </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    style={{ padding: '0.4rem 1rem', borderRadius: 4, border: '1px solid #d6d3d1', background: 'white', cursor: 'pointer' }}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    style={{ padding: '0.4rem 1rem', borderRadius: 4, border: 'none', background: '#0f766e', color: 'white', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                    {saving ? 'Saving…' : 'Save credentials'}
                </button>
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ConnectorConfigPanel({ workspaceId, apiBase, initialConnectors }: Props) {
    const [connectors, setConnectors] = useState<ConnectorSummary[]>(initialConnectors);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [oauthPendingId, setOauthPendingId] = useState<string | null>(null);
    const [oauthErrorId, setOauthErrorId] = useState<string | null>(null);
    const [revokePendingId, setRevokePendingId] = useState<string | null>(null);
    const [revokeErrorId, setRevokeErrorId] = useState<string | null>(null);
    const [healthRunning, setHealthRunning] = useState(false);
    const [healthError, setHealthError] = useState<string | null>(null);

    const handleSaved = (updated: ConnectorSummary) => {
        setConnectors((prev) =>
            prev.map((c) => (c.connector_id === updated.connector_id ? updated : c)),
        );
        setEditingId(null);
        setSavedId(updated.connector_id);
        setTimeout(() => setSavedId(null), 4000);
    };

    const handleOAuthConnect = async (connector: ConnectorSummary) => {
        setOauthPendingId(connector.connector_id);
        setOauthErrorId(null);
        try {
            const response = await fetch(`${apiBase}/v1/connectors/oauth/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    connector_type: connector.connector_type,
                    workspace_id: workspaceId,
                }),
            });

            if (!response.ok) {
                setOauthErrorId(connector.connector_id);
                return;
            }

            const body = (await response.json()) as { authorization_url?: string };
            if (!body.authorization_url) {
                setOauthErrorId(connector.connector_id);
                return;
            }

            window.location.assign(body.authorization_url);
        } catch {
            setOauthErrorId(connector.connector_id);
        } finally {
            setOauthPendingId(null);
        }
    };

    const handleDisconnect = async (connector: ConnectorSummary) => {
        setRevokePendingId(connector.connector_id);
        setRevokeErrorId(null);
        try {
            const response = await fetch(`${apiBase}/v1/connectors/oauth/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    connector_type: connector.connector_type,
                    workspace_id: workspaceId,
                }),
            });

            if (!response.ok) {
                setRevokeErrorId(connector.connector_id);
                return;
            }

            setConnectors((prev) => prev.map((item) => (
                item.connector_id === connector.connector_id
                    ? {
                        ...item,
                        status: 'revoked',
                        scope_status: null,
                        last_error_class: null,
                        remediation: 'none',
                    }
                    : item
            )));
        } catch {
            setRevokeErrorId(connector.connector_id);
        } finally {
            setRevokePendingId(null);
        }
    };

    const handleRunHealthCheck = async () => {
        setHealthRunning(true);
        setHealthError(null);
        try {
            const response = await fetch(`${apiBase}/v1/connectors/health/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ workspace_id: workspaceId }),
            });

            if (!response.ok) {
                setHealthError('Could not run health check. Please retry.');
                return;
            }

            const body = (await response.json()) as {
                results?: Array<{
                    connector_id: string;
                    status_after: string;
                    remediation: string;
                }>;
            };

            if (!body.results) {
                setHealthError('Health check returned unexpected payload.');
                return;
            }

            const updates = new Map(body.results.map((result) => [result.connector_id, result]));
            setConnectors((prev) => prev.map((connector) => {
                const update = updates.get(connector.connector_id);
                if (!update) {
                    return connector;
                }
                const remediation =
                    update.remediation === 're_auth' || update.remediation === 'reconsent'
                        ? 're_auth_or_reconsent'
                        : update.remediation === 'backoff'
                            ? 'backoff'
                            : 'none';

                return {
                    ...connector,
                    status: update.status_after,
                    remediation,
                    last_healthcheck_at: new Date().toISOString(),
                    last_error_class:
                        update.status_after === 'degraded' && remediation === 'backoff'
                            ? 'provider_unavailable'
                            : update.status_after === 'permission_invalid' || update.status_after === 'consent_pending'
                                ? 'insufficient_scope'
                                : null,
                };
            }));
        } catch {
            setHealthError('Could not run health check. Please retry.');
        } finally {
            setHealthRunning(false);
        }
    };

    return (
        <article className="card" style={{ marginTop: '1.5rem' }}>
            <h2>Connector Credentials</h2>
            <p style={{ marginTop: 0, color: '#57534e', fontSize: '0.9rem' }}>
                Update the credentials used to connect to external tools. Credentials are stored securely in Azure Key Vault and never logged.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <button
                    onClick={() => void handleRunHealthCheck()}
                    disabled={healthRunning}
                    style={{
                        padding: '0.35rem 0.8rem',
                        borderRadius: 4,
                        border: '1px solid #0f766e',
                        background: '#f0fdfa',
                        color: '#0f766e',
                        cursor: healthRunning ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem',
                    }}
                >
                    {healthRunning ? 'Running health check…' : 'Run Health Check Now'}
                </button>
                {healthError && (
                    <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem' }}>
                        {healthError}
                    </p>
                )}
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {connectors.map((connector) => {
                    const isEditing = editingId === connector.connector_id;
                    const isSaved = savedId === connector.connector_id;
                    const hint = remediationHint(connector);

                    return (
                        <li
                            key={connector.connector_id}
                            style={{
                                border: '1px solid #e7e5e4',
                                borderRadius: 6,
                                padding: '1rem',
                                background: isSaved ? '#f0fdf4' : 'white',
                                transition: 'background 0.4s',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                    <strong style={{ fontSize: '1rem' }}>
                                        {DISPLAY_NAMES[connector.connector_type] ?? connector.connector_type}
                                    </strong>
                                    <span
                                        className={statusBadgeClass(connector.status)}
                                        style={{ marginLeft: '0.5rem', fontSize: '0.75rem', verticalAlign: 'middle' }}
                                    >
                                        {connector.status.replace(/_/g, ' ')}
                                    </span>
                                    {isSaved && (
                                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#16a34a', verticalAlign: 'middle' }}>
                                            ✓ Saved
                                        </span>
                                    )}
                                </div>

                                {!isEditing && (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {isOAuthConnector(connector.connector_type) && (
                                            <button
                                                onClick={() => void handleOAuthConnect(connector)}
                                                disabled={oauthPendingId === connector.connector_id}
                                                style={{
                                                    padding: '0.3rem 0.8rem',
                                                    borderRadius: 4,
                                                    border: '1px solid #0f766e',
                                                    background: '#0f766e',
                                                    color: 'white',
                                                    fontSize: '0.875rem',
                                                    cursor: oauthPendingId === connector.connector_id ? 'not-allowed' : 'pointer',
                                                    opacity: oauthPendingId === connector.connector_id ? 0.7 : 1,
                                                }}
                                            >
                                                {oauthPendingId === connector.connector_id ? 'Opening OAuth…' : 'Connect via OAuth'}
                                            </button>
                                        )}
                                        {isOAuthConnector(connector.connector_type) && (
                                            <button
                                                onClick={() => void handleDisconnect(connector)}
                                                disabled={revokePendingId === connector.connector_id}
                                                style={{
                                                    padding: '0.3rem 0.8rem',
                                                    borderRadius: 4,
                                                    border: '1px solid #dc2626',
                                                    background: 'white',
                                                    color: '#dc2626',
                                                    fontSize: '0.875rem',
                                                    cursor: revokePendingId === connector.connector_id ? 'not-allowed' : 'pointer',
                                                    opacity: revokePendingId === connector.connector_id ? 0.7 : 1,
                                                }}
                                            >
                                                {revokePendingId === connector.connector_id ? 'Disconnecting…' : 'Disconnect'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setEditingId(connector.connector_id)}
                                            style={{
                                                padding: '0.3rem 0.8rem',
                                                borderRadius: 4,
                                                border: '1px solid #d6d3d1',
                                                background: 'white',
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Update credentials
                                        </button>
                                    </div>
                                )}
                            </div>

                            {connector.last_healthcheck_at && !isEditing && (
                                <p style={{ margin: '0.35rem 0 0', color: '#78716c', fontSize: '0.8rem' }}>
                                    Last checked: {new Date(connector.last_healthcheck_at).toLocaleString()}
                                </p>
                            )}

                            {hint && !isEditing && (
                                <p role="alert" style={{ margin: '0.4rem 0 0', color: '#b45309', fontSize: '0.85rem' }}>
                                    ⚠ {hint}
                                </p>
                            )}

                            {oauthErrorId === connector.connector_id && !isEditing && (
                                <p role="alert" style={{ margin: '0.4rem 0 0', color: '#dc2626', fontSize: '0.85rem' }}>
                                    Could not initiate OAuth for this connector. Please try again.
                                </p>
                            )}

                            {revokeErrorId === connector.connector_id && !isEditing && (
                                <p role="alert" style={{ margin: '0.4rem 0 0', color: '#dc2626', fontSize: '0.85rem' }}>
                                    Could not disconnect this connector. Please retry.
                                </p>
                            )}

                            {isEditing && (
                                <CredentialForm
                                    connector={connector}
                                    apiBase={apiBase}
                                    onSaved={handleSaved}
                                    onCancel={() => setEditingId(null)}
                                />
                            )}
                        </li>
                    );
                })}
            </ul>

            {connectors.length === 0 && (
                <p style={{ color: '#78716c', fontSize: '0.9rem' }}>
                    No connectors configured for workspace {workspaceId}.
                </p>
            )}
        </article>
    );
}
