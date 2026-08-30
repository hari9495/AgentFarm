'use client';

import { useState } from 'react';
import { UiKit, Masthead, Panel, Badge, Button } from './ui-kit';
import { WfThemeToggle } from './editorial';

type WebhookProvider = 'github' | 'gitlab' | 'jira' | 'linear' | 'pagerduty' | 'sentry' | 'custom';
type WebhookEventType =
    | 'push'
    | 'pull_request'
    | 'issue'
    | 'issue_comment'
    | 'workflow_run'
    | 'release'
    | 'incident'
    | 'alert'
    | 'deployment'
    | 'unknown';

type WebhookRegistration = {
    id: string;
    provider: WebhookProvider;
    events: WebhookEventType[];
    target_url: string;
    active: boolean;
    created_at: string;
    last_received_at?: string;
    total_received: number;
};

type RecentEvent = {
    id: string;
    provider: WebhookProvider;
    event_type: WebhookEventType;
    received_at: string;
    signature_valid: boolean;
    loop_triggered: boolean;
};

const PROVIDER_EVENTS: Record<WebhookProvider, WebhookEventType[]> = {
    github: ['push', 'pull_request', 'issue', 'issue_comment', 'workflow_run', 'release', 'deployment'],
    gitlab: ['push', 'pull_request', 'issue', 'deployment'],
    jira: ['issue', 'issue_comment', 'deployment'],
    linear: ['issue', 'issue_comment'],
    pagerduty: ['incident'],
    sentry: ['alert'],
    custom: ['push', 'pull_request', 'issue', 'incident', 'alert', 'unknown'],
};

const BASE_WEBHOOK_URL = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/ingest`
    : 'https://your-domain/api/webhooks/ingest';

export function WebhookManagerPanel() {
    const [registrations, setRegistrations] = useState<WebhookRegistration[]>([]);
    const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [provider, setProvider] = useState<WebhookProvider>('github');
    const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>([]);
    const [secret, setSecret] = useState('');
    const [copied, setCopied] = useState(false);

    const botId = 'default';

    const loadRegistrations = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/webhooks`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { registrations: WebhookRegistration[] };
            setRegistrations(data.registrations);
        } catch {
            setError('Failed to load webhook registrations');
        } finally {
            setLoading(false);
        }
    };

    const loadEvents = async () => {
        setLoadingEvents(true);
        try {
            const res = await fetch(`/api/runtime/${botId}/webhooks/events?limit=20`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { events: RecentEvent[] };
            setRecentEvents(data.events);
        } catch {
            setError('Failed to load events');
        } finally {
            setLoadingEvents(false);
        }
    };

    const registerWebhook = async () => {
        if (selectedEvents.length === 0) {
            setError('Select at least one event type');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/webhooks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    events: selectedEvents,
                    target_url: `${BASE_WEBHOOK_URL}/${provider}`,
                    secret: secret || crypto.randomUUID(),
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { registration: WebhookRegistration };
            setRegistrations((prev) => [data.registration, ...prev]);
            setShowForm(false);
            setSelectedEvents([]);
            setSecret('');
        } catch {
            setError('Failed to register webhook');
        } finally {
            setLoading(false);
        }
    };

    const deactivateWebhook = async (id: string) => {
        try {
            await fetch(`/api/runtime/${botId}/webhooks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) });
            setRegistrations((prev) => prev.map((r) => (r.id === id ? { ...r, active: false } : r)));
        } catch {
            setError('Failed to deactivate webhook');
        }
    };

    const deleteWebhook = async (id: string) => {
        try {
            await fetch(`/api/runtime/${botId}/webhooks/${id}`, { method: 'DELETE' });
            setRegistrations((prev) => prev.filter((r) => r.id !== id));
        } catch {
            setError('Failed to delete webhook');
        }
    };

    const toggleEvent = (event: WebhookEventType) => {
        setSelectedEvents((prev) =>
            prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
        );
    };

    const copyWebhookUrl = async (url: string) => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Developer Tools — Inbound"
                title="Webhook Manager"
                actions={
                    <>
                        <Button variant="ghost" size="sm" disabled={loadingEvents} onClick={loadEvents}>
                            {loadingEvents ? 'Loading…' : 'Refresh Events'}
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>+ Register Webhook</Button>
                        <WfThemeToggle />
                    </>
                }
            />

            <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto', width: '100%', display: 'grid', gap: 18 }}>
                {error && (
                    <div className="uk-panel" style={{ padding: 14, borderLeft: '2px solid var(--danger)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
                )}

                {/* Registration form */}
                {showForm && (
                    <Panel title="New webhook registration">
                        <div style={{ display: 'grid', gap: 16, marginTop: 4 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <label style={{ display: 'grid', gap: 5 }}>
                                    <span className="uk-eyebrow">Provider</span>
                                    <select
                                        className="uk-input"
                                        value={provider}
                                        onChange={(e) => { setProvider(e.target.value as WebhookProvider); setSelectedEvents([]); }}
                                    >
                                        {(Object.keys(PROVIDER_EVENTS) as WebhookProvider[]).map((p) => (
                                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label style={{ display: 'grid', gap: 5 }}>
                                    <span className="uk-eyebrow">Signing secret</span>
                                    <input
                                        type="password"
                                        className="uk-input"
                                        style={{ fontFamily: 'var(--font-plex-mono), monospace' }}
                                        value={secret}
                                        onChange={(e) => setSecret(e.target.value)}
                                        placeholder="Leave blank to auto-generate"
                                    />
                                </label>
                            </div>

                            <div>
                                <span className="uk-eyebrow" style={{ display: 'block', marginBottom: 8 }}>Events to listen for</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {PROVIDER_EVENTS[provider].map((event) => {
                                        const on = selectedEvents.includes(event);
                                        return (
                                            <button
                                                key={event}
                                                onClick={() => toggleEvent(event)}
                                                style={{
                                                    padding: '5px 11px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
                                                    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                                                    background: on ? 'var(--accent)' : 'transparent',
                                                    color: on ? 'var(--card)' : 'var(--ink-muted)',
                                                }}
                                            >
                                                {event.replace('_', ' ')}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="uk-panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                                <span className="uk-mono" style={{ fontSize: 12, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>{BASE_WEBHOOK_URL}/{provider}</span>
                                <button onClick={() => copyWebhookUrl(`${BASE_WEBHOOK_URL}/${provider}`)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                                    {copied ? 'Copied!' : 'Copy URL'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <Button variant="primary" size="sm" disabled={loading || selectedEvents.length === 0} onClick={registerWebhook}>
                                    {loading ? 'Registering…' : 'Register'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                            </div>
                        </div>
                    </Panel>
                )}

                {/* Registrations */}
                <Panel title="Registered webhooks" action={<button onClick={loadRegistrations} disabled={loading} className="uk-eyebrow" style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer' }}>{loading ? 'Loading…' : 'Reload'}</button>}>
                    {registrations.length === 0 ? (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>No webhooks registered yet. Click “+ Register Webhook” to add one.</div>
                    ) : (
                        <div style={{ display: 'grid' }}>
                            {registrations.map((reg) => (
                                <div key={reg.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                                    <Badge tone="neutral">{reg.provider}</Badge>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p className="uk-mono" style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reg.target_url}</p>
                                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>
                                            {reg.events.join(', ')} · {reg.total_received} received
                                            {reg.last_received_at && ` · last: ${new Date(reg.last_received_at).toLocaleTimeString()}`}
                                        </p>
                                    </div>
                                    <Badge tone={reg.active ? 'ok' : 'neutral'}>{reg.active ? 'active' : 'paused'}</Badge>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {reg.active && <Button variant="ghost" size="sm" onClick={() => deactivateWebhook(reg.id)}>Pause</Button>}
                                        <Button variant="danger" size="sm" onClick={() => deleteWebhook(reg.id)}>Delete</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                {/* Recent events */}
                <Panel title="Recent events">
                    {recentEvents.length === 0 ? (
                        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>No recent events. Click “Refresh Events” to load.</div>
                    ) : (
                        <div style={{ display: 'grid' }}>
                            {recentEvents.map((event) => (
                                <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                                    <Badge tone="neutral">{event.provider}</Badge>
                                    <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{event.event_type.replace('_', ' ')}</span>
                                    <span className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', marginLeft: 'auto' }}>{new Date(event.received_at).toLocaleTimeString()}</span>
                                    {event.loop_triggered && <Badge tone="accent">loop triggered</Badge>}
                                    <Badge tone={event.signature_valid ? 'ok' : 'err'}>{event.signature_valid ? '✓ verified' : '✗ unverified'}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </UiKit>
    );
}
