'use client';

import { useState } from 'react';

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

const PROVIDER_COLORS: Record<WebhookProvider, string> = {
    github: 'bg-zinc-700 text-zinc-200',
    gitlab: 'bg-orange-900/40 text-orange-300',
    jira: 'bg-blue-900/40 text-blue-300',
    linear: 'bg-purple-900/40 text-purple-300',
    pagerduty: 'bg-green-900/40 text-green-300',
    sentry: 'bg-red-900/40 text-red-300',
    custom: 'bg-zinc-700 text-zinc-400',
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
        <div className="flex flex-col gap-6 p-6 bg-zinc-900 min-h-screen text-zinc-100">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Webhook Manager</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        Register and monitor inbound webhooks from external services
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadEvents}
                        disabled={loadingEvents}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                        {loadingEvents ? 'Loading…' : 'Refresh Events'}
                    </button>
                    <button
                        onClick={() => setShowForm(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                    >
                        + Register Webhook
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Registration form */}
            {showForm && (
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
                    <h2 className="font-semibold text-sm">New Webhook Registration</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Provider</label>
                            <select
                                value={provider}
                                onChange={(e) => {
                                    setProvider(e.target.value as WebhookProvider);
                                    setSelectedEvents([]);
                                }}
                                className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm"
                            >
                                {(Object.keys(PROVIDER_EVENTS) as WebhookProvider[]).map((p) => (
                                    <option key={p} value={p}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Signing Secret</label>
                            <input
                                type="password"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                placeholder="Leave blank to auto-generate"
                                className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 mb-2 block">Events to listen for</label>
                        <div className="flex flex-wrap gap-2">
                            {PROVIDER_EVENTS[provider].map((event) => (
                                <button
                                    key={event}
                                    onClick={() => toggleEvent(event)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedEvents.includes(event) ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}
                                >
                                    {event.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-zinc-700/40 rounded-lg">
                        <span className="text-xs text-zinc-400 font-mono break-all">
                            {BASE_WEBHOOK_URL}/{provider}
                        </span>
                        <button
                            onClick={() => copyWebhookUrl(`${BASE_WEBHOOK_URL}/${provider}`)}
                            className="ml-auto text-xs text-blue-400 hover:text-blue-300 shrink-0"
                        >
                            {copied ? 'Copied!' : 'Copy URL'}
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={registerWebhook}
                            disabled={loading || selectedEvents.length === 0}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            {loading ? 'Registering…' : 'Register'}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Registrations table */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
                    <h2 className="font-semibold text-sm">Registered Webhooks</h2>
                    <button
                        onClick={loadRegistrations}
                        disabled={loading}
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        {loading ? 'Loading…' : 'Reload'}
                    </button>
                </div>
                {registrations.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                        No webhooks registered yet. Click "+ Register Webhook" to add one.
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-700">
                        {registrations.map((reg) => (
                            <div key={reg.id} className="flex items-center gap-4 px-4 py-3">
                                <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_COLORS[reg.provider]}`}
                                >
                                    {reg.provider}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-mono text-zinc-300 truncate">{reg.target_url}</p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {reg.events.join(', ')} · {reg.total_received} received
                                        {reg.last_received_at && ` · last: ${new Date(reg.last_received_at).toLocaleTimeString()}`}
                                    </p>
                                </div>
                                <span
                                    className={`text-xs font-medium ${reg.active ? 'text-green-400' : 'text-zinc-500'}`}
                                >
                                    {reg.active ? 'active' : 'paused'}
                                </span>
                                <div className="flex gap-1">
                                    {reg.active && (
                                        <button
                                            onClick={() => deactivateWebhook(reg.id)}
                                            className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors"
                                        >
                                            Pause
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteWebhook(reg.id)}
                                        className="px-2 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded text-xs transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent events */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-700">
                    <h2 className="font-semibold text-sm">Recent Events</h2>
                </div>
                {recentEvents.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 text-sm">
                        No recent events. Click "Refresh Events" to load.
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-700">
                        {recentEvents.map((event) => (
                            <div key={event.id} className="flex items-center gap-4 px-4 py-3">
                                <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_COLORS[event.provider]}`}
                                >
                                    {event.provider}
                                </span>
                                <span className="text-xs text-zinc-300">{event.event_type.replace('_', ' ')}</span>
                                <span className="text-xs text-zinc-500 ml-auto">
                                    {new Date(event.received_at).toLocaleTimeString()}
                                </span>
                                {event.loop_triggered && (
                                    <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded text-xs">
                                        loop triggered
                                    </span>
                                )}
                                <span
                                    className={`px-2 py-0.5 rounded text-xs ${event.signature_valid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}
                                >
                                    {event.signature_valid ? '✓ verified' : '✗ unverified'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
