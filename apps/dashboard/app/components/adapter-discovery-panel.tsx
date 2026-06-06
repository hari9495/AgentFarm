'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Zap, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
    : 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

type AdapterType = 'source_control' | 'ci_cd' | 'issue_tracker' | 'communication' | 'cloud_provider' | 'custom';
type AuthType    = 'none' | 'api_key' | 'bearer_token' | 'basic_auth';
type HttpMethod  = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ActionDef = {
    name: string;
    method: HttpMethod;
    path: string;
    description: string;
};

type AdapterRecord = {
    adapter_id: string;
    name: string;
    type: AdapterType;
    description?: string;
    version?: string;
    endpoint_url?: string;
    health_score?: number;
    status: 'active' | 'inactive' | 'error' | 'unknown';
    registered_at: string;
    actions?: ActionDef[];
};

type HealthCheckResult = {
    adapter_id: string;
    healthy: boolean;
    latency_ms: number;
    message?: string;
    checked_at: string;
};

const ADAPTER_TYPES: { value: AdapterType; label: string }[] = [
    { value: 'custom',         label: 'Custom API'          },
    { value: 'source_control', label: 'Source Control'      },
    { value: 'issue_tracker',  label: 'Issue Tracker'       },
    { value: 'ci_cd',          label: 'CI / CD'             },
    { value: 'communication',  label: 'Communication'       },
    { value: 'cloud_provider', label: 'Cloud Provider'      },
];

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_COLORS: Record<HttpMethod, { bg: string; color: string }> = {
    GET:    { bg: 'rgba(26,122,74,0.08)',   color: 'var(--ok)' },
    POST:   { bg: 'rgba(0,102,204,0.08)',   color: 'var(--accent)' },
    PUT:    { bg: 'rgba(180,83,9,0.08)',    color: 'var(--warn)' },
    PATCH:  { bg: 'rgba(124,45,146,0.08)', color: '#7c2d92' },
    DELETE: { bg: 'rgba(196,22,28,0.08)',  color: 'var(--danger)' },
};

function statusDot(status: AdapterRecord['status']) {
    if (status === 'active')   return { color: 'var(--ok)', bg: 'rgba(26,122,74,0.08)',  border: 'rgba(26,122,74,0.2)',  label: 'Active'   };
    if (status === 'inactive') return { color: 'var(--ink-muted)', bg: 'rgba(110,110,115,0.08)', border: 'rgba(110,110,115,0.2)', label: 'Inactive' };
    if (status === 'error')    return { color: 'var(--danger)', bg: 'rgba(196,22,28,0.08)',  border: 'rgba(196,22,28,0.2)',  label: 'Error'    };
    return                            { color: 'var(--warn)', bg: 'rgba(180,83,9,0.08)',   border: 'rgba(180,83,9,0.2)',   label: 'Unknown'  };
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 9,
    border: '1px solid var(--line)', background: 'var(--card)',
    color: 'var(--ink)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
};

const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 5,
};

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({
    adaptersUrl,
    onRegistered,
    onCancel,
}: {
    adaptersUrl: string;
    onRegistered: () => void;
    onCancel: () => void;
}) {
    // Step state
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Step 1 — Identity
    const [adapterId, setAdapterId]     = useState('');
    const [name, setName]               = useState('');
    const [type, setType]               = useState<AdapterType>('custom');
    const [version, setVersion]         = useState('1.0.0');
    const [description, setDescription] = useState('');

    // Step 2 — Connection
    const [endpointUrl, setEndpointUrl] = useState('');
    const [authType, setAuthType]       = useState<AuthType>('none');
    const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
    const [apiKeyValue, setApiKeyValue]   = useState('');
    const [bearerToken, setBearerToken]   = useState('');
    const [basicUser, setBasicUser]       = useState('');
    const [basicPass, setBasicPass]       = useState('');
    const [healthPath, setHealthPath]     = useState('/health');

    // Step 3 — Actions
    const [actions, setActions] = useState<ActionDef[]>([
        { name: '', method: 'GET', path: '', description: '' },
    ]);

    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [success, setSuccess]   = useState(false);

    const addAction = () => setActions(a => [...a, { name: '', method: 'GET', path: '', description: '' }]);
    const removeAction = (i: number) => setActions(a => a.filter((_, idx) => idx !== i));
    const updateAction = (i: number, patch: Partial<ActionDef>) =>
        setActions(a => a.map((ac, idx) => idx === i ? { ...ac, ...patch } : ac));

    const submit = async () => {
        setError(null); setSaving(true);
        try {
            const authConfig =
                authType === 'api_key'      ? { type: 'api_key',      header: apiKeyHeader, value: apiKeyValue }
              : authType === 'bearer_token' ? { type: 'bearer_token', token: bearerToken }
              : authType === 'basic_auth'   ? { type: 'basic_auth',   username: basicUser, password: basicPass }
              : { type: 'none' };

            const res = await fetch(adaptersUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    adapter_id:   adapterId.trim(),
                    name:         name.trim(),
                    type,
                    version:      version.trim() || '1.0.0',
                    description:  description.trim() || undefined,
                    endpoint_url: endpointUrl.trim(),
                    auth:         authConfig,
                    health_check: { path: healthPath.trim() || '/health', expected_status: 200 },
                    actions:      actions.filter(a => a.name.trim() && a.path.trim()),
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;
            if (!res.ok) { setError(body?.message ?? 'Registration failed.'); return; }
            setSuccess(true);
            setTimeout(() => { onRegistered(); }, 1000);
        } catch { setError('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const STEPS = [
        { n: 1 as const, label: 'Identity',   done: step > 1 },
        { n: 2 as const, label: 'Connection', done: step > 2 },
        { n: 3 as const, label: 'Actions',    done: false     },
    ];

    return (
        <div style={{ border: '1px solid rgba(0,102,204,0.25)', borderRadius: 18, background: 'var(--card)', boxShadow: '0 0 0 4px rgba(0,102,204,0.04)', marginBottom: 20, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Register Custom Adapter</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Connect your own internal API so agents can call it</p>
                </div>
                <button onClick={onCancel} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', padding: '12px 20px', borderBottom: '1px solid #f0f0f2', gap: 0 }}>
                {STEPS.map(({ n, label: lbl, done }, i) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <div style={{ width: 32, height: 1, background: '#d2d2d7', margin: '0 6px' }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: done ? 'pointer' : 'default' }} onClick={() => done && setStep(n)}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step === n ? '#0066cc' : done ? 'rgba(26,122,74,0.1)' : '#f5f5f7', color: step === n ? '#fff' : done ? '#1a7a4a' : '#aeaeb2', border: `1px solid ${step === n ? '#0066cc' : done ? 'rgba(26,122,74,0.3)' : '#d2d2d7'}` }}>
                                {done ? '✓' : n}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: step === n ? 700 : 500, color: step === n ? '#0066cc' : done ? '#1a7a4a' : '#aeaeb2' }}>{lbl}</span>
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
                                <label style={label}>Adapter ID <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={adapterId} onChange={e => setAdapterId(e.target.value)} style={inp} placeholder="inventory-api" />
                                <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Unique identifier — use lowercase with hyphens</p>
                            </div>
                            <div>
                                <label style={label}>Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Inventory API" />
                            </div>
                            <div>
                                <label style={label}>Type</label>
                                <select value={type} onChange={e => setType(e.target.value as AdapterType)} style={{ ...inp, cursor: 'pointer' }}>
                                    {ADAPTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={label}>Version</label>
                                <input value={version} onChange={e => setVersion(e.target.value)} style={inp} placeholder="1.0.0" />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={label}>Description</label>
                                <input value={description} onChange={e => setDescription(e.target.value)} style={inp} placeholder="What does this adapter do? (optional)" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => { if (!adapterId.trim() || !name.trim()) { setError('Adapter ID and Name are required.'); return; } setError(null); setStep(2); }}
                                style={{ padding: '8px 24px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Next: Connection →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Connection ────────────────────────────────── */}
                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={label}>API Base URL <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} type="url" style={inp} placeholder="https://api.yourcompany.com/v1" />
                            <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>All action paths are appended to this base URL</p>
                        </div>

                        <div>
                            <label style={label}>Authentication</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {(['none','api_key','bearer_token','basic_auth'] as AuthType[]).map(a => (
                                    <button key={a} type="button" onClick={() => setAuthType(a)} style={{ padding: '6px 12px', borderRadius: 9999, border: `1px solid ${authType === a ? '#0066cc' : '#d2d2d7'}`, background: authType === a ? 'rgba(0,102,204,0.07)' : '#fff', color: authType === a ? '#0066cc' : '#424245', fontSize: 12, fontWeight: authType === a ? 700 : 500, cursor: 'pointer' }}>
                                        {a === 'none' ? 'None' : a === 'api_key' ? 'API Key' : a === 'bearer_token' ? 'Bearer Token' : 'Basic Auth'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {authType === 'api_key' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                                <div>
                                    <label style={label}>Header Name</label>
                                    <input value={apiKeyHeader} onChange={e => setApiKeyHeader(e.target.value)} style={inp} placeholder="X-API-Key" />
                                </div>
                                <div>
                                    <label style={label}>API Key Value <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <input value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)} type="password" style={inp} placeholder="sk-…" />
                                    <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Stored encrypted in Azure Key Vault, never logged</p>
                                </div>
                            </div>
                        )}
                        {authType === 'bearer_token' && (
                            <div>
                                <label style={label}>Bearer Token <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={bearerToken} onChange={e => setBearerToken(e.target.value)} type="password" style={inp} placeholder="eyJ…" />
                                <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Sent as Authorization: Bearer {'<token>'} on every request</p>
                            </div>
                        )}
                        {authType === 'basic_auth' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={label}>Username <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <input value={basicUser} onChange={e => setBasicUser(e.target.value)} style={inp} />
                                </div>
                                <div>
                                    <label style={label}>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <input value={basicPass} onChange={e => setBasicPass(e.target.value)} type="password" style={inp} />
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={label}>Health Check Path</label>
                            <input value={healthPath} onChange={e => setHealthPath(e.target.value)} style={inp} placeholder="/health" />
                            <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>GET request — expects HTTP 200. Used to confirm the API is reachable.</p>
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setStep(1)} style={{ padding: '8px 18px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>← Back</button>
                            <button onClick={() => { if (!endpointUrl.trim()) { setError('API Base URL is required.'); return; } setError(null); setStep(3); }}
                                style={{ padding: '8px 24px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Next: Actions →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Actions ───────────────────────────────────── */}
                {step === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Define what your agents can do</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>Each action is a typed API call your agent can invoke. Skip this to register without actions now and add them later.</p>
                                </div>
                                <button onClick={addAction} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    <Plus size={12} /> Add action
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {actions.map((action, i) => (
                                    <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--bg)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action {i + 1}</span>
                                            {actions.length > 1 && (
                                                <button onClick={() => removeAction(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)' }}><Trash2 size={13} /></button>
                                            )}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 2fr', gap: 8 }}>
                                            <div>
                                                <label style={label}>Action name</label>
                                                <input value={action.name} onChange={e => updateAction(i, { name: e.target.value })} style={{ ...inp, background: 'var(--card)' }} placeholder="get_stock" />
                                            </div>
                                            <div>
                                                <label style={label}>Method</label>
                                                <select value={action.method} onChange={e => updateAction(i, { method: e.target.value as HttpMethod })} style={{ ...inp, background: 'var(--card)', cursor: 'pointer', color: METHOD_COLORS[action.method].color, fontWeight: 700 }}>
                                                    {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={label}>Path</label>
                                                <input value={action.path} onChange={e => updateAction(i, { path: e.target.value })} style={{ ...inp, background: 'var(--card)', fontFamily: 'ui-monospace, monospace' }} placeholder="/inventory/{sku}" />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={label}>Description</label>
                                                <input value={action.description} onChange={e => updateAction(i, { description: e.target.value })} style={{ ...inp, background: 'var(--card)' }} placeholder="What does this action do? e.g. Look up stock level by SKU" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary preview */}
                        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.15)' }}>
                            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Summary</p>
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                                <strong>{name || 'Adapter'}</strong> · {endpointUrl || 'no endpoint'}<br />
                                Auth: <strong>{authType.replace(/_/g, ' ')}</strong> ·{' '}
                                {actions.filter(a => a.name.trim()).length} action{actions.filter(a => a.name.trim()).length !== 1 ? 's' : ''} defined
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
                            <button onClick={() => setStep(2)} style={{ padding: '8px 18px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>← Back</button>
                            <button onClick={submit} disabled={saving || success} style={{ padding: '8px 28px', borderRadius: 9999, border: 'none', background: saving || success ? '#aeaeb2' : '#0066cc', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Registering…' : success ? '✓ Registered' : 'Register Adapter'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Error shown at step 1 / 2 */}
                {error && step < 3 && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                        <AlertCircle size={13} /> {error}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

type Props = { workspaceId?: string };

export function AdapterDiscoveryPanel({ workspaceId }: Props) {
    const [adapters, setAdapters]     = useState<AdapterRecord[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [showForm, setShowForm]     = useState(false);
    const [expanded, setExpanded]     = useState<string | null>(null);
    const [healthResults, setHealthResults] = useState<Record<string, HealthCheckResult>>({});
    const [checkingHealth, setCheckingHealth] = useState<Record<string, boolean>>({});

    const adaptersUrl = workspaceId
        ? `${API_BASE}/v1/workspaces/${encodeURIComponent(workspaceId)}/adapters`
        : `${API_BASE}/v1/adapters`;

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(adaptersUrl, { cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as { adapters?: AdapterRecord[]; message?: string } | null;
            if (!res.ok || !body) { setError(body?.message ?? 'Failed to load adapters'); setAdapters([]); }
            else setAdapters(body.adapters ?? []);
        } catch { setError('Network error loading adapters'); setAdapters([]); }
        finally { setLoading(false); }
    }, [adaptersUrl]);

    useEffect(() => { void load(); }, [load]);

    const healthCheck = async (adapter: AdapterRecord) => {
        setCheckingHealth(p => ({ ...p, [adapter.adapter_id]: true }));
        try {
            const res = await fetch(`${adaptersUrl}/${encodeURIComponent(adapter.adapter_id)}/health-check`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
            });
            const body = (await res.json().catch(() => null)) as Partial<HealthCheckResult> | null;
            if (res.ok && body) {
                setHealthResults(p => ({ ...p, [adapter.adapter_id]: { adapter_id: adapter.adapter_id, healthy: body.healthy ?? false, latency_ms: body.latency_ms ?? 0, message: body.message, checked_at: body.checked_at ?? new Date().toISOString() } }));
            }
        } catch { /* silent */ }
        finally { setCheckingHealth(p => ({ ...p, [adapter.adapter_id]: false })); }
    };

    const deleteAdapter = async (id: string) => {
        if (!confirm('Remove this adapter? Agents will lose access to its actions.')) return;
        try { await fetch(`${adaptersUrl}/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
        catch { /* silent */ }
    };

    return (
        <section style={{ marginTop: '0.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>Adapter Discovery</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                        {loading ? 'Loading…' : `${adapters.length} registered adapter${adapters.length !== 1 ? 's' : ''}`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => void load()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 9999, border: 'none', background: showForm ? '#aeaeb2' : '#0066cc', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {showForm ? '✕ Cancel' : <><Plus size={12} /> Register Adapter</>}
                    </button>
                </div>
            </div>

            {/* Register form */}
            {showForm && (
                <RegisterForm adaptersUrl={adaptersUrl} onRegistered={() => { setShowForm(false); void load(); }} onCancel={() => setShowForm(false)} />
            )}

            {/* Error */}
            {error && !showForm && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            {/* Empty state */}
            {!loading && adapters.length === 0 && !error && !showForm && (
                <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed #d2d2d7', borderRadius: 14, background: 'var(--bg)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No adapters registered yet</div>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-muted)', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                        Register your custom internal APIs so agents can call them as typed actions — just like GitHub or Jira.
                    </p>
                    <button onClick={() => setShowForm(true)} style={{ padding: '8px 20px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Register your first adapter
                    </button>
                </div>
            )}

            {/* Adapter list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {adapters.map(adapter => {
                    const dot    = statusDot(adapter.status);
                    const health = healthResults[adapter.adapter_id];
                    const checking = checkingHealth[adapter.adapter_id] ?? false;
                    const isExpanded = expanded === adapter.adapter_id;

                    return (
                        <div key={adapter.adapter_id} style={{ border: `1px solid ${dot.border}`, borderRadius: 14, background: 'var(--card)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
                                {/* Status */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color, display: 'block' }} />
                                </div>
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{adapter.name}</span>
                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: dot.bg, color: dot.color, border: `1px solid ${dot.border}` }}>{dot.label}</span>
                                        {adapter.version && <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>v{adapter.version}</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'ui-monospace, monospace' }}>{adapter.adapter_id}</div>
                                    {adapter.endpoint_url && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 3 }}>{adapter.endpoint_url}</div>}
                                    {health && (
                                        <div style={{ marginTop: 4, fontSize: 12, color: health.healthy ? '#1a7a4a' : '#c4161c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {health.healthy ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                            {health.healthy ? `Healthy · ${health.latency_ms}ms` : `Unhealthy${health.message ? ` · ${health.message}` : ''}`}
                                        </div>
                                    )}
                                </div>
                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                    {adapter.actions && adapter.actions.length > 0 && (
                                        <button onClick={() => setExpanded(isExpanded ? null : adapter.adapter_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                            {adapter.actions.length} actions {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                        </button>
                                    )}
                                    <button onClick={() => void healthCheck(adapter)} disabled={checking} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        <Zap size={11} /> {checking ? '…' : 'Ping'}
                                    </button>
                                    <button onClick={() => void deleteAdapter(adapter.adapter_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </div>
                            {/* Expanded actions */}
                            {isExpanded && adapter.actions && adapter.actions.length > 0 && (
                                <div style={{ borderTop: '1px solid #f0f0f2', padding: '10px 16px', background: 'var(--bg)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Available Actions</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {adapter.actions.map((a, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: METHOD_COLORS[a.method].bg, color: METHOD_COLORS[a.method].color, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{a.method}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>{a.name}</span>
                                                <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'ui-monospace, monospace' }}>{a.path}</span>
                                                {a.description && <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>— {a.description}</span>}
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
