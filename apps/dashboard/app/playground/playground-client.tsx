'use client';

import { useCallback, useState } from 'react';

// ── Endpoint catalogue ─────────────────────────────────────────────────────

type ParamDef = {
    name: string;
    in: 'path' | 'query' | 'body';
    required?: boolean;
    description?: string;
    example?: string;
};

type EndpointDef = {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;           // e.g. /v1/agents/:botId
    summary: string;
    description?: string;
    category: string;
    params: ParamDef[];
    bodyTemplate?: string;  // default JSON body as string
};

const ENDPOINTS: EndpointDef[] = [
    // ── Agents ───────────────────────────────────────────────────────────────
    {
        id: 'list-agents', method: 'GET', path: '/v1/agents', category: 'Agents',
        summary: 'List agents',
        description: 'Returns all bots in your tenant, ordered by creation date.',
        params: [
            { name: 'limit', in: 'query', description: 'Max results (default 50)', example: '20' },
        ],
    },
    {
        id: 'get-agent', method: 'GET', path: '/v1/agents/:botId', category: 'Agents',
        summary: 'Get agent',
        params: [{ name: 'botId', in: 'path', required: true, description: 'Agent ID', example: 'bot_abc123' }],
    },
    {
        id: 'dispatch-agent', method: 'POST', path: '/v1/agents/dispatch', category: 'Agents',
        summary: 'Dispatch task to agent',
        params: [],
        bodyTemplate: JSON.stringify({ fromAgentId: 'system', toAgentId: 'bot_abc123', workspaceId: 'ws_abc', tenantId: 'ten_abc', taskDescription: 'Summarise open Jira tickets' }, null, 2),
    },
    {
        id: 'batch-dispatch', method: 'POST', path: '/v1/agents/batch-dispatch', category: 'Agents',
        summary: 'Batch task submission',
        description: 'Dispatch same task template for multiple inputs.',
        params: [],
        bodyTemplate: JSON.stringify({ to_agent_id: 'bot_abc123', workspace_id: 'ws_abc', template: 'Research {{name}} at {{company}}', rows: [{ name: 'Alice', company: 'Acme' }] }, null, 2),
    },
    // ── Approvals ────────────────────────────────────────────────────────────
    {
        id: 'list-pending', method: 'GET', path: '/v1/approvals/intake', category: 'Approvals',
        summary: 'Request approval (intake)',
        params: [],
        bodyTemplate: JSON.stringify({ workspace_id: 'ws_abc', bot_id: 'bot_abc', task_id: 'task_xyz', action_id: 'act_123', action_summary: 'Deploy to production', risk_level: 'high', requested_by: 'developer-agent', policy_pack_version: 'v1' }, null, 2),
    },
    {
        id: 'decide-approval', method: 'POST', path: '/v1/approvals/:approvalId/decision', category: 'Approvals',
        summary: 'Submit approval decision',
        params: [{ name: 'approvalId', in: 'path', required: true, example: 'apr_abc123' }],
        bodyTemplate: JSON.stringify({ workspace_id: 'ws_abc', decision: 'approved', reason: 'Verified scope and rollback plan' }, null, 2),
    },
    // ── Analytics ────────────────────────────────────────────────────────────
    {
        id: 'agent-perf', method: 'GET', path: '/v1/analytics/agent-performance', category: 'Analytics',
        summary: 'Agent performance (30d)',
        params: [
            { name: 'tenantId', in: 'query', required: true, description: 'Your tenant ID' },
            { name: 'from', in: 'query', description: 'ISO date', example: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) },
            { name: 'to', in: 'query', description: 'ISO date', example: new Date().toISOString().slice(0, 10) },
        ],
    },
    {
        id: 'tasks-list', method: 'GET', path: '/v1/analytics/tasks', category: 'Analytics',
        summary: 'Task execution history',
        params: [
            { name: 'tenantId', in: 'query', required: true },
            { name: 'limit', in: 'query', example: '25' },
            { name: 'outcome', in: 'query', description: 'success | failed | approval_queued' },
        ],
    },
    // ── Schedules ────────────────────────────────────────────────────────────
    {
        id: 'list-schedules', method: 'GET', path: '/v1/schedules', category: 'Schedules',
        summary: 'List scheduled tasks',
        params: [],
    },
    {
        id: 'create-schedule', method: 'POST', path: '/v1/schedules', category: 'Schedules',
        summary: 'Create scheduled task',
        params: [],
        bodyTemplate: JSON.stringify({ name: 'Weekly standup summary', cronExpr: '0 9 * * 1', goal: 'Summarise open PRs and post to Slack #engineering', agentId: 'bot_abc123', enabled: true }, null, 2),
    },
    // ── Webhooks ─────────────────────────────────────────────────────────────
    {
        id: 'list-webhooks', method: 'GET', path: '/v1/webhooks/outbound', category: 'Webhooks',
        summary: 'List outbound webhooks',
        params: [],
    },
    {
        id: 'create-webhook', method: 'POST', path: '/v1/webhooks/outbound', category: 'Webhooks',
        summary: 'Create outbound webhook',
        params: [],
        bodyTemplate: JSON.stringify({ url: 'https://hooks.yourapp.com/agentfarm', events: ['task_completed', 'task_failed'] }, null, 2),
    },
    {
        id: 'webhook-events', method: 'GET', path: '/v1/webhooks/events', category: 'Webhooks',
        summary: 'List supported event types',
        params: [],
    },
    // ── Governance ────────────────────────────────────────────────────────────
    {
        id: 'governance-kpis', method: 'GET', path: '/v1/governance/kpis', category: 'Governance',
        summary: 'Governance KPIs',
        params: [
            { name: 'workspace_id', in: 'query', required: true },
            { name: 'time_window_seconds', in: 'query', example: '86400' },
        ],
    },
    {
        id: 'budget-state', method: 'GET', path: '/v1/workspaces/:workspaceId/budget/state', category: 'Governance',
        summary: 'Budget state',
        params: [{ name: 'workspaceId', in: 'path', required: true }],
    },
    // ── Memory ───────────────────────────────────────────────────────────────
    {
        id: 'episodic-memory', method: 'GET', path: '/v1/memory/episodic', category: 'Memory',
        summary: 'Episodic memory',
        params: [
            { name: 'workspace_id', in: 'query', required: true },
            { name: 'limit', in: 'query', example: '20' },
        ],
    },
    // ── Teams ─────────────────────────────────────────────────────────────────
    {
        id: 'list-team', method: 'GET', path: '/v1/team/members', category: 'Team',
        summary: 'List team members',
        params: [],
    },
];

const CATEGORIES = [...new Set(ENDPOINTS.map((e) => e.category))];

const METHOD_COLORS: Record<string, string> = {
    GET: '#1a7a4a', POST: '#0052cc', PUT: '#b45309', PATCH: '#b45309', DELETE: '#c4161c',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildCurl(endpoint: EndpointDef, resolvedPath: string, body: string, queryParams: Record<string, string>, baseUrl: string): string {
    const url = new URL(`${baseUrl}${resolvedPath}`);
    for (const [k, v] of Object.entries(queryParams)) {
        if (v) url.searchParams.set(k, v);
    }
    let curl = `curl -X ${endpoint.method} \\\n  '${url.toString()}'`;
    curl += ` \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`;
    if (endpoint.method !== 'GET' && endpoint.method !== 'DELETE' && body.trim()) {
        curl += ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, "\\'")}'`;
    }
    return curl;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PlaygroundClient({ tenantId, workspaceId }: { tenantId: string; workspaceId: string }) {
    const [selectedId, setSelectedId] = useState<string>(ENDPOINTS[0]?.id ?? '');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [pathParams, setPathParams] = useState<Record<string, string>>({});
    const [queryParams, setQueryParams] = useState<Record<string, string>>({});
    const [bodyText, setBodyText] = useState('');
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<{
        status: number;
        status_text: string;
        duration_ms: number;
        body: unknown;
        error?: string;
    } | null>(null);
    const [showCurl, setShowCurl] = useState(false);
    const [copied, setCopied] = useState(false);

    const endpoint = ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0]!;

    const selectEndpoint = (ep: EndpointDef) => {
        setSelectedId(ep.id);
        setPathParams({});
        // Pre-fill workspaceId / tenantId
        const qp: Record<string, string> = {};
        for (const p of ep.params) {
            if (p.in === 'query') {
                if (p.name === 'workspace_id' || p.name === 'workspaceId') qp[p.name] = workspaceId;
                else if (p.name === 'tenantId') qp[p.name] = tenantId;
                else if (p.example) qp[p.name] = p.example;
                else qp[p.name] = '';
            }
        }
        setQueryParams(qp);
        setBodyText(ep.bodyTemplate ?? '');
        setResponse(null);
        setShowCurl(false);
    };

    // Resolve path params in the URL
    const resolvedPath = endpoint.path.replace(/:(\w+)/g, (_, key: string) => {
        return encodeURIComponent(pathParams[key] ?? `:${key}`);
    });

    const handleSend = useCallback(async () => {
        setLoading(true);
        setResponse(null);

        let parsedBody: unknown;
        if (bodyText.trim() && endpoint.method !== 'GET' && endpoint.method !== 'DELETE') {
            try { parsedBody = JSON.parse(bodyText); } catch {
                setResponse({ status: 0, status_text: 'Client Error', duration_ms: 0, body: null, error: 'Invalid JSON body.' });
                setLoading(false);
                return;
            }
        }

        try {
            const res = await fetch('/api/playground/proxy', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    method: endpoint.method,
                    path: resolvedPath,
                    queryParams,
                    body: parsedBody,
                }),
            });
            const data = await res.json() as typeof response;
            setResponse(data);
        } finally {
            setLoading(false);
        }
    }, [endpoint, resolvedPath, queryParams, bodyText]);

    const curlSnippet = buildCurl(endpoint, resolvedPath, bodyText, queryParams, 'https://your-gateway.agentfarm.io');

    const copyText = (text: string) => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const statusColor = response
        ? response.status >= 200 && response.status < 300 ? '#1a7a4a'
        : response.status >= 400 ? '#c4161c' : '#b45309'
        : '#57534e';

    const filteredEndpoints = activeCategory === 'all'
        ? ENDPOINTS
        : ENDPOINTS.filter((e) => e.category === activeCategory);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1rem', minHeight: '80vh' }}>

            {/* ── Sidebar: endpoint list ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <select
                    value={activeCategory}
                    onChange={(e) => setActiveCategory(e.target.value)}
                    className="approval-select"
                    style={{ width: '100%', marginBottom: '0.25rem' }}
                >
                    <option value="all">All categories</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {filteredEndpoints.map((ep) => (
                        <button
                            key={ep.id}
                            type="button"
                            onClick={() => selectEndpoint(ep)}
                            style={{
                                textAlign: 'left',
                                padding: '0.45rem 0.6rem',
                                borderRadius: '0.4rem',
                                border: `1px solid ${selectedId === ep.id ? '#0052cc' : 'transparent'}`,
                                background: selectedId === ep.id ? 'rgba(0,82,204,0.06)' : 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                            }}
                        >
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: METHOD_COLORS[ep.method] ?? '#57534e', fontFamily: 'ui-monospace, monospace', flexShrink: 0, width: 38 }}>
                                {ep.method}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: selectedId === ep.id ? '#0052cc' : '#1d1d1f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ep.summary}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Main panel ── */}
            <div style={{ display: 'grid', gap: '0.85rem' }}>

                {/* URL bar */}
                <div className="card" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '0.3rem', background: METHOD_COLORS[endpoint.method] ?? '#57534e', color: '#fff', fontSize: '0.75rem', fontWeight: 800, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                            {endpoint.method}
                        </span>
                        <code style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', color: '#374151', background: '#f9fafb', padding: '0.25rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #e5e7eb', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {resolvedPath}
                        </code>
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => void handleSend()}
                            disabled={loading}
                            style={{ flexShrink: 0 }}
                        >
                            {loading ? 'Sending…' : '▶ Send'}
                        </button>
                        <button
                            type="button"
                            className="chip-button"
                            onClick={() => setShowCurl((v) => !v)}
                            style={{ flexShrink: 0 }}
                        >
                            {showCurl ? 'Hide cURL' : 'cURL'}
                        </button>
                    </div>
                    {endpoint.description && (
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#57534e' }}>{endpoint.description}</p>
                    )}
                </div>

                {/* cURL snippet */}
                {showCurl && (
                    <div className="card" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>cURL</span>
                            <button type="button" className="chip-button" onClick={() => copyText(curlSnippet)}>
                                {copied ? '✓ Copied' : 'Copy'}
                            </button>
                        </div>
                        <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', background: '#1d1d1f', color: '#a8e6cf', padding: '0.75rem', borderRadius: '0.4rem', overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {curlSnippet}
                        </pre>
                    </div>
                )}

                {/* Parameters */}
                {(endpoint.params.some((p) => p.in === 'path') || endpoint.params.some((p) => p.in === 'query')) && (
                    <div className="card" style={{ padding: '0.85rem 1rem' }}>
                        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>Parameters</h3>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {endpoint.params.filter((p) => p.in === 'path').map((p) => (
                                <label key={p.name} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>
                                    <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                                        :{p.name} <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '0.65rem', padding: '0 3px', borderRadius: 3 }}>path</span>
                                        {p.required && <span style={{ color: '#c4161c', marginLeft: 3 }}>*</span>}
                                    </span>
                                    <input
                                        type="text"
                                        value={pathParams[p.name] ?? ''}
                                        onChange={(e) => setPathParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                                        placeholder={p.example ?? p.name}
                                        className="approval-input"
                                    />
                                </label>
                            ))}
                            {endpoint.params.filter((p) => p.in === 'query').map((p) => (
                                <label key={p.name} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>
                                    <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                                        {p.name} <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.65rem', padding: '0 3px', borderRadius: 3 }}>query</span>
                                        {p.required && <span style={{ color: '#c4161c', marginLeft: 3 }}>*</span>}
                                        {p.description && <span style={{ fontWeight: 400, color: '#78716c', fontSize: '0.73rem', marginLeft: 4 }}>{p.description}</span>}
                                    </span>
                                    <input
                                        type="text"
                                        value={queryParams[p.name] ?? ''}
                                        onChange={(e) => setQueryParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                                        placeholder={p.example ?? ''}
                                        className="approval-input"
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Body */}
                {endpoint.method !== 'GET' && endpoint.method !== 'DELETE' && (
                    <div className="card" style={{ padding: '0.85rem 1rem' }}>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>
                            Request body <span style={{ fontWeight: 400, color: '#78716c' }}>(JSON)</span>
                        </h3>
                        <textarea
                            value={bodyText}
                            onChange={(e) => setBodyText(e.target.value)}
                            rows={Math.max(6, (bodyText.split('\n').length + 1))}
                            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #d2d2d7', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }}
                            placeholder="{}"
                            spellCheck={false}
                        />
                    </div>
                )}

                {/* Response */}
                {response && (
                    <div className="card" style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ padding: '0.2rem 0.55rem', borderRadius: 9999, background: response.status >= 200 && response.status < 300 ? 'rgba(26,122,74,0.08)' : 'rgba(196,22,28,0.08)', color: statusColor, fontSize: '0.78rem', fontWeight: 800 }}>
                                    {response.status} {response.status_text}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#78716c' }}>{response.duration_ms}ms</span>
                            </div>
                            <button type="button" className="chip-button" onClick={() => copyText(JSON.stringify(response.body, null, 2))}>
                                {copied ? '✓ Copied' : 'Copy response'}
                            </button>
                        </div>
                        {response.error && (
                            <p style={{ margin: '0 0 0.5rem', color: '#c4161c', fontSize: '0.82rem' }}>⚠ {response.error}</p>
                        )}
                        <pre style={{ margin: 0, fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', background: '#1d1d1f', color: '#e5e5e7', padding: '0.75rem', borderRadius: '0.4rem', overflowX: 'auto', maxHeight: 400, overflowY: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {response.body !== null && response.body !== undefined
                                ? JSON.stringify(response.body, null, 2)
                                : '(empty response)'}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
