'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Trash2, RotateCcw, Plus, AlertTriangle } from 'lucide-react';

type ApiKeyRecord = {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    role: string;
    enabled: boolean;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    createdBy: string;
};

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
    viewer:   { bg: 'var(--bg)', color: 'var(--ink-muted)' },
    operator: { bg: 'var(--info-bg)', color: 'var(--info)' },
    admin:    { bg: 'var(--warn-bg)', color: 'var(--warn)' },
};

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60)    return `${secs}s ago`;
    if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button onClick={copy} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}>
            {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
        </button>
    );
}

export default function ApiKeysPanel({ tenantId: _tenantId }: { tenantId: string }) {
    const [keys, setKeys]         = useState<ApiKeyRecord[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [refreshing, setRef]    = useState(false);

    // Create form
    const [name, setName]         = useState('');
    const [role, setRole]         = useState<'viewer' | 'operator' | 'admin'>('operator');
    const [expiresIn, setExpiresIn] = useState('');   // days, empty = never
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [newRawKey, setNewRawKey] = useState<string | null>(null);

    // Per-row busy state
    const [busy, setBusy] = useState<Record<string, string>>({}); // id → action

    const fetchKeys = useCallback(async (silent = false) => {
        if (!silent) setLoading(true); else setRef(true);
        setError(null);
        try {
            const res  = await fetch('/api/settings/api-keys', { cache: 'no-store' });
            const data = (await res.json()) as { keys?: ApiKeyRecord[]; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to load API keys.'); return; }
            setKeys(data.keys ?? []);
        } catch { setError('Network error.'); }
        finally { setLoading(false); setRef(false); }
    }, []);

    useEffect(() => { void fetchKeys(); }, [fetchKeys]);

    // ── Create ──────────────────────────────────────────────────────────────
    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setCreating(true); setCreateErr(null);
        const body: Record<string, unknown> = { name: name.trim(), role };
        if (expiresIn && parseInt(expiresIn) > 0) {
            const d = new Date(); d.setDate(d.getDate() + parseInt(expiresIn));
            body.expiresAt = d.toISOString();
        }
        try {
            const res  = await fetch('/api/settings/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = (await res.json()) as { apiKey?: ApiKeyRecord; rawKey?: string; error?: string; message?: string };
            if (!res.ok) { setCreateErr(data.message ?? data.error ?? 'Failed.'); return; }
            setNewRawKey(data.rawKey ?? null);
            setName(''); setExpiresIn('');
            await fetchKeys(true);
        } catch { setCreateErr('Network error.'); }
        finally { setCreating(false); }
    }

    // ── Toggle enable / disable ──────────────────────────────────────────────
    async function handleToggle(k: ApiKeyRecord) {
        setBusy(b => ({ ...b, [k.id]: 'toggle' }));
        try {
            const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(k.id)}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !k.enabled }),
            });
            if (!res.ok) { const d = (await res.json()) as { message?: string }; window.alert(d.message ?? 'Failed.'); return; }
            await fetchKeys(true);
        } finally { setBusy(b => { const n = { ...b }; delete n[k.id]; return n; }); }
    }

    // ── Rotate (create new with same name/role, disable old) ─────────────────
    async function handleRotate(k: ApiKeyRecord) {
        if (!window.confirm(`Rotate "${k.name}"? A new key will be created and this one disabled.`)) return;
        setBusy(b => ({ ...b, [k.id]: 'rotate' }));
        try {
            const res  = await fetch('/api/settings/api-keys', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `${k.name} (rotated)`, role: k.role }),
            });
            const data = (await res.json()) as { apiKey?: ApiKeyRecord; rawKey?: string; error?: string };
            if (!res.ok) { window.alert((data as { message?: string }).message ?? 'Rotate failed.'); return; }
            // Disable the old key
            await fetch(`/api/settings/api-keys/${encodeURIComponent(k.id)}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            });
            setNewRawKey(data.rawKey ?? null);
            await fetchKeys(true);
        } finally { setBusy(b => { const n = { ...b }; delete n[k.id]; return n; }); }
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    async function handleDelete(k: ApiKeyRecord) {
        if (!window.confirm(`Permanently delete "${k.name}"? This cannot be undone.`)) return;
        setBusy(b => ({ ...b, [k.id]: 'delete' }));
        try {
            const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(k.id)}`, { method: 'DELETE' });
            if (!res.ok) { const d = (await res.json()) as { message?: string }; window.alert(d.message ?? 'Delete failed.'); return; }
            await fetchKeys(true);
        } finally { setBusy(b => { const n = { ...b }; delete n[k.id]; return n; }); }
    }

    const TH: React.CSSProperties = { padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500, fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap' };
    const TD: React.CSSProperties = { padding: '0.65rem 0.75rem', fontSize: '0.83rem' };

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>API Keys</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                        Keys are shown once. Store them securely — we only keep a hash.
                    </p>
                </div>
                <button onClick={() => void fetchKeys(true)} disabled={refreshing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer' }}>
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* ── Create form ── */}
            <form onSubmit={(e) => void handleCreate(e)}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.5rem', marginBottom: '1rem', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</label>
                    <input type="text" placeholder="e.g. CI pipeline, staging bot" value={name} onChange={e => setName(e.target.value)} required
                        style={{ padding: '0.45rem 0.75rem', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.875rem' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</label>
                    <select value={role} onChange={e => setRole(e.target.value as typeof role)}
                        style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.875rem' }}>
                        <option value="viewer">viewer</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expires in</label>
                    <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.875rem' }}>
                        <option value="">Never</option>
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                        <option value="180">180 days</option>
                        <option value="365">1 year</option>
                    </select>
                </div>
                <button type="submit" disabled={creating}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.46rem 1rem', background: 'var(--brand, #2563EB)', color: 'var(--card)', border: 'none', borderRadius: 6, fontSize: '0.875rem', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                    <Plus size={14} /> {creating ? 'Creating…' : 'Create'}
                </button>
            </form>
            {createErr && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{createErr}</p>}

            {/* ── Raw key reveal ── */}
            {newRawKey && (
                <div style={{ background: 'var(--warn-bg)', border: '1px solid #fde047', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.4rem' }}>
                        <AlertTriangle size={14} color="#92400e" />
                        <span style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--warn)' }}>Copy now — this key will not be shown again.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid #fde047', borderRadius: 6, padding: '0.4rem 0.7rem', marginBottom: '0.5rem' }}>
                        <code style={{ flex: 1, wordBreak: 'break-all', fontSize: '0.8rem', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>{newRawKey}</code>
                        <CopyButton text={newRawKey} />
                    </div>
                    <button onClick={() => setNewRawKey(null)}
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', border: '1px solid #fde047', borderRadius: 5, background: 'var(--card)', cursor: 'pointer', color: 'var(--warn)', fontWeight: 600 }}>
                        I&apos;ve saved it
                    </button>
                </div>
            )}

            {error && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '0.65rem 0.9rem', color: 'var(--danger)', fontSize: '0.83rem', marginBottom: '0.75rem' }}>
                    {error}
                </div>
            )}

            {/* ── Table ── */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)' }}>
                            <th style={TH}>Name</th>
                            <th style={TH}>Key</th>
                            <th style={TH}>Role</th>
                            <th style={TH}>Status</th>
                            <th style={TH}>Last used</th>
                            <th style={TH}>Expires</th>
                            <th style={TH}>Created</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && [0,1,2].map(i => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                {[120, 90, 60, 55, 80, 75, 80, 100].map((w, j) => (
                                    <td key={j} style={TD}>
                                        <div style={{ height: '0.82rem', background: 'var(--line)', borderRadius: 4, width: w, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                    </td>
                                ))}
                            </tr>
                        ))}

                        {!loading && keys.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                                    No API keys yet. Create one above.
                                </td>
                            </tr>
                        )}

                        {!loading && keys.map(k => {
                            const rb   = ROLE_BADGE[k.role] ?? ROLE_BADGE.operator;
                            const row  = busy[k.id];
                            const exp  = k.expiresAt ? daysUntil(k.expiresAt) : null;
                            const expiredOrSoon = exp !== null && exp <= 14;

                            return (
                                <tr key={k.id} style={{ borderBottom: '1px solid var(--line)', opacity: row ? 0.6 : 1 }}>
                                    {/* Name */}
                                    <td style={{ ...TD, fontWeight: 600, color: 'var(--ink)' }}>{k.name}</td>

                                    {/* Key prefix */}
                                    <td style={TD}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <code style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', fontFamily: 'monospace' }}>
                                                {k.keyPrefix}••••
                                            </code>
                                            <CopyButton text={k.keyPrefix} />
                                        </span>
                                    </td>

                                    {/* Role */}
                                    <td style={TD}>
                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, background: rb.bg, color: rb.color }}>
                                            {k.role}
                                        </span>
                                    </td>

                                    {/* Status */}
                                    <td style={TD}>
                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, background: k.enabled ? 'var(--ok-bg)' : 'var(--danger-bg)', color: k.enabled ? 'var(--ok)' : 'var(--danger)' }}>
                                            {k.enabled ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>

                                    {/* Last used */}
                                    <td style={{ ...TD, color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
                                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : '—'}
                                    </td>

                                    {/* Expires */}
                                    <td style={{ ...TD, fontSize: '0.78rem' }}>
                                        {exp === null ? <span style={{ color: 'var(--ink-muted)' }}>Never</span>
                                         : exp <= 0   ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Expired</span>
                                         : expiredOrSoon
                                             ? <span style={{ color: 'var(--warn)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> {exp}d</span>
                                             : <span style={{ color: 'var(--ink-soft)' }}>in {exp}d</span>}
                                    </td>

                                    {/* Created */}
                                    <td style={{ ...TD, color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
                                        {timeAgo(k.createdAt)}
                                    </td>

                                    {/* Actions */}
                                    <td style={{ ...TD, textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                            {/* Toggle enable/disable */}
                                            <button onClick={() => void handleToggle(k)} disabled={!!row}
                                                title={k.enabled ? 'Disable' : 'Enable'}
                                                style={{ padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 4, cursor: row ? 'not-allowed' : 'pointer', border: `1px solid ${k.enabled ? 'var(--danger-bg)' : 'var(--ok)'}`, background: 'var(--card)', color: k.enabled ? 'var(--danger)' : 'var(--ok)' }}>
                                                {row === 'toggle' ? '…' : k.enabled ? 'Disable' : 'Enable'}
                                            </button>

                                            {/* Rotate */}
                                            <button onClick={() => void handleRotate(k)} disabled={!!row}
                                                title="Rotate — creates a new key and disables this one"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 4, cursor: row ? 'not-allowed' : 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}>
                                                <RotateCcw size={11} /> {row === 'rotate' ? '…' : 'Rotate'}
                                            </button>

                                            {/* Delete */}
                                            <button onClick={() => void handleDelete(k)} disabled={!!row}
                                                title="Permanently delete"
                                                style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 6px', borderRadius: 4, cursor: row ? 'not-allowed' : 'pointer', border: '1px solid var(--danger-border)', background: 'var(--card)', color: 'var(--danger)' }}>
                                                {row === 'delete' ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
