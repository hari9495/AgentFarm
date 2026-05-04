'use client';

import { useState } from 'react';

type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'unconfigured';

type ConnectorEntry = {
    id: string;
    name: string;
    description: string;
    category: 'communication' | 'project_management' | 'monitoring' | 'documentation' | 'vcs' | 'ci_cd';
    requiredEnvVars: string[];
    docs_url: string;
    status: ConnectorStatus;
    latency_ms?: number;
    last_checked?: string;
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
];

const CATEGORY_LABELS: Record<ConnectorEntry['category'], string> = {
    vcs: 'Version Control',
    communication: 'Communication',
    project_management: 'Project Management',
    monitoring: 'Monitoring',
    documentation: 'Documentation',
    ci_cd: 'CI / CD',
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

export function ConnectorMarketplacePanel() {
    const [connectors, setConnectors] = useState<ConnectorEntry[]>(CONNECTOR_CATALOG);
    const [filter, setFilter] = useState<ConnectorEntry['category'] | 'all'>('all');
    const [testing, setTesting] = useState<Record<string, boolean>>({});
    const [selected, setSelected] = useState<ConnectorEntry | null>(null);
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
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    testConnector(connector);
                                }}
                                disabled={testing[connector.id]}
                                className="flex-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
                            >
                                {testing[connector.id] ? 'Testing…' : 'Health Check'}
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
