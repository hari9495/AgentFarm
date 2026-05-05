'use client';

/**
 * AdapterDiscoveryPanel
 *
 * Lists registered adapters from GET /v1/adapters.
 * Supports registering a new adapter and running health checks.
 */

import { useCallback, useEffect, useState } from 'react';

const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
    : 'http://localhost:3000';

type AdapterType = 'source_control' | 'ci_cd' | 'issue_tracker' | 'communication' | 'cloud_provider' | 'custom';

type AdapterRecord = {
    adapter_id: string;
    name: string;
    type: AdapterType;
    description?: string;
    version?: string;
    health_score?: number;
    status: 'active' | 'inactive' | 'error' | 'unknown';
    registered_at: string;
};

type HealthCheckResult = {
    adapter_id: string;
    healthy: boolean;
    latency_ms: number;
    message?: string;
    checked_at: string;
};

const ADAPTER_TYPES: AdapterType[] = [
    'source_control', 'ci_cd', 'issue_tracker', 'communication', 'cloud_provider', 'custom',
];

function statusDot(status: AdapterRecord['status']) {
    if (status === 'active') return { bg: '#22c55e', label: 'Active' };
    if (status === 'inactive') return { bg: '#94a3b8', label: 'Inactive' };
    if (status === 'error') return { bg: '#ef4444', label: 'Error' };
    return { bg: '#f59e0b', label: 'Unknown' };
}

function healthColor(score: number) {
    if (score >= 0.8) return '#15803d';
    if (score >= 0.5) return '#854d0e';
    return '#dc2626';
}

type Props = { workspaceId?: string };

export function AdapterDiscoveryPanel({ workspaceId: _workspaceId }: Props) {
    const [adapters, setAdapters] = useState<AdapterRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Register form
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const [formId, setFormId] = useState('');
    const [formName, setFormName] = useState('');
    const [formType, setFormType] = useState<AdapterType>('custom');
    const [formDescription, setFormDescription] = useState('');
    const [formVersion, setFormVersion] = useState('1.0.0');
    const [registering, setRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);

    // Health check state per adapter
    const [healthResults, setHealthResults] = useState<Record<string, HealthCheckResult>>({});
    const [checkingHealth, setCheckingHealth] = useState<Record<string, boolean>>({});

    const loadAdapters = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/v1/adapters`, { cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as { adapters?: AdapterRecord[]; message?: string } | null;
            if (!res.ok || !body) {
                setError(body?.message ?? 'Failed to load adapters');
                setAdapters([]);
            } else {
                setAdapters(body.adapters ?? []);
            }
        } catch {
            setError('Network error loading adapters');
            setAdapters([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAdapters();
    }, [loadAdapters]);

    const handleRegister = async () => {
        if (!formId.trim() || !formName.trim()) {
            setRegisterError('Adapter ID and Name are required');
            return;
        }
        setRegistering(true);
        setRegisterError(null);
        try {
            const res = await fetch(`${API_BASE}/v1/adapters`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    adapter_id: formId.trim(),
                    name: formName.trim(),
                    type: formType,
                    description: formDescription.trim() || undefined,
                    version: formVersion.trim() || '1.0.0',
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;
            if (!res.ok) {
                setRegisterError(body?.message ?? 'Registration failed');
                return;
            }
            // Reset form and reload
            setFormId(''); setFormName(''); setFormDescription(''); setFormVersion('1.0.0');
            setShowRegisterForm(false);
            await loadAdapters();
        } catch {
            setRegisterError('Network error during registration');
        } finally {
            setRegistering(false);
        }
    };

    const handleHealthCheck = async (adapter: AdapterRecord) => {
        setCheckingHealth((prev) => ({ ...prev, [adapter.adapter_id]: true }));
        try {
            const res = await fetch(`${API_BASE}/v1/adapters/${encodeURIComponent(adapter.adapter_id)}/health-check`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });
            const body = (await res.json().catch(() => null)) as Partial<HealthCheckResult> | null;
            if (res.ok && body) {
                setHealthResults((prev) => ({
                    ...prev,
                    [adapter.adapter_id]: {
                        adapter_id: adapter.adapter_id,
                        healthy: body.healthy ?? false,
                        latency_ms: body.latency_ms ?? 0,
                        message: body.message,
                        checked_at: body.checked_at ?? new Date().toISOString(),
                    },
                }));
            }
        } catch {
            // silently swallow; health badge stays unchanged
        } finally {
            setCheckingHealth((prev) => ({ ...prev, [adapter.adapter_id]: false }));
        }
    };

    const handleDelete = async (adapterId: string) => {
        try {
            await fetch(`${API_BASE}/v1/adapters/${encodeURIComponent(adapterId)}`, { method: 'DELETE' });
            await loadAdapters();
        } catch {
            // ignore
        }
    };

    return (
        <section style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Adapter Discovery</h2>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#78716c' }}>
                        {adapters.length} registered adapter{adapters.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => void loadAdapters()}
                        disabled={loading}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', border: '1px solid #d4d4d4', borderRadius: 6, background: '#fff', cursor: loading ? 'wait' : 'pointer' }}
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setShowRegisterForm((v) => !v)}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', border: '1px solid #6366f1', borderRadius: 6, background: '#6366f1', color: '#fff', cursor: 'pointer' }}
                    >
                        {showRegisterForm ? 'Cancel' : '+ Register Adapter'}
                    </button>
                </div>
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: '0.83rem', marginBottom: '0.5rem' }}>{error}</p>}

            {/* Register form */}
            {showRegisterForm && (
                <div style={{ padding: '0.9rem', border: '1px solid #6366f1', borderRadius: 8, background: '#fafafa', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Register New Adapter</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Adapter ID *</label>
                            <input value={formId} onChange={(e) => setFormId(e.target.value)}
                                placeholder="adapter-github-org" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Name *</label>
                            <input value={formName} onChange={(e) => setFormName(e.target.value)}
                                placeholder="GitHub Org Connector" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Type</label>
                            <select value={formType} onChange={(e) => setFormType(e.target.value as AdapterType)} style={{ ...inputStyle, background: '#fff' }}>
                                {ADAPTER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Version</label>
                            <input value={formVersion} onChange={(e) => setFormVersion(e.target.value)}
                                placeholder="1.0.0" style={inputStyle} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Description</label>
                            <input value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Optional description" style={inputStyle} />
                        </div>
                    </div>
                    {registerError && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.4rem' }}>{registerError}</p>}
                    <button
                        onClick={() => void handleRegister()}
                        disabled={registering}
                        style={{ marginTop: '0.6rem', padding: '0.4rem 1rem', background: registering ? '#c7d2fe' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: registering ? 'wait' : 'pointer', fontSize: '0.85rem' }}
                    >
                        {registering ? 'Registering…' : 'Register'}
                    </button>
                </div>
            )}

            {/* Adapter list */}
            {loading && adapters.length === 0 && (
                <p style={{ fontSize: '0.88rem', color: '#78716c' }}>Loading adapters…</p>
            )}

            {!loading && adapters.length === 0 && !error && (
                <p style={{ fontSize: '0.88rem', color: '#78716c' }}>No adapters registered yet.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {adapters.map((adapter) => {
                    const dot = statusDot(adapter.status);
                    const health = healthResults[adapter.adapter_id];
                    const checking = checkingHealth[adapter.adapter_id] ?? false;

                    return (
                        <div key={adapter.adapter_id} style={{ padding: '0.75rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                            {/* Status dot */}
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot.bg, marginTop: 4, flexShrink: 0 }} title={dot.label} />

                            {/* Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{adapter.name}</div>
                                <div style={{ fontSize: '0.77rem', color: '#78716c' }}>
                                    {adapter.adapter_id} · {adapter.type.replace(/_/g, ' ')}
                                    {adapter.version && <> · v{adapter.version}</>}
                                </div>
                                {adapter.description && (
                                    <div style={{ fontSize: '0.78rem', color: '#57534e', marginTop: '0.2rem' }}>{adapter.description}</div>
                                )}

                                {/* Health result badge */}
                                {health && (
                                    <div style={{ marginTop: '0.35rem', fontSize: '0.77rem', color: health.healthy ? '#15803d' : '#dc2626' }}>
                                        {health.healthy ? '✓ Healthy' : '✗ Unhealthy'} · {health.latency_ms}ms
                                        {health.message && <> · {health.message}</>}
                                    </div>
                                )}
                            </div>

                            {/* Health score */}
                            {adapter.health_score !== undefined && (
                                <div style={{ textAlign: 'center', minWidth: 52 }}>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: healthColor(adapter.health_score) }}>
                                        {(adapter.health_score * 100).toFixed(0)}%
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#78716c' }}>health</div>
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                <button
                                    onClick={() => void handleHealthCheck(adapter)}
                                    disabled={checking}
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', border: '1px solid #d4d4d4', borderRadius: 5, background: '#fff', cursor: checking ? 'wait' : 'pointer' }}
                                    title="Run health check"
                                >
                                    {checking ? '…' : '⚡ Check'}
                                </button>
                                <button
                                    onClick={() => void handleDelete(adapter.adapter_id)}
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', border: '1px solid #fecaca', borderRadius: 5, background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                                    title="Remove adapter"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: '0.2rem',
    padding: '0.4rem 0.6rem', fontSize: '0.82rem',
    border: '1px solid #d4d4d4', borderRadius: 6, boxSizing: 'border-box',
};
