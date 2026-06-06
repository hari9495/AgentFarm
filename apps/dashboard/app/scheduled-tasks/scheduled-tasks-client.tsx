'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type ScheduledJob = {
    id: string;
    tenantId: string;
    name: string;
    cronExpr: string;
    goal: string;
    agentId: string | null;
    enabled: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
};

type Bot = {
    id: string;
    role: string;
    status: string;
    workspaceId: string;
};

// ── Schedule presets ───────────────────────────────────────────────────────

type ScheduleMode =
    | 'daily'
    | 'weekdays'
    | 'weekly'
    | 'monthly'
    | 'every_n_hours'
    | 'custom';

const WEEKDAYS = [
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' },
    { label: 'Sunday', value: '0' },
];

const buildCron = (
    mode: ScheduleMode,
    hour: number,
    minute: number,
    weekday: string,
    monthDay: number,
    nHours: number,
    custom: string,
): string => {
    const h = String(hour);
    const m = String(minute);
    switch (mode) {
        case 'daily': return `${m} ${h} * * *`;
        case 'weekdays': return `${m} ${h} * * 1-5`;
        case 'weekly': return `${m} ${h} * * ${weekday}`;
        case 'monthly': return `${m} ${h} ${monthDay} * *`;
        case 'every_n_hours': return `0 */${nHours} * * *`;
        case 'custom': return custom.trim();
        default: return `${m} ${h} * * *`;
    }
};

const describeCron = (
    mode: ScheduleMode,
    hour: number,
    minute: number,
    weekday: string,
    monthDay: number,
    nHours: number,
): string => {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const wdLabel = WEEKDAYS.find((d) => d.value === weekday)?.label ?? 'Monday';
    switch (mode) {
        case 'daily': return `Every day at ${time}`;
        case 'weekdays': return `Every weekday (Mon–Fri) at ${time}`;
        case 'weekly': return `Every ${wdLabel} at ${time}`;
        case 'monthly': return `Monthly on day ${monthDay} at ${time}`;
        case 'every_n_hours': return `Every ${nHours} hour${nHours > 1 ? 's' : ''}`;
        case 'custom': return 'Custom cron expression';
        default: return '';
    }
};

const suggestName = (goal: string, mode: ScheduleMode, hour: number, weekday: string): string => {
    const short = goal.trim().split(/\s+/).slice(0, 4).join(' ');
    if (!short) return '';
    const suffix =
        mode === 'daily' ? `daily ${String(hour).padStart(2, '0')}:00` :
        mode === 'weekdays' ? 'weekdays' :
        mode === 'weekly' ? `weekly ${WEEKDAYS.find((d) => d.value === weekday)?.label ?? ''}` :
        mode === 'monthly' ? 'monthly' :
        mode === 'every_n_hours' ? 'hourly' : 'scheduled';
    return `${short} — ${suffix}`;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const N_HOURS = [1, 2, 3, 4, 6, 8, 12];

// ── Component ─────────────────────────────────────────────────────────────

export default function ScheduledTasksClient() {
    const [jobs, setJobs] = useState<ScheduledJob[]>([]);
    const [bots, setBots] = useState<Bot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    // builder visibility + edit mode
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);

    // builder fields
    const [goal, setGoal] = useState('');
    const [agentId, setAgentId] = useState('');
    const [name, setName] = useState('');
    const [nameManual, setNameManual] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('daily');
    const [hour, setHour] = useState(9);
    const [minute, setMinute] = useState(0);
    const [weekday, setWeekday] = useState('1');
    const [monthDay, setMonthDay] = useState(1);
    const [nHours, setNHours] = useState(4);
    const [customCron, setCustomCron] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/scheduled-jobs');
            const data = (await res.json().catch(() => ({}))) as { schedules?: ScheduledJob[]; error?: string; message?: string };
            if (!res.ok) {
                setError(data.message ?? data.error ?? 'Failed to load scheduled tasks.');
                return;
            }
            setJobs(data.schedules ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchBots = useCallback(async () => {
        try {
            const res = await fetch('/api/agents');
            if (!res.ok) return;
            const data = (await res.json().catch(() => ({}))) as { agents?: Bot[]; bots?: Bot[] };
            setBots(data.agents ?? data.bots ?? []);
        } catch {
            // non-fatal
        }
    }, []);

    useEffect(() => {
        void fetchJobs();
        void fetchBots();
    }, [fetchJobs, fetchBots]);

    // auto-suggest name when goal or schedule changes
    useEffect(() => {
        if (!nameManual) {
            setName(suggestName(goal, scheduleMode, hour, weekday));
        }
    }, [goal, scheduleMode, hour, weekday, nameManual]);

    // ── Open builder / edit ────────────────────────────────────────────────

    const openCreate = () => {
        setEditingJob(null);
        setGoal('');
        setAgentId(bots[0]?.id ?? '');
        setName('');
        setNameManual(false);
        setEnabled(true);
        setScheduleMode('daily');
        setHour(9);
        setMinute(0);
        setWeekday('1');
        setMonthDay(1);
        setNHours(4);
        setCustomCron('');
        setShowBuilder(true);
    };

    const openEdit = (job: ScheduledJob) => {
        setEditingJob(job);
        setGoal(job.goal);
        setAgentId(job.agentId ?? '');
        setName(job.name);
        setNameManual(true);
        setEnabled(job.enabled);
        setScheduleMode('custom');
        setCustomCron(job.cronExpr);
        setShowBuilder(true);
    };

    const closeBuilder = () => {
        setShowBuilder(false);
        setEditingJob(null);
    };

    // ── Save ───────────────────────────────────────────────────────────────

    const handleSave = async () => {
        const cronExpr = buildCron(scheduleMode, hour, minute, weekday, monthDay, nHours, customCron);
        const trimmedGoal = goal.trim();
        const trimmedName = name.trim() || suggestName(trimmedGoal, scheduleMode, hour, weekday) || 'Scheduled Task';

        if (!trimmedGoal) {
            setMessage({ text: 'Task description is required.', ok: false });
            return;
        }
        if (!cronExpr) {
            setMessage({ text: 'A schedule is required.', ok: false });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const payload = {
                name: trimmedName,
                cronExpr,
                goal: trimmedGoal,
                agentId: agentId || null,
                enabled,
            };

            const isEdit = Boolean(editingJob);
            const url = isEdit ? `/api/scheduled-jobs/${editingJob!.id}` : '/api/scheduled-jobs';
            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; id?: string };

            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Failed to save.', ok: false });
                return;
            }

            setMessage({ text: isEdit ? 'Schedule updated.' : 'Schedule created.', ok: true });
            closeBuilder();
            await fetchJobs();
        } finally {
            setSaving(false);
        }
    };

    // ── Toggle enable ──────────────────────────────────────────────────────

    const toggleEnable = async (job: ScheduledJob) => {
        try {
            const res = await fetch(`/api/scheduled-jobs/${job.id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: !job.enabled }),
            });
            if (res.ok) {
                setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, enabled: !j.enabled } : j));
            }
        } catch {
            // non-fatal
        }
    };

    // ── Delete ─────────────────────────────────────────────────────────────

    const handleDelete = async (job: ScheduledJob) => {
        if (!window.confirm(`Delete "${job.name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/scheduled-jobs/${job.id}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                setJobs((prev) => prev.filter((j) => j.id !== job.id));
                setMessage({ text: `"${job.name}" deleted.`, ok: true });
            }
        } catch {
            setMessage({ text: 'Failed to delete.', ok: false });
        }
    };

    // ── Derived ────────────────────────────────────────────────────────────

    const cronPreview = buildCron(scheduleMode, hour, minute, weekday, monthDay, nHours, customCron);
    const scheduleDesc = describeCron(scheduleMode, hour, minute, weekday, monthDay, nHours);

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                    {jobs.length} schedule{jobs.length !== 1 ? 's' : ''} configured
                    {jobs.filter((j) => j.enabled).length > 0 && (
                        <> · <strong>{jobs.filter((j) => j.enabled).length} active</strong></>
                    )}
                </p>
                <button type="button" className="primary-action" onClick={openCreate}>
                    + New Schedule
                </button>
            </div>

            {/* Global message */}
            {message && (
                <p style={{ margin: 0, padding: '0.5rem 0.85rem', borderRadius: 8, fontSize: '0.82rem', background: message.ok ? 'var(--ok-bg)' : 'var(--danger-bg)', border: `1px solid ${message.ok ? 'var(--ok-border)' : 'var(--danger-border)'}`, color: message.ok ? 'var(--ok)' : 'var(--danger)' }}>
                    {message.text}
                </p>
            )}

            {/* ── Builder modal ────────────────────────────────────────────── */}
            {showBuilder && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={editingJob ? 'Edit schedule' : 'New schedule'}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(12,18,28,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeBuilder(); }}
                >
                    <div style={{ width: 'min(36rem, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 24px 48px rgba(15,23,42,0.22)', display: 'grid', gap: '1.25rem' }}>

                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                                    {editingJob ? 'Edit Schedule' : 'New Scheduled Task'}
                                </h2>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                    Your agent will run this task automatically on the schedule you choose.
                                </p>
                            </div>
                            <button type="button" className="chip-button" onClick={closeBuilder}>Close</button>
                        </div>

                        {/* ── Step 1: What should the agent do? ── */}
                        <section>
                            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                                1. What should the agent do?
                            </label>
                            <textarea
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                rows={3}
                                placeholder="e.g. Summarise open Jira tickets and post to #standup in Slack"
                                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--line)', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', outline: 'none' }}
                            />
                        </section>

                        {/* ── Step 2: Which agent? ── */}
                        {bots.length > 0 && (
                            <section>
                                <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                                    2. Which agent?
                                </label>
                                <select
                                    value={agentId}
                                    onChange={(e) => setAgentId(e.target.value)}
                                    className="approval-select"
                                    style={{ width: '100%' }}
                                >
                                    <option value="">— any available agent —</option>
                                    {bots.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.role} ({b.id.slice(0, 12)}…)
                                        </option>
                                    ))}
                                </select>
                            </section>
                        )}

                        {/* ── Step 3: When should it run? ── */}
                        <section>
                            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                3. When should it run?
                            </label>

                            {/* Mode pills */}
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                                {(
                                    [
                                        ['daily', 'Daily'],
                                        ['weekdays', 'Weekdays'],
                                        ['weekly', 'Weekly'],
                                        ['monthly', 'Monthly'],
                                        ['every_n_hours', 'Every N hours'],
                                        ['custom', 'Custom cron'],
                                    ] as [ScheduleMode, string][]
                                ).map(([mode, label]) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setScheduleMode(mode)}
                                        style={{
                                            padding: '0.3rem 0.75rem',
                                            borderRadius: 9999,
                                            border: `1px solid ${scheduleMode === mode ? 'var(--accent)' : 'var(--line)'}`,
                                            background: scheduleMode === mode ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg)',
                                            color: scheduleMode === mode ? 'var(--accent)' : 'var(--ink)',
                                            fontSize: '0.78rem',
                                            fontWeight: scheduleMode === mode ? 700 : 400,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Time controls */}
                            {scheduleMode !== 'every_n_hours' && scheduleMode !== 'custom' && (
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                                    {scheduleMode === 'weekly' && (
                                        <div>
                                            <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>Day</div>
                                            <select
                                                value={weekday}
                                                onChange={(e) => setWeekday(e.target.value)}
                                                className="approval-select"
                                            >
                                                {WEEKDAYS.map((d) => (
                                                    <option key={d.value} value={d.value}>{d.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {scheduleMode === 'monthly' && (
                                        <div>
                                            <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>Day of month</div>
                                            <select
                                                value={monthDay}
                                                onChange={(e) => setMonthDay(Number(e.target.value))}
                                                className="approval-select"
                                            >
                                                {MONTH_DAYS.map((d) => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>Hour</div>
                                        <select
                                            value={hour}
                                            onChange={(e) => setHour(Number(e.target.value))}
                                            className="approval-select"
                                        >
                                            {HOURS.map((h) => (
                                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>Minute</div>
                                        <select
                                            value={minute}
                                            onChange={(e) => setMinute(Number(e.target.value))}
                                            className="approval-select"
                                        >
                                            {MINUTES.map((m) => (
                                                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {scheduleMode === 'every_n_hours' && (
                                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <span style={{ fontSize: '0.85rem' }}>Every</span>
                                    <select
                                        value={nHours}
                                        onChange={(e) => setNHours(Number(e.target.value))}
                                        className="approval-select"
                                    >
                                        {N_HOURS.map((n) => (
                                            <option key={n} value={n}>{n} hour{n > 1 ? 's' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {scheduleMode === 'custom' && (
                                <div style={{ marginBottom: '0.6rem' }}>
                                    <input
                                        type="text"
                                        value={customCron}
                                        onChange={(e) => setCustomCron(e.target.value)}
                                        placeholder="e.g. 30 9 * * 1-5"
                                        className="approval-input"
                                        style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }}
                                    />
                                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        5-field cron: minute hour day-of-month month day-of-week
                                    </p>
                                </div>
                            )}

                            {/* Human-readable summary + cron preview */}
                            {cronPreview && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'color-mix(in srgb, var(--accent) 4%, transparent)', borderRadius: '0.4rem', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                                    <span style={{ fontSize: '0.83rem', color: 'var(--accent)', flex: 1 }}>
                                        {scheduleMode !== 'custom' ? scheduleDesc : ''}
                                    </span>
                                    <code style={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', color: 'var(--ink)', background: 'var(--bg)', padding: '0.15rem 0.4rem', borderRadius: '0.25rem' }}>
                                        {cronPreview}
                                    </code>
                                </div>
                            )}
                        </section>

                        {/* ── Step 4: Name & options ── */}
                        <section>
                            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                                4. Schedule name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => { setName(e.target.value); setNameManual(true); }}
                                placeholder="Auto-generated from task + schedule…"
                                className="approval-input"
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem' }}>
                                <input
                                    id="enabled-toggle"
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                                />
                                <label htmlFor="enabled-toggle" style={{ fontSize: '0.83rem', cursor: 'pointer' }}>
                                    Enable immediately after saving
                                </label>
                            </div>
                        </section>

                        {/* Save / cancel */}
                        {message && (
                            <p style={{ margin: 0, fontSize: '0.82rem', padding: '0.4rem 0.7rem', borderRadius: 7, background: message.ok ? 'var(--ok-bg)' : 'var(--danger-bg)', border: `1px solid ${message.ok ? 'var(--ok-border)' : 'var(--danger-border)'}`, color: message.ok ? 'var(--ok)' : 'var(--danger)' }}>
                                {message.text}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="chip-button" onClick={closeBuilder} disabled={saving}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => void handleSave()}
                                disabled={saving || !goal.trim() || !cronPreview}
                            >
                                {saving ? 'Saving…' : editingJob ? 'Save Changes' : 'Create Schedule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Schedule list ────────────────────────────────────────────── */}
            {error && (
                <p style={{ margin: 0, padding: '0.6rem 1rem', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.82rem' }}>
                    {error}
                </p>
            )}

            {loading && jobs.length === 0 && (
                <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                    Loading schedules…
                </div>
            )}

            {!loading && jobs.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem' }}>🗓️</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.3rem' }}>
                        No schedules yet
                    </div>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                        Create your first scheduled task and let agents work on autopilot.
                    </p>
                    <button type="button" className="primary-action" onClick={openCreate}>
                        + Create first schedule
                    </button>
                </div>
            )}

            {jobs.length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {jobs.map((job) => {
                        const botRole = bots.find((b) => b.id === job.agentId)?.role;
                        return (
                            <div
                                key={job.id}
                                className="card"
                                style={{ padding: '0.9rem 1.1rem', opacity: job.enabled ? 1 : 0.65 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {/* Left: job info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                                                {job.name}
                                            </span>
                                            <span style={{
                                                padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                                background: job.enabled ? 'var(--ok-bg)' : 'var(--bg)',
                                                color: job.enabled ? 'var(--ok)' : 'var(--ink-muted)',
                                            }}>
                                                {job.enabled ? 'active' : 'paused'}
                                            </span>
                                            {botRole && (
                                                <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 7%, transparent)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600 }}>
                                                    {botRole}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ margin: '0 0 0.45rem', fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                                            {job.goal}
                                        </p>
                                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                                            <span>
                                                <code style={{ fontFamily: 'ui-monospace, monospace', background: 'var(--bg)', padding: '0.1rem 0.35rem', borderRadius: '0.2rem' }}>
                                                    {job.cronExpr}
                                                </code>
                                            </span>
                                            {job.nextRunAt && (
                                                <span>Next: {formatDate(job.nextRunAt)}</span>
                                            )}
                                            {job.lastRunAt && (
                                                <span>Last: {formatDate(job.lastRunAt)}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: actions */}
                                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="chip-button"
                                            onClick={() => void toggleEnable(job)}
                                            title={job.enabled ? 'Pause schedule' : 'Resume schedule'}
                                        >
                                            {job.enabled ? '⏸ Pause' : '▶ Resume'}
                                        </button>
                                        <button
                                            type="button"
                                            className="chip-button"
                                            onClick={() => openEdit(job)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDelete(job)}
                                            style={{ padding: '0.3rem 0.65rem', borderRadius: 9999, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
