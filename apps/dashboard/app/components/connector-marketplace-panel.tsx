'use client';

import { useState } from 'react';

type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'unconfigured';

type ConnectorEntry = {
    id: string;
    name: string;
    description: string;
    category: 'communication' | 'project_management' | 'monitoring' | 'documentation' | 'vcs' | 'ci_cd' | 'testing';
    requiredEnvVars: string[];
    docs_url: string;
    status: ConnectorStatus;
    latency_ms?: number;
    last_checked?: string;
    /** Only show this connector when the workspace has this agent role active. */
    requiredRole?: string;
};

const CONNECTOR_CATALOG: ConnectorEntry[] = [
    {
        id: 'slack',
        name: 'Slack',
        description: 'Bidirectional messaging: post alerts, receive commands, manage incident channels.',
        category: 'communication',
        requiredEnvVars: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
        docs_url: 'https://api.slack.com/authentication/token-types',
        status: 'unconfigured',
    },
    {
        id: 'github',
        name: 'GitHub',
        description: 'Full GitHub integration: issues, PRs, commits, workflow runs, and webhooks.',
        category: 'vcs',
        requiredEnvVars: ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'],
        docs_url: 'https://docs.github.com/en/rest',
        status: 'unconfigured',
    },
    {
        id: 'linear',
        name: 'Linear',
        description: 'Issue tracking: create, update, and triage Linear issues from agent context.',
        category: 'project_management',
        requiredEnvVars: ['LINEAR_API_KEY', 'LINEAR_TEAM_ID'],
        docs_url: 'https://developers.linear.app/docs',
        status: 'unconfigured',
    },
    {
        id: 'jira',
        name: 'Jira',
        description: 'Atlassian Jira issue management and sprint planning integration.',
        category: 'project_management',
        requiredEnvVars: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
        docs_url: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
        status: 'unconfigured',
    },
    {
        id: 'pagerduty',
        name: 'PagerDuty',
        description: 'Incident management: trigger, acknowledge, and resolve PagerDuty incidents.',
        category: 'monitoring',
        requiredEnvVars: ['PAGERDUTY_API_KEY', 'PAGERDUTY_SERVICE_ID'],
        docs_url: 'https://developer.pagerduty.com',
        status: 'unconfigured',
    },
    {
        id: 'sentry',
        name: 'Sentry',
        description: 'Error tracking: query issues, resolve errors, manage releases and alerts.',
        category: 'monitoring',
        requiredEnvVars: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
        docs_url: 'https://docs.sentry.io/api/',
        status: 'unconfigured',
    },
    {
        id: 'azure-devops',
        name: 'Azure DevOps',
        description: 'Work items, pipelines, and board management via ADO REST APIs.',
        category: 'ci_cd',
        requiredEnvVars: ['ADO_PAT', 'ADO_ORGANIZATION', 'ADO_PROJECT'],
        docs_url: 'https://docs.microsoft.com/en-us/rest/api/azure/devops',
        status: 'unconfigured',
    },
    {
        id: 'notion',
        name: 'Notion',
        description: 'Knowledge base: create, update, and search Notion pages and databases.',
        category: 'documentation',
        requiredEnvVars: ['NOTION_API_KEY'],
        docs_url: 'https://developers.notion.com',
        status: 'unconfigured',
    },
    {
        id: 'confluence',
        name: 'Confluence',
        description: 'Atlassian Confluence: read/write documentation spaces and pages.',
        category: 'documentation',
        requiredEnvVars: ['CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'],
        docs_url: 'https://developer.atlassian.com/cloud/confluence/rest/v2/',
        status: 'unconfigured',
    },
    // ── Testing connectors (Tester agent only) ──────────────────────────────
    {
        id: 'selenium',
        name: 'Selenium / WebDriver',
        description: 'Browser automation across Chrome, Firefox, and Safari via WebDriver protocol.',
        category: 'testing',
        requiredEnvVars: ['SELENIUM_REMOTE_URL'],
        docs_url: 'https://www.selenium.dev/documentation/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'playwright',
        name: 'Playwright',
        description: 'End-to-end browser testing with Chromium, Firefox, and WebKit.',
        category: 'testing',
        requiredEnvVars: ['PLAYWRIGHT_BASE_URL'],
        docs_url: 'https://playwright.dev/docs/intro',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'cypress',
        name: 'Cypress',
        description: 'JavaScript end-to-end and component testing framework for web apps.',
        category: 'testing',
        requiredEnvVars: ['CYPRESS_BASE_URL'],
        docs_url: 'https://docs.cypress.io/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'appium',
        name: 'Appium',
        description: 'Mobile automation for iOS and Android native, hybrid, and web apps.',
        category: 'testing',
        requiredEnvVars: ['APPIUM_SERVER_URL', 'APPIUM_PLATFORM'],
        docs_url: 'https://appium.io/docs/en/latest/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'k6',
        name: 'k6 / Artillery',
        description: 'Performance and load testing — p50/p95/p99 latency benchmarks against any backend stack.',
        category: 'testing',
        requiredEnvVars: ['K6_CLOUD_TOKEN'],
        docs_url: 'https://grafana.com/docs/k6/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'jmeter',
        name: 'JMeter',
        description: 'Apache JMeter load testing for web applications and services.',
        category: 'testing',
        requiredEnvVars: ['JMETER_HOME'],
        docs_url: 'https://jmeter.apache.org/usermanual/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'postman',
        name: 'Postman / Newman',
        description: 'API testing via Newman CLI — runs Postman collections and publishes per-request failure reports.',
        category: 'testing',
        requiredEnvVars: ['POSTMAN_API_KEY'],
        docs_url: 'https://learning.postman.com/docs/collections/using-newman-cli/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'soapui',
        name: 'SoapUI',
        description: 'SOAP, REST, and GraphQL API contract testing.',
        category: 'testing',
        requiredEnvVars: ['SOAPUI_HOME'],
        docs_url: 'https://www.soapui.org/docs/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'testrail',
        name: 'TestRail',
        description: 'Test case management: sync runs, publish results, and link defects automatically.',
        category: 'testing',
        requiredEnvVars: ['TESTRAIL_URL', 'TESTRAIL_USER', 'TESTRAIL_API_KEY'],
        docs_url: 'https://support.testrail.com/hc/en-us/articles/7077792415124',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'zephyr',
        name: 'Jira Zephyr',
        description: 'Zephyr Scale test management inside Jira — sync test cases and run results.',
        category: 'testing',
        requiredEnvVars: ['ZEPHYR_TOKEN', 'ZEPHYR_BASE_URL'],
        docs_url: 'https://support.smartbear.com/zephyr-scale-cloud/docs/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'owasp-zap',
        name: 'OWASP ZAP',
        description: 'Dynamic Application Security Testing (DAST) — spider + active scan against staging environments.',
        category: 'testing',
        requiredEnvVars: ['ZAP_API_KEY', 'ZAP_TARGET_URL'],
        docs_url: 'https://www.zaproxy.org/docs/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'burpsuite',
        name: 'Burp Suite',
        description: 'Security testing and vulnerability scanning for web applications.',
        category: 'testing',
        requiredEnvVars: ['BURP_API_KEY', 'BURP_BASE_URL'],
        docs_url: 'https://portswigger.net/burp/documentation/desktop',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'jenkins-ci',
        name: 'Jenkins',
        description: 'CI pipeline integration — trigger builds, report test results, and gate deployments.',
        category: 'testing',
        requiredEnvVars: ['JENKINS_URL', 'JENKINS_USER', 'JENKINS_TOKEN'],
        docs_url: 'https://www.jenkins.io/doc/book/using/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
    {
        id: 'circleci',
        name: 'CircleCI',
        description: 'CircleCI pipeline integration — trigger workflows and publish test run statuses.',
        category: 'testing',
        requiredEnvVars: ['CIRCLECI_TOKEN', 'CIRCLECI_PROJECT_SLUG'],
        docs_url: 'https://circleci.com/docs/api/v2/',
        status: 'unconfigured',
        requiredRole: 'tester',
    },
];

const CATEGORY_LABELS: Record<ConnectorEntry['category'], string> = {
    vcs: 'Version Control',
    communication: 'Communication',
    project_management: 'Project Management',
    monitoring: 'Monitoring',
    documentation: 'Documentation',
    ci_cd: 'CI / CD',
    testing: 'Testing & QA',
};

const STATUS_COLOR: Record<ConnectorStatus, string> = {
    connected: 'var(--ok)',
    disconnected: 'var(--warn)',
    error: 'var(--danger)',
    unconfigured: 'var(--ink-muted)',
};

// ── Connector field map (rich config for the install modal) ──────────────────

type FieldDef = { key: string; label: string; type: 'text' | 'password' | 'url'; placeholder?: string; hint?: string; required: boolean };

const CONNECTOR_FIELDS: Record<string, FieldDef[]> = {
    slack:       [{ key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-…', hint: 'Slack API → Your App → OAuth & Permissions', required: true }, { key: 'defaultChannel', label: 'Default Channel', type: 'text', placeholder: '#general', required: false }],
    github:      [{ key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_…', hint: 'GitHub Settings → Developer settings → PAT', required: true }, { key: 'owner', label: 'Owner / Org', type: 'text', placeholder: 'your-org', required: false }],
    jira:        [{ key: 'host', label: 'Jira Host', type: 'url', placeholder: 'https://yourorg.atlassian.net', required: true }, { key: 'email', label: 'Account Email', type: 'text', required: true }, { key: 'apiToken', label: 'API Token', type: 'password', hint: 'id.atlassian.com → Security → API tokens', required: true }],
    linear:      [{ key: 'apiKey', label: 'API Key', type: 'password', hint: 'Linear → Settings → API → Personal API keys', required: true }],
    pagerduty:   [{ key: 'apiKey', label: 'API Key', type: 'password', hint: 'PagerDuty → Integrations → API Access Keys', required: true }, { key: 'serviceId', label: 'Default Service ID', type: 'text', required: false }],
    sentry:      [{ key: 'token', label: 'Auth Token', type: 'password', hint: 'Sentry → Settings → Auth Tokens', required: true }, { key: 'organization', label: 'Organization Slug', type: 'text', required: true }],
    'azure-devops': [{ key: 'token', label: 'Personal Access Token', type: 'password', required: true }, { key: 'organization', label: 'Organization', type: 'text', required: true }, { key: 'project', label: 'Default Project', type: 'text', required: false }],
    notion:      [{ key: 'apiKey', label: 'Integration Token', type: 'password', hint: 'notion.so/my-integrations', required: true }],
    confluence:  [{ key: 'host', label: 'Confluence Host', type: 'url', placeholder: 'https://yourorg.atlassian.net/wiki', required: true }, { key: 'email', label: 'Account Email', type: 'text', required: true }, { key: 'apiToken', label: 'API Token', type: 'password', required: true }],
};

// ── Install Modal ─────────────────────────────────────────────────────────────

function InstallModal({ connector, onClose, onInstalled }: {
    connector: ConnectorEntry;
    onClose: () => void;
    onInstalled: () => void;
}) {
    const fields = CONNECTOR_FIELDS[connector.id] ?? connector.requiredEnvVars.map(k => ({
        key: k.toLowerCase(), label: k, type: 'text' as const, required: true,
    }));
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const inputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8,
        padding: '8px 12px', fontSize: 13, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
    };

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/connectors/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connector_type: connector.id, config: values, display_name: connector.name }),
            });
            const body = (await res.json()) as { error?: string; message?: string; authorization_url?: string };
            if (!res.ok) { setError(body.message ?? body.error ?? 'Failed to install.'); return; }
            if (body.authorization_url) { window.location.href = body.authorization_url; return; }
            setSuccess(true);
            setTimeout(() => { onInstalled(); onClose(); }, 1200);
        } catch { setError('Network error. Please try again.'); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}>
                {/* Header */}
                <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Install Connector</div>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{connector.name}</h2>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{CATEGORY_LABELS[connector.category]}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* What agents can do */}
                <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Your agents will be able to</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(connector as ConnectorEntry & { supportedActions?: string[] }).supportedActions?.slice(0, 6).map((a: string) => (
                            <span key={a} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--card)', border: '1px solid var(--line)', fontSize: 10, fontFamily: 'monospace', color: 'var(--ink-muted)' }}>{a}</span>
                        )) ?? connector.requiredEnvVars.slice(0, 4).map(e => (
                            <span key={e} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--card)', border: '1px solid var(--line)', fontSize: 10, fontFamily: 'monospace', color: 'var(--ink-muted)' }}>{e}</span>
                        ))}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={submit} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {fields.map(field => (
                        <div key={field.key}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 5 }}>
                                {field.label} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                            </label>
                            <input
                                type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                                value={values[field.key] ?? ''}
                                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                                style={inputStyle}
                                placeholder={field.placeholder}
                                required={field.required}
                            />
                            {field.hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>{field.hint}</p>}
                        </div>
                    ))}

                    {error && <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg, rgba(196,22,28,0.08))', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12 }}>⚠ {error}</div>}
                    {success && <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--ok-bg, rgba(26,122,74,0.08))', border: '1px solid var(--ok)', color: 'var(--ok)', fontSize: 12 }}>✓ {connector.name} installed successfully!</div>}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={saving || success} style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Installing…' : success ? '✓ Done' : `Install ${connector.name}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

type ConnectorMarketplacePanelProps = {
    /** Role keys for the active agents in this workspace, e.g. ['developer', 'tester']. */
    agentRoles?: string[];
};

export function ConnectorMarketplacePanel({ agentRoles = [] }: ConnectorMarketplacePanelProps) {
    // Only include connectors that are available for the current agent roles.
    const allowedCatalog = CONNECTOR_CATALOG.filter(
        (c) => !c.requiredRole || agentRoles.includes(c.requiredRole),
    );
    const hasTesterRole = agentRoles.includes('tester');

    const [connectors, setConnectors] = useState<ConnectorEntry[]>(allowedCatalog);
    const [filter, setFilter] = useState<ConnectorEntry['category'] | 'all'>('all');
    const [testing, setTesting] = useState<Record<string, boolean>>({});
    const [selected, setSelected] = useState<ConnectorEntry | null>(null);
    const [installing, setInstalling] = useState<ConnectorEntry | null>(null);
    const [error, setError] = useState<string | null>(null);

    const botId = 'default';

    const visible = filter === 'all' ? connectors : connectors.filter((c) => c.category === filter);

    const testConnector = async (connector: ConnectorEntry) => {
        setTesting((t) => ({ ...t, [connector.id]: true }));
        setError(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/connectors/${connector.id}/health`, {
                method: 'GET',
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { reachable: boolean; latency_ms: number };
            setConnectors((prev) =>
                prev.map((c) =>
                    c.id === connector.id
                        ? {
                            ...c,
                            status: data.reachable ? 'connected' : 'error',
                            latency_ms: data.latency_ms,
                            last_checked: new Date().toISOString(),
                        }
                        : c,
                ),
            );
        } catch {
            setConnectors((prev) =>
                prev.map((c) => (c.id === connector.id ? { ...c, status: 'error' } : c)),
            );
        } finally {
            setTesting((t) => ({ ...t, [connector.id]: false }));
        }
    };

    const testAll = async () => {
        for (const c of connectors) {
            await testConnector(c);
        }
    };

    const categories = Array.from(new Set(CONNECTOR_CATALOG.map((c) => c.category)));

    const chipStyle = (active: boolean): React.CSSProperties => ({
        padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: active ? 'none' : '1px solid var(--line)',
        background: active ? 'var(--accent)' : 'var(--card)',
        color: active ? '#fff' : 'var(--ink-muted)',
    });

    const secondaryBtnStyle: React.CSSProperties = {
        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink-soft)', textDecoration: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 4, color: 'var(--ink)' }}>
            {installing && (
                <InstallModal
                    connector={installing}
                    onClose={() => setInstalling(null)}
                    onInstalled={() => {
                        setConnectors(prev => prev.map(c =>
                            c.id === installing.id ? { ...c, status: 'connected' as const } : c
                        ));
                        setInstalling(null);
                    }}
                />
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Connector Marketplace</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>
                        Browse, configure, and health-check external integrations
                    </p>
                </div>
                <button
                    onClick={testAll}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                    Test All
                </button>
            </div>

            {error && (
                <div style={{ padding: 12, background: 'var(--danger-bg, rgba(196,22,28,0.08))', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setFilter('all')} style={chipStyle(filter === 'all')}>
                    All ({connectors.length})
                </button>
                {categories.map((cat) => (
                    <button key={cat} onClick={() => setFilter(cat)} style={chipStyle(filter === cat)}>
                        {CATEGORY_LABELS[cat]} ({connectors.filter((c) => c.category === cat).length})
                    </button>
                ))}
            </div>

            {/* Connector grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {visible.map((connector) => (
                    <div
                        key={connector.id}
                        onClick={() => setSelected(connector)}
                        style={{
                            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
                            padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'border-color 0.15s',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[connector.status], flexShrink: 0 }} />
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{connector.name}</h3>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                    {CATEGORY_LABELS[connector.category]}
                                </span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[connector.status] }}>
                                {connector.status}
                            </span>
                        </div>

                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{connector.description}</p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {connector.requiredEnvVars.map((env) => (
                                <span key={env} style={{ padding: '2px 6px', background: 'var(--bg)', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', color: 'var(--ink-soft)' }}>
                                    {env}
                                </span>
                            ))}
                        </div>

                        {connector.latency_ms !== undefined && (
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-muted)' }}>
                                Last ping: {connector.latency_ms}ms ·{' '}
                                {connector.last_checked ? new Date(connector.last_checked).toLocaleTimeString() : '—'}
                            </p>
                        )}

                        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                            {connector.status !== 'connected' ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setInstalling(connector); }}
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    + Install
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setInstalling(connector); }}
                                    style={{ ...secondaryBtnStyle, flex: 1 }}
                                >
                                    Reconfigure
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); testConnector(connector); }}
                                disabled={testing[connector.id]}
                                style={{ ...secondaryBtnStyle, opacity: testing[connector.id] ? 0.5 : 1 }}
                            >
                                {testing[connector.id] ? '…' : 'Test'}
                            </button>
                            <a
                                href={connector.docs_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={secondaryBtnStyle}
                            >
                                Docs ↗
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            {/* Testing connectors locked notice */}
            {!hasTesterRole && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg)', padding: 14 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="var(--ink-muted)" style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }}>
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Testing &amp; QA connectors are locked</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
                            14 integrations — Selenium, Playwright, Cypress, Appium, k6, JMeter, Postman, SoapUI, TestRail, Zephyr, OWASP ZAP, Burp Suite, Jenkins, CircleCI — are only available after the Tester agent is enabled for this workspace.
                        </p>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {selected && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
                        onClick={() => setSelected(null)}
                    />
                    <div style={{ position: 'relative', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{selected.name}</h2>
                            <button
                                onClick={() => setSelected(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                            >
                                ×
                            </button>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>{selected.description}</p>
                        <div>
                            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Required Environment Variables
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {selected.requiredEnvVars.map((env) => (
                                    <div key={env} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--ink)' }}>{env}</span>
                                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>string</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => {
                                    testConnector(selected);
                                    setSelected(null);
                                }}
                                style={{ flex: 1, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                                Run Health Check
                            </button>
                            <a
                                href={selected.docs_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                            >
                                View Docs ↗
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
