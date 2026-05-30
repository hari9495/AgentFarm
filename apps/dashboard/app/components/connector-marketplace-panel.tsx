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

const STATUS_COLORS: Record<ConnectorStatus, string> = {
    connected: 'text-green-400',
    disconnected: 'text-yellow-400',
    error: 'text-red-400',
    unconfigured: 'text-zinc-500',
};

const STATUS_DOT: Record<ConnectorStatus, string> = {
    connected: 'bg-green-400',
    disconnected: 'bg-yellow-400',
    error: 'bg-red-400',
    unconfigured: 'bg-zinc-600',
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

    const inputCls = 'w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 16, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Install Connector</div>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f4f4f5' }}>{connector.name}</h2>
                        <p style={{ margin: 0, fontSize: 12, color: '#71717a', marginTop: 2 }}>{CATEGORY_LABELS[connector.category]}</p>
                    </div>
                    <button onClick={onClose} style={{ background: '#27272a', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: '#71717a', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* What agents can do */}
                <div style={{ padding: '12px 20px', background: '#09090b', borderBottom: '1px solid #27272a' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Your agents will be able to</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(connector as ConnectorEntry & { supportedActions?: string[] }).supportedActions?.slice(0, 6).map((a: string) => (
                            <span key={a} style={{ padding: '2px 8px', borderRadius: 6, background: '#18181b', border: '1px solid #3f3f46', fontSize: 10, fontFamily: 'monospace', color: '#a1a1aa' }}>{a}</span>
                        )) ?? connector.requiredEnvVars.slice(0, 4).map(e => (
                            <span key={e} style={{ padding: '2px 8px', borderRadius: 6, background: '#18181b', border: '1px solid #3f3f46', fontSize: 10, fontFamily: 'monospace', color: '#a1a1aa' }}>{e}</span>
                        ))}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={submit} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {fields.map(field => (
                        <div key={field.key}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#a1a1aa', marginBottom: 5 }}>
                                {field.label} {field.required && <span style={{ color: '#f43f5e' }}>*</span>}
                            </label>
                            <input
                                type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                                value={values[field.key] ?? ''}
                                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                                className={inputCls}
                                placeholder={field.placeholder}
                                required={field.required}
                            />
                            {field.hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#52525b' }}>{field.hint}</p>}
                        </div>
                    ))}

                    {error && <div style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>⚠ {error}</div>}
                    {success && <div style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontSize: 12 }}>✓ {connector.name} installed successfully!</div>}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 9, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={saving || success} style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', background: saving || success ? '#1d4ed8' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
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

    return (
        <div className="flex flex-col gap-6 p-6 bg-zinc-900 min-h-screen text-zinc-100">
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Connector Marketplace</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        Browse, configure, and health-check external integrations
                    </p>
                </div>
                <button
                    onClick={testAll}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                >
                    Test All
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                    All ({connectors.length})
                </button>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === cat ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {CATEGORY_LABELS[cat]} ({connectors.filter((c) => c.category === cat).length})
                    </button>
                ))}
            </div>

            {/* Connector grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visible.map((connector) => (
                    <div
                        key={connector.id}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3 hover:border-zinc-500 transition-colors cursor-pointer"
                        onClick={() => setSelected(connector)}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[connector.status]}`}
                                    />
                                    <h3 className="font-semibold text-sm">{connector.name}</h3>
                                </div>
                                <span className="text-xs text-zinc-500 mt-0.5">
                                    {CATEGORY_LABELS[connector.category]}
                                </span>
                            </div>
                            <span className={`text-xs font-medium ${STATUS_COLORS[connector.status]}`}>
                                {connector.status}
                            </span>
                        </div>

                        <p className="text-xs text-zinc-400 leading-relaxed">{connector.description}</p>

                        <div className="flex flex-wrap gap-1">
                            {connector.requiredEnvVars.map((env) => (
                                <span
                                    key={env}
                                    className="px-1.5 py-0.5 bg-zinc-700 rounded text-xs font-mono text-zinc-300"
                                >
                                    {env}
                                </span>
                            ))}
                        </div>

                        {connector.latency_ms !== undefined && (
                            <p className="text-xs text-zinc-500">
                                Last ping: {connector.latency_ms}ms ·{' '}
                                {connector.last_checked ? new Date(connector.last_checked).toLocaleTimeString() : '—'}
                            </p>
                        )}

                        <div className="flex gap-2 mt-auto">
                            {connector.status !== 'connected' ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setInstalling(connector); }}
                                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold transition-colors text-white"
                                >
                                    + Install
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setInstalling(connector); }}
                                    className="flex-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium transition-colors text-zinc-300"
                                >
                                    Reconfigure
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); testConnector(connector); }}
                                disabled={testing[connector.id]}
                                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
                            >
                                {testing[connector.id] ? '…' : 'Test'}
                            </button>
                            <a
                                href={connector.docs_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium transition-colors"
                            >
                                Docs ↗
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            {/* Testing connectors locked notice */}
            {!hasTesterRole && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <p className="text-sm font-medium text-zinc-300">Testing &amp; QA connectors are locked</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                            14 integrations — Selenium, Playwright, Cypress, Appium, k6, JMeter, Postman, SoapUI, TestRail, Zephyr, OWASP ZAP, Burp Suite, Jenkins, CircleCI — are only available after hiring the{' '}
                            <a href="/marketplace/tester" className="text-blue-400 hover:underline">Tester agent</a>.
                        </p>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelected(null)}
                    />
                    <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg mx-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">{selected.name}</h2>
                            <button
                                onClick={() => setSelected(null)}
                                className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <p className="text-sm text-zinc-300">{selected.description}</p>
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
                                Required Environment Variables
                            </p>
                            <div className="flex flex-col gap-1">
                                {selected.requiredEnvVars.map((env) => (
                                    <div
                                        key={env}
                                        className="flex items-center justify-between px-3 py-2 bg-zinc-800 rounded-lg"
                                    >
                                        <span className="font-mono text-sm text-zinc-200">{env}</span>
                                        <span className="text-xs text-zinc-500">string</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    testConnector(selected);
                                    setSelected(null);
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                            >
                                Run Health Check
                            </button>
                            <a
                                href={selected.docs_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
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
