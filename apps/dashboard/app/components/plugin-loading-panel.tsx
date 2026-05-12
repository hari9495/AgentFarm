'use client';

import { useEffect, useMemo, useState } from 'react';

type PluginLoadRecord = {
    pluginKey: string;
    loadStatus: 'loaded' | 'rejected' | 'disabled';
    trustLevel: 'trusted' | 'untrusted' | 'unknown';
    rejectionReason?: string;
    loadedAt: string;
};

type PluginKillSwitch = {
    pluginKey: string;
    status: 'active' | 'resolved';
    reason: string;
};

type PluginAuditEvent = {
    pluginKey: string;
    eventType: 'plugin_load' | 'plugin_reject' | 'plugin_disable' | 'plugin_enable';
    message: string;
    createdAt: string;
};

type PluginStatusResponse = {
    workspace_id: string;
    feature_enabled: boolean;
    load_records: PluginLoadRecord[];
    kill_switches: PluginKillSwitch[];
};

type PluginAuditResponse = {
    events: PluginAuditEvent[];
};

type PluginHistoryRecord = {
    id: string;
    pluginKey: string;
    tenantId: string;
    workspaceId: string;
    trustLevel: string;
    loadStatus: string;
    rejectionReason: string | null;
    loadedAt: string;
};

const LOAD_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    loaded: { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
    disabled: { bg: '#fef9c3', color: '#854d0e' },
};

function loadStatusBadge(status: string) {
    const style = LOAD_STATUS_BADGE[status] ?? { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: style.bg, color: style.color }}>
            {status}
        </span>
    );
}

export function PluginLoadingPanel({ workspaceId }: { workspaceId: string }) {
    const [status, setStatus] = useState<PluginStatusResponse | null>(null);
    const [audit, setAudit] = useState<PluginAuditEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [historyKey, setHistoryKey] = useState('');
    const [history, setHistory] = useState<PluginHistoryRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [disabling, setDisabling] = useState<string | null>(null);
    const [enabling, setEnabling] = useState<string | null>(null);
    const [disableKey, setDisableKey] = useState('');
    const [allowlistKey, setAllowlistKey] = useState('');
    const [allowlistCaps, setAllowlistCaps] = useState('');
    const [allowlistSaving, setAllowlistSaving] = useState(false);
    const [allowlistMsg, setAllowlistMsg] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const run = async () => {
            setError(null);

            const [statusRes, auditRes] = await Promise.all([
                fetch(`/api/approvals/plugins/status?workspace_id=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' }),
                fetch('/api/approvals/plugins/audit', { cache: 'no-store' }),
            ]);

            const statusBody = (await statusRes.json().catch(() => ({}))) as PluginStatusResponse & { message?: string; error?: string };
            const auditBody = (await auditRes.json().catch(() => ({}))) as PluginAuditResponse & { message?: string; error?: string };

            if (!active) return;

            if (!statusRes.ok) {
                setError(statusBody.message ?? statusBody.error ?? 'Failed to load plugin status.');
                return;
            }

            if (!auditRes.ok) {
                setError(auditBody.message ?? auditBody.error ?? 'Failed to load plugin audit events.');
                return;
            }

            setStatus(statusBody);
            setAudit(auditBody.events ?? []);
        };

        void run();
        return () => {
            active = false;
        };
    }, [workspaceId, refreshKey]);

    const activeKillSwitches = useMemo(
        () => (status?.kill_switches ?? []).filter((row) => row.status === 'active'),
        [status],
    );

    const fetchHistory = async () => {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const params = new URLSearchParams();
            if (historyKey.trim()) params.set('pluginKey', historyKey.trim());
            const res = await fetch(`/api/plugins/history?${params.toString()}`, { cache: 'no-store' });
            const d = (await res.json().catch(() => ({}))) as { records?: PluginHistoryRecord[]; message?: string };
            if (!res.ok) {
                setHistoryError(d.message ?? 'Failed to load plugin history.');
                return;
            }
            setHistory(d.records ?? []);
        } catch {
            setHistoryError('Failed to load plugin history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleDisable = async (pluginKey: string) => {
        if (!window.confirm(`Disable plugin ${pluginKey}?`)) return;
        setDisabling(pluginKey);
        try {
            await fetch(`/api/plugins/${encodeURIComponent(pluginKey)}/disable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                cache: 'no-store',
            });
            setRefreshKey(k => k + 1);
        } finally {
            setDisabling(null);
        }
    };

    const handleEnable = async (pluginKey: string) => {
        setEnabling(pluginKey);
        try {
            await fetch(`/api/plugins/${encodeURIComponent(pluginKey)}/enable`, {
                method: 'POST',
                cache: 'no-store',
            });
            setRefreshKey(k => k + 1);
        } finally {
            setEnabling(null);
        }
    };

    const handleAllowlistUpsert = async () => {
        if (!allowlistKey.trim()) {
            setAllowlistMsg('Plugin Key is required.');
            return;
        }
        const caps = allowlistCaps.split(',').map(c => c.trim()).filter(Boolean);
        setAllowlistSaving(true);
        setAllowlistMsg(null);
        try {
            const res = await fetch('/api/plugins/allowlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    plugin_key: allowlistKey,
                    allowed_capabilities: caps,
                }),
                cache: 'no-store',
            });
            if (res.ok) {
                setAllowlistMsg('Allowlist updated.');
            } else {
                const d = (await res.json().catch(() => ({}))) as { message?: string };
                setAllowlistMsg(d.message ?? 'Failed to update allowlist.');
            }
        } catch {
            setAllowlistMsg('Failed to update allowlist.');
        } finally {
            setAllowlistSaving(false);
        }
    };

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <h2>External Plugin Loading Controls</h2>
            <p style={{ margin: '-0.4rem 0 0.7rem', fontSize: '0.84rem', color: '#57534e' }}>
                Workspace allowlist enforcement, trust checks, and kill-switch state for C2 plugin onboarding.
            </p>

            {error && <p className="message-inline">{error}</p>}

            {status && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
                        <div className="card" style={{ padding: '0.6rem' }}>
                            <strong>{status.feature_enabled ? 'enabled' : 'disabled'}</strong>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Feature flag</p>
                        </div>
                        <div className="card" style={{ padding: '0.6rem' }}>
                            <strong>{status.load_records.length}</strong>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Load attempts</p>
                        </div>
                        <div className="card" style={{ padding: '0.6rem' }}>
                            <strong>{activeKillSwitches.length}</strong>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Active kill-switches</p>
                        </div>
                    </div>

                    <div>
                        <h3 style={{ marginBottom: '0.4rem' }}>Latest load records</h3>
                        <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.86rem', display: 'grid', gap: '0.3rem' }}>
                            {status.load_records.slice(-5).map((record) => (
                                <li key={`${record.pluginKey}:${record.loadedAt}`}>
                                    <strong>{record.pluginKey}</strong> → {record.loadStatus} ({record.trustLevel})
                                    {record.rejectionReason ? `: ${record.rejectionReason}` : ''}
                                </li>
                            ))}
                            {status.load_records.length === 0 && <li>No plugin load attempts for this workspace yet.</li>}
                        </ul>
                    </div>

                    <div>
                        <h3 style={{ marginBottom: '0.4rem' }}>Audit events</h3>
                        <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.86rem', display: 'grid', gap: '0.3rem' }}>
                            {audit.slice(-6).map((event) => (
                                <li key={`${event.pluginKey}:${event.createdAt}:${event.eventType}`}>
                                    <strong>{event.eventType}</strong> {event.pluginKey}: {event.message}
                                </li>
                            ))}
                            {audit.length === 0 && <li>No plugin audit events captured yet.</li>}
                        </ul>
                    </div>

                    {/* Kill switch controls */}
                    <div>
                        <h3 style={{ marginBottom: '0.4rem' }}>Kill switches</h3>
                        <ul style={{ margin: 0, padding: 0, fontSize: '0.86rem', display: 'grid', gap: '0.3rem', listStyle: 'none' }}>
                            {status.kill_switches.map((ks) => (
                                <li key={ks.pluginKey} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong>{ks.pluginKey}</strong>
                                    <span style={{ fontSize: '0.8rem', color: '#57534e' }}>
                                        ({ks.status}){ks.reason ? `: ${ks.reason}` : ''}
                                    </span>
                                    {ks.status === 'active' ? (
                                        <button
                                            onClick={() => void handleEnable(ks.pluginKey)}
                                            disabled={enabling === ks.pluginKey}
                                            style={{ fontSize: '0.78rem', padding: '1px 8px', cursor: 'pointer' }}
                                        >
                                            {enabling === ks.pluginKey ? 'Enabling…' : 'Enable'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => void handleDisable(ks.pluginKey)}
                                            disabled={disabling === ks.pluginKey}
                                            style={{ fontSize: '0.78rem', padding: '1px 8px', cursor: 'pointer' }}
                                        >
                                            {disabling === ks.pluginKey ? 'Disabling…' : 'Disable'}
                                        </button>
                                    )}
                                </li>
                            ))}
                            {status.kill_switches.length === 0 && <li>No kill switches recorded.</li>}
                        </ul>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={disableKey}
                                onChange={e => setDisableKey(e.target.value)}
                                placeholder="Plugin key to disable"
                                style={{ fontSize: '0.83rem', padding: '0.25rem 0.4rem', flex: 1 }}
                            />
                            <button
                                onClick={() => void handleDisable(disableKey)}
                                disabled={!disableKey.trim() || disabling === disableKey}
                                style={{ fontSize: '0.83rem', padding: '0.25rem 0.6rem', cursor: 'pointer' }}
                            >
                                {disabling === disableKey ? 'Disabling…' : 'Disable'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Allowlist Management */}
            <div className="card" style={{ marginTop: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Allowlist</h3>
                <div style={{ display: 'grid', gap: '0.4rem', maxWidth: '380px' }}>
                    <input
                        type="text"
                        value={allowlistKey}
                        onChange={e => setAllowlistKey(e.target.value)}
                        placeholder="Plugin Key"
                        style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem' }}
                    />
                    <input
                        type="text"
                        value={allowlistCaps}
                        onChange={e => setAllowlistCaps(e.target.value)}
                        placeholder="read,write,network (comma separated)"
                        style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem' }}
                    />
                    <button
                        onClick={() => void handleAllowlistUpsert()}
                        disabled={allowlistSaving || !allowlistKey.trim()}
                        style={{ fontSize: '0.84rem', padding: '0.3rem 0.75rem', cursor: 'pointer' }}
                    >
                        {allowlistSaving ? 'Saving…' : 'Update Allowlist'}
                    </button>
                    {allowlistMsg && (
                        <p style={{ fontSize: '0.82rem', color: allowlistMsg === 'Allowlist updated.' ? '#166534' : '#991b1b', margin: 0 }}>
                            {allowlistMsg}
                        </p>
                    )}
                </div>
            </div>

            {/* Plugin History */}
            <div className="card" style={{ marginTop: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Plugin History</h3>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <input
                        type="text"
                        value={historyKey}
                        onChange={e => setHistoryKey(e.target.value)}
                        placeholder="Plugin Key (optional filter)"
                        style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem', flex: 1 }}
                    />
                    <button
                        onClick={() => void fetchHistory()}
                        disabled={historyLoading}
                        style={{ fontSize: '0.84rem', padding: '0.3rem 0.75rem', cursor: 'pointer' }}
                    >
                        {historyLoading ? 'Loading…' : 'Load History'}
                    </button>
                </div>
                {historyError && <p className="message-inline">{historyError}</p>}
                {!historyLoading && history.length === 0 && (
                    <p style={{ fontSize: '0.84rem', color: '#57534e' }}>No history records loaded yet.</p>
                )}
                {history.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e7e5e4', textAlign: 'left' }}>
                                    <th style={{ padding: '0.3rem 0.4rem', color: '#57534e' }}>Plugin Key</th>
                                    <th style={{ padding: '0.3rem 0.4rem', color: '#57534e' }}>Trust</th>
                                    <th style={{ padding: '0.3rem 0.4rem', color: '#57534e' }}>Status</th>
                                    <th style={{ padding: '0.3rem 0.4rem', color: '#57534e' }}>Workspace</th>
                                    <th style={{ padding: '0.3rem 0.4rem', color: '#57534e' }}>Loaded At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #e7e5e4' }}>
                                        <td style={{ padding: '0.35rem 0.4rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.pluginKey}</td>
                                        <td style={{ padding: '0.35rem 0.4rem', fontSize: '0.8rem' }}>{r.trustLevel}</td>
                                        <td style={{ padding: '0.35rem 0.4rem' }}>{loadStatusBadge(r.loadStatus)}</td>
                                        <td style={{ padding: '0.35rem 0.4rem', fontSize: '0.8rem', color: '#57534e' }}>{r.workspaceId}</td>
                                        <td style={{ padding: '0.35rem 0.4rem', fontSize: '0.8rem', whiteSpace: 'nowrap', color: '#57534e' }}>
                                            {new Date(r.loadedAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
