'use client';

import { useEffect, useState, useCallback } from 'react';

type OutboundWebhooksPanelProps = { tenantId: string };

type DlqEntry = {
    id: string;
    webhookId: string;
    tenantId: string;
    reason: string;
    lastPayload: unknown;
    lastEventType: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
};

type DeliveryRecord = {
    id: string;
    webhookId: string;
    tenantId: string;
    eventType: string;
    payload: unknown;
    responseStatus: number | null;
    responseBody: string | null;
    durationMs: number | null;
    success: boolean;
    firedAt: string;
};

type EventDefinition = {
    eventType: string;
    schemaVersion: string;
    description: string;
    fields: unknown[];
    examplePayload: Record<string, unknown>;
};

type ActiveTab = 'registered' | 'dlq' | 'deliveries' | 'catalog';

type RegisteredWebhook = {
    id: string;
    url: string;
    events: string[];
    enabled: boolean;
    createdAt: string;
};

type ReplayResult = { success: boolean; status: number };

export default function OutboundWebhooksPanel({ tenantId: _tenantId }: OutboundWebhooksPanelProps) {
    const [activeTab, setActiveTab] = useState<ActiveTab>('registered');

    // Registered webhooks tab state
    const [webhooks, setWebhooks]           = useState<RegisteredWebhook[]>([]);
    const [webhooksLoading, setWHLoading]   = useState(false);
    const [testing, setTesting]             = useState<string | null>(null);
    const [testResults, setTestResults]     = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [dlq, setDlq] = useState<DlqEntry[]>([]);
    const [showResolved, setShowResolved] = useState(false);
    const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
    const [webhookIdInput, setWebhookIdInput] = useState('');
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [events, setEvents] = useState<EventDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [deliveriesLoading, setDeliveriesLoading] = useState(false);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retrying, setRetrying] = useState<string | null>(null);
    const [replaying, setReplaying] = useState<string | null>(null);
    const [replayResults, setReplayResults] = useState<Record<string, ReplayResult>>({});

    const fetchDlq = useCallback(async (resolved: boolean) => {
        try {
            const res = await fetch(
                `/api/webhooks-ops/dlq?resolved=${resolved ? 'true' : 'false'}`,
                { cache: 'no-store' },
            );
            const data = (await res.json()) as { dlq?: DlqEntry[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load DLQ entries.');
            } else {
                setDlq(data.dlq ?? []);
                setError(null);
            }
        } catch {
            setError('Network error loading DLQ entries.');
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchDlq(showResolved).finally(() => setLoading(false));
    }, [fetchDlq, showResolved]);

    const fetchDeliveries = useCallback(async (webhookId: string) => {
        setDeliveriesLoading(true);
        setDeliveries([]);
        setError(null);
        try {
            const res = await fetch(
                `/api/webhooks-ops/deliveries/${encodeURIComponent(webhookId)}`,
                { cache: 'no-store' },
            );
            const data = (await res.json()) as { deliveries?: DeliveryRecord[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load deliveries.');
            } else {
                setDeliveries(data.deliveries ?? []);
                setError(null);
            }
        } catch {
            setError('Network error loading deliveries.');
        } finally {
            setDeliveriesLoading(false);
        }
    }, []);

    const fetchEvents = useCallback(async () => {
        if (eventsLoaded) return;
        setEventsLoading(true);
        try {
            const res = await fetch('/api/webhooks-ops/events', { cache: 'no-store' });
            const data = (await res.json()) as { events?: EventDefinition[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load event catalog.');
            } else {
                setEvents(data.events ?? []);
                setEventsLoaded(true);
                setError(null);
            }
        } catch {
            setError('Network error loading event catalog.');
        } finally {
            setEventsLoading(false);
        }
    }, [eventsLoaded]);

    useEffect(() => {
        if (activeTab === 'catalog') {
            void fetchEvents();
        }
    }, [activeTab, fetchEvents]);

    async function handleRetry(dlqId: string) {
        if (!window.confirm('Retry this DLQ entry? This will re-enable the webhook and replay the last delivery.')) return;
        setRetrying(dlqId);
        try {
            const res = await fetch(
                `/api/webhooks-ops/dlq/${encodeURIComponent(dlqId)}/retry`,
                { method: 'POST' },
            );
            const data = (await res.json()) as { retried?: boolean; error?: string; message?: string };
            if (!res.ok) {
                window.alert(data.message ?? data.error ?? 'Retry failed.');
                return;
            }
            await fetchDlq(showResolved);
        } catch {
            window.alert('Network error retrying DLQ entry.');
        } finally {
            setRetrying(null);
        }
    }

    async function handleReplay(deliveryId: string) {
        setReplaying(deliveryId);
        try {
            const res = await fetch(
                `/api/webhooks-ops/deliveries/replay/${encodeURIComponent(deliveryId)}`,
                { method: 'POST' },
            );
            const data = (await res.json()) as {
                replayed?: boolean;
                success?: boolean;
                status?: number;
                error?: string;
            };
            if (!res.ok) {
                window.alert(data.error ?? 'Replay failed.');
                return;
            }
            setReplayResults((prev) => ({
                ...prev,
                [deliveryId]: { success: data.success ?? false, status: data.status ?? 0 },
            }));
        } catch {
            window.alert('Network error replaying delivery.');
        } finally {
            setReplaying(null);
        }
    }

    const fetchWebhooks = useCallback(async () => {
        setWHLoading(true);
        try {
            const res = await fetch('/api/outbound-webhooks', { cache: 'no-store' });
            const data = (await res.json()) as { webhooks?: RegisteredWebhook[]; error?: string };
            if (res.ok) setWebhooks(data.webhooks ?? []);
        } catch { /* ignore */ }
        finally { setWHLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'registered') void fetchWebhooks();
    }, [activeTab, fetchWebhooks]);

    async function handleTest(webhookId: string) {
        setTesting(webhookId);
        setTestResults(prev => ({ ...prev, [webhookId]: { ok: false, msg: 'Sending…' } }));
        try {
            const res = await fetch(`/api/outbound-webhooks/${encodeURIComponent(webhookId)}/test`, { method: 'POST' });
            const data = (await res.json()) as { dispatched?: boolean; error?: string; message?: string };
            if (res.ok && data.dispatched) {
                setTestResults(prev => ({ ...prev, [webhookId]: { ok: true, msg: '✓ Test payload sent' } }));
            } else {
                setTestResults(prev => ({ ...prev, [webhookId]: { ok: false, msg: data.message ?? data.error ?? 'Failed' } }));
            }
        } catch {
            setTestResults(prev => ({ ...prev, [webhookId]: { ok: false, msg: 'Network error' } }));
        } finally {
            setTesting(null);
            // Clear result after 4 s
            setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[webhookId]; return n; }), 4000);
        }
    }

    function handleDeliveriesSubmit(e: React.FormEvent) {
        e.preventDefault();
        const id = webhookIdInput.trim();
        if (!id) return;
        setSelectedWebhookId(id);
        void fetchDeliveries(id);
    }

    const TAB_BTN: (tab: ActiveTab) => React.CSSProperties = (tab) => ({
        padding: '0.45rem 1rem',
        fontSize: '0.85rem',
        fontWeight: activeTab === tab ? 600 : 400,
        color: activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)',
        background: 'transparent',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: activeTab === tab ? '2px solid var(--ink)' : '2px solid transparent',
        cursor: 'pointer',
    });

    const TH: React.CSSProperties = { padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 };
    const TD: React.CSSProperties = { padding: '0.65rem 0.75rem' };
    const TD_MUTED: React.CSSProperties = { padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' };
    const TD_SOFT: React.CSSProperties = { padding: '0.65rem 0.75rem', color: 'var(--ink-soft)' };

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--ink)' }}>
                Outbound Webhook Operations
            </h2>

            {/* Tab bar */}
            <div
                style={{
                    display: 'flex',
                    gap: '0.25rem',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: '1.25rem',
                }}
            >
                <button style={TAB_BTN('registered')} onClick={() => setActiveTab('registered')}>Registered</button>
                <button style={TAB_BTN('dlq')} onClick={() => setActiveTab('dlq')}>DLQ</button>
                <button style={TAB_BTN('deliveries')} onClick={() => setActiveTab('deliveries')}>Deliveries</button>
                <button style={TAB_BTN('catalog')} onClick={() => setActiveTab('catalog')}>Event Catalog</button>
            </div>

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        background: 'var(--danger-bg)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: 'var(--danger)',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* ── Registered webhooks tab ── */}
            {activeTab === 'registered' && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', margin: 0 }}>
                            Outbound webhooks registered for this tenant. Use the <strong>Test</strong> button to fire a sample payload.
                        </p>
                        <button
                            onClick={() => void fetchWebhooks()}
                            disabled={webhooksLoading}
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.8rem', borderRadius: '0.4rem', border: '1px solid var(--line)', background: 'var(--card)', cursor: 'pointer', color: 'var(--ink-soft)' }}
                        >
                            {webhooksLoading ? 'Loading…' : '↻ Refresh'}
                        </button>
                    </div>
                    {webhooksLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1,2,3].map(i => <div key={i} style={{ height: 48, borderRadius: 8, background: 'var(--bg-deep)' }} />)}
                        </div>
                    )}
                    {!webhooksLoading && webhooks.length === 0 && (
                        <p style={{ fontSize: '0.83rem', color: 'var(--ink-muted)', padding: '1rem 0' }}>
                            No outbound webhooks registered yet. Create one from the Webhooks settings page.
                        </p>
                    )}
                    {!webhooksLoading && webhooks.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={TH}>URL</th>
                                    <th style={TH}>Events</th>
                                    <th style={TH}>Status</th>
                                    <th style={TH}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {webhooks.map(wh => {
                                    const result = testResults[wh.id];
                                    return (
                                        <tr key={wh.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <td style={{ ...TD, fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {wh.url}
                                            </td>
                                            <td style={TD_MUTED}>
                                                {Array.isArray(wh.events) ? wh.events.slice(0, 2).join(', ') + (wh.events.length > 2 ? ` +${wh.events.length - 2}` : '') : '—'}
                                            </td>
                                            <td style={TD}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
                                                    background: wh.enabled ? 'var(--ok-bg)' : 'var(--bg)',
                                                    color: wh.enabled ? 'var(--ok)' : 'var(--ink-muted)',
                                                }}>
                                                    {wh.enabled ? 'Active' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td style={TD}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <button
                                                        onClick={() => void handleTest(wh.id)}
                                                        disabled={testing === wh.id}
                                                        style={{
                                                            fontSize: '0.75rem', fontWeight: 600,
                                                            padding: '0.3rem 0.8rem', borderRadius: '0.4rem',
                                                            border: '1px solid var(--accent, #2563EB)',
                                                            background: testing === wh.id ? 'var(--line)' : 'var(--accent, #2563EB)',
                                                            color: testing === wh.id ? 'var(--ink-muted)' : 'var(--card)',
                                                            cursor: testing === wh.id ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        {testing === wh.id ? 'Sending…' : '▶ Test'}
                                                    </button>
                                                    {result && (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: result.ok ? 'var(--ok)' : 'var(--danger)' }}>
                                                            {result.msg}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── DLQ tab ── */}
            {activeTab === 'dlq' && (
                <div>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label
                            style={{
                                fontSize: '0.85rem',
                                color: 'var(--ink-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={showResolved}
                                onChange={(e) => setShowResolved(e.target.checked)}
                            />
                            Show resolved
                        </label>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={TH}>Webhook ID</th>
                                    <th style={TH}>Event</th>
                                    <th style={TH}>Reason</th>
                                    <th style={TH}>Created</th>
                                    <th style={TH}>Resolved</th>
                                    <th style={TH}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                            Loading…
                                        </td>
                                    </tr>
                                )}
                                {!loading && dlq.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                        >
                                            {showResolved ? 'No resolved DLQ entries.' : 'No DLQ entries.'}
                                        </td>
                                    </tr>
                                )}
                                {!loading && dlq.map((entry) => (
                                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={TD}>
                                            <code style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }} title={entry.webhookId}>
                                                {entry.webhookId.slice(0, 12)}…
                                            </code>
                                        </td>
                                        <td style={TD_SOFT}>{entry.lastEventType}</td>
                                        <td
                                            style={{
                                                padding: '0.65rem 0.75rem',
                                                color: 'var(--ink-soft)',
                                                maxWidth: '200px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={entry.reason}
                                        >
                                            {entry.reason}
                                        </td>
                                        <td style={TD_MUTED}>{new Date(entry.createdAt).toLocaleString()}</td>
                                        <td style={TD_MUTED}>
                                            {entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleString() : '—'}
                                        </td>
                                        <td style={TD}>
                                            {!entry.resolvedAt && (
                                                <button
                                                    onClick={() => void handleRetry(entry.id)}
                                                    disabled={retrying === entry.id}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--line)',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg)',
                                                        color: 'var(--ink)',
                                                        cursor: retrying === entry.id ? 'not-allowed' : 'pointer',
                                                        opacity: retrying === entry.id ? 0.6 : 1,
                                                    }}
                                                >
                                                    {retrying === entry.id ? 'Retrying…' : 'Retry'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Deliveries tab ── */}
            {activeTab === 'deliveries' && (
                <div>
                    <form
                        onSubmit={handleDeliveriesSubmit}
                        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}
                    >
                        <input
                            type="text"
                            placeholder="Webhook ID"
                            value={webhookIdInput}
                            onChange={(e) => setWebhookIdInput(e.target.value)}
                            style={{
                                flex: 1,
                                padding: '0.4rem 0.75rem',
                                border: '1px solid var(--line)',
                                borderRadius: '5px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                fontSize: '0.85rem',
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                padding: '0.4rem 0.9rem',
                                fontSize: '0.85rem',
                                border: '1px solid var(--line)',
                                borderRadius: '5px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                cursor: 'pointer',
                            }}
                        >
                            Fetch
                        </button>
                    </form>

                    {!selectedWebhookId && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                            Enter a webhook ID above to view its delivery history.
                        </p>
                    )}

                    {selectedWebhookId && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                        <th style={TH}>Delivery ID</th>
                                        <th style={TH}>Event</th>
                                        <th style={TH}>HTTP Status</th>
                                        <th style={TH}>Success</th>
                                        <th style={TH}>Attempted At</th>
                                        <th style={TH}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deliveriesLoading && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                                Loading…
                                            </td>
                                        </tr>
                                    )}
                                    {!deliveriesLoading && deliveries.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                            >
                                                No deliveries found for this webhook.
                                            </td>
                                        </tr>
                                    )}
                                    {!deliveriesLoading && deliveries.map((d) => {
                                        const replayResult = replayResults[d.id];
                                        return (
                                            <tr key={d.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={TD}>
                                                    <code style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }} title={d.id}>
                                                        {d.id.slice(0, 12)}…
                                                    </code>
                                                </td>
                                                <td style={TD_SOFT}>{d.eventType}</td>
                                                <td style={TD_SOFT}>{d.responseStatus ?? '—'}</td>
                                                <td style={TD}>
                                                    <span
                                                        style={{
                                                            fontWeight: 600,
                                                            fontSize: '0.85rem',
                                                            color: d.success ? 'var(--ok)' : 'var(--danger)',
                                                        }}
                                                    >
                                                        {d.success ? '✓' : '✗'}
                                                    </span>
                                                </td>
                                                <td style={TD_MUTED}>{new Date(d.firedAt).toLocaleString()}</td>
                                                <td style={{ padding: '0.65rem 0.75rem', minWidth: '130px' }}>
                                                    {replayResult ? (
                                                        <span
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                color: replayResult.success ? 'var(--ok)' : 'var(--danger)',
                                                            }}
                                                        >
                                                            {replayResult.success
                                                                ? `Replayed ✓ (HTTP ${replayResult.status})`
                                                                : `Replayed ✗ (HTTP ${replayResult.status})`}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => void handleReplay(d.id)}
                                                            disabled={replaying === d.id}
                                                            style={{
                                                                padding: '0.25rem 0.6rem',
                                                                fontSize: '0.75rem',
                                                                border: '1px solid var(--line)',
                                                                borderRadius: '4px',
                                                                background: 'var(--bg)',
                                                                color: 'var(--ink)',
                                                                cursor: replaying === d.id ? 'not-allowed' : 'pointer',
                                                                opacity: replaying === d.id ? 0.6 : 1,
                                                            }}
                                                        >
                                                            {replaying === d.id ? 'Replaying…' : 'Replay'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Event Catalog tab ── */}
            {activeTab === 'catalog' && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                <th style={TH}>Event Type</th>
                                <th style={TH}>Description</th>
                                <th style={TH}>Schema Version</th>
                            </tr>
                        </thead>
                        <tbody>
                            {eventsLoading && (
                                <tr>
                                    <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                        Loading…
                                    </td>
                                </tr>
                            )}
                            {!eventsLoading && events.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={3}
                                        style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                    >
                                        No events in catalog.
                                    </td>
                                </tr>
                            )}
                            {!eventsLoading && events.map((evt) => (
                                <tr key={evt.eventType} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={TD}>
                                        <code style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{evt.eventType}</code>
                                    </td>
                                    <td style={TD_SOFT}>{evt.description}</td>
                                    <td style={TD_MUTED}>{evt.schemaVersion}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
