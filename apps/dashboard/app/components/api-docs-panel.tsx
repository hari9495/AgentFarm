'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type AuthLevel = 'public' | 'session' | 'viewer+' | 'operator+' | 'admin+';

type Endpoint = {
    method: HttpMethod;
    path: string;
    description: string;
    auth: AuthLevel;
};

type RouteGroup = {
    group: string;
    prefix: string;
    description: string;
    endpoints: Endpoint[];
};

type SdkExample = {
    title: string;
    language: string;
    code: string;
};

const ROUTE_GROUPS: RouteGroup[] = [
    {
        group: 'Authentication',
        prefix: '/auth',
        description: 'User registration, login, logout, and internal service authentication.',
        endpoints: [
            { method: 'POST', path: '/auth/signup',         description: 'Register a new user',          auth: 'public'    },
            { method: 'POST', path: '/auth/login',          description: 'Login and get session token',  auth: 'public'    },
            { method: 'POST', path: '/auth/logout',         description: 'Invalidate session',           auth: 'session'   },
            { method: 'POST', path: '/auth/internal-login', description: 'Internal service login',       auth: 'session'   },
        ],
    },
    {
        group: 'Agents',
        prefix: '/v1/agents',
        description: 'Create and manage agent bots — pause, resume, and configure behaviour.',
        endpoints: [
            { method: 'GET',  path: '/v1/agents',               description: 'List all agents for tenant',   auth: 'viewer+'   },
            { method: 'POST', path: '/v1/agents',               description: 'Create a new agent',           auth: 'operator+' },
            { method: 'GET',  path: '/v1/agents/:botId',        description: 'Get agent by ID',              auth: 'viewer+'   },
            { method: 'POST', path: '/v1/agents/:botId/pause',  description: 'Pause an agent',               auth: 'operator+' },
            { method: 'POST', path: '/v1/agents/:botId/resume', description: 'Resume a paused agent',        auth: 'operator+' },
        ],
    },
    {
        group: 'Tasks & Queue',
        prefix: '/v1/task-queue',
        description: 'Enqueue, inspect, and cancel tenant-scoped tasks in the priority queue.',
        endpoints: [
            { method: 'POST',   path: '/v1/task-queue',           description: 'Enqueue a task',           auth: 'operator+' },
            { method: 'GET',    path: '/v1/task-queue',           description: 'List queue entries',       auth: 'viewer+'   },
            { method: 'GET',    path: '/v1/task-queue/status',    description: 'Queue health summary',     auth: 'viewer+'   },
            { method: 'DELETE', path: '/v1/task-queue/:entryId',  description: 'Cancel a pending entry',   auth: 'operator+' },
        ],
    },
    {
        group: 'Approvals',
        prefix: '/approvals',
        description: 'Submit approval requests, list pending approvals, and record decisions.',
        endpoints: [
            { method: 'POST', path: '/approvals',              description: 'Submit an approval request',       auth: 'session'   },
            { method: 'GET',  path: '/approvals',              description: 'List approvals for workspace',     auth: 'viewer+'   },
            { method: 'POST', path: '/approvals/:id/decision', description: 'Submit approve/reject decision',   auth: 'operator+' },
            { method: 'POST', path: '/approvals/:id/escalate', description: 'Escalate to next tier',            auth: 'operator+' },
        ],
    },
    {
        group: 'Audit & Compliance',
        prefix: '/v1/audit',
        description: 'Query and export the immutable tenant audit event log.',
        endpoints: [
            { method: 'GET', path: '/v1/audit/events', description: 'Query audit event log',    auth: 'admin+' },
            { method: 'GET', path: '/v1/audit/export', description: 'Export audit log as CSV',  auth: 'admin+' },
        ],
    },
    {
        group: 'Billing',
        prefix: '/v1/billing',
        description: 'Subscription plans, current subscription state, and order creation.',
        endpoints: [
            { method: 'GET',  path: '/v1/billing/plans',        description: 'List available plans',     auth: 'session'   },
            { method: 'GET',  path: '/v1/billing/subscription', description: 'Get current subscription', auth: 'session'   },
            { method: 'POST', path: '/v1/billing/create-order', description: 'Create a new order',       auth: 'operator+' },
        ],
    },
    {
        group: 'Webhooks',
        prefix: '/v1/webhooks',
        description: 'Register outbound webhooks, manage the dead-letter queue, and browse the event catalog.',
        endpoints: [
            { method: 'POST', path: '/v1/webhooks/outbound',       description: 'Register outbound webhook', auth: 'operator+' },
            { method: 'GET',  path: '/v1/webhooks/outbound',       description: 'List outbound webhooks',    auth: 'viewer+'   },
            { method: 'GET',  path: '/v1/webhooks/dlq',            description: 'View dead-letter queue',    auth: 'operator+' },
            { method: 'POST', path: '/v1/webhooks/dlq/:id/retry',  description: 'Retry DLQ entry',           auth: 'operator+' },
            { method: 'GET',  path: '/v1/webhooks/events',         description: 'Browse event catalog',      auth: 'viewer+'   },
        ],
    },
    {
        group: 'Analytics',
        prefix: '/v1/analytics',
        description: 'Task execution metrics, per-agent performance, and aggregated cost summaries.',
        endpoints: [
            { method: 'GET', path: '/v1/analytics/tasks',             description: 'Task execution metrics',       auth: 'viewer+' },
            { method: 'GET', path: '/v1/analytics/agent-performance', description: 'Per-agent performance stats',  auth: 'viewer+' },
            { method: 'GET', path: '/v1/analytics/cost-summary',      description: 'Aggregated cost summary',      auth: 'viewer+' },
        ],
    },
    {
        group: 'API Keys',
        prefix: '/v1/api-keys',
        description: 'Create, list, update, and revoke long-lived API keys for programmatic access.',
        endpoints: [
            { method: 'POST',   path: '/v1/api-keys',         description: 'Create API key (returned once)', auth: 'admin+' },
            { method: 'GET',    path: '/v1/api-keys',         description: 'List keys (no plaintext)',       auth: 'admin+' },
            { method: 'PATCH',  path: '/v1/api-keys/:keyId',  description: 'Update key metadata',           auth: 'admin+' },
            { method: 'DELETE', path: '/v1/api-keys/:keyId',  description: 'Revoke key',                    auth: 'admin+' },
        ],
    },
    {
        group: 'A/B Tests',
        prefix: '/v1/ab-tests',
        description: 'Create and manage A/B test experiments comparing bot config versions.',
        endpoints: [
            { method: 'POST', path: '/v1/ab-tests',               description: 'Create A/B test',       auth: 'operator+' },
            { method: 'GET',  path: '/v1/ab-tests',               description: 'List all tests',        auth: 'viewer+'   },
            { method: 'GET',  path: '/v1/ab-tests/:id/results',   description: 'Get variant results',   auth: 'viewer+'   },
            { method: 'POST', path: '/v1/ab-tests/:id/conclude',  description: 'Conclude a test',       auth: 'operator+' },
        ],
    },
    {
        group: 'Scheduled Reports',
        prefix: '/v1/scheduled-reports',
        description: 'Configure periodic digest email reports for workspace stakeholders.',
        endpoints: [
            { method: 'POST',   path: '/v1/scheduled-reports',            description: 'Create report schedule', auth: 'operator+' },
            { method: 'GET',    path: '/v1/scheduled-reports',            description: 'List schedules',         auth: 'viewer+'   },
            { method: 'PATCH',  path: '/v1/scheduled-reports/:reportId',  description: 'Update schedule',        auth: 'operator+' },
            { method: 'DELETE', path: '/v1/scheduled-reports/:reportId',  description: 'Delete schedule',        auth: 'operator+' },
        ],
    },
    {
        group: 'Memory',
        prefix: '/api/v1/workspaces',
        description: 'Store, list, and search workspace-scoped memory entries for agents.',
        endpoints: [
            { method: 'GET',  path: '/api/v1/workspaces/:id/memory',        description: 'List memory entries',   auth: 'viewer+'   },
            { method: 'POST', path: '/api/v1/workspaces/:id/memory',        description: 'Store memory entry',    auth: 'operator+' },
            { method: 'GET',  path: '/api/v1/workspaces/:id/memory/search', description: 'Search memory',         auth: 'viewer+'   },
        ],
    },
    {
        group: 'Meetings',
        prefix: '/v1/meetings',
        description: 'Manage agent meeting sessions — join, check status, and end lifecycle.',
        endpoints: [
            { method: 'POST', path: '/v1/meetings/join',       description: 'Join a meeting session',  auth: 'operator+' },
            { method: 'GET',  path: '/v1/meetings/:id/status', description: 'Get meeting status',      auth: 'viewer+'   },
            { method: 'POST', path: '/v1/meetings/:id/end',    description: 'End a meeting session',   auth: 'operator+' },
        ],
    },
];

const SDK_EXAMPLES: SdkExample[] = [
    {
        title: 'Authenticate',
        language: 'typescript',
        code: `const response = await fetch('https://your-gateway/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'you@example.com',
    password: 'secret',
  }),
});

const data = await response.json();
const token: string = data.token;
console.log('Session token:', token);`,
    },
    {
        title: 'List Agents',
        language: 'typescript',
        code: `const response = await fetch('https://your-gateway/v1/agents', {
  headers: { Authorization: \`Bearer \${token}\` },
});

const data = await response.json();
const agents: { id: string; status: string }[] = data.agents;

for (const agent of agents) {
  console.log(agent.id, agent.status);
}`,
    },
    {
        title: 'Enqueue a Task',
        language: 'typescript',
        code: `const response = await fetch('https://your-gateway/v1/task-queue', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${token}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    taskId: 'task_abc123',
    priority: 'high',
    tenantId: 'tenant_xxx',
  }),
});

const entry = await response.json();
console.log('Queued entry:', entry.id);`,
    },
    {
        title: 'Register a Webhook',
        language: 'typescript',
        code: `const response = await fetch('https://your-gateway/v1/webhooks/outbound', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${token}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://your-server/webhook',
    events: ['task.completed', 'agent.error'],
  }),
});

const webhook = await response.json();
console.log('Webhook ID:', webhook.id);`,
    },
    {
        title: 'Stream Live Tasks (SSE)',
        language: 'typescript',
        code: `const source = new EventSource('/sse/tasks?workspaceId=ws_xxx');

source.addEventListener('task', (event: MessageEvent) => {
  const task = JSON.parse(event.data);
  console.log('Live task update:', task);
});

source.addEventListener('error', () => {
  console.error('SSE connection lost, reconnecting...');
});

// Clean up when done
// source.close();`,
    },
];

const METHOD_COLORS: Record<HttpMethod, CSSProperties> = {
    GET:    { backgroundColor: '#3b82f6', color: '#ffffff' },
    POST:   { backgroundColor: '#22c55e', color: '#ffffff' },
    PATCH:  { backgroundColor: '#f59e0b', color: '#ffffff' },
    DELETE: { backgroundColor: '#ef4444', color: '#ffffff' },
};

const AUTH_COLORS: Record<AuthLevel, CSSProperties> = {
    'public':    { backgroundColor: '#e2e8f0', color: '#475569' },
    'session':   { backgroundColor: '#dbeafe', color: '#1d4ed8' },
    'viewer+':   { backgroundColor: '#d1fae5', color: '#065f46' },
    'operator+': { backgroundColor: '#fef3c7', color: '#92400e' },
    'admin+':    { backgroundColor: '#fee2e2', color: '#991b1b' },
};

export default function ApiDocsPanel() {
    const [activeTab, setActiveTab] = useState<'api' | 'sdk'>('api');
    const [activeGroup, setActiveGroup] = useState<string>(ROUTE_GROUPS[0]?.group ?? '');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (title: string, code: string): void => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopiedKey(title);
            setTimeout(() => {
                setCopiedKey(null);
            }, 2000);
        }).catch(() => undefined);
    };

    return (
        <div>
            {/* Tab bar */}
            <div
                style={{
                    display: 'flex',
                    gap: '0.25rem',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: '1.5rem',
                }}
            >
                {(['api', 'sdk'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab ? 700 : 400,
                            color: activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)',
                            borderBottom: activeTab === tab ? '2px solid var(--ink)' : '2px solid transparent',
                            fontSize: '0.9rem',
                            marginBottom: '-1px',
                        }}
                    >
                        {tab === 'api' ? 'REST API Reference' : 'SDK Quick-Start'}
                    </button>
                ))}
            </div>

            {/* API tab */}
            {activeTab === 'api' && (
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {/* Left sidebar */}
                    <nav
                        style={{
                            width: '220px',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                        }}
                    >
                        {ROUTE_GROUPS.map((group) => {
                            const isActive = activeGroup === group.group;
                            return (
                                <button
                                    key={group.group}
                                    onClick={() => setActiveGroup(group.group)}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '0.375rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: isActive ? 'var(--ink)' : 'transparent',
                                        color: isActive ? '#ffffff' : 'var(--ink)',
                                        width: '100%',
                                    }}
                                >
                                    <span
                                        style={{
                                            display: 'block',
                                            fontWeight: 600,
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        {group.group}
                                    </span>
                                    <span
                                        style={{
                                            display: 'block',
                                            fontSize: '0.7rem',
                                            color: isActive ? 'rgba(255,255,255,0.65)' : 'var(--ink-muted)',
                                            fontFamily: 'monospace',
                                            marginTop: '0.1rem',
                                        }}
                                    >
                                        {group.prefix}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Right content panel */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {ROUTE_GROUPS.map((group) =>
                            activeGroup === group.group ? (
                                <div key={group.group}>
                                    {/* Group header */}
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                flexWrap: 'wrap',
                                                marginBottom: '0.5rem',
                                            }}
                                        >
                                            <h2
                                                style={{
                                                    fontSize: '1.25rem',
                                                    fontWeight: 700,
                                                    color: 'var(--ink)',
                                                    margin: 0,
                                                }}
                                            >
                                                {group.group}
                                            </h2>
                                            <span
                                                style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                    padding: '0.2rem 0.5rem',
                                                    border: '1px solid var(--line)',
                                                    borderRadius: '0.25rem',
                                                    color: 'var(--ink-muted)',
                                                }}
                                            >
                                                {group.prefix}
                                            </span>
                                        </div>
                                        <p
                                            style={{
                                                color: 'var(--ink-muted)',
                                                fontSize: '0.9rem',
                                                margin: 0,
                                            }}
                                        >
                                            {group.description}
                                        </p>
                                    </div>

                                    {/* Endpoint table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table
                                            style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                                    <th
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '0.5rem 0.75rem',
                                                            fontWeight: 600,
                                                            color: 'var(--ink-muted)',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        Method
                                                    </th>
                                                    <th
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '0.5rem 0.75rem',
                                                            fontWeight: 600,
                                                            color: 'var(--ink-muted)',
                                                        }}
                                                    >
                                                        Path
                                                    </th>
                                                    <th
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '0.5rem 0.75rem',
                                                            fontWeight: 600,
                                                            color: 'var(--ink-muted)',
                                                        }}
                                                    >
                                                        Description
                                                    </th>
                                                    <th
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '0.5rem 0.75rem',
                                                            fontWeight: 600,
                                                            color: 'var(--ink-muted)',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        Auth
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.endpoints.map((ep) => (
                                                    <tr
                                                        key={ep.path}
                                                        style={{ borderBottom: '1px solid var(--line)' }}
                                                    >
                                                        <td
                                                            style={{
                                                                padding: '0.625rem 0.75rem',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    ...METHOD_COLORS[ep.method],
                                                                    padding: '0.2rem 0.45rem',
                                                                    borderRadius: '0.25rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    letterSpacing: '0.05em',
                                                                    fontFamily: 'monospace',
                                                                }}
                                                            >
                                                                {ep.method}
                                                            </span>
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: '0.625rem 0.75rem',
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.82rem',
                                                                color: 'var(--ink)',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {ep.path}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: '0.625rem 0.75rem',
                                                                color: 'var(--ink-muted)',
                                                            }}
                                                        >
                                                            {ep.description}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: '0.625rem 0.75rem',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    ...AUTH_COLORS[ep.auth],
                                                                    padding: '0.15rem 0.4rem',
                                                                    borderRadius: '0.25rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                {ep.auth}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null
                        )}
                    </div>
                </div>
            )}

            {/* SDK tab */}
            {activeTab === 'sdk' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {SDK_EXAMPLES.map((example) => (
                        <div key={example.title}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    marginBottom: '0.75rem',
                                }}
                            >
                                <h3
                                    style={{
                                        fontSize: '1.1rem',
                                        fontWeight: 700,
                                        color: 'var(--ink)',
                                        margin: 0,
                                    }}
                                >
                                    {example.title}
                                </h3>
                                <span
                                    style={{
                                        backgroundColor: '#334155',
                                        color: '#94a3b8',
                                        padding: '0.15rem 0.5rem',
                                        borderRadius: '0.25rem',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    {example.language}
                                </span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => handleCopy(example.title, example.code)}
                                    style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        right: '0.5rem',
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        color: '#cdd6f4',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '0.25rem',
                                        padding: '0.25rem 0.6rem',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        zIndex: 1,
                                    }}
                                >
                                    {copiedKey === example.title ? '✓ Copied' : 'Copy'}
                                </button>
                                <pre
                                    style={{
                                        backgroundColor: '#1e1e2e',
                                        color: '#cdd6f4',
                                        fontFamily: 'monospace',
                                        padding: '1rem',
                                        borderRadius: '0.5rem',
                                        overflowX: 'auto',
                                        margin: 0,
                                        fontSize: '0.85rem',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    <code>{example.code}</code>
                                </pre>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
