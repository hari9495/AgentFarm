'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Zap, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
    : 'http://localhost:3000';

// ── Types matching AdapterRegistryRecord from @agentfarm/shared-types ─────────

type AdapterType    = 'connector' | 'runtime' | 'provider';
type AdapterStatus  = 'registered' | 'healthy' | 'degraded' | 'failed' | 'unregistered';

type AdapterCapability = {
    name: string;
    version: string;
    supported: boolean;
};

type AdapterRecord = {
    id: string;
    adapterId: string;
    adapterKey: string;
    adapterType: AdapterType;
    displayName: string;
    status: AdapterStatus;
    version: string;
    tenantId?: string;
    workspaceId?: string;
    capabilities: AdapterCapability[];
    lastHealthcheckAt?: string;
    lastHealthcheckResult?: string;
    registeredAt: string;
    updatedAt: string;
    correlationId: string;
};

type HealthCheckResult = {
    adapter_id: string;
    status: AdapterStatus;
    last_healthcheck_at?: string;
    last_healthcheck_result?: string;
};

const ADAPTER_TYPES: { value: AdapterType; label: string }[] = [
    { value: 'connector', label: 'Connector' },
    { value: 'runtime',   label: 'Runtime'   },
    { value: 'provider',  label: 'Provider'  },
];

function statusDot(status: AdapterStatus) {
    if (status === 'healthy')      return { color: 'var(--ok)',       bg: 'rgba(26,122,74,0.08)',   border: 'rgba(26,122,74,0.2)',   label: 'Healthy'      };
    if (status === 'registered')   return { color: 'var(--accent)',   bg: 'rgba(214, 48, 31,0.08)',   border: 'rgba(214, 48, 31,0.2)',   label: 'Registered'   };
    if (status === 'degraded')     return { color: 'var(--warn)',     bg: 'rgba(180,83,9,0.08)',    border: 'rgba(180,83,9,0.2)',    label: 'Degraded'     };
    if (status === 'failed')       return { color: 'var(--danger)',   bg: 'rgba(196,22,28,0.08)',   border: 'rgba(196,22,28,0.2)',   label: 'Failed'       };
    return                                { color: 'var(--ink-muted)',bg: 'rgba(110,110,115,0.08)', border: 'rgba(110,110,115,0.2)', label: 'Unregistered' };
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 9,
    border: '1px solid var(--line)', background: 'var(--card)',
    color: 'var(--ink)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
};

const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 5,
};

// ── Register form ──────────────────────────────────────────────────────────────

function RegisterForm({
    adaptersUrl,
    onRegistered,
    onCancel,
}: {
    adaptersUrl: string;
    onRegistered: () => void;
    onCancel: () => void;
}) {
    const [step, setStep] = useState<1 | 2>(1);

    // Step 1 — Identity
    const [adapterKey, setAdapterKey]     = useState('');
    const [displayName, setDisplayName]   = useState('');
    const [adapterType, setAdapterType]   = useState<AdapterType>('connector');
    const [version, setVersion]           = useState('1.0.0');

    // Step 2 — Capabilities
    const [capabilities, setCapabilities] = useState<AdapterCapability[]>([
        { name: '', version: '1.0.0', supported: true },
    ]);

    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const addCap    = () => setCapabilities(c => [...c, { name: '', version: '1.0.0', supported: true }]);
    const removeCap = (i: number) => setCapabilities(c => c.filter((_, idx) => idx !== i));
    const updateCap = (i: number, patch: Partial<AdapterCapability>) =>
        setCapabilities(c => c.map((cap, idx) => idx === i ? { ...cap, ...patch } : cap));

    const submit = async () => {
        setError(null); setSaving(true);
        try {
            const res = await fetch(adaptersUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    adapter_key:  adapterKey.trim(),
                    display_name: displayName.trim(),
                    adapter_type: adapterType,
                    version:      version.trim() || '1.0.0',
                    capabilities: capabilities.filter(c => c.name.trim()),
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
            if (!res.ok) { setError(body?.message ?? body?.error ?? 'Registration failed.'); return; }
            setSuccess(true);
            setTimeout(() => { onRegistered(); }, 1000);
        } catch { setError('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ border: '1px solid rgba(214, 48, 31,0.25)', borderRadius: 18, background: 'var(--card)', boxShadow: '0 0 0 4px rgba(214, 48, 31,0.04)', marginBottom: 20, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Register Custom Adapter</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Connect your internal API so agents can call it</p>
                </div>
                <button onClick={onCancel} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', padding: '12px 20px', borderBottom: '1px solid var(--line)', gap: 0 }}>
                {([{ n: 1 as const, label: 'Identity', done: step > 1 }, { n: 2 as const, label: 'Capabilities', done: false }]).map(({ n, label: stepLabel, done }, i) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <div style={{ width: 32, height: 1, background: 'var(--line)', margin: '0 6px' }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: done ? 'pointer' : 'default' }} onClick={() => done && setStep(n)}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step === n ? 'var(--accent)' : done ? 'var(--ok-bg)' : 'var(--bg)', color: step === n ? 'var(--card)' : done ? 'var(--ok)' : 'var(--ink-muted)', border: `1px solid ${step === n ? 'var(--accent)' : done ? 'var(--ok-border)' : 'var(--line)'}` }}>
                                {done ? '✓' : n}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: step === n ? 700 : 500, color: step === n ? 'var(--accent)' : done ? 'var(--ok)' : 'var(--ink-muted)' }}>{stepLabel}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '20px' }}>
                {/* ── Step 1: Identity ──────────────────────────────────── */}
                {step === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={lbl}>Adapter Key <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={adapterKey} onChange={e => setAdapterKey(e.target.value)} style={inp} placeholder="inventory-api" />
                                <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Unique identifier — lowercase with hyphens</p>
                            </div>
                            <div>
                                <label style={lbl}>Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inp} placeholder="Inventory API" />
                            </div>
                            <div>
                                <label style={lbl}>Type <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <select value={adapterType} onChange={e => setAdapterType(e.target.value as AdapterType)} style={{ ...inp, cursor: 'pointer' }}>
                                    {ADAPTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>Version</label>
                                <input value={version} onChange={e => setVersion(e.target.value)} style={inp} placeholder="1.0.0" />
                            </div>
                        </div>
                        {error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                                <AlertCircle size={13} /> {error}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => { if (!adapterKey.trim() || !displayName.trim()) { setError('Adapter Key and Display Name are required.'); return; } setError(null); setStep(2); }}
                                style={{ padding: '8px 24px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Next: Capabilities →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Capabilities ──────────────────────────────── */}
                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Declare what this adapter supports</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>Optional — skip to register without capabilities and add them later.</p>
                                </div>
                                <button onClick={addCap} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {capabilities.map((cap, i) => (
                                    <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
                                        <div>
                                            <label style={lbl}>Capability name</label>
                                            <input value={cap.name} onChange={e => updateCap(i, { name: e.target.value })} style={{ ...inp, background: 'var(--card)' }} placeholder="file_read" />
                                        </div>
                                        <div>
                                            <label style={lbl}>Version</label>
                                            <input value={cap.version} onChange={e => updateCap(i, { version: e.target.value })} style={{ ...inp, background: 'var(--card)' }} placeholder="1.0.0" />
                                        </div>
                                        <div style={{ paddingBottom: 2 }}>
                                            <label style={{ ...lbl, marginBottom: 8 }}>Supported</label>
                                            <input type="checkbox" checked={cap.supported} onChange={e => updateCap(i, { supported: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                        </div>
                                        {capabilities.length > 1 && (
                                            <button onClick={() => removeCap(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', paddingBottom: 4 }}><Trash2 size={13} /></button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(214, 48, 31,0.04)', border: '1px solid rgba(214, 48, 31,0.15)' }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Summary</p>
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                                <strong>{displayName}</strong> · key: <code style={{ fontSize: 11 }}>{adapterKey}</code> · type: <strong>{adapterType}</strong> · v{version}<br />
                                {capabilities.filter(c => c.name.trim()).length} capability{capabilities.filter(c => c.name.trim()).length !== 1 ? 'ies' : ''} defined
                            </div>
                        </div>

                        {error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                                <AlertCircle size={13} /> {error}
                            </div>
                        )}
                        {success && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', color: 'var(--ok)', fontSize: 12 }}>
                                <CheckCircle2 size={13} /> Adapter registered successfully!
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setStep(1)} style={{ padding: '8px 18px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>← Back</button>
                            <button onClick={submit} disabled={saving || success} style={{ padding: '8px 28px', borderRadius: 9999, border: 'none', background: saving || success ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Registering…' : success ? '✓ Registered' : 'Register Adapter'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

type Props = { workspaceId?: string };

export function AdapterDiscoveryPanel({ workspaceId }: Props) {
    const [adapters, setAdapters]         = useState<AdapterRecord[]>([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState<string | null>(null);
    const [showForm, setShowForm]         = useState(false);
    const [expanded, setExpanded]         = useState<string | null>(null);
    const [healthResults, setHealthResults] = useState<Record<string, HealthCheckResult>>({});
    const [checkingHealth, setCheckingHealth] = useState<Record<string, boolean>>({});

    // Always use /v1/adapters; pass workspace_id as query param if provided
    const adaptersUrl = workspaceId
        ? `${API_BASE}/v1/adapters?workspace_id=${encodeURIComponent(workspaceId)}`
        : `${API_BASE}/v1/adapters`;

    const adapterBaseUrl = `${API_BASE}/v1/adapters`;

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(adaptersUrl, { credentials: 'include', cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as { adapters?: AdapterRecord[]; total?: number; message?: string; error?: string } | null;
            if (!res.ok || !body) {
                setError(body?.message ?? body?.error ?? `Failed to load adapters (${res.status})`);
                setAdapters([]);
            } else {
                setAdapters(body.adapters ?? []);
            }
        } catch { setError('Network error loading adapters'); setAdapters([]); }
        finally { setLoading(false); }
    }, [adaptersUrl]);

    useEffect(() => { void load(); }, [load]);

    const healthCheck = async (adapter: AdapterRecord) => {
        setCheckingHealth(p => ({ ...p, [adapter.id]: true }));
        try {
            const res = await fetch(`${adapterBaseUrl}/${encodeURIComponent(adapter.id)}/health-check`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                credentials: 'include', body: JSON.stringify({}),
            });
            const body = (await res.json().catch(() => null)) as Partial<HealthCheckResult> | null;
            if (res.ok && body) {
                setHealthResults(p => ({ ...p, [adapter.id]: { adapter_id: adapter.id, status: body.status ?? adapter.status, last_healthcheck_at: body.last_healthcheck_at, last_healthcheck_result: body.last_healthcheck_result } }));
            }
        } catch { /* silent */ }
        finally { setCheckingHealth(p => ({ ...p, [adapter.id]: false })); }
    };

    const deleteAdapter = async (id: string) => {
        if (!confirm('Remove this adapter? Agents will lose access to its capabilities.')) return;
        try { await fetch(`${adapterBaseUrl}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }); await load(); }
        catch { /* silent */ }
    };

    return (
        <section style={{ marginTop: '0.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>Adapter Registry</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                        {loading ? 'Loading…' : `${adapters.length} registered adapter${adapters.length !== 1 ? 's' : ''}`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => void load()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 9999, border: 'none', background: showForm ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {showForm ? '✕ Cancel' : <><Plus size={12} /> Register Adapter</>}
                    </button>
                </div>
            </div>

            {/* Register form */}
            {showForm && (
                <RegisterForm adaptersUrl={adapterBaseUrl} onRegistered={() => { setShowForm(false); void load(); }} onCancel={() => setShowForm(false)} />
            )}

            {/* Error */}
            {error && !showForm && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && adapters.length === 0 && !error && !showForm && (
                <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed #d2d2d7', borderRadius: 14, background: 'var(--bg)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No adapters registered yet</div>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-muted)', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                        Register your custom internal APIs so agents can call them as typed actions — just like GitHub or Jira.
                    </p>
                    <button onClick={() => setShowForm(true)} style={{ padding: '8px 20px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Register your first adapter
                    </button>
                </div>
            )}

            {/* Adapter list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {adapters.map(adapter => {
                    const dot       = statusDot(adapter.status);
                    const health    = healthResults[adapter.id];
                    const checking  = checkingHealth[adapter.id] ?? false;
                    const isExpanded = expanded === adapter.id;

                    return (
                        <div key={adapter.id} style={{ border: `1px solid ${dot.border}`, borderRadius: 14, background: 'var(--card)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color, display: 'block' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{adapter.displayName}</span>
                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: dot.bg, color: dot.color, border: `1px solid ${dot.border}` }}>{dot.label}</span>
                                        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: 'var(--bg)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>{adapter.adapterType}</span>
                                        {adapter.version && <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>v{adapter.version}</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'ui-monospace, monospace' }}>{adapter.adapterKey}</div>
                                    {health && (
                                        <div style={{ marginTop: 4, fontSize: 12, color: (health.status === 'healthy') ? 'var(--ok)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {health.status === 'healthy' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                            {health.last_healthcheck_result ?? health.status}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                    {adapter.capabilities && adapter.capabilities.length > 0 && (
                                        <button onClick={() => setExpanded(isExpanded ? null : adapter.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                            {adapter.capabilities.length} cap{adapter.capabilities.length !== 1 ? 's' : ''} {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                        </button>
                                    )}
                                    <button onClick={() => void healthCheck(adapter)} disabled={checking} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        <Zap size={11} /> {checking ? '…' : 'Ping'}
                                    </button>
                                    <button onClick={() => void deleteAdapter(adapter.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </div>
                            {/* Expanded capabilities */}
                            {isExpanded && adapter.capabilities && adapter.capabilities.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--line)', padding: '10px 16px', background: 'var(--bg)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Capabilities</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {adapter.capabilities.map((cap, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: cap.supported ? 'rgba(26,122,74,0.08)' : 'rgba(196,22,28,0.08)', color: cap.supported ? 'var(--ok)' : 'var(--danger)', fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                                                    {cap.supported ? '✓' : '✗'}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>{cap.name}</span>
                                                <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>v{cap.version}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
