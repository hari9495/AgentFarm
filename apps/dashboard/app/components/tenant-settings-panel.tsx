'use client';

import { useCallback, useEffect, useState } from 'react';

type LanguageConfig = {
    defaultLanguage: string;
    ticketLanguage: string;
    autoDetect: boolean;
};

type McpServer = {
    id: string;
    name: string;
    url: string;
    workspaceId: string | null;
    isActive: boolean;
};

export default function TenantSettingsPanel() {
    // Language state
    const [lang, setLang] = useState<LanguageConfig | null>(null);
    const [langLoading, setLangLoading] = useState(true);
    const [langError, setLangError] = useState<string | null>(null);
    const [langSaving, setLangSaving] = useState(false);
    const [langDraft, setLangDraft] = useState<LanguageConfig>({
        defaultLanguage: 'en',
        ticketLanguage: 'en',
        autoDetect: true,
    });

    // MCP state
    const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
    const [mcpLoading, setMcpLoading] = useState(true);
    const [mcpError, setMcpError] = useState<string | null>(null);
    const [pingStates, setPingStates] = useState<Record<string, { loading: boolean; ok?: boolean; latencyMs?: number }>>({});

    // Add server form state
    const [addName, setAddName] = useState('');
    const [addUrl, setAddUrl] = useState('');
    const [addWorkspaceId, setAddWorkspaceId] = useState('');
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const fetchLang = useCallback(async () => {
        setLangLoading(true);
        setLangError(null);
        try {
            const res = await fetch('/api/tenant/language', { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as LanguageConfig & {
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setLangError(data.message ?? data.error ?? 'Failed to load language config.');
            } else {
                setLang(data);
                setLangDraft({
                    defaultLanguage: data.defaultLanguage,
                    ticketLanguage: data.ticketLanguage,
                    autoDetect: data.autoDetect,
                });
            }
        } catch {
            setLangError('Network error loading language config.');
        } finally {
            setLangLoading(false);
        }
    }, []);

    const fetchMcp = useCallback(async () => {
        setMcpLoading(true);
        setMcpError(null);
        try {
            const res = await fetch('/api/tenant/mcp', { cache: 'no-store' });
            const data = (await res.json().catch(() => [])) as McpServer[] | { error?: string; message?: string };
            if (!res.ok) {
                const err = data as { error?: string; message?: string };
                setMcpError(err.message ?? err.error ?? 'Failed to load MCP servers.');
            } else {
                setMcpServers(Array.isArray(data) ? data : []);
            }
        } catch {
            setMcpError('Network error loading MCP servers.');
        } finally {
            setMcpLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLang();
        void fetchMcp();
    }, [fetchLang, fetchMcp]);

    const saveLang = async () => {
        setLangSaving(true);
        setLangError(null);
        try {
            const res = await fetch('/api/tenant/language', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(langDraft),
            });
            const data = (await res.json().catch(() => ({}))) as LanguageConfig & {
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setLangError(data.message ?? data.error ?? 'Failed to save language config.');
            } else {
                setLang(data);
            }
        } catch {
            setLangError('Network error saving language config.');
        } finally {
            setLangSaving(false);
        }
    };

    const handleRemove = async (server: McpServer) => {
        if (!window.confirm(`Remove MCP server "${server.name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/tenant/mcp/${encodeURIComponent(server.id)}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
                setMcpError(data.message ?? data.error ?? 'Failed to remove server.');
                return;
            }
            await fetchMcp();
        } catch {
            setMcpError('Network error removing server.');
        }
    };

    const handlePing = async (server: McpServer) => {
        setPingStates((prev) => ({ ...prev, [server.id]: { loading: true } }));
        try {
            const res = await fetch(`/api/tenant/mcp/${encodeURIComponent(server.id)}/ping`, {
                cache: 'no-store',
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                latencyMs?: number;
                error?: string;
            };
            setPingStates((prev) => ({
                ...prev,
                [server.id]: { loading: false, ok: data.ok ?? false, latencyMs: data.latencyMs },
            }));
        } catch {
            setPingStates((prev) => ({ ...prev, [server.id]: { loading: false, ok: false } }));
        }
    };

    const handleAddServer = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setAddError(null);
        try {
            const res = await fetch('/api/tenant/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: addName.trim(),
                    url: addUrl.trim(),
                    workspaceId: addWorkspaceId.trim() || undefined,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) {
                setAddError(data.message ?? data.error ?? 'Failed to register server.');
                return;
            }
            setAddName('');
            setAddUrl('');
            setAddWorkspaceId('');
            await fetchMcp();
        } catch {
            setAddError('Network error registering server.');
        } finally {
            setAdding(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        padding: '0.4rem 0.6rem',
        fontSize: '0.875rem',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '0.8rem',
        fontWeight: 600,
        color: 'var(--ink-muted)',
        marginBottom: '0.25rem',
        display: 'block',
    };

    const TH: React.CSSProperties = {
        padding: '0.45rem 0.7rem',
        color: 'var(--ink-muted)',
        fontWeight: 500,
        textAlign: 'left',
        fontSize: '0.78rem',
    };
    const TD: React.CSSProperties = { padding: '0.55rem 0.7rem', fontSize: '0.84rem' };
    const TD_MUTED: React.CSSProperties = {
        padding: '0.55rem 0.7rem',
        color: 'var(--ink-muted)',
        fontSize: '0.8rem',
    };

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Language Settings */}
            <section className="card">
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                    Language Settings
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                    Configure default and ticket language preferences for this tenant.
                </p>

                {langError && (
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
                        {langError}
                    </div>
                )}

                {langLoading ? (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>Loading…</p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.9rem', maxWidth: '480px' }}>
                        <div>
                            <label style={labelStyle}>Default Language</label>
                            <input
                                type="text"
                                value={langDraft.defaultLanguage}
                                onChange={(e) =>
                                    setLangDraft((prev) => ({ ...prev, defaultLanguage: e.target.value }))
                                }
                                style={inputStyle}
                                placeholder="e.g. en"
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Ticket Language</label>
                            <input
                                type="text"
                                value={langDraft.ticketLanguage}
                                onChange={(e) =>
                                    setLangDraft((prev) => ({ ...prev, ticketLanguage: e.target.value }))
                                }
                                style={inputStyle}
                                placeholder="e.g. en"
                            />
                        </div>
                        <label
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.875rem',
                                color: 'var(--ink)',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={langDraft.autoDetect}
                                onChange={(e) =>
                                    setLangDraft((prev) => ({ ...prev, autoDetect: e.target.checked }))
                                }
                            />
                            Auto-detect language
                        </label>
                        <div>
                            <button
                                onClick={() => void saveLang()}
                                disabled={langSaving}
                                style={{
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: '#1d4ed8',
                                    color: '#fff',
                                    cursor: langSaving ? 'not-allowed' : 'pointer',
                                    opacity: langSaving ? 0.7 : 1,
                                }}
                            >
                                {langSaving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                        {lang && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                Last saved: default={lang.defaultLanguage}, ticket={lang.ticketLanguage},
                                auto-detect={lang.autoDetect ? 'on' : 'off'}
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* MCP Servers */}
            <section className="card">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                    }}
                >
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                        MCP Servers
                    </h2>
                    <button
                        onClick={() => void fetchMcp()}
                        style={{
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.8rem',
                            border: '1px solid var(--line)',
                            borderRadius: '6px',
                            background: 'var(--bg)',
                            color: 'var(--ink)',
                            cursor: 'pointer',
                        }}
                    >
                        Refresh
                    </button>
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                    Manage Model Context Protocol servers available to agents in this tenant.
                </p>

                {mcpError && (
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
                        {mcpError}
                    </div>
                )}

                {mcpLoading && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>Loading MCP servers…</p>
                )}

                {!mcpLoading && mcpServers.length === 0 && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>
                        No MCP servers registered yet.
                    </p>
                )}

                {!mcpLoading && mcpServers.length > 0 && (
                    <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={TH}>Name</th>
                                    <th style={TH}>URL</th>
                                    <th style={TH}>Workspace</th>
                                    <th style={TH}>Ping</th>
                                    <th style={TH}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {mcpServers.map((server) => {
                                    const ping = pingStates[server.id];
                                    return (
                                        <tr
                                            key={server.id}
                                            style={{ borderBottom: '1px solid var(--line)' }}
                                        >
                                            <td style={TD}>{server.name}</td>
                                            <td style={TD_MUTED}>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        maxWidth: '240px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        verticalAlign: 'bottom',
                                                    }}
                                                    title={server.url}
                                                >
                                                    {server.url}
                                                </span>
                                            </td>
                                            <td style={TD_MUTED}>{server.workspaceId ?? '—'}</td>
                                            <td style={TD}>
                                                <button
                                                    onClick={() => void handlePing(server)}
                                                    disabled={ping?.loading}
                                                    style={{
                                                        padding: '0.2rem 0.55rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--line)',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg)',
                                                        color: 'var(--ink)',
                                                        cursor: ping?.loading ? 'not-allowed' : 'pointer',
                                                    }}
                                                >
                                                    {ping?.loading
                                                        ? '…'
                                                        : ping?.ok !== undefined
                                                            ? ping.ok
                                                                ? `✓ ${ping.latencyMs}ms`
                                                                : '✗ timeout'
                                                            : 'Ping'}
                                                </button>
                                            </td>
                                            <td style={TD}>
                                                <button
                                                    onClick={() => void handleRemove(server)}
                                                    style={{
                                                        padding: '0.2rem 0.55rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: '4px',
                                                        background: '#fef2f2',
                                                        color: '#dc2626',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Add server form */}
                <form onSubmit={(e) => void handleAddServer(e)} style={{ display: 'grid', gap: '0.75rem', maxWidth: '480px' }}>
                    <p
                        style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-muted)',
                            margin: 0,
                        }}
                    >
                        Register New Server
                    </p>

                    {addError && (
                        <div
                            style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                padding: '0.55rem 0.8rem',
                                color: '#dc2626',
                                fontSize: '0.82rem',
                            }}
                        >
                            {addError}
                        </div>
                    )}

                    <div>
                        <label style={labelStyle}>Name</label>
                        <input
                            type="text"
                            value={addName}
                            onChange={(e) => setAddName(e.target.value)}
                            style={inputStyle}
                            placeholder="e.g. my-mcp-server"
                            required
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>URL</label>
                        <input
                            type="url"
                            value={addUrl}
                            onChange={(e) => setAddUrl(e.target.value)}
                            style={inputStyle}
                            placeholder="https://mcp.example.com"
                            required
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Workspace ID (optional)</label>
                        <input
                            type="text"
                            value={addWorkspaceId}
                            onChange={(e) => setAddWorkspaceId(e.target.value)}
                            style={inputStyle}
                            placeholder="Leave blank for tenant-wide"
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={adding}
                            style={{
                                padding: '0.4rem 1rem',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                border: 'none',
                                borderRadius: '6px',
                                background: '#1d4ed8',
                                color: '#fff',
                                cursor: adding ? 'not-allowed' : 'pointer',
                                opacity: adding ? 0.7 : 1,
                            }}
                        >
                            {adding ? 'Registering…' : 'Register'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
