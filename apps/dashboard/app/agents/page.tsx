'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AgentCard, { type Agent, type BotStatus } from '../components/agent-card.js';
import AgentDetailPanel from '../components/agent-detail-panel.js';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [newRole, setNewRole] = useState('');
    const [newWorkspaceId, setNewWorkspaceId] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

    async function loadAgents() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/agents');
            if (!res.ok) {
                setError('Failed to load agents.');
                return;
            }
            const data = (await res.json()) as { bots?: Agent[] };
            const list = data.bots ?? [];
            setAgents(list);
            if (list.length > 0 && !selectedId) {
                setSelectedId(list[0]!.id);
            }
        } catch {
            setError('Network error loading agents.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadAgents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createAgent() {
        if (!newRole.trim() || !newWorkspaceId.trim()) {
            setCreateError('Role and Workspace ID are required.');
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole.trim(), workspaceId: newWorkspaceId.trim() }),
            });
            const body = (await res.json()) as { bot?: Agent; error?: string; message?: string };
            if (res.ok && body.bot) {
                setAgents((prev) => [body.bot!, ...prev]);
                setSelectedId(body.bot!.id);
                setShowCreate(false);
                setNewRole('');
                setNewWorkspaceId('');
            } else {
                setCreateError(body.message ?? body.error ?? 'Failed to create agent.');
            }
        } catch {
            setCreateError('Network error creating agent.');
        } finally {
            setCreating(false);
        }
    }

    function handleStatusChange(botId: string, newStatus: BotStatus) {
        setAgents((prev) =>
            prev.map((a) => (a.id === botId ? { ...a, status: newStatus, updatedAt: new Date().toISOString() } : a))
        );
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#020817',
                color: '#e2e8f0',
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Top bar */}
            <header
                style={{
                    height: '56px',
                    background: '#0a0f1e',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 24px',
                    gap: '16px',
                    flexShrink: 0,
                }}
            >
                <Link
                    href="/"
                    style={{
                        color: '#475569',
                        fontSize: '12px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    ← Dashboard
                </Link>
                <span style={{ color: '#1e293b' }}>|</span>
                <h1
                    style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#f1f5f9',
                        margin: 0,
                    }}
                >
                    Agent Builder
                </h1>
                <div style={{ marginLeft: 'auto' }}>
                    <button
                        onClick={() => {
                            setShowCreate((v) => !v);
                            setCreateError(null);
                        }}
                        style={{
                            padding: '7px 14px',
                            background: '#1d4ed8',
                            border: '1px solid #2563eb',
                            borderRadius: '6px',
                            color: '#eff6ff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        + New Agent
                    </button>
                </div>
            </header>

            {/* Create form */}
            {showCreate && (
                <div
                    style={{
                        background: '#0a0f1e',
                        borderBottom: '1px solid #1e293b',
                        padding: '16px 24px',
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '12px',
                        flexWrap: 'wrap',
                    }}
                >
                    <div>
                        <label
                            style={{
                                fontSize: '11px',
                                color: '#475569',
                                fontWeight: 600,
                                display: 'block',
                                marginBottom: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            Role
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Developer Agent"
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            style={{
                                padding: '7px 10px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                color: '#e2e8f0',
                                fontSize: '13px',
                                width: '220px',
                            }}
                        />
                    </div>
                    <div>
                        <label
                            style={{
                                fontSize: '11px',
                                color: '#475569',
                                fontWeight: 600,
                                display: 'block',
                                marginBottom: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            Workspace ID
                        </label>
                        <input
                            type="text"
                            placeholder="ws_..."
                            value={newWorkspaceId}
                            onChange={(e) => setNewWorkspaceId(e.target.value)}
                            style={{
                                padding: '7px 10px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                color: '#e2e8f0',
                                fontSize: '13px',
                                width: '220px',
                            }}
                        />
                    </div>
                    <button
                        onClick={createAgent}
                        disabled={creating}
                        style={{
                            padding: '7px 16px',
                            background: '#16a34a',
                            border: '1px solid #15803d',
                            borderRadius: '6px',
                            color: '#f0fdf4',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: creating ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                    <button
                        onClick={() => {
                            setShowCreate(false);
                            setCreateError(null);
                        }}
                        style={{
                            padding: '7px 14px',
                            background: 'transparent',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#64748b',
                            fontSize: '12px',
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    {createError && (
                        <span style={{ fontSize: '12px', color: '#fca5a5', alignSelf: 'center' }}>
                            {createError}
                        </span>
                    )}
                </div>
            )}

            {/* Body: two-column layout */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    overflow: 'hidden',
                    minHeight: 0,
                }}
            >
                {/* Left column — agent list */}
                <div
                    style={{
                        width: '280px',
                        flexShrink: 0,
                        borderRight: '1px solid #1e293b',
                        overflowY: 'auto',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                    }}
                >
                    {loading && (
                        <p style={{ fontSize: '13px', color: '#475569', padding: '8px' }}>Loading…</p>
                    )}
                    {!loading && error && (
                        <p style={{ fontSize: '13px', color: '#fca5a5', padding: '8px' }}>{error}</p>
                    )}
                    {!loading && !error && agents.length === 0 && (
                        <p style={{ fontSize: '13px', color: '#475569', padding: '8px' }}>
                            No agents yet. Click &quot;+ New Agent&quot; to create one.
                        </p>
                    )}
                    {agents.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            selected={agent.id === selectedId}
                            onClick={() => setSelectedId(agent.id)}
                        />
                    ))}
                </div>

                {/* Right column — detail panel */}
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        background: '#060d1a',
                    }}
                >
                    {selectedAgent ? (
                        <AgentDetailPanel agent={selectedAgent} onStatusChange={handleStatusChange} />
                    ) : (
                        <div
                            style={{
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1e293b',
                                fontSize: '14px',
                            }}
                        >
                            Select an agent to view details
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
