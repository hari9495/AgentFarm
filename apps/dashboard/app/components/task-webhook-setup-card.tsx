'use client';

import { useCallback, useEffect, useState } from 'react';

type OutboundWebhook = {
    id: string;
    url: string;
    events: string[];
    workspaceId: string | null;
    enabled: boolean;
    failureCount: number;
    createdAt: string;
};

type TaskWebhookSetupCardProps = {
    workspaceId?: string;
};

const TASK_EVENTS = ['task_completed', 'task_failed'] as const;

export function TaskWebhookSetupCard({ workspaceId }: TaskWebhookSetupCardProps) {
    const [webhooks, setWebhooks] = useState<OutboundWebhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    // create form
    const [showForm, setShowForm] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
        new Set(TASK_EVENTS),
    );

    const fetchWebhooks = useCallback(async () => {
        try {
            const res = await fetch('/api/outbound-webhooks');
            if (!res.ok) return;
            const data = (await res.json()) as { webhooks?: OutboundWebhook[] };
            const all = data.webhooks ?? [];
            // Show only task-related webhooks
            setWebhooks(
                all.filter((w) => w.events.some((e) => TASK_EVENTS.includes(e as typeof TASK_EVENTS[number]))),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchWebhooks(); }, [fetchWebhooks]);

    const handleCreate = async () => {
        if (!newUrl.trim() || !newUrl.startsWith('https://')) {
            setMessage({ text: 'URL must start with https://', ok: false });
            return;
        }
        if (selectedEvents.size === 0) {
            setMessage({ text: 'Select at least one event.', ok: false });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const payload: Record<string, unknown> = {
                url: newUrl.trim(),
                events: [...selectedEvents],
            };
            if (workspaceId) payload.workspaceId = workspaceId;

            const res = await fetch('/api/outbound-webhooks', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Failed to create webhook.', ok: false });
                return;
            }
            setMessage({ text: 'Webhook created. Task results will be delivered to this URL.', ok: true });
            setNewUrl('');
            setShowForm(false);
            await fetchWebhooks();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, url: string) => {
        if (!window.confirm(`Remove webhook to ${url}?`)) return;
        setDeleting(id);
        try {
            await fetch(`/api/outbound-webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
            setWebhooks((prev) => prev.filter((w) => w.id !== id));
            setMessage({ text: 'Webhook removed.', ok: true });
        } finally {
            setDeleting(null);
        }
    };

    const toggleEvent = (evt: string) => {
        setSelectedEvents((prev) => {
            const next = new Set(prev);
            if (next.has(evt)) next.delete(evt);
            else next.add(evt);
            return next;
        });
    };

    return (
        <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Output Delivery Webhooks</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#57534e' }}>
                        Push task results to your systems automatically when agents complete work.
                    </p>
                </div>
                {!showForm && (
                    <button type="button" className="primary-action" onClick={() => { setShowForm(true); setMessage(null); }}>
                        + Add webhook
                    </button>
                )}
            </div>

            {message && (
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: message.ok ? '#1a7a4a' : '#c4161c' }}>
                    {message.ok ? '✓ ' : '⚠ '}{message.text}
                </p>
            )}

            {/* Create form */}
            {showForm && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.85rem', display: 'grid', gap: '0.75rem' }}>
                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                            Destination URL <span style={{ color: '#6b7280', fontWeight: 400 }}>(must be https://)</span>
                        </label>
                        <input
                            type="url"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            placeholder="https://hooks.yourapp.com/agentfarm"
                            className="approval-input"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>Deliver on events</div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {TASK_EVENTS.map((evt) => (
                                <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedEvents.has(evt)}
                                        onChange={() => toggleEvent(evt)}
                                        style={{ width: 15, height: 15 }}
                                    />
                                    <code style={{ fontFamily: 'ui-monospace, monospace', background: '#f3f4f6', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.78rem' }}>
                                        {evt}
                                    </code>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Sample payload preview */}
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                            Sample payload
                        </div>
                        <pre style={{ margin: 0, background: '#1d1d1f', color: '#a8e6cf', padding: '0.65rem 0.75rem', borderRadius: '0.4rem', fontSize: '0.73rem', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, overflowX: 'auto' }}>
{`{
  "eventType": "task_completed",
  "tenantId": "ten_abc123",
  "workspaceId": "${workspaceId ?? 'ws_abc123'}",
  "timestamp": "2026-06-03T09:00:00.000Z",
  "taskId": "task_xyz",
  "botId": "bot_developer",
  "outcome": "success",
  "durationMs": 4200,
  "costUsd": 0.0012,
  "outputSummary": "Fixed login bug in auth.ts — null check added"
}`}
                        </pre>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => void handleCreate()}
                            disabled={saving || !newUrl.trim()}
                        >
                            {saving ? 'Creating…' : 'Create webhook'}
                        </button>
                        <button
                            type="button"
                            className="chip-button"
                            onClick={() => { setShowForm(false); setMessage(null); }}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Webhook list */}
            {loading && <p style={{ margin: 0, fontSize: '0.83rem', color: '#78716c' }}>Loading…</p>}

            {!loading && webhooks.length === 0 && !showForm && (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f9fafb', borderRadius: '0.4rem', border: '1px dashed #e5e7eb' }}>
                    <div style={{ fontSize: '1.3rem', marginBottom: '0.35rem' }}>🔗</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '0.2rem' }}>No delivery webhooks yet</div>
                    <div style={{ fontSize: '0.78rem', color: '#78716c' }}>
                        Add a webhook URL and task results will be pushed there automatically.
                    </div>
                </div>
            )}

            {webhooks.length > 0 && (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {webhooks.map((wh) => (
                        <div key={wh.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.75rem', background: '#f9fafb', borderRadius: '0.4rem', border: '1px solid #e5e7eb' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                                    <span style={{ padding: '0.1rem 0.4rem', borderRadius: 9999, background: wh.enabled ? 'rgba(26,122,74,0.08)' : '#f3f4f6', color: wh.enabled ? '#1a7a4a' : '#6b7280', fontSize: '0.7rem', fontWeight: 700 }}>
                                        {wh.enabled ? 'active' : 'disabled'}
                                    </span>
                                    {wh.failureCount > 0 && (
                                        <span style={{ padding: '0.1rem 0.4rem', borderRadius: 9999, background: 'rgba(196,22,28,0.08)', color: '#c4161c', fontSize: '0.7rem', fontWeight: 700 }}>
                                            {wh.failureCount} failures
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.83rem', color: '#1d1d1f', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', marginBottom: '0.2rem' }}>
                                    {wh.url}
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {wh.events.map((e) => (
                                        <code key={e} style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.3rem', borderRadius: '0.2rem' }}>
                                            {e}
                                        </code>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleDelete(wh.id, wh.url)}
                                disabled={deleting === wh.id}
                                style={{ padding: '0.25rem 0.55rem', borderRadius: 6, border: '1px solid rgba(196,22,28,0.2)', background: 'rgba(196,22,28,0.05)', color: '#c4161c', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                            >
                                {deleting === wh.id ? '…' : 'Remove'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <p style={{ margin: '0.65rem 0 0', fontSize: '0.73rem', color: '#a8a29e' }}>
                Webhooks are signed with HMAC-SHA256. Verify the <code style={{ fontFamily: 'ui-monospace, monospace' }}>X-AgentFarm-Signature</code> header in your receiver.
            </p>
        </section>
    );
}
