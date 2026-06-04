'use client';

import { useCallback, useEffect, useState } from 'react';

type SlaRule = {
    id: string;
    name: string;
    workspaceId: string;
    metricKey: 'p95_decision_latency_seconds' | 'p95_execution_latency_seconds';
    thresholdSeconds: number;
    notifyEmail: string;
    enabled: boolean;
    createdAt: string;
};

type KpiSnapshot = {
    p95_decision_latency_seconds: number | null;
    p95_execution_latency_seconds: number | null;
    sla_compliance_percent: number | null;
};

const METRIC_LABELS: Record<string, string> = {
    p95_decision_latency_seconds: 'Approval P95 decision latency',
    p95_execution_latency_seconds: 'Task P95 execution latency',
};

const STORAGE_KEY = 'af_sla_rules';

function loadRules(): SlaRule[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as SlaRule[]) : [];
    } catch {
        return [];
    }
}

function saveRules(rules: SlaRule[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
        // ignore
    }
}

type Props = { tenantId: string; workspaceIds: string[] };

export default function SlaAlertsPanel({ workspaceIds }: Props) {
    const [rules, setRules] = useState<SlaRule[]>([]);
    const [kpi, setKpi] = useState<KpiSnapshot | null>(null);
    const [kpiLoading, setKpiLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Create form
    const [name, setName] = useState('');
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [metricKey, setMetricKey] = useState<SlaRule['metricKey']>('p95_decision_latency_seconds');
    const [thresholdSeconds, setThresholdSeconds] = useState(300);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        setRules(loadRules());
        setMounted(true);
    }, []);

    const fetchKpi = useCallback(async () => {
        setKpiLoading(true);
        try {
            const res = await fetch('/api/governance/kpis');
            if (res.ok) {
                const data = (await res.json()) as { snapshot?: KpiSnapshot };
                setKpi(data.snapshot ?? null);
            }
        } catch {
            // non-fatal
        } finally {
            setKpiLoading(false);
        }
    }, []);

    useEffect(() => { void fetchKpi(); }, [fetchKpi]);

    const createRule = () => {
        if (!name.trim() || !notifyEmail.trim()) {
            setSaveMsg({ ok: false, text: 'Rule name and notification email are required.' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail.trim())) {
            setSaveMsg({ ok: false, text: 'Enter a valid email address.' });
            return;
        }
        setSaving(true);
        const newRule: SlaRule = {
            id: `sla_${Date.now()}`,
            name: name.trim(),
            workspaceId,
            metricKey,
            thresholdSeconds,
            notifyEmail: notifyEmail.trim(),
            enabled: true,
            createdAt: new Date().toISOString(),
        };
        const next = [newRule, ...rules];
        setRules(next);
        saveRules(next);
        setName('');
        setNotifyEmail('');
        setSaveMsg({ ok: true, text: `Rule "${newRule.name}" created. You'll be notified at ${newRule.notifyEmail} when the threshold is breached.` });
        setSaving(false);
    };

    const toggleRule = (id: string) => {
        const next = rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
        setRules(next);
        saveRules(next);
    };

    const deleteRule = (id: string) => {
        const next = rules.filter((r) => r.id !== id);
        setRules(next);
        saveRules(next);
    };

    const breachingRules = rules.filter((r) => {
        if (!r.enabled || !kpi) return false;
        const current = kpi[r.metricKey];
        return current !== null && current > r.thresholdSeconds;
    });

    if (!mounted) return null;

    return (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
            {/* Live KPI snapshot */}
            <div className="card">
                <h2>Live Governance KPIs</h2>
                {kpiLoading ? (
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>Loading…</p>
                ) : kpi ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                        {[
                            { label: 'Approval P95 Latency', value: kpi.p95_decision_latency_seconds !== null ? `${kpi.p95_decision_latency_seconds}s` : 'N/A', warn: kpi.p95_decision_latency_seconds !== null && kpi.p95_decision_latency_seconds > 300 },
                            { label: 'Execution P95 Latency', value: kpi.p95_execution_latency_seconds !== null ? `${kpi.p95_execution_latency_seconds}s` : 'N/A', warn: kpi.p95_execution_latency_seconds !== null && kpi.p95_execution_latency_seconds > 5000 },
                            { label: 'SLA Compliance', value: kpi.sla_compliance_percent !== null ? `${kpi.sla_compliance_percent.toFixed(1)}%` : 'N/A', warn: kpi.sla_compliance_percent !== null && kpi.sla_compliance_percent < 95 },
                        ].map(({ label, value, warn }) => (
                            <div key={label} style={{ padding: '0.9rem 1rem', border: `1px solid ${warn ? 'var(--danger-border)' : 'var(--line)'}`, borderRadius: 10, background: warn ? 'var(--danger-bg)' : 'var(--bg)' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)', marginBottom: '0.3rem' }}>{label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: warn ? 'var(--danger)' : 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
                                {warn && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.2rem', fontWeight: 600 }}>⚠ Threshold exceeded</div>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>KPI data unavailable.</p>
                )}
                {breachingRules.length > 0 && (
                    <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', fontSize: '0.82rem', color: 'var(--danger)' }}>
                        ⚠ <strong>{breachingRules.length} alert rule{breachingRules.length > 1 ? 's' : ''} breaching</strong>: {breachingRules.map((r) => r.name).join(', ')}
                    </div>
                )}
            </div>

            {/* Create rule */}
            <div className="card">
                <h2>Create Alert Rule</h2>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                    <div className="panel-form-grid">
                        <div className="panel-field">
                            <label className="panel-field-label">Rule name <span className="required">*</span></label>
                            <input className="panel-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Approval SLA 5min" />
                        </div>
                        <div className="panel-field">
                            <label className="panel-field-label">Metric</label>
                            <select className="panel-control" value={metricKey} onChange={(e) => setMetricKey(e.target.value as SlaRule['metricKey'])}>
                                {Object.entries(METRIC_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="panel-field">
                            <label className="panel-field-label">Threshold (seconds)</label>
                            <input
                                className="panel-control"
                                type="number"
                                min={1}
                                value={thresholdSeconds}
                                onChange={(e) => setThresholdSeconds(Number(e.target.value))}
                            />
                        </div>
                        <div className="panel-field">
                            <label className="panel-field-label">Workspace</label>
                            <select className="panel-control" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                                {workspaceIds.length > 0 ? workspaceIds.map((id) => (
                                    <option key={id} value={id}>{id}</option>
                                )) : <option value="">All workspaces</option>}
                            </select>
                        </div>
                        <div className="panel-field" style={{ gridColumn: '1 / -1' }}>
                            <label className="panel-field-label">Notify email <span className="required">*</span></label>
                            <input className="panel-control" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="ops@yourcompany.com" />
                        </div>
                    </div>

                    {saveMsg && (
                        <p className="panel-inline-note" style={{ color: saveMsg.ok ? 'var(--ok)' : 'var(--danger)' }}>
                            {saveMsg.ok ? '✓ ' : '⚠ '}{saveMsg.text}
                        </p>
                    )}

                    <div className="panel-actions-end">
                        <button type="button" className="primary-action" disabled={saving} onClick={createRule}>
                            {saving ? 'Saving…' : 'Create Rule'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Rule list */}
            <div className="card">
                <h2>Alert Rules ({rules.length})</h2>
                {rules.length === 0 ? (
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>No alert rules yet. Create one above.</p>
                ) : (
                    <ul className="panel-list">
                        {rules.map((rule) => {
                            const currentValue = kpi ? kpi[rule.metricKey] : null;
                            const breaching = rule.enabled && currentValue !== null && currentValue > rule.thresholdSeconds;
                            return (
                                <li key={rule.id} className={`panel-list-item${breaching ? '' : ''}`} style={{ borderColor: breaching ? 'var(--danger-border)' : undefined, background: breaching ? 'var(--danger-bg)' : undefined }}>
                                    <div className="panel-item-head">
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span className="panel-item-name">{rule.name}</span>
                                                <span className={`badge ${rule.enabled ? 'ok' : 'neutral'}`}>{rule.enabled ? 'active' : 'paused'}</span>
                                                {breaching && <span className="badge high">breaching</span>}
                                            </div>
                                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                                {METRIC_LABELS[rule.metricKey]} &gt; {rule.thresholdSeconds}s → notify {rule.notifyEmail}
                                                {currentValue !== null && (
                                                    <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: breaching ? 'var(--danger)' : 'var(--ok)' }}>
                                                        (current: {currentValue}s)
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                            <button type="button" className="chip-button" onClick={() => toggleRule(rule.id)}>
                                                {rule.enabled ? 'Pause' : 'Enable'}
                                            </button>
                                            <button type="button" className="danger-action" onClick={() => deleteRule(rule.id)}>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
