'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Users, Plus, RefreshCw, ChevronRight, Circle, Zap, Clock, AlertCircle, Sun, Moon } from 'lucide-react';
import AgentDetailPanel from '../components/agent-detail-panel';
import type { Agent, BotStatus } from '../components/agent-card';

// ── Dark-editorial / Swiss-print system (scoped to this page) ────────────────────
const WF_CSS = `
/* Editorial palette — LIGHT default (Swiss black-on-white), DARK on toggle.
   Remaps --bg/--card/--line/--ink/--accent so every token-driven inline style
   on the page follows the theme automatically. */
.wf {
    --paper: #FBFAF7; --panel: #FFFFFF;
    --ink: #14140F; --ink-soft: #4A4A44; --ink-muted: #8C8C84;
    --rule: rgba(20,20,15,0.15); --signal: #D6301F;
    --bg: var(--paper); --card: var(--panel); --line: var(--rule); --accent: var(--signal);
    background: var(--paper); color: var(--ink);
    font-family: var(--font-inter), -apple-system, sans-serif; -webkit-font-smoothing: antialiased;
}
[data-theme="dark"] .wf {
    --paper: #0C0C0E; --panel: #141417;
    --ink: #ECECEC; --ink-soft: #B4B4B8; --ink-muted: #7C7C82;
    --rule: rgba(255,255,255,0.14); --signal: #E5484D;
}
.wf svg { stroke-width: 1.5px; }
.wf .wf-display { font-family: var(--font-fraunces), Georgia, 'Times New Roman', serif; letter-spacing: -0.015em; font-weight: 600; }
.wf .wf-eyebrow { font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.16em; font-size: 10px; color: var(--ink-muted); }
.wf .wf-mono { font-family: var(--font-plex-mono), monospace; }
/* Swiss: flat, sharp, no shadow, instant */
.wf button, .wf input, .wf select, .wf textarea { border-radius: 2px !important; box-shadow: none !important; }
.wf button { transition: background 60ms linear, color 60ms linear, border-color 60ms linear !important; }
/* Magazine-index rows */
.wf .wf-row { border-radius: 0 !important; border: 0 !important; border-top: 1px solid var(--rule) !important; background: transparent !important; }
.wf .wf-row:last-child { border-bottom: 1px solid var(--rule) !important; }
.wf .wf-row:hover { background: rgba(255,255,255,0.045) !important; }
.wf .wf-row[data-selected="true"] { background: rgba(229,72,77,0.10) !important; box-shadow: inset 2px 0 0 var(--signal) !important; }
/* Buttons: hard invert on hover */
.wf .wf-primary { background: var(--signal) !important; color: #0C0C0E !important; border: 1px solid var(--signal) !important; font-weight: 600 !important; }
.wf .wf-primary:hover { background: transparent !important; color: var(--signal) !important; }
.wf .wf-ghost { background: transparent !important; color: var(--ink-soft) !important; border: 1px solid var(--rule) !important; }
.wf .wf-ghost:hover { background: var(--ink) !important; color: var(--paper) !important; border-color: var(--ink) !important; }
/* Panels: hairline, no radius */
.wf .wf-panel { border-radius: 2px !important; box-shadow: none !important; border: 1px solid var(--rule) !important; background: var(--panel) !important; }
`;

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BotStatus, { label: string; color: string; bg: string; border: string }> = {
    active:                    { label: 'On shift',       color: 'var(--ok)', bg: 'rgba(26,122,74,0.07)',   border: 'rgba(26,122,74,0.22)'  },
    created:                   { label: 'Onboarding',     color: 'var(--accent)', bg: 'rgba(0,102,204,0.07)',   border: 'rgba(0,102,204,0.22)'  },
    bootstrapping:             { label: 'Onboarding',     color: 'var(--warn)', bg: 'rgba(180,83,9,0.07)',    border: 'rgba(180,83,9,0.22)'   },
    connector_setup_required:  { label: 'Setup needed',   color: 'var(--warn)', bg: 'rgba(180,83,9,0.07)',    border: 'rgba(180,83,9,0.22)'   },
    paused:                    { label: 'Off shift',      color: 'var(--ink-muted)', bg: 'rgba(110,110,115,0.07)', border: 'rgba(110,110,115,0.22)'},
    failed:                    { label: 'Needs attention',color: 'var(--danger)', bg: 'rgba(196,22,28,0.07)',   border: 'rgba(196,22,28,0.22)'  },
};

// Employee identity: a two-letter role monogram in a calm, deterministic tint —
// a team-directory avatar, not a robot/emoji. Tints are muted (no rainbow).
const ROLE_ABBR: Record<string, string> = {
    developer: 'DV', fullstack_developer: 'FS', tester: 'QA',
    business_analyst: 'BA', technical_writer: 'TW', content_writer: 'CW',
    sales_rep: 'SL', marketing_specialist: 'MK', corporate_assistant: 'CA',
    customer_support_executive: 'CS',
    project_manager_product_owner_scrum_master: 'PM',
    recruiter: 'RC', devops_engineer: 'DO', mobile: 'MB',
};
const AVATAR_TINTS = [
    { bg: 'rgba(37,99,235,0.10)', fg: '#2563eb' },
    { bg: 'rgba(13,148,136,0.10)', fg: '#0d9488' },
    { bg: 'rgba(109,40,217,0.10)', fg: '#6d28d9' },
    { bg: 'rgba(180,83,9,0.10)', fg: '#b45309' },
    { bg: 'rgba(71,85,105,0.12)', fg: '#475569' },
];
const roleMonogram = (role: string): string => ROLE_ABBR[role] ?? role.slice(0, 2).toUpperCase();
function avatarTint(seed: string) {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function EmployeeAvatar({ agent, size = 36 }: { agent: Agent; size?: number }) {
    const t = avatarTint(agent.id || agent.role);
    return (
        <span style={{
            width: size, height: size, borderRadius: 2, flexShrink: 0,
            background: t.bg, color: t.fg, border: `1px solid ${t.fg}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.round(size * 0.34), fontWeight: 700, letterSpacing: '0.04em',
            fontFamily: 'var(--font-plex-mono), monospace',
        }}>
            {roleMonogram(agent.role)}
        </span>
    );
}

const roleLabelOf = (role: string): string => role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Light/dark toggle — shares the app-wide `af_theme` key so it syncs everywhere.
function WfThemeToggle() {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const stored = localStorage.getItem('af_theme');
        const d = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDark(d);
        document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    }, []);
    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
        localStorage.setItem('af_theme', next ? 'dark' : 'light');
    };
    return (
        <button className="wf-ghost" onClick={toggle} aria-label="Toggle light or dark mode"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
            {dark ? <Sun size={13} /> : <Moon size={13} />} {dark ? 'Light' : 'Dark'}
        </button>
    );
}

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
    const roleLabel = roleLabelOf(agent.role);
    const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.created;

    return (
        <button
            type="button"
            className="wf-row"
            data-selected={selected}
            onClick={onClick}
            style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 11,
            }}
        >
            <EmployeeAvatar agent={agent} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--signal)' : 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {roleLabel}
                </div>
                <div className="wf-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2, letterSpacing: '0.04em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cfg.label.toUpperCase()} · #{agent.id.slice(-6).toUpperCase()}
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
    workspaceIds, onClose, onCreate,
}: {
    workspaceIds: string[];
    onClose: () => void;
    onCreate: (role: string, workspaceId: string, name: string, provider: string) => Promise<void>;
}) {
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [provider, setProvider] = useState('anthropic');
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
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

    const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 11px', borderRadius: 8,
        border: '1px solid var(--line)', background: 'var(--card)',
        color: 'var(--ink)', fontSize: 14, outline: 'none',
        transition: 'border-color 0.15s',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: 'var(--card)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480,
                border: '1px solid var(--line)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.15)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Add Teammate</div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Create an Agent</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelStyle}>Name <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Dev Agent Alpha" />
                    </div>
                    <div>
                        <label style={labelStyle}>Role <span style={{ color: 'var(--danger)' }}>*</span></label>
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
                        <label style={labelStyle}>Workspace</label>
                        {workspaceIds.length > 1 ? (
                            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} required>
                                {workspaceIds.map((id) => <option key={id} value={id}>{id}</option>)}
                            </select>
                        ) : (
                            <input value={workspaceId} readOnly style={{ ...inputStyle, background: 'var(--bg)', color: 'var(--ink-muted)' }} />
                        )}
                    </div>

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={creating} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: 'none', background: creating ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 14, fontWeight: 500, cursor: creating ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
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
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Users size={28} color="var(--accent)" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>No team members yet</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--ink-muted)', maxWidth: 280, lineHeight: 1.5 }}>
                Build your team. Each teammate has a dedicated role, its own memory, and the tools to do the work.
            </p>
            <button onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                <Plus size={14} /> Add teammate
            </button>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentsPageClient({ workspaceIds }: { workspaceIds: string[] }) {
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
        <div className="wf" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <style>{WF_CSS}</style>

            {/* ── Masthead ───────────────────────────────────────────────── */}
            <header style={{
                background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
                padding: '14px 28px 18px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Link href="/" className="wf-eyebrow" style={{ textDecoration: 'none' }}>← Dashboard</Link>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <WfThemeToggle />
                        <button className="wf-ghost" onClick={loadAgents} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                            <RefreshCw size={12} />
                        </button>
                        <button className="wf-primary" onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                            <Plus size={13} /> Add teammate
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
                    <div>
                        <div className="wf-eyebrow" style={{ marginBottom: 5 }}>The Workforce — {agents.length} on the roster</div>
                        <h1 className="wf-display" style={{ margin: 0, fontSize: 36, lineHeight: 0.95, color: 'var(--ink)' }}>Workforce</h1>
                    </div>
                    {agents.length > 0 && (
                        <div style={{ display: 'flex', gap: 32 }}>
                            {[
                                { val: activeCount, label: 'On shift', color: 'var(--ok)' },
                                { val: pausedCount, label: 'Off shift', color: 'var(--ink-muted)' },
                                { val: failedCount, label: 'Attention', color: 'var(--signal)' },
                            ].map(({ val, label, color }) => (
                                <div key={label} style={{ textAlign: 'right' }}>
                                    <div className="wf-display" style={{ fontSize: 28, lineHeight: 1, color }}>{String(val).padStart(2, '0')}</div>
                                    <div className="wf-eyebrow" style={{ marginTop: 5 }}>{label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                {/* Left column — agent list */}
                <div style={{ width: 272, flexShrink: 0, borderRight: '1px solid var(--rule)', background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div className="wf-eyebrow" style={{ padding: '14px 16px 8px' }}>Roster — Index</div>
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
                            No team members yet
                        </div>
                    )}
                    {agents.map((agent) => (
                        <AgentListItem key={agent.id} agent={agent} selected={agent.id === selectedId} onClick={() => setSelectedId(agent.id)} />
                    ))}

                    {agents.length > 0 && (
                        <Link href="/agents" className="wf-eyebrow wf-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginTop: 'auto', textDecoration: 'none' }}>
                            View full roster <ChevronRight size={12} />
                        </Link>
                    )}
                </div>

                {/* Right column — detail / empty */}
                <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
                    {loading ? null : selectedAgent ? (
                        <div style={{ padding: 20 }}>
                            {/* Agent header */}
                            <div className="wf-panel" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', marginBottom: 16 }}>
                                <EmployeeAvatar agent={selectedAgent} size={52} />
                                <div style={{ flex: 1 }}>
                                    <div className="wf-eyebrow" style={{ marginBottom: 6 }}>{selectedAgent.status === 'active' ? 'On shift' : roleLabelOf(selectedAgent.status)} · #{selectedAgent.id.slice(-6).toUpperCase()}</div>
                                    <div className="wf-display" style={{ fontSize: 24, lineHeight: 1, color: 'var(--ink)' }}>
                                        {roleLabelOf(selectedAgent.role)}
                                    </div>
                                </div>
                                <StatusBadge status={selectedAgent.status} />
                                <Link href={`/agents/${selectedAgent.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
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
            {showCreate && <CreateAgentModal workspaceIds={workspaceIds} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
        </div>
    );
}
