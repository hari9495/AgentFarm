'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Activity, RefreshCw, AlertCircle, CheckCircle2, PauseCircle,
    XCircle, Clock, Zap, ChevronRight, Play, Pause,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type BotStatus = 'created' | 'bootstrapping' | 'connector_setup_required' | 'active' | 'paused' | 'failed';

type AgentHealth = {
    id: string;
    role: string;
    status: BotStatus;
    workspaceId: string;
    workspaceName: string;
    createdAt: string;
    updatedAt: string;
    lastTaskAt: string | null;
    lastOutcome: 'success' | 'failed' | 'approval_queued' | null;
    tasks24h: number;
};

type Summary = { active: number; paused: number; failed: number; other: number };

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<BotStatus, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
    active:                   { label: 'Active',        color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0', Icon: CheckCircle2 },
    paused:                   { label: 'Paused',        color: '#d97706', bg: '#fef9c3', border: '#fde68a', Icon: PauseCircle  },
    failed:                   { label: 'Failed',        color: '#dc2626', bg: '#fee2e2', border: '#fecaca', Icon: XCircle      },
    bootstrapping:            { label: 'Bootstrapping', color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe', Icon: RefreshCw    },
    created:                  { label: 'Created',       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', Icon: Clock        },
    connector_setup_required: { label: 'Setup needed',  color: '#9333ea', bg: '#f3e8ff', border: '#e9d5ff', Icon: AlertCircle  },
};

const OUTCOME_CFG = {
    success:         { color: '#16a34a', label: '✓ success' },
    failed:          { color: '#dc2626', label: '✗ failed'  },
    approval_queued: { color: '#d97706', label: '⏳ queued' },
};

const ROLE_LABELS: Record<string, string> = {
    sales_rep: 'Sales', recruiter: 'Recruiter', content_writer: 'Content Writer',
    technical_writer: 'Technical Writer', developer: 'Developer',
    fullstack_developer: 'Full-Stack Dev', tester: 'Tester',
    business_analyst: 'Business Analyst', devops_engineer: 'DevOps',
    customer_support_executive: 'Support', corporate_assistant: 'Corp. Asst.',
    marketing_specialist: 'Marketing',
    project_manager_product_owner_scrum_master: 'Project Manager',
};

function timeAgo(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ count, label, color, bg, Icon }: { count: number; label: string; color: string; bg: string; Icon: React.ElementType }) {
    return (
        <div style={{ flex: '1 1 120px', padding: '14px 18px', borderRadius: 12, background: bg, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9999, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, opacity: 0.75, marginTop: 2 }}>{label}</div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentHealthClient() {
    const [agents, setAgents]       = useState<AgentHealth[]>([]);
    const [summary, setSummary]     = useState<Summary>({ active: 0, paused: 0, failed: 0, other: 0 });
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [refreshing, setRef]      = useState(false);
    const [lastAt, setLastAt]       = useState<Date | null>(null);
    const [busy, setBusy]           = useState<Record<string, string>>({});
    const [statusFilter, setFilter] = useState<BotStatus | ''>('');
    const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true); else setRef(true);
        setError(null);
        try {
            const res  = await fetch('/api/agents/health', { cache: 'no-store' });
            const data = (await res.json()) as { agents?: AgentHealth[]; summary?: Summary; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to load'); return; }
            setAgents(data.agents ?? []);
            setSummary(data.summary ?? { active: 0, paused: 0, failed: 0, other: 0 });
            setLastAt(new Date());
        } catch { setError('Network error.'); }
        finally { setLoading(false); setRef(false); }
    }, []);

    useEffect(() => {
        void load();
        timerRef.current = setInterval(() => void load(true), 30_000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [load]);

    async function handleAction(agent: AgentHealth, action: 'pause' | 'resume') {
        setBusy(b => ({ ...b, [agent.id]: action }));
        try {
            const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/${action}`, { method: 'POST' });
            if (!res.ok) { const d = (await res.json()) as { message?: string }; window.alert(d.message ?? `${action} failed`); return; }
            await load(true);
        } catch { window.alert('Network error.'); }
        finally { setBusy(b => { const n = { ...b }; delete n[agent.id]; return n; }); }
    }

    const displayed = statusFilter ? agents.filter(a => a.status === statusFilter) : agents;

    const TH: React.CSSProperties = { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' };
    const TD: React.CSSProperties = { padding: '11px 12px', fontSize: 13, borderBottom: '1px solid var(--line)', verticalAlign: 'middle' };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans, system-ui)' }}>
            {/* Header */}
            <div style={{ padding: '28px 32px 0', maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={18} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>Agent Health</h1>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>
                                Live status of every agent · auto-refreshes every 30 s
                                {lastAt && ` · updated ${timeAgo(lastAt.toISOString())}`}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Link href="/agents" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                            Manage agents →
                        </Link>
                        <button onClick={() => void load(true)} disabled={refreshing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer' }}>
                            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Summary cards */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
                    <SummaryCard count={summary.active}  label="Active"        color="#16a34a" bg="#f0fdf4" Icon={CheckCircle2} />
                    <SummaryCard count={summary.paused}  label="Paused"        color="#d97706" bg="#fffbeb" Icon={PauseCircle}  />
                    <SummaryCard count={summary.failed}  label="Failed"        color="#dc2626" bg="#fef2f2" Icon={XCircle}      />
                    <SummaryCard count={summary.other}   label="Other"         color="#64748b" bg="#f8fafc" Icon={Clock}        />
                    <SummaryCard count={agents.length}   label="Total agents"  color="#2563eb" bg="#eff6ff" Icon={Zap}          />
                </div>

                {/* Status filter pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    {(['', 'active', 'paused', 'failed', 'bootstrapping', 'created', 'connector_setup_required'] as const).map(s => {
                        const cfg = s ? STATUS_CFG[s] : null;
                        const active = statusFilter === s;
                        return (
                            <button key={s || 'all'} onClick={() => setFilter(s as BotStatus | '')}
                                style={{ fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 9999, cursor: 'pointer',
                                    border: `1px solid ${active ? (cfg?.color ?? 'var(--accent)') : 'var(--line)'}`,
                                    background: active ? (cfg?.bg ?? 'var(--card)') : 'var(--card)',
                                    color: active ? (cfg?.color ?? 'var(--accent)') : 'var(--ink-soft)', transition: 'all 0.12s' }}>
                                {s ? (STATUS_CFG[s]?.label ?? s) : 'All'}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Table */}
            <div style={{ padding: '0 32px 48px', maxWidth: 1100, margin: '0 auto' }}>
                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(196,22,28,0.07)', border: '1px solid rgba(196,22,28,0.2)', color: '#c4161c', fontSize: 13, marginBottom: 16 }}>
                        <AlertCircle size={14} /> {error}
                        <button onClick={() => void load()} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
                    </div>
                )}

                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--bg-deep)' }}>
                            <tr>
                                <th style={TH}>Agent</th>
                                <th style={TH}>Role</th>
                                <th style={TH}>Status</th>
                                <th style={TH}>Last activity</th>
                                <th style={TH}>Last outcome</th>
                                <th style={{ ...TH, textAlign: 'center' }}>Tasks (24h)</th>
                                <th style={TH}>Workspace</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && [1,2,3,4,5].map(i => (
                                <tr key={i}>
                                    {[100,90,80,90,80,40,90,100].map((w, j) => (
                                        <td key={j} style={TD}>
                                            <div style={{ height: 14, width: w, background: 'var(--bg-deep)', borderRadius: 4 }} />
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {!loading && displayed.length === 0 && (
                                <tr>
                                    <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--ink-muted)', padding: '3rem' }}>
                                        {agents.length === 0 ? 'No agents found.' : 'No agents match the selected filter.'}
                                    </td>
                                </tr>
                            )}

                            {!loading && displayed.map(agent => {
                                const cfg  = STATUS_CFG[agent.status] ?? STATUS_CFG.created;
                                const Icon = cfg.Icon;
                                const row  = busy[agent.id];

                                return (
                                    <tr key={agent.id} style={{ transition: 'background 0.1s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-deep)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                        {/* Agent ID */}
                                        <td style={TD}>
                                            <code style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'monospace' }}>
                                                {agent.id.slice(-10)}
                                            </code>
                                        </td>

                                        {/* Role */}
                                        <td style={{ ...TD, fontWeight: 600, color: 'var(--ink)' }}>
                                            {ROLE_LABELS[agent.role] ?? agent.role}
                                        </td>

                                        {/* Status */}
                                        <td style={TD}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                                                <Icon size={10} className={agent.status === 'bootstrapping' ? 'animate-spin' : ''} />
                                                {cfg.label}
                                            </span>
                                        </td>

                                        {/* Last activity */}
                                        <td style={{ ...TD, color: 'var(--ink-muted)', fontSize: 12 }}>
                                            {agent.lastTaskAt ? timeAgo(agent.lastTaskAt) : <span style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>no tasks yet</span>}
                                        </td>

                                        {/* Last outcome */}
                                        <td style={TD}>
                                            {agent.lastOutcome ? (
                                                <span style={{ fontSize: 11, fontWeight: 600, color: OUTCOME_CFG[agent.lastOutcome]?.color ?? 'var(--ink-muted)' }}>
                                                    {OUTCOME_CFG[agent.lastOutcome]?.label ?? agent.lastOutcome}
                                                </span>
                                            ) : <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>—</span>}
                                        </td>

                                        {/* Tasks 24h */}
                                        <td style={{ ...TD, textAlign: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: agent.tasks24h > 0 ? 700 : 400, color: agent.tasks24h > 0 ? 'var(--ink)' : 'var(--ink-muted)' }}>
                                                {agent.tasks24h}
                                            </span>
                                        </td>

                                        {/* Workspace */}
                                        <td style={{ ...TD, color: 'var(--ink-soft)', fontSize: 12 }}>
                                            {agent.workspaceName}
                                        </td>

                                        {/* Actions */}
                                        <td style={{ ...TD, textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                                {agent.status === 'active' && (
                                                    <button onClick={() => void handleAction(agent, 'pause')} disabled={!!row}
                                                        title="Pause agent"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: row ? 'not-allowed' : 'pointer', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e' }}>
                                                        <Pause size={11} /> {row === 'pause' ? '…' : 'Pause'}
                                                    </button>
                                                )}
                                                {agent.status === 'paused' && (
                                                    <button onClick={() => void handleAction(agent, 'resume')} disabled={!!row}
                                                        title="Resume agent"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: row ? 'not-allowed' : 'pointer', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534' }}>
                                                        <Play size={11} /> {row === 'resume' ? '…' : 'Resume'}
                                                    </button>
                                                )}
                                                <Link href={`/agents?botId=${agent.id}`}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', textDecoration: 'none' }}>
                                                    Detail <ChevronRight size={10} />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && displayed.length > 0 && (
                    <div style={{ textAlign: 'center', paddingTop: 14, fontSize: 12, color: 'var(--ink-muted)' }}>
                        Showing {displayed.length} of {agents.length} agents
                    </div>
                )}
            </div>
        </div>
    );
}
