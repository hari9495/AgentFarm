'use client';

import { useState, useEffect } from 'react';
import {
    Copy, Check, ExternalLink, Radio,
    Zap, Globe, Shield,
    AlertCircle, CheckCircle2, Clock, XCircle, Heart,
    ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

function useCopy(text: string) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return { copied, copy };
}

function CopyBtn({ text, label = 'Copy', size = 'md' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
    const { copied, copy } = useCopy(text);
    return (
        <button
            type="button"
            onClick={copy}
            className={size === 'sm' ? 'secondary-action' : 'secondary-action'}
            style={{ fontSize: size === 'sm' ? '0.72rem' : '0.8rem', padding: size === 'sm' ? '0.18rem 0.55rem' : '0.3rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
            {copied ? <Check size={size === 'sm' ? 10 : 12} /> : <Copy size={size === 'sm' ? 10 : 12} />}
            {copied ? 'Copied!' : label}
        </button>
    );
}

// ── Code block ────────────────────────────────────────────────────────────────
// Code blocks intentionally stay dark — standard practice for all code editors.

function CodeBlock({ code, language, title }: { code: string; language: string; title?: string }) {
    const [expanded, setExpanded] = useState(false);
    const lines = code.split('\n');
    const shouldCollapse = lines.length > 16;
    const visible = shouldCollapse && !expanded ? lines.slice(0, 14).join('\n') + '\n…' : code;
    const { copied, copy } = useCopy(code);

    return (
        <div style={{ borderRadius: '0 0 10px 10px', overflow: 'hidden', border: '1px solid var(--line)', borderTop: 'none' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', background: '#1a1a1c',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
                            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                        ))}
                    </div>
                    {title && <span style={{ fontSize: '0.72rem', color: '#6e6e73', marginLeft: 2 }}>{title}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{language}</span>
                    <button
                        type="button"
                        onClick={copy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: copied ? '#34d399' : '#98989d', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>
            <div style={{ background: '#111113', padding: '14px 18px', overflowX: 'auto' }}>
                <pre style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.7, fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', color: '#e5e5e7', whiteSpace: 'pre' }}>
                    {visible}
                </pre>
            </div>
            {shouldCollapse && (
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    style={{ width: '100%', padding: '7px', background: '#1a1a1c', border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', color: '#6e6e73', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                    {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show {lines.length - 14} more lines</>}
                </button>
            )}
        </div>
    );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
    { type: 'task_queued',    icon: Clock,        colorVar: '#b45309', desc: 'A new task was accepted and placed in the execution queue.' },
    { type: 'task_started',   icon: Zap,          colorVar: '#0066cc', desc: 'The runtime engine picked up the task and began execution.' },
    { type: 'task_completed', icon: CheckCircle2, colorVar: '#1a7a4a', desc: 'Task finished successfully. Payload contains outcome and cost.' },
    { type: 'task_failed',    icon: AlertCircle,  colorVar: '#c4161c', desc: 'Task terminated with an error. Check payload.errorMessage.' },
    { type: 'task_cancelled', icon: XCircle,      colorVar: '#6e6e73', desc: 'Task was cancelled by an operator or a kill-switch trigger.' },
    { type: 'heartbeat',      icon: Heart,        colorVar: '#94a3b8', desc: 'Sent every 30 s to keep the connection alive through proxies. Ignore in your handler.' },
];

const SCHEMA_FIELDS = [
    { name: 'eventId',     type: 'string',   req: true,  desc: 'Unique ID. Pass as Last-Event-ID on reconnect to replay missed events.',      ex: 'evt_abc123'           },
    { name: 'type',        type: 'string',   req: true,  desc: 'One of the 6 event types above.',                                             ex: 'task_completed'       },
    { name: 'tenantId',    type: 'string',   req: true,  desc: 'Tenant this event belongs to.',                                               ex: 'ten_xyz'              },
    { name: 'workspaceId', type: 'string',   req: true,  desc: 'Workspace this event belongs to.',                                            ex: 'ws_abc'               },
    { name: 'taskId',      type: 'string',   req: false, desc: 'Present on all task_* events, absent on heartbeat.',                         ex: 'tsk_def'              },
    { name: 'timestamp',   type: 'ISO 8601', req: true,  desc: 'UTC time the event was emitted.',                                             ex: '2025-05-30T14:03:22Z' },
    { name: 'payload',     type: 'object',   req: false, desc: 'Event-specific metadata: outcome, latencyMs, model, errorMessage, etc.',     ex: undefined              },
];

const INTEGRATIONS = [
    { title: 'Slack alerts',        emoji: '💬', desc: 'Post task_failed events to a channel with full context — bot, task, error.' },
    { title: 'PagerDuty incidents', emoji: '🚨', desc: 'Auto-create an incident when a high-priority task fails or stalls.' },
    { title: 'Mobile push',         emoji: '📱', desc: 'Notify on approval required or critical task completion.' },
    { title: 'Custom dashboard',    emoji: '📊', desc: 'Build a real-time ops display without polling the REST API.' },
    { title: 'Audit / SIEM relay',  emoji: '🔒', desc: 'Forward every event to Splunk, Datadog, or your compliance store.' },
    { title: 'CI/CD gates',         emoji: '⚙️', desc: 'Subscribe in a pipeline and block the next step until task_completed fires.' },
];

const META_PILLS = [
    { icon: Radio,  label: 'Protocol', value: 'text/event-stream' },
    { icon: Zap,    label: 'Latency',  value: 'sub-100 ms push'   },
    { icon: Shield, label: 'Auth',     value: 'Session cookie'     },
    { icon: Globe,  label: 'Reconnect',value: 'Last-Event-ID'      },
];

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)' }}>
            {children}
        </p>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SseStreamPanel({ workspaceId }: { workspaceId?: string }) {
    // Use state for origin so server and client render the same initial value,
    // avoiding the React hydration mismatch caused by window.location.origin.
    const [origin, setOrigin] = useState('');
    useEffect(() => { setOrigin(window.location.origin); }, []);

    const path = '/api/sse/tasks';
    const fullUrl = workspaceId ? `${origin}${path}?workspaceId=${encodeURIComponent(workspaceId)}` : `${origin}${path}`;
    const { copied: urlCopied, copy: copyUrl } = useCopy(fullUrl);

    const [activeSnippet, setActiveSnippet] = useState<'js' | 'curl' | 'python' | 'node'>('js');

    const wsParam = workspaceId ?? 'YOUR_WORKSPACE_ID';

    const snippets = {
        js: { title: 'browser.js', lang: 'JavaScript', code: `const source = new EventSource(\n  '${path}?workspaceId=${wsParam}',\n  { withCredentials: true }   // sends the session cookie\n);\n\n// Handle any event\nsource.onmessage = (e) => {\n  const event = JSON.parse(e.data);\n  console.log(event.type, event.taskId);\n};\n\n// Handle a specific event type\nsource.addEventListener('task_failed', (e) => {\n  const { taskId, payload } = JSON.parse(e.data);\n  notifySlack(\`Task \${taskId} failed: \${payload?.errorMessage}\`);\n});\n\nsource.onerror = () => {\n  // Browser reconnects automatically using Last-Event-ID\n};` },
        curl: { title: 'terminal', lang: 'curl', code: `curl -N \\\n  -H "Accept: text/event-stream" \\\n  -H "Cookie: af_session=<YOUR_SESSION_COOKIE>" \\\n  "${fullUrl}"\n\n# Sample output:\n# data: {"eventId":"evt_01","type":"task_queued","taskId":"tsk_abc","timestamp":"2025-05-30T14:00:00Z"}\n#\n# data: {"eventId":"evt_02","type":"task_started","taskId":"tsk_abc","timestamp":"2025-05-30T14:00:01Z"}\n#\n# data: {"eventId":"evt_03","type":"task_completed","taskId":"tsk_abc","payload":{"outcome":"success","latencyMs":1842},"timestamp":"2025-05-30T14:00:03Z"}` },
        python: { title: 'app.py', lang: 'Python', code: `import json, requests\nfrom sseclient import SSEClient  # pip install sseclient-py\n\nresponse = requests.get(\n    "${fullUrl}",\n    headers={\n        "Accept": "text/event-stream",\n        "Cookie": "af_session=<YOUR_SESSION_COOKIE>",\n    },\n    stream=True,\n)\n\nfor event in SSEClient(response).events():\n    data = json.loads(event.data)\n    print(f"[{data['type']}] task={data.get('taskId','—')}")\n\n    if data["type"] == "task_failed":\n        send_pagerduty_alert(data)  # your integration here` },
        node: { title: 'bot.js', lang: 'Node.js', code: `// Node.js backend — e.g. a Slack bot or Lambda\nimport EventSource from 'eventsource';  // npm i eventsource\n\nconst source = new EventSource('${fullUrl}', {\n  headers: { Cookie: 'af_session=<YOUR_SESSION_COOKIE>' },\n});\n\nsource.onmessage = ({ data }) => {\n  const event = JSON.parse(data);\n\n  if (event.type === 'task_failed') {\n    await fetch('https://hooks.slack.com/your-webhook', {\n      method: 'POST',\n      body: JSON.stringify({ text: \`❌ Task failed: \${event.taskId}\` }),\n    });\n  }\n\n  if (event.type === 'task_completed') {\n    console.log('✅', event.taskId, event.payload?.latencyMs + 'ms');\n  }\n};` },
    };

    const SNIPPET_TABS: { key: 'js' | 'curl' | 'python' | 'node'; label: string }[] = [
        { key: 'js',     label: 'Browser JS' },
        { key: 'curl',   label: 'curl'        },
        { key: 'python', label: 'Python'      },
        { key: 'node',   label: 'Node.js'     },
    ];

    return (
        <div className="panel-stack">

            {/* ── Endpoint card ─────────────────────────────────── */}
            <section className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <span className="badge low" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Radio size={10} /> SSE · Real-time API
                    </span>
                </div>
                <h2>Live Task Stream</h2>
                <p className="panel-subtitle" style={{ maxWidth: 540 }}>
                    A persistent HTTP connection that pushes task lifecycle events the moment they happen —
                    no polling, no webhooks, no delays. Wire it into Slack, PagerDuty, a mobile app, or any CI pipeline.
                </p>

                {/* Endpoint row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', marginTop: '1rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                        <span style={{ padding: '6px 10px', background: 'rgba(26,122,74,0.1)', color: '#1a7a4a', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', borderRight: '1px solid var(--line)' }}>
                            GET
                        </span>
                        <code style={{ padding: '6px 12px', color: 'var(--ink)', fontSize: '0.82rem', fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', background: 'var(--bg)' }}>
                            {path}
                            {workspaceId && (
                                <span style={{ color: 'var(--ink-muted)' }}>
                                    ?workspaceId=<span style={{ color: 'var(--brand)' }}>{workspaceId.slice(0, 18)}</span>
                                </span>
                            )}
                        </code>
                        <button
                            type="button"
                            onClick={copyUrl}
                            style={{ padding: '6px 10px', background: 'var(--bg)', border: 'none', borderLeft: '1px solid var(--line)', color: urlCopied ? '#1a7a4a' : 'var(--ink-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            {urlCopied ? <Check size={11} /> : <Copy size={11} />}
                            {urlCopied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="primary-action"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                        <ExternalLink size={12} /> Open raw stream
                    </a>
                    <CopyBtn text={fullUrl} label="Copy full URL" />
                </div>

                {/* Meta pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {META_PILLS.map(({ icon: Icon, label, value }) => (
                        <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', fontSize: '0.78rem' }}>
                            <Icon size={11} style={{ color: 'var(--brand)' }} />
                            <span style={{ color: 'var(--ink-muted)' }}>{label}</span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{value}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Event types ───────────────────────────────────── */}
            <section className="card">
                <h3 className="panel-group-title">Event Types</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.6rem' }}>
                    {EVENT_TYPES.map(({ type, icon: Icon, colorVar, desc }) => (
                        <div key={type} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)' }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${colorVar}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={13} color={colorVar} />
                            </div>
                            <div>
                                <code style={{ fontSize: '0.75rem', fontWeight: 700, color: colorVar, fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', display: 'block', marginBottom: 3 }}>
                                    {type}
                                </code>
                                <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', lineHeight: 1.45 }}>{desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Code snippets ─────────────────────────────────── */}
            <section className="card">
                <h3 className="panel-group-title">Connect in your language</h3>
                {/* Language tab switcher */}
                <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', marginBottom: 0 }}>
                    {SNIPPET_TABS.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveSnippet(key)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px 6px 0 0',
                                border: 'none',
                                borderBottom: activeSnippet === key ? '2px solid var(--brand)' : '2px solid transparent',
                                background: 'transparent',
                                color: activeSnippet === key ? 'var(--brand)' : 'var(--ink-muted)',
                                fontSize: '0.82rem',
                                fontWeight: activeSnippet === key ? 600 : 400,
                                cursor: 'pointer',
                                marginBottom: '-1px',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <CodeBlock
                    code={snippets[activeSnippet].code}
                    language={snippets[activeSnippet].lang}
                    title={snippets[activeSnippet].title}
                />
            </section>

            {/* ── Event schema ──────────────────────────────────── */}
            <section className="card">
                <h3 className="panel-group-title">Event Schema</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                {['Field', 'Type', 'Description'].map(h => (
                                    <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {SCHEMA_FIELDS.map(({ name, type, req, desc, ex }, i) => (
                                <tr key={name} style={{ borderBottom: i < SCHEMA_FIELDS.length - 1 ? '1px solid var(--line)' : 'none' }}>
                                    <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>
                                        <code style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand)', fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' }}>{name}</code>
                                        {req && <span className="badge critical" style={{ marginLeft: 5, fontSize: '0.62rem', padding: '1px 5px' }}>REQ</span>}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.6rem' }}>
                                        <code style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' }}>{type}</code>
                                    </td>
                                    <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink)', lineHeight: 1.5 }}>
                                        {desc}
                                        {ex && <code style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', marginTop: 2 }}>e.g. {ex}</code>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── Integrations ──────────────────────────────────── */}
            <section className="card">
                <h3 className="panel-group-title">What you can build</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
                    {INTEGRATIONS.map(({ title, emoji, desc }) => (
                        <div key={title} style={{ padding: '0.85rem 1rem', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)' }}>
                            <div style={{ fontSize: '1.35rem', marginBottom: '0.4rem' }}>{emoji}</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.25rem' }}>{title}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>{desc}</div>
                        </div>
                    ))}
                </div>
            </section>

        </div>
    );
}
