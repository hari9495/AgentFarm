'use client';

import { useEffect, useState } from 'react';

type ApiKeysPanelProps = { tenantId: string };

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

export default function ApiKeysPanel({ tenantId: _tenantId }: ApiKeysPanelProps) {
    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [createName, setCreateName] = useState('');
    const [createRole, setCreateRole] = useState<'viewer' | 'operator' | 'admin'>('operator');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [newRawKey, setNewRawKey] = useState<string | null>(null);

    async function fetchKeys() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/settings/api-keys', { cache: 'no-store' });
            const data = (await res.json()) as { keys?: ApiKeyRecord[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load API keys.');
            } else {
                setKeys(data.keys ?? []);
            }
        } catch {
            setError('Network error loading API keys.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void fetchKeys();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!createName.trim()) return;
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/settings/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: createName.trim(), role: createRole }),
            });
            const data = (await res.json()) as {
                apiKey?: ApiKeyRecord;
                rawKey?: string;
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setCreateError(data.message ?? data.error ?? 'Failed to create key.');
            } else {
                setNewRawKey(data.rawKey ?? null);
                setCreateName('');
                await fetchKeys();
            }
        } catch {
            setCreateError('Network error creating API key.');
        } finally {
            setCreating(false);
        }
    }

    async function handleDisable(keyId: string, keyName: string) {
        if (!window.confirm(`Disable key "${keyName}"? It can be re-enabled later.`)) return;
        try {
            const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(keyId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string; message?: string };
                window.alert(data.message ?? data.error ?? 'Failed to disable key.');
                return;
            }
            await fetchKeys();
        } catch {
            window.alert('Network error disabling API key.');
        }
    }

    async function handleEnable(keyId: string) {
        try {
            const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(keyId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string; message?: string };
                window.alert(data.message ?? data.error ?? 'Failed to enable key.');
                return;
            }
            await fetchKeys();
        } catch {
            window.alert('Network error enabling API key.');
        }
    }

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--ink)' }}>
                API Keys
            </h2>

            {/* Create form */}
            <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Key name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                    style={{
                        flex: '1 1 200px',
                        padding: '0.45rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        fontSize: '0.875rem',
                    }}
                />
                <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as 'viewer' | 'operator' | 'admin')}
                    style={{
                        padding: '0.45rem 0.6rem',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        fontSize: '0.875rem',
                    }}
                >
                    <option value="viewer">viewer</option>
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                </select>
                <button
                    type="submit"
                    disabled={creating}
                    style={{
                        padding: '0.45rem 1rem',
                        background: 'var(--brand)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        cursor: creating ? 'not-allowed' : 'pointer',
                        opacity: creating ? 0.7 : 1,
                    }}
                >
                    {creating ? 'Creating…' : 'Create Key'}
                </button>
            </form>

            {createError && (
                <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    {createError}
                </p>
            )}

            {/* Plaintext key reveal */}
            {newRawKey && (
                <div
                    style={{
                        background: '#fefce8',
                        border: '1px solid #fde047',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                    }}
                >
                    <p style={{ fontWeight: 600, marginBottom: '0.35rem', color: '#78350f' }}>
                        Copy this key now — it will not be shown again.
                    </p>
                    <code
                        style={{
                            display: 'block',
                            wordBreak: 'break-all',
                            background: '#fff',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid #fde047',
                            color: '#1c1917',
                            marginBottom: '0.5rem',
                        }}
                    >
                        {newRawKey}
                    </code>
                    <button
                        onClick={() => setNewRawKey(null)}
                        style={{
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.8rem',
                            border: '1px solid #fde047',
                            borderRadius: '5px',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#78350f',
                        }}
                    >
                        I&apos;ve copied it
                    </button>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: '#dc2626',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Name</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Prefix</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Role</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Status</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Created</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            [0, 1, 2].map((i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                    {[0, 1, 2, 3, 4, 5].map((j) => (
                                        <td key={j} style={{ padding: '0.65rem 0.75rem' }}>
                                            <div
                                                style={{
                                                    height: '0.85rem',
                                                    background: 'var(--line)',
                                                    borderRadius: '4px',
                                                    width: j === 0 ? '120px' : '80px',
                                                    animation: 'pulse 1.5s ease-in-out infinite',
                                                }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {!loading && keys.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                >
                                    No API keys found.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            keys.map((k) => (
                                <tr key={k.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink)', fontWeight: 500 }}>
                                        {k.name}
                                    </td>
                                    <td style={{ padding: '0.65rem 0.75rem' }}>
                                        <code style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                            {k.keyPrefix}••••••••
                                        </code>
                                    </td>
                                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-soft)' }}>
                                        {k.role}
                                    </td>
                                    <td style={{ padding: '0.65rem 0.75rem' }}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                padding: '0.15rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: k.enabled ? '#dcfce7' : '#fee2e2',
                                                color: k.enabled ? '#166534' : '#991b1b',
                                            }}
                                        >
                                            {k.enabled ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                                        {new Date(k.createdAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '0.65rem 0.75rem' }}>
                                        {k.enabled ? (
                                            <button
                                                onClick={() => void handleDisable(k.id, k.name)}
                                                style={{
                                                    padding: '0.25rem 0.6rem',
                                                    fontSize: '0.75rem',
                                                    border: '1px solid #fecaca',
                                                    borderRadius: '4px',
                                                    background: '#fff',
                                                    color: '#dc2626',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Disable
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => void handleEnable(k.id)}
                                                style={{
                                                    padding: '0.25rem 0.6rem',
                                                    fontSize: '0.75rem',
                                                    border: '1px solid #bbf7d0',
                                                    borderRadius: '4px',
                                                    background: '#fff',
                                                    color: '#166534',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Enable
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
