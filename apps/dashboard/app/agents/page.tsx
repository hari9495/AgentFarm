'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot, Plus, RefreshCw, ChevronRight, Circle, Zap, Clock, AlertCircle } from 'lucide-react';
import AgentDetailPanel from '../components/agent-detail-panel';
import type { Agent, BotStatus } from '../components/agent-card';

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BotStatus, { label: string; color: string; bg: string; border: string }> = {
    active:                    { label: 'Active',         color: '#1a7a4a', bg: 'rgba(26,122,74,0.07)',   border: 'rgba(26,122,74,0.22)'  },
    created:                   { label: 'Created',        color: '#0066cc', bg: 'rgba(0,102,204,0.07)',   border: 'rgba(0,102,204,0.22)'  },
    bootstrapping:             { label: 'Bootstrapping',  color: '#b45309', bg: 'rgba(180,83,9,0.07)',    border: 'rgba(180,83,9,0.22)'   },
    connector_setup_required:  { label: 'Setup Required', color: '#b45309', bg: 'rgba(180,83,9,0.07)',    border: 'rgba(180,83,9,0.22)'   },
    paused:                    { label: 'Paused',         color: '#6e6e73', bg: 'rgba(110,110,115,0.07)', border: 'rgba(110,110,115,0.22)'},
    failed:                    { label: 'Failed',         color: '#c4161c', bg: 'rgba(196,22,28,0.07)',   border: 'rgba(196,22,28,0.22)'  },
};

const ROLE_ICONS: Record<string, string> = {
    developer: '💻', fullstack_developer: '🖥️', tester: '🧪',
    business_analyst: '📊', technical_writer: '✍️', content_writer: '📝',
    sales_rep: '🤝', marketing_specialist: '📣', corporate_assistant: '🗓️',
    customer_support_executive: '🎧',
    project_manager_product_owner_scrum_master: '🗂️',
    recruiter: '🔍',
};

const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini', 'mistral', 'groq', 'cohere'];

function StatusBadge({ status }: { status: BotStatus }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.created;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '9999px', fontSize: '11px',
            fontWeight: 600, letterSpacing: '0.01em',
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0,
                ...(status === 'active' ? { boxShadow: `0 0 0 3px ${cfg.border}` } : {}),
            }} />
            {cfg.label}
        </span>
    );
}

// ── Agent list item ─────────────────────────────────────────────────────────────

function AgentListItem({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
    const icon = ROLE_ICONS[agent.role] ?? '🤖';
    const roleLabel = agent.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.created;

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: '100%', textAlign: 'left', background: selected ? 'rgba(0,102,204,0.06)' : 'transparent',
                border: `1px solid ${selected ? 'rgba(0,102,204,0.2)' : 'transparent'}`,
                borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.03)'; }}
            onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
            <span style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: selected ? 'rgba(0,102,204,0.12)' : '#f5f5f7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: selected ? '#0066cc' : '#1d1d1f',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {roleLabel}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    #{agent.id.slice(-8).toUpperCase()}
                </div>
            </div>
            <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: cfg.color,
                ...(agent.status === 'active' ? { boxShadow: `0 0 0 3px ${cfg.border}` } : {}),
            }} />
        </button>
    );
}

// ── Create agent modal ─────────────────────────────────────────────────────────

function CreateAgentModal({
    onClose, onCreate,
}: {
    onClose: () => void;
    onCreate: (role: string, workspaceId: string, name: string, provider: string) => Promise<void>;
}) {
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [provider, setProvider] = useState('anthropic');
    const [workspaceId, setWorkspaceId] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!role.trim() || !workspaceId.trim()) { setError('Role and Workspace ID are required.'); return; }
        setCreating(true);
        setError(null);
        try { await onCreate(role.trim(), workspaceId.trim(), name.trim(), provider); }
        catch (err) { setError(err instanceof Error ? err.message : 'Failed to create agent.'); }
        finally { setCreating(false); }
    }

    const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 5 };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 11px', borderRadius: 8,
        border: '1px solid #d2d2d7', background: '#ffffff',
        color: '#1d1d1f', fontSize: 14, outline: 'none',
        transition: 'border-color 0.15s',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: '#ffffff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480,
                border: '1px solid #d2d2d7', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.15)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0066cc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>New Agent</div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>Create an Agent</h2>
                    </div>
                    <button onClick={onClose} style={{ background: '#f5f5f7', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6e6e73', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelStyle}>Name <span style={{ color: '#6e6e73', fontWeight: 400 }}>(optional)</span></label>
                        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Dev Agent Alpha" />
                    </div>
                    <div>
                        <label style={labelStyle}>Role <span style={{ color: '#c4161c' }}>*</span></label>
                        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} required>
                            <option value="">Select a role…</option>
                            <option value="developer">Developer</option>
                            <option value="fullstack_developer">Full-Stack Developer</option>
                            <option value="tester">Tester</option>
                            <option value="business_analyst">Business Analyst</option>
                            <option value="technical_writer">Technical Writer</option>
                            <option value="content_writer">Content Writer</option>
                            <option value="sales_rep">Sales Rep</option>
                            <option value="marketing_specialist">Marketing Specialist</option>
                            <option value="corporate_assistant">Corporate Assistant</option>
                            <option value="customer_support_executive">Customer Support Executive</option>
                            <option value="project_manager_product_owner_scrum_master">Project Manager</option>
                            <option value="recruiter">Recruiter</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>LLM Provider</label>
                        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            {LLM_PROVIDERS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Workspace ID <span style={{ color: '#c4161c' }}>*</span></label>
                        <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={inputStyle} placeholder="ws_..." required />
                    </div>

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: 'rgba(196,22,28,0.07)', border: '1px solid rgba(196,22,28,0.2)', color: '#c4161c', fontSize: 13 }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#ffffff', color: '#424245', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={creating} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: 'none', background: creating ? '#aeaeb2' : '#0066cc', color: '#ffffff', fontSize: 14, fontWeight: 500, cursor: creating ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                            {creating ? 'Creating…' : 'Create Agent'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Bot size={28} color="#0066cc" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>No agents yet</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6e6e73', maxWidth: 280, lineHeight: 1.5 }}>
                Create your first AI agent. Each agent has a dedicated role, memory, and action capabilities.
            </p>
            <button onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                <Plus size={14} /> New Agent
            </button>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

    async function loadAgents() {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/agents');
            if (!res.ok) { setError('Failed to load agents.'); return; }
            const data = (await res.json()) as { bots?: Agent[] };
            const list = data.bots ?? [];
            setAgents(list);
            if (list.length > 0 && !selectedId) setSelectedId(list[0]!.id);
        } catch { setError('Network error.'); }
        finally { setLoading(false); }
    }

    useEffect(() => { void loadAgents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleCreate(role: string, workspaceId: string, _name: string, _provider: string) {
        const res = await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, workspaceId }),
        });
        const body = (await res.json()) as { bot?: Agent; error?: string; message?: string };
        if (res.ok && body.bot) {
            setAgents((prev) => [body.bot!, ...prev]);
            setSelectedId(body.bot!.id);
            setShowCreate(false);
        } else {
            throw new Error(body.message ?? body.error ?? 'Failed to create agent.');
        }
    }

    function handleStatusChange(botId: string, newStatus: BotStatus) {
        setAgents((prev) => prev.map((a) => a.id === botId ? { ...a, status: newStatus } : a));
    }

    const activeCount = agents.filter((a) => a.status === 'active').length;
    const pausedCount = agents.filter((a) => a.status === 'paused').length;
    const failedCount = agents.filter((a) => a.status === 'failed').length;

    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column' }}>

            {/* ── Top bar ────────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: '#ffffff', borderBottom: '1px solid #d2d2d7',
                display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0,
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6e6e73', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
                    ← Dashboard
                </Link>
                <span style={{ color: '#d2d2d7' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bot size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>Agent Management</span>
                </div>

                {/* Stats */}
                {agents.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginLeft: 16 }}>
                        {[
                            { icon: Zap, color: '#1a7a4a', bg: 'rgba(26,122,74,0.07)', val: activeCount, label: 'Active' },
                            { icon: Clock, color: '#6e6e73', bg: 'rgba(110,110,115,0.07)', val: pausedCount, label: 'Paused' },
                            { icon: AlertCircle, color: '#c4161c', bg: 'rgba(196,22,28,0.07)', val: failedCount, label: 'Failed' },
                        ].map(({ icon: Icon, color, bg, val, label }) => val > 0 ? (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: bg, border: `1px solid ${color}33` }}>
                                <Icon size={11} color={color} />
                                <span style={{ fontSize: 12, fontWeight: 600, color }}>{val} {label}</span>
                            </div>
                        ) : null)}
                    </div>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={loadAgents} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#424245', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={12} />
                    </button>
                    <button onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 9999, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={13} /> New Agent
                    </button>
                </div>
            </header>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                {/* Left column — agent list */}
                <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--line)', background: 'var(--card)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {loading && (
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1, 2, 3].map((i) => (
                                <div key={i} style={{ height: 56, borderRadius: 12, background: 'var(--line)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            ))}
                        </div>
                    )}
                    {!loading && error && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span>{error}</span>
                            <button
                                type="button"
                                onClick={() => void loadAgents()}
                                style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    {!loading && !error && agents.length === 0 && (
                        <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                            No agents yet
                        </div>
                    )}
                    {agents.map((agent) => (
                        <AgentListItem key={agent.id} agent={agent} selected={agent.id === selectedId} onClick={() => setSelectedId(agent.id)} />
                    ))}

                    {agents.length > 0 && (
                        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                            <Link href="/agents" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, color: '#0066cc', fontSize: 12, fontWeight: 600, textDecoration: 'none', background: 'rgba(0,102,204,0.04)' }}>
                                View all agents <ChevronRight size={12} />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Right column — detail / empty */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#f5f5f7' }}>
                    {loading ? null : selectedAgent ? (
                        <div style={{ padding: 20 }}>
                            {/* Agent header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                                    {ROLE_ICONS[selectedAgent.role] ?? '🤖'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: 3 }}>
                                        {selectedAgent.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6e6e73', fontFamily: 'monospace' }}>#{selectedAgent.id.slice(-8).toUpperCase()}</div>
                                </div>
                                <StatusBadge status={selectedAgent.status} />
                                <Link href={`/agents/${selectedAgent.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#424245', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                                    Full detail <ChevronRight size={11} />
                                </Link>
                            </div>
                            <AgentDetailPanel agent={selectedAgent} onStatusChange={handleStatusChange} />
                        </div>
                    ) : (
                        <EmptyState onNew={() => setShowCreate(true)} />
                    )}
                </div>
            </div>

            {/* ── Create modal ─────────────────────────────────────────────── */}
            {showCreate && <CreateAgentModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
        </div>
    );
}
