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

export function PluginLoadingPanel({ workspaceId }: { workspaceId: string }) {
    const [status, setStatus] = useState<PluginStatusResponse | null>(null);
    const [audit, setAudit] = useState<PluginAuditEvent[]>([]);
    const [error, setError] = useState<string | null>(null);

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
    }, [workspaceId]);

    const activeKillSwitches = useMemo(
        () => (status?.kill_switches ?? []).filter((row) => row.status === 'active'),
        [status],
    );

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
                </div>
            )}
        </section>
    );
}
