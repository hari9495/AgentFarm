'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Play, RefreshCw, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type WakeSource = 'timer' | 'assignment' | 'on_demand' | 'automation' | 'proactive_signal' | 'agent_handoff';

type WakeRun = {
    id: string;
    botId: string;
    workspaceId: string;
    wakeSource: WakeSource;
    status: 'scheduled' | 'running' | 'completed' | 'failed' | 'skipped';
    correlationId?: string;
    dedupeKey?: string;
    scheduledAt?: string;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
    createdAt: string;
};

type ScheduleForm = {
    botId: string;
    wakeSource: WakeSource;
    dedupeKey: string;
    timestamp: string;
    correlationId: string;
};

const API_BASE = '';

const WAKE_SOURCES: WakeSource[] = [
    'timer', 'assignment', 'on_demand', 'automation', 'proactive_signal', 'agent_handoff',
];

const SOURCE_LABEL: Record<WakeSource, string> = {
    timer: 'Timer',
    assignment: 'Assignment',
    on_demand: 'On Demand',
    automation: 'Automation',
    proactive_signal: 'Proactive Signal',
    agent_handoff: 'Agent Handoff',
};

const STATUS_STYLE: Record<WakeRun['status'], { bg: string; color: string; icon: React.ElementType }> = {
    scheduled: { bg: '#eff6ff', color: '#1e40af', icon: Clock },
    running: { bg: '#fef9c3', color: 'var(--warn)', icon: Loader2 },
    completed: { bg: '#dcfce7', color: 'var(--ok)', icon: CheckCircle2 },
    failed: { bg: '#fee2e2', color: 'var(--danger)', icon: XCircle },
    skipped: { bg: '#f1f5f9', color: '#475569', icon: RefreshCw },
};

const SOURCE_BADGE: Record<WakeSource, { bg: string; color: string }> = {
    timer: { bg: '#eff6ff', color: '#1e40af' },
    assignment: { bg: '#f0fdf4', color: 'var(--ok)' },
    on_demand: { bg: '#fdf4ff', color: '#7c3aed' },
    automation: { bg: '#fff7ed', color: '#c2410c' },
    proactive_signal: { bg: '#fefce8', color: 'var(--warn)' },
    agent_handoff: { bg: '#f0f9ff', color: 'var(--info)' },
};

const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };

function EmptyState({ label }: { label: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
            <AlarmClock size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>{label}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: WakeRun['status'] }) {
    const s = STATUS_STYLE[status];
    const Icon = s.icon;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
            <Icon size={10} />
            {status}
        </span>
    );
}

function SourceBadge({ source }: { source: WakeSource }) {
    const s = SOURCE_BADGE[source];
    return (
        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
            {SOURCE_LABEL[source]}
        </span>
    );
}

const EMPTY_FORM: ScheduleForm = {
    botId: '',
    wakeSource: 'on_demand',
    dedupeKey: '',
    timestamp: '',
    correlationId: '',
};

export default function WakeRunsPanel({ workspaceId }: { workspaceId: string }) {
    const [runs, setRuns] = useState<WakeRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitOk, setSubmitOk] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            const res = await fetch(`${API_BASE}/api/wake/runs?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRuns(Array.isArray(data) ? data : (data.runs ?? []));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load wake runs');
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => { load(); }, [load]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setSubmitError(null);
        setSubmitOk(false);
        try {
            const body: Record<string, string> = {
                workspace_id: workspaceId,
                bot_id: form.botId,
                wake_source: form.wakeSource,
            };
            if (form.dedupeKey) body.dedupe_key = form.dedupeKey;
            if (form.timestamp) body.timestamp = form.timestamp;
            if (form.correlationId) body.correlation_id = form.correlationId;

            const res = await fetch(`${API_BASE}/api/wake/schedule`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message ?? `HTTP ${res.status}`);
            }
            setSubmitOk(true);
            setForm(EMPTY_FORM);
            setShowForm(false);
            await load();
        } catch (e) {
            setSubmitError(e instanceof Error ? e.message : 'Failed to schedule wake run');
        } finally {
            setSubmitting(false);
        }
    };

    const inp: React.CSSProperties = {
        width: '100%', padding: '7px 10px', border: '1px solid var(--line)',
        borderRadius: 8, fontSize: 13, color: 'var(--ink-soft)', background: 'var(--card)',
        outline: 'none', boxSizing: 'border-box',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={load} title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                        <RefreshCw size={13} />Refresh
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
                </div>
                <button type="button" onClick={() => { setShowForm(f => !f); setSubmitError(null); setSubmitOk(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: 'none', borderRadius: 8, background: '#0066cc', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <Play size={12} />Schedule Wake Run
                </button>
            </div>

            {/* Schedule form */}
            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>New Wake Run</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Bot ID *</label>
                            <input style={inp} required placeholder="bot_xyz" value={form.botId} onChange={e => setForm(f => ({ ...f, botId: e.target.value }))} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Wake Source *</label>
                            <select style={{ ...inp }} required value={form.wakeSource} onChange={e => setForm(f => ({ ...f, wakeSource: e.target.value as WakeSource }))}>
                                {WAKE_SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Dedupe Key</label>
                            <input style={inp} placeholder="optional" value={form.dedupeKey} onChange={e => setForm(f => ({ ...f, dedupeKey: e.target.value }))} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Scheduled At (ISO)</label>
                            <input style={inp} type="datetime-local" value={form.timestamp} onChange={e => setForm(f => ({ ...f, timestamp: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Correlation ID</label>
                            <input style={inp} placeholder="optional trace ID" value={form.correlationId} onChange={e => setForm(f => ({ ...f, correlationId: e.target.value }))} />
                        </div>
                    </div>
                    {submitError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{submitError}</p>}
                    {submitOk && <p style={{ margin: 0, fontSize: 12, color: 'var(--ok)' }}>Wake run scheduled successfully.</p>}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setShowForm(false)} style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>Cancel</button>
                        <button type="submit" disabled={submitting} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: '#0066cc', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>
                            {submitting ? 'Scheduling…' : 'Schedule'}
                        </button>
                    </div>
                </form>
            )}

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading wake runs…</div>
            ) : error ? (
                <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 13 }}>{error}</div>
            ) : runs.length === 0 ? (
                <EmptyState label="No wake runs yet. Schedule one to get started." />
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Bot ID', 'Wake Source', 'Status', 'Scheduled At', 'Completed At', 'Correlation ID'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run, i) => (
                                <tr key={run.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                    <td style={cell}><code style={{ fontSize: 11, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{run.botId}</code></td>
                                    <td style={cell}><SourceBadge source={run.wakeSource} /></td>
                                    <td style={cell}><StatusBadge status={run.status} /></td>
                                    <td style={{ ...cell, color: '#64748b' }}>{run.scheduledAt ? new Date(run.scheduledAt).toLocaleString() : run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}</td>
                                    <td style={{ ...cell, color: '#64748b' }}>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}</td>
                                    <td style={{ ...cell, color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{run.correlationId ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
