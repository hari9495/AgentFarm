'use client';

import { useState } from 'react';
import {
    Copy, Check, ExternalLink, Radio,
    Zap, Globe, Shield, Terminal,
    AlertCircle, CheckCircle2, Clock, XCircle, MinusCircle, Heart,
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
    const sm = size === 'sm';
    return (
        <button onClick={copy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: sm ? '3px 9px' : '6px 12px',
            borderRadius: 9999,
            border: '1px solid', borderColor: copied ? 'rgba(26,122,74,0.3)' : '#d2d2d7',
            background: copied ? 'rgba(26,122,74,0.06)' : '#fff',
            color: copied ? '#1a7a4a' : '#424245',
            fontSize: sm ? 11 : 12, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s',
        }}>
            {copied ? <Check size={sm ? 10 : 12} /> : <Copy size={sm ? 10 : 12} />}
            {copied ? 'Copied!' : label}
        </button>
    );
}

// ── Syntax-highlighted code block ─────────────────────────────────────────────

function CodeBlock({ code, language, title }: { code: string; language: string; title?: string }) {
    const [expanded, setExpanded] = useState(false);
    const lines = code.split('\n');
    const shouldCollapse = lines.length > 16;
    const visible = shouldCollapse && !expanded ? lines.slice(0, 14).join('\n') + '\n…' : code;

    return (
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Top bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: '#161618',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Traffic lights */}
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
                            <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
                        ))}
                    </div>
                    {title && <span style={{ fontSize: 12, color: '#6e6e73', marginLeft: 4 }}>{title}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{language}</span>
                    <CopyBtn text={code} label="Copy" size="sm" />
                </div>
            </div>
            {/* Code */}
            <div style={{ background: '#1d1d1f', padding: '16px 18px', overflowX: 'auto' }}>
                <pre style={{
                    margin: 0, fontSize: 13, lineHeight: 1.7,
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    color: '#e5e5e7', whiteSpace: 'pre',
                }}>
                    {visible}
                </pre>
            </div>
            {shouldCollapse && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    style={{
                        width: '100%', padding: '8px', background: '#161618',
                        border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)',
                        color: '#6e6e73', fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                >
                    {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show {lines.length - 14} more lines</>}
                </button>
            )}
        </div>
    );
}

// ── Event type rows ────────────────────────────────────────────────────────────

const EVENT_TYPES = [
    { type: 'task_queued',    icon: Clock,        color: '#b45309', bg: 'rgba(180,83,9,0.08)',    desc: 'A new task was accepted and placed in the execution queue.' },
    { type: 'task_started',   icon: Zap,          color: '#0066cc', bg: 'rgba(0,102,204,0.08)',   desc: 'The runtime engine picked up the task and began execution.' },
    { type: 'task_completed', icon: CheckCircle2, color: '#1a7a4a', bg: 'rgba(26,122,74,0.08)',   desc: 'Task finished successfully. Payload contains outcome and cost.' },
    { type: 'task_failed',    icon: AlertCircle,  color: '#c4161c', bg: 'rgba(196,22,28,0.08)',   desc: 'Task terminated with an error. Check payload.errorMessage.' },
    { type: 'task_cancelled', icon: XCircle,      color: '#6e6e73', bg: 'rgba(110,110,115,0.08)', desc: 'Task was cancelled by an operator or a kill-switch trigger.' },
    { type: 'heartbeat',      icon: Heart,        color: '#aeaeb2', bg: 'rgba(174,174,178,0.08)', desc: 'Sent every 30 s to keep the connection alive through proxies. Ignore in your handler.' },
];

const SCHEMA_FIELDS = [
    { name: 'eventId',     type: 'string',   req: true,  desc: 'Unique ID. Pass as Last-Event-ID on reconnect to replay missed events.',            ex: 'evt_abc123'           },
    { name: 'type',        type: 'string',   req: true,  desc: 'One of the 6 event types above.',                                                   ex: 'task_completed'       },
    { name: 'tenantId',    type: 'string',   req: true,  desc: 'Tenant this event belongs to.',                                                     ex: 'ten_xyz'              },
    { name: 'workspaceId', type: 'string',   req: true,  desc: 'Workspace this event belongs to.',                                                  ex: 'ws_abc'               },
    { name: 'taskId',      type: 'string',   req: false, desc: 'The task being acted on. Present on all task_* events, absent on heartbeat.',       ex: 'tsk_def'              },
    { name: 'timestamp',   type: 'ISO 8601', req: true,  desc: 'UTC time the event was emitted.',                                                   ex: '2025-05-30T14:03:22Z' },
    { name: 'payload',     type: 'object',   req: false, desc: 'Event-specific metadata: outcome, latencyMs, model, errorMessage, etc.',           ex: undefined              },
];

const INTEGRATIONS = [
    { title: 'Slack alerts',         emoji: '💬', desc: 'Post task_failed events to a channel with full context — bot, task, error.' },
    { title: 'PagerDuty incidents',  emoji: '🚨', desc: 'Auto-create an incident when a high-priority task fails or stalls.' },
    { title: 'Mobile push',          emoji: '📱', desc: 'Notify on approval required or critical task completion.' },
    { title: 'Custom dashboard',     emoji: '📊', desc: 'Build a real-time ops display without polling the REST API.' },
    { title: 'Audit / SIEM relay',   emoji: '🔒', desc: 'Forward every event to Splunk, Datadog, or your compliance store.' },
    { title: 'CI/CD gates',          emoji: '⚙️', desc: 'Subscribe in a pipeline and block the next step until task_completed fires.' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function SseStreamPanel({ workspaceId }: { workspaceId?: string }) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-dashboard.io';
    const path = '/api/sse/tasks';
    const fullUrl = workspaceId ? `${origin}${path}?workspaceId=${encodeURIComponent(workspaceId)}` : `${origin}${path}`;
    const { copied: urlCopied, copy: copyUrl } = useCopy(fullUrl);

    const [activeSnippet, setActiveSnippet] = useState<'js' | 'curl' | 'python' | 'node'>('js');

    const wsParam = workspaceId ?? 'YOUR_WORKSPACE_ID';

    const snippets = {
        js: {
            title: 'browser.js',
            lang: 'JavaScript',
            code: `const source = new EventSource(
  '${path}?workspaceId=${wsParam}',
  { withCredentials: true }   // sends the session cookie
);

// Handle any event
source.onmessage = (e) => {
  const event = JSON.parse(e.data);
  console.log(event.type, event.taskId);
};

// Handle a specific event type
source.addEventListener('task_failed', (e) => {
  const { taskId, payload } = JSON.parse(e.data);
  notifySlack(\`Task \${taskId} failed: \${payload?.errorMessage}\`);
});

source.onerror = () => {
  // Browser reconnects automatically using Last-Event-ID
};`,
        },
        curl: {
            title: 'terminal',
            lang: 'curl',
            code: `curl -N \\
  -H "Accept: text/event-stream" \\
  -H "Cookie: af_session=<YOUR_SESSION_COOKIE>" \\
  "${fullUrl}"

# Sample output:
# data: {"eventId":"evt_01","type":"task_queued","taskId":"tsk_abc","timestamp":"2025-05-30T14:00:00Z"}
#
# data: {"eventId":"evt_02","type":"task_started","taskId":"tsk_abc","timestamp":"2025-05-30T14:00:01Z"}
#
# data: {"eventId":"evt_03","type":"task_completed","taskId":"tsk_abc","payload":{"outcome":"success","latencyMs":1842},"timestamp":"2025-05-30T14:00:03Z"}`,
        },
        python: {
            title: 'app.py',
            lang: 'Python',
            code: `import json, requests
from sseclient import SSEClient  # pip install sseclient-py

response = requests.get(
    "${fullUrl}",
    headers={
        "Accept": "text/event-stream",
        "Cookie": "af_session=<YOUR_SESSION_COOKIE>",
    },
    stream=True,
)

for event in SSEClient(response).events():
    data = json.loads(event.data)
    print(f"[{data['type']}] task={data.get('taskId','—')}")

    if data["type"] == "task_failed":
        send_pagerduty_alert(data)  # your integration here`,
        },
        node: {
            title: 'bot.js',
            lang: 'Node.js',
            code: `// Node.js backend — e.g. a Slack bot or Lambda
import EventSource from 'eventsource';  // npm i eventsource

const source = new EventSource('${fullUrl}', {
  headers: { Cookie: 'af_session=<YOUR_SESSION_COOKIE>' },
});

source.onmessage = ({ data }) => {
  const event = JSON.parse(data);

  if (event.type === 'task_failed') {
    await fetch('https://hooks.slack.com/your-webhook', {
      method: 'POST',
      body: JSON.stringify({ text: \`❌ Task failed: \${event.taskId}\` }),
    });
  }

  if (event.type === 'task_completed') {
    console.log('✅', event.taskId, event.payload?.latencyMs + 'ms');
  }
};`,
        },
    };

    const SNIPPET_TABS: { key: 'js' | 'curl' | 'python' | 'node'; label: string }[] = [
        { key: 'js',     label: 'Browser JS' },
        { key: 'curl',   label: 'curl'        },
        { key: 'python', label: 'Python'      },
        { key: 'node',   label: 'Node.js'     },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ═══════════════════════════════════════════════════════
                HERO — Endpoint + description side by side
            ═══════════════════════════════════════════════════════ */}
            <div style={{
                background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1829 60%, #0a1520 100%)',
                borderRadius: 18, padding: '28px 28px 24px', marginBottom: 16,
                position: 'relative', overflow: 'hidden',
            }}>
                {/* Subtle glow blob */}
                <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,102,204,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Radio size={13} color="#2997ff" />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#2997ff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Server-Sent Events · Real-time API
                        </span>
                    </div>

                    {/* Two-column: description left, meta right */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
                        <div>
                            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#f5f5f7', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                                Live Task Stream
                            </h2>
                            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#98989d', lineHeight: 1.6, maxWidth: 440 }}>
                                A persistent HTTP connection that pushes task lifecycle events
                                the moment they happen — no polling, no webhooks, no delays.
                                Wire it into Slack, PagerDuty, a mobile app, or any CI pipeline.
                            </p>

                            {/* Endpoint row */}
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 0,
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 10, overflow: 'hidden',
                            }}>
                                <span style={{
                                    padding: '8px 12px', background: 'rgba(26,122,74,0.3)',
                                    color: '#34d399', fontSize: 11, fontWeight: 800,
                                    letterSpacing: '0.06em', borderRight: '1px solid rgba(255,255,255,0.1)',
                                    flexShrink: 0,
                                }}>GET</span>
                                <code style={{ padding: '8px 14px', color: '#f5f5f7', fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>
                                    {path}
                                    {workspaceId && <span style={{ color: '#98989d' }}>?workspaceId=<span style={{ color: '#2997ff' }}>{workspaceId.slice(0, 18)}</span></span>}
                                </code>
                                <button onClick={copyUrl} style={{
                                    padding: '8px 12px', background: 'transparent',
                                    border: 'none', borderLeft: '1px solid rgba(255,255,255,0.1)',
                                    color: urlCopied ? '#34d399' : '#98989d', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                                    transition: 'color 0.15s',
                                }}>
                                    {urlCopied ? <Check size={12} /> : <Copy size={12} />}
                                    {urlCopied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 9999,
                                    background: '#0066cc', color: '#fff',
                                    fontSize: 13, fontWeight: 500, textDecoration: 'none',
                                }}>
                                    <ExternalLink size={12} /> Open raw stream
                                </a>
                                <CopyBtn text={fullUrl} label="Copy full URL" />
                            </div>
                        </div>

                        {/* Meta pills — right side, stacked */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                            {[
                                { icon: Radio,  label: 'Protocol', value: 'text/event-stream' },
                                { icon: Zap,    label: 'Latency',  value: 'sub-100 ms push'   },
                                { icon: Shield, label: 'Auth',     value: 'Session cookie'     },
                                { icon: Globe,  label: 'Reconnect',value: 'Last-Event-ID'      },
                            ].map(({ icon: Icon, label, value }) => (
                                <div key={label} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    minWidth: 200,
                                }}>
                                    <Icon size={13} color="#2997ff" />
                                    <span style={{ fontSize: 12, color: '#6e6e73', minWidth: 60 }}>{label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f5f5f7' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                EVENT TYPES — visual cards, not just pills
            ═══════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Event Types
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                    {EVENT_TYPES.map(({ type, icon: Icon, color, bg, desc }) => (
                        <div key={type} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '12px 14px', borderRadius: 12,
                            background: '#fff', border: `1px solid ${color}22`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                <Icon size={13} color={color} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <code style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace', display: 'block', marginBottom: 3 }}>
                                    {type}
                                </code>
                                <span style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.45 }}>{desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                CODE SNIPPETS — prominent, tabbed, default open
            ═══════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Connect in your language
                </div>
                {/* Language switcher */}
                <div style={{ display: 'flex', gap: 2, marginBottom: 0, background: '#161618', borderRadius: '14px 14px 0 0', padding: '8px 12px 0', borderBottom: 'none' }}>
                    {SNIPPET_TABS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveSnippet(key)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px 8px 0 0',
                                border: 'none', cursor: 'pointer',
                                background: activeSnippet === key ? '#1d1d1f' : 'transparent',
                                color: activeSnippet === key ? '#f5f5f7' : '#6e6e73',
                                fontSize: 12, fontWeight: activeSnippet === key ? 600 : 500,
                                transition: 'all 0.15s',
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
            </div>

            {/* ═══════════════════════════════════════════════════════
                SCHEMA — compact table, no collapse needed
            ═══════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Event Schema
                </div>
                <div style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 1fr', gap: '0 12px', padding: '9px 16px', background: '#f5f5f7', borderBottom: '1px solid #e5e5ea' }}>
                        {['Field', 'Type', 'Description'].map(h => (
                            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
                        ))}
                    </div>
                    {SCHEMA_FIELDS.map(({ name, type, req, desc, ex }, i) => (
                        <div key={name} style={{
                            display: 'grid', gridTemplateColumns: '130px 80px 1fr',
                            gap: '0 12px', padding: '10px 16px', alignItems: 'start',
                            borderBottom: i < SCHEMA_FIELDS.length - 1 ? '1px solid #f5f5f7' : 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <code style={{ fontSize: 12, fontWeight: 700, color: '#0066cc', fontFamily: 'ui-monospace, monospace' }}>{name}</code>
                                {req && <span style={{ fontSize: 9, fontWeight: 800, color: '#c4161c', padding: '1px 4px', borderRadius: 4, background: 'rgba(196,22,28,0.08)', border: '1px solid rgba(196,22,28,0.2)', lineHeight: 1.4 }}>REQ</span>}
                            </div>
                            <code style={{ fontSize: 11, color: '#6e6e73', fontFamily: 'ui-monospace, monospace', paddingTop: 1 }}>{type}</code>
                            <div>
                                <span style={{ fontSize: 13, color: '#424245', lineHeight: 1.45 }}>{desc}</span>
                                {ex && <code style={{ display: 'block', fontSize: 11, color: '#aeaeb2', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>e.g. {ex}</code>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                INTEGRATIONS — what to build
            ═══════════════════════════════════════════════════════ */}
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    What you can build
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {INTEGRATIONS.map(({ title, emoji, desc }) => (
                        <div key={title} style={{
                            padding: '14px 16px', borderRadius: 14,
                            background: '#fff', border: '1px solid #e5e5ea',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{ fontSize: 22, marginBottom: 8 }}>{emoji}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', marginBottom: 4, letterSpacing: '-0.01em' }}>{title}</div>
                            <div style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.5 }}>{desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
