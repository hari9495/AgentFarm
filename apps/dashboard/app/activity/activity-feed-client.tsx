'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Activity, RefreshCw, AlertCircle, CheckCircle2,
    Clock, XCircle, Info, AlertTriangle, Filter,
    Zap, ShieldCheck, GitPullRequest, Plug, Server, Lock,
    ChevronDown, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedStatus = 'success' | 'failure' | 'pending' | 'info' | 'warning';
type FeedSource = 'activity_event' | 'dispatch' | 'approval';

type FeedItem = {
    id: string;
    source: FeedSource;
    category: string;
    title: string;
    detail?: string;
    agentId?: string;
    triggeredBy?: string;
    status: FeedStatus;
    timestamp: string;
    meta?: Record<string, unknown>;
};

// ── Visual config ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<FeedStatus, { color: string; bg: string; Icon: React.ElementType }> = {
    success: { color: '#16a34a', bg: '#dcfce7', Icon: CheckCircle2 },
    failure: { color: '#dc2626', bg: '#fee2e2', Icon: XCircle },
    pending: { color: '#2563eb', bg: '#dbeafe', Icon: Clock },
    warning: { color: '#d97706', bg: '#fef9c3', Icon: AlertTriangle },
    info:    { color: '#64748b', bg: '#f1f5f9', Icon: Info },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
    runtime:      { label: 'Runtime',      color: '#1d4ed8', bg: '#dbeafe', Icon: Zap },
    approval:     { label: 'Approval',     color: '#854d0e', bg: '#fef9c3', Icon: ShieldCheck },
    ci:           { label: 'CI',           color: '#7c3aed', bg: '#f3e8ff', Icon: GitPullRequest },
    connector:    { label: 'Connector',    color: '#166534', bg: '#dcfce7', Icon: Plug },
    provisioning: { label: 'Provisioning', color: '#991b1b', bg: '#fee2e2', Icon: Server },
    security:     { label: 'Security',     color: '#7f1d1d', bg: '#fee2e2', Icon: Lock },
    system:       { label: 'System',       color: '#475569', bg: '#f1f5f9', Icon: Activity },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG);

const ALL_STATUSES: { key: FeedStatus | ''; label: string }[] = [
    { key: '',          label: 'All statuses' },
    { key: 'success',   label: 'Success' },
    { key: 'failure',   label: 'Failure' },
    { key: 'warning',   label: 'Warning' },
    { key: 'pending',   label: 'Pending' },
    { key: 'info',      label: 'Info' },
];

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 5)    return 'just now';
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shortId(id: string): string {
    return id.length > 10 ? '…' + id.slice(-8) : id;
}

// ── Feed item row ─────────────────────────────────────────────────────────────

function FeedRow({ item }: { item: FeedItem }) {
    const [open, setOpen] = useState(false);
    const dotCfg = STATUS_DOT[item.status] ?? STATUS_DOT.info;
    const catCfg = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.system;
    const DotIcon = dotCfg.Icon;
    const CatIcon = catCfg.Icon;
    const hasDetail = !!item.detail || !!item.agentId || !!item.triggeredBy;

    return (
        <div
            style={{
                display: 'flex', gap: 14, padding: '14px 0',
                borderBottom: '1px solid var(--line)',
                cursor: hasDetail ? 'pointer' : 'default',
            }}
            onClick={() => hasDetail && setOpen(o => !o)}
        >
            {/* Timeline dot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
                <div style={{
                    width: 28, height: 28, borderRadius: 9999,
                    background: dotCfg.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 0 3px var(--bg)`,
                }}>
                    <DotIcon size={14} color={dotCfg.color} />
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Top row: category + title + time */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 9999,
                        background: catCfg.bg, color: catCfg.color,
                        flexShrink: 0,
                    }}>
                        <CatIcon size={9} /> {catCfg.label}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                        {item.title}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {timeAgo(item.timestamp)}
                    </span>
                    {hasDetail && (
                        <span style={{ color: 'var(--ink-muted)', flexShrink: 0 }}>
                            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </span>
                    )}
                </div>

                {/* Agent / trigger badges */}
                <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    {item.agentId && (
                        <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 9999,
                            background: 'var(--bg-deep)', color: 'var(--ink-muted)',
                            fontFamily: 'monospace',
                        }}>
                            agent:{shortId(item.agentId)}
                        </span>
                    )}
                    {item.triggeredBy && item.triggeredBy !== item.agentId && (
                        <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 9999,
                            background: 'var(--bg-deep)', color: 'var(--ink-muted)',
                            fontFamily: 'monospace',
                        }}>
                            by:{shortId(item.triggeredBy)}
                        </span>
                    )}
                </div>

                {/* Expanded detail */}
                {open && (
                    <div style={{
                        marginTop: 10, padding: '10px 12px',
                        borderRadius: 10, background: 'var(--bg-deep)',
                        fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                        {item.detail ?? '(no additional detail)'}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Day separator ─────────────────────────────────────────────────────────────

function DaySeparator({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>
    );
}

function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityFeedClient({ workspaceIds }: { workspaceIds: string[] }) {
    const workspaceId = workspaceIds[0] ?? '';

    const [items, setItems]           = useState<FeedItem[]>([]);
    const [total, setTotal]           = useState(0);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [lastRefreshed, setLast]    = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [catFilter, setCatFilter]   = useState('');
    const [statFilter, setStatFilter] = useState<FeedStatus | ''>('');

    // Counts per status for the filter bar
    const [counts, setCounts] = useState<Record<string, number>>({});

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!workspaceId) { setLoading(false); return; }
        if (!silent) setLoading(true); else setRefreshing(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: '80' });
            if (catFilter)  params.set('category', catFilter);
            if (statFilter) params.set('status', statFilter);
            const res = await fetch(
                `/api/workspaces/${encodeURIComponent(workspaceId)}/activity-feed?${params}`,
                { cache: 'no-store' },
            );
            const data = (await res.json()) as { items?: FeedItem[]; total?: number; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to load feed'); return; }
            const fetched = data.items ?? [];
            setItems(fetched);
            setTotal(data.total ?? fetched.length);
            // Count per status for the filter bar
            const c: Record<string, number> = {};
            for (const item of fetched) c[item.status] = (c[item.status] ?? 0) + 1;
            setCounts(c);
            setLast(new Date());
        } catch { setError('Network error. Try refreshing.'); }
        finally { setLoading(false); setRefreshing(false); }
    }, [workspaceId, catFilter, statFilter]);

    useEffect(() => {
        void load();
        timerRef.current = setInterval(() => void load(true), 20_000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [load]);

    // Group items by day for day separators
    const groups: Array<{ dayLabel: string; items: FeedItem[] }> = [];
    let lastDay = '';
    for (const item of items) {
        const dl = dayLabel(item.timestamp);
        if (dl !== lastDay) {
            groups.push({ dayLabel: dl, items: [] });
            lastDay = dl;
        }
        groups[groups.length - 1]!.items.push(item);
    }

    const failureCount = counts['failure'] ?? 0;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
            {/* ── Header ── */}
            <div style={{ padding: '28px 32px 0', maxWidth: 860, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={18} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>Activity Feed</h1>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>
                                Unified timeline — tasks, approvals, CI, connectors across all agents
                                {lastRefreshed && ` · updated ${timeAgo(lastRefreshed.toISOString())}`}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {failureCount > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 9999, border: '1px solid #fecaca' }}>
                                {failureCount} failure{failureCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        <button
                            onClick={() => void load(true)} disabled={refreshing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                        >
                            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* ── Filters ── */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4, alignItems: 'center' }}>
                    <Filter size={13} color="var(--ink-muted)" style={{ flexShrink: 0 }} />

                    {/* Category pills */}
                    {['', ...ALL_CATEGORIES].map(cat => {
                        const cfg = cat ? CATEGORY_CONFIG[cat] : null;
                        const active = catFilter === cat;
                        return (
                            <button key={cat || 'all'} onClick={() => setCatFilter(cat)}
                                style={{
                                    fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 9999, cursor: 'pointer',
                                    border: `1px solid ${active ? (cfg?.color ?? 'var(--accent)') : 'var(--line)'}`,
                                    background: active ? (cfg?.bg ?? 'color-mix(in srgb, var(--accent) 12%, transparent)') : 'var(--card)',
                                    color: active ? (cfg?.color ?? 'var(--accent)') : 'var(--ink-soft)',
                                    transition: 'all 0.12s',
                                }}>
                                {cat ? (CATEGORY_CONFIG[cat]?.label ?? cat) : 'All'}
                            </button>
                        );
                    })}

                    {/* Status select */}
                    <select
                        value={statFilter}
                        onChange={e => setStatFilter(e.target.value as FeedStatus | '')}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer', marginLeft: 'auto' }}
                    >
                        {ALL_STATUSES.map(s => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Timeline ── */}
            <div style={{ padding: '0 32px 48px', maxWidth: 860, margin: '0 auto' }}>
                {/* Error */}
                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(196,22,28,0.07)', border: '1px solid rgba(196,22,28,0.2)', color: '#c4161c', fontSize: 13, margin: '16px 0' }}>
                        <AlertCircle size={14} /> {error}
                        <button onClick={() => void load()} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
                    </div>
                )}

                {/* Skeletons */}
                {loading && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {[1,2,3,4,5].map(i => (
                            <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 9999, background: 'var(--bg-deep)', flexShrink: 0 }} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ height: 14, width: `${55 + i * 8}%`, background: 'var(--bg-deep)', borderRadius: 6 }} />
                                    <div style={{ height: 11, width: '30%', background: 'var(--bg-deep)', borderRadius: 6 }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && items.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 9999, background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={26} color="var(--ink-muted)" />
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-soft)' }}>No activity yet</div>
                        <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Events will appear here once agents start running tasks.</div>
                    </div>
                )}

                {/* Feed rows grouped by day */}
                {!loading && groups.map(group => (
                    <div key={group.dayLabel}>
                        <DaySeparator label={group.dayLabel} />
                        {group.items.map(item => <FeedRow key={item.id} item={item} />)}
                    </div>
                ))}

                {/* Showing N of total */}
                {!loading && items.length > 0 && (
                    <div style={{ textAlign: 'center', paddingTop: 20, fontSize: 12, color: 'var(--ink-muted)' }}>
                        Showing {items.length} of {total} events · auto-refreshes every 20 s
                    </div>
                )}
            </div>
        </div>
    );
}
