'use client';

import { useState } from 'react';
import {
    Copy, Check, ExternalLink, Radio, Code2,
    ChevronDown, ChevronRight, Terminal, Globe, Zap,
} from 'lucide-react';

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: copied ? '#1a7a4a' : '#424245', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : label}
        </button>
    );
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
    return (
        <div style={{ position: 'relative', background: '#1d1d1f', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{language}</span>
                <CopyBtn text={code} label="Copy code" />
            </div>
            <pre style={{ margin: 0, padding: '14px 16px', fontSize: 12.5, lineHeight: 1.65, color: '#f5f5f7', overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace', whiteSpace: 'pre' }}>
                {code}
            </pre>
        </div>
    );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, children }: {
    title: string;
    icon: React.ElementType;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ border: '1px solid #d2d2d7', borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color="#0066cc" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.01em', flex: 1 }}>{title}</span>
                {open ? <ChevronDown size={15} color="#6e6e73" /> : <ChevronRight size={15} color="#6e6e73" />}
            </button>
            {open && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f0f2' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ── Schema field row ──────────────────────────────────────────────────────────

function FieldRow({ name, type, required, description, example }: {
    name: string; type: string; required?: boolean; description: string; example?: string;
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '150px 90px 1fr', gap: '0 16px', padding: '9px 0', borderBottom: '1px solid #f5f5f7', alignItems: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 12, fontWeight: 700, color: '#0066cc', fontFamily: 'ui-monospace, monospace' }}>{name}</code>
                {required && <span style={{ fontSize: 10, fontWeight: 700, color: '#c4161c', padding: '1px 5px', borderRadius: 4, background: 'rgba(196,22,28,0.07)', border: '1px solid rgba(196,22,28,0.18)' }}>req</span>}
            </div>
            <code style={{ fontSize: 11, color: '#6e6e73', fontFamily: 'ui-monospace, monospace', paddingTop: 1 }}>{type}</code>
            <div>
                <div style={{ fontSize: 13, color: '#424245', lineHeight: 1.45 }}>{description}</div>
                {example && <code style={{ fontSize: 11, color: '#aeaeb2', fontFamily: 'ui-monospace, monospace', marginTop: 2, display: 'block' }}>e.g. {example}</code>}
            </div>
        </div>
    );
}

// ── Event type badge ──────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; color: string }> = {
    task_queued:    { bg: 'rgba(180,83,9,0.07)',  color: '#b45309' },
    task_started:   { bg: 'rgba(0,102,204,0.07)', color: '#0066cc' },
    task_completed: { bg: 'rgba(26,122,74,0.07)', color: '#1a7a4a' },
    task_failed:    { bg: 'rgba(196,22,28,0.07)', color: '#c4161c' },
    task_cancelled: { bg: 'rgba(110,110,115,0.07)', color: '#6e6e73' },
    heartbeat:      { bg: 'rgba(110,110,115,0.07)', color: '#6e6e73' },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function SseStreamPanel({ workspaceId }: { workspaceId?: string }) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-dashboard.agentfarm.io';
    const endpointPath = '/api/sse/tasks';
    const fullUrl = workspaceId
        ? `${baseUrl}${endpointPath}?workspaceId=${encodeURIComponent(workspaceId)}`
        : `${baseUrl}${endpointPath}`;

    const jsCode = `const source = new EventSource(
  '${endpointPath}${workspaceId ? `?workspaceId=${workspaceId}` : '?workspaceId=YOUR_WORKSPACE_ID'}',
  { withCredentials: true }      // forwards the session cookie
);

source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);  // e.g. "task_completed" { taskId, ... }
};

source.addEventListener('task_failed', (event) => {
  const data = JSON.parse(event.data);
  // trigger PagerDuty / Slack alert here
  alert(\`Task \${data.taskId} failed\`);
});

source.onerror = () => {
  console.warn('SSE connection lost, browser will auto-reconnect');
};

// Reconnect from last event:
// new EventSource(url + '&lastEventId=' + lastId)`;

    const curlCode = `curl -N \\
  -H "Accept: text/event-stream" \\
  -H "Cookie: af_session=YOUR_SESSION_COOKIE" \\
  "${fullUrl}"

# Output:
# data: {"eventId":"evt_01","type":"task_queued","taskId":"tsk_abc","workspaceId":"ws_xyz","timestamp":"2025-05-30T14:00:00Z"}
#
# data: {"eventId":"evt_02","type":"task_started","taskId":"tsk_abc","workspaceId":"ws_xyz","timestamp":"2025-05-30T14:00:01Z"}`;

    const pythonCode = `import sseclient, requests

url = "${fullUrl}"
headers = {
    "Accept": "text/event-stream",
    "Cookie": "af_session=YOUR_SESSION_COOKIE",
}

response = requests.get(url, headers=headers, stream=True)
client = sseclient.SSEClient(response)

for event in client.events():
    import json
    data = json.loads(event.data)
    print(f"{data['type']} — task: {data.get('taskId', 'n/a')}")

    if data["type"] == "task_failed":
        send_slack_alert(data)  # your integration`;

    const nodeCode = `// Node.js (no browser required — e.g. in a Slack bot or Lambda)
import EventSource from 'eventsource';

const source = new EventSource(
  '${fullUrl}',
  { headers: { Cookie: 'af_session=YOUR_SESSION_COOKIE' } }
);

source.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.type === 'task_failed') {
    // POST to PagerDuty / create Jira ticket
    triggerIncident(event);
  }
};`;

    const examplePayload = `// Event envelope (all events share this shape)
{
  "eventId":    "evt_abc123",          // unique event ID — use as Last-Event-ID on reconnect
  "type":       "task_completed",      // see event types below
  "tenantId":   "ten_xyz",
  "workspaceId":"ws_abc",
  "taskId":     "tsk_def",             // present on all task_* events
  "timestamp":  "2025-05-30T14:03:22Z",
  "payload": {                         // optional, event-type specific
    "outcome": "success",
    "latencyMs": 1842,
    "model": "claude-sonnet-4-6"
  }
}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Hero card ──────────────────────────────────────────────── */}
            <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0066cc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                            Server-Sent Events
                        </div>
                        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                            Real-time Task Stream
                        </h3>
                        <p style={{ margin: '0 0 14px', fontSize: 14, color: '#6e6e73', lineHeight: 1.55, maxWidth: 520 }}>
                            A persistent HTTP connection that pushes task lifecycle events the moment they happen.
                            Wire it into Slack, PagerDuty, a mobile app, or any custom tool — no polling required.
                        </p>
                        {/* Endpoint pill */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: '#f5f5f7', border: '1px solid #d2d2d7', width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(26,122,74,0.09)', border: '1px solid rgba(26,122,74,0.22)', fontSize: 11, fontWeight: 700, color: '#1a7a4a' }}>GET</span>
                            <code style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{endpointPath}</code>
                            <CopyBtn text={fullUrl} label="Copy URL" />
                        </div>
                    </div>
                    {/* Stat pills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                        {[
                            { icon: Radio, label: 'Protocol', value: 'text/event-stream' },
                            { icon: Zap, label: 'Latency', value: 'sub-100 ms push' },
                            { icon: Globe, label: 'Auth', value: 'Session cookie' },
                        ].map(({ icon: Icon, label, value }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: '#f5f5f7', border: '1px solid #e5e5ea' }}>
                                <Icon size={13} color="#0066cc" />
                                <span style={{ fontSize: 12, color: '#6e6e73', fontWeight: 500 }}>{label}:</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 500, textDecoration: 'none', cursor: 'pointer' }}
                    >
                        <ExternalLink size={12} /> Open raw stream
                    </a>
                    <CopyBtn text={fullUrl} label="Copy full URL" />
                </div>
            </div>

            {/* ── Event types ────────────────────────────────────────────── */}
            <Section title="Event Types" icon={Radio}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 14 }}>
                    {Object.entries(EVENT_COLORS).map(([type, { bg, color }]) => (
                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 9999, background: bg, border: `1px solid ${color}44` }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <code style={{ fontSize: 12, fontWeight: 600, color, fontFamily: 'ui-monospace, monospace' }}>{type}</code>
                        </div>
                    ))}
                </div>
                <p style={{ fontSize: 13, color: '#6e6e73', marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>
                    <strong style={{ color: '#1d1d1f' }}>heartbeat</strong> is sent every 30 s to keep the connection alive through proxies.
                    Your client should ignore it or use it to detect stale connections.
                </p>
            </Section>

            {/* ── Event schema ───────────────────────────────────────────── */}
            <Section title="Event Schema" icon={Code2}>
                <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ borderBottom: '2px solid #f0f0f2', paddingBottom: 6, display: 'grid', gridTemplateColumns: '150px 90px 1fr', gap: '0 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Field</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</span>
                    </div>
                    <FieldRow name="eventId"     type="string"   required  description="Unique event ID. Pass as Last-Event-ID header on reconnect to replay missed events." example="evt_abc123" />
                    <FieldRow name="type"        type="string"   required  description="Event type — one of the 6 event types listed above." example="task_completed" />
                    <FieldRow name="tenantId"    type="string"   required  description="Tenant this event belongs to." example="ten_xyz" />
                    <FieldRow name="workspaceId" type="string"   required  description="Workspace this event belongs to." example="ws_abc" />
                    <FieldRow name="taskId"      type="string"             description="The task being acted on. Present on all task_* events, absent on heartbeat." example="tsk_def" />
                    <FieldRow name="timestamp"   type="ISO 8601" required  description="UTC timestamp of when the event was emitted." example="2025-05-30T14:03:22Z" />
                    <FieldRow name="payload"     type="object"             description="Event-specific metadata: outcome, latencyMs, model, errorMessage, etc." />
                    <div style={{ marginTop: 6 }}>
                        <CodeBlock code={examplePayload} language="JSON envelope" />
                    </div>
                </div>
            </Section>

            {/* ── Query parameters ───────────────────────────────────────── */}
            <Section title="Query Parameters" icon={Terminal} defaultOpen={false}>
                <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{ borderBottom: '2px solid #f0f0f2', paddingBottom: 6, display: 'grid', gridTemplateColumns: '150px 90px 1fr', gap: '0 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Param</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</span>
                    </div>
                    <FieldRow name="workspaceId" type="string" description="Filter events to a single workspace. Omit to receive events for all workspaces in your tenant." example="ws_abc" />
                </div>
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,102,204,0.06)', border: '1px solid rgba(0,102,204,0.18)', fontSize: 13, color: '#424245', lineHeight: 1.5 }}>
                    <strong>Reconnect:</strong> Set the <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 4 }}>Last-Event-ID</code> header to the last <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 4 }}>eventId</code> you received.
                    The gateway will replay any events you missed during the disconnect. Browsers handle this automatically via <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 4 }}>EventSource</code>.
                </div>
            </Section>

            {/* ── Code snippets ──────────────────────────────────────────── */}
            <Section title="Code Snippets" icon={Code2} defaultOpen={false}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Globe size={12} /> Browser — JavaScript EventSource
                        </div>
                        <CodeBlock code={jsCode} language="JavaScript" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Terminal size={12} /> Terminal — curl
                        </div>
                        <CodeBlock code={curlCode} language="curl" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Terminal size={12} /> Python — sseclient
                        </div>
                        <CodeBlock code={pythonCode} language="Python" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Terminal size={12} /> Node.js — backend / Slack bot
                        </div>
                        <CodeBlock code={nodeCode} language="Node.js" />
                    </div>
                </div>
            </Section>

            {/* ── Integration ideas ──────────────────────────────────────── */}
            <Section title="What you can build with this" icon={Zap} defaultOpen={false}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, paddingTop: 14 }}>
                    {[
                        { title: 'Slack alerts',        desc: 'Post task_failed events to a Slack channel. Include taskId, agent, and error context.' },
                        { title: 'PagerDuty incidents', desc: 'Auto-trigger an incident when a high-priority task fails or stalls for > 60 s.' },
                        { title: 'Mobile push',         desc: 'Fire push notifications when an approval is queued or a critical task completes.' },
                        { title: 'Custom dashboard',    desc: 'Build a real-time ops display (TV mode) without polling the REST API.' },
                        { title: 'Audit webhook relay', desc: 'Forward all events to an external SIEM or audit store for compliance.' },
                        { title: 'CI/CD gates',         desc: 'In a deploy pipeline, subscribe and wait for task_completed before proceeding.' },
                    ].map(({ title, desc }) => (
                        <div key={title} style={{ padding: '12px 14px', borderRadius: 12, background: '#f5f5f7', border: '1px solid #e5e5ea' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', marginBottom: 4 }}>{title}</div>
                            <div style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.5 }}>{desc}</div>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
