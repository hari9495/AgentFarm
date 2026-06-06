'use client';

/**
 * RoutineSchedulerPanel
 *
 * B4 deferred dashboard component: UI for managing routine scheduled tasks.
 * Lists existing tasks for the selected bot, allows creating new tasks,
 * and triggering on-demand runs.
 *
 * Calls the api-gateway at /v1/bots/:botId/routine-tasks and /v1/routine-tasks.
 */

import { useCallback, useEffect, useState } from 'react';

const API_BASE = '';

type ScheduleType = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
type ScheduledRunStatus = 'scheduled' | 'queued' | 'active' | 'completed' | 'skipped' | 'failed';

type SchedulePolicy = {
    dedupeKey: string;
    concurrencyPolicy: 'queue' | 'replace' | 'skip';
    maxRetries: number;
    retryBackoffMs: number;
};

type ScheduledTaskRecord = {
    id: string;
    botId: string;
    workspaceId: string;
    scheduleType: ScheduleType;
    scheduleExpression: string;
    status: ScheduledRunStatus;
    enabled: boolean;
    isFeatureFlagged: boolean;
    featureFlagKey: string;
    lastTriggeredAt?: string;
    nextScheduledAt?: string;
    failureCount: number;
    lastFailureReason?: string;
    policy: SchedulePolicy;
    createdAt: string;
    updatedAt: string;
};

const STATUS_STYLE: Record<ScheduledRunStatus, { bg: string; color: string }> = {
    scheduled: { bg: '#eff6ff', color: '#1e40af' },
    queued: { bg: '#fef9c3', color: 'var(--warn)' },
    active: { bg: '#dcfce7', color: 'var(--ok)' },
    completed: { bg: '#f0fdf4', color: 'var(--ok)' },
    skipped: { bg: '#f5f5f5', color: '#737373' },
    failed: { bg: '#fef2f2', color: 'var(--danger)' },
};

const SCHEDULE_TYPES: ScheduleType[] = ['once', 'hourly', 'daily', 'weekly', 'monthly'];
const CONCURRENCY_POLICIES: Array<'queue' | 'replace' | 'skip'> = ['queue', 'replace', 'skip'];

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.35rem 0.5rem',
    border: '1px solid #d4d4d4',
    borderRadius: 6,
    fontSize: '0.82rem',
    boxSizing: 'border-box',
};

type Props = {
    botId: string;
    workspaceId: string;
    tenantId?: string;
};

export function RoutineSchedulerPanel({ botId, workspaceId, tenantId: _tenantId }: Props) {
    const [tasks, setTasks] = useState<ScheduledTaskRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formScheduleType, setFormScheduleType] = useState<ScheduleType>('daily');
    const [formExpression, setFormExpression] = useState('0 9 * * *');
    const [formDedupeKey, setFormDedupeKey] = useState('');
    const [formConcurrency, setFormConcurrency] = useState<'queue' | 'replace' | 'skip'>('skip');
    const [formMaxRetries, setFormMaxRetries] = useState(0);
    const [formFlagKey, setFormFlagKey] = useState('scheduler.routine_tasks');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Trigger state per task
    const [triggeringId, setTriggeringId] = useState<string | null>(null);
    const [triggerResult, setTriggerResult] = useState<{ taskId: string; message: string } | null>(null);

    const loadTasks = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `${API_BASE}/api/bots/${encodeURIComponent(botId)}/routine-tasks`,
                { cache: 'no-store' },
            );
            const body = (await res.json().catch(() => null)) as
                | { tasks?: ScheduledTaskRecord[]; scheduled_tasks?: ScheduledTaskRecord[] }
                | null;
            if (!res.ok || !body) {
                setError('Failed to load routine tasks.');
                setTasks([]);
            } else {
                setTasks(body.tasks ?? body.scheduled_tasks ?? []);
            }
        } catch {
            setError('Network error loading routine tasks.');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [botId]);

    useEffect(() => {
        void loadTasks();
    }, [loadTasks]);

    const handleCreate = async () => {
        if (!formDedupeKey.trim()) {
            setCreateError('Dedupe key is required.');
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch(`${API_BASE}/api/routine-tasks`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    bot_id: botId,
                    schedule_type: formScheduleType,
                    schedule_expression: formExpression.trim(),
                    task_payload: {},
                    policy: {
                        dedupe_key: formDedupeKey.trim(),
                        concurrency_policy: formConcurrency,
                        max_retries: formMaxRetries,
                        retry_backoff_ms: 0,
                    },
                    feature_flag_key: formFlagKey.trim() || 'scheduler.routine_tasks',
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;
            if (!res.ok) {
                setCreateError(body?.message ?? 'Failed to create task.');
                return;
            }
            setFormDedupeKey('');
            setShowCreateForm(false);
            await loadTasks();
        } catch {
            setCreateError('Network error during task creation.');
        } finally {
            setCreating(false);
        }
    };

    const handleTrigger = async (taskId: string) => {
        setTriggeringId(taskId);
        setTriggerResult(null);
        try {
            const res = await fetch(
                `${API_BASE}/api/routine-tasks/${encodeURIComponent(taskId)}/runs`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({}),
                },
            );
            const body = (await res.json().catch(() => null)) as { message?: string; run_id?: string } | null;
            if (!res.ok) {
                setTriggerResult({ taskId, message: body?.message ?? 'Trigger failed.' });
            } else {
                setTriggerResult({
                    taskId,
                    message: body?.run_id ? `Run started: ${body.run_id}` : 'Run triggered.',
                });
            }
        } catch {
            setTriggerResult({ taskId, message: 'Network error — trigger failed.' });
        } finally {
            setTriggeringId(null);
        }
    };

    return (
        <section style={{ marginTop: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Routine Scheduler</h2>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                        Bot: <code style={{ fontSize: '0.72rem' }}>{botId}</code>
                        {' · '}
                        {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => { void loadTasks(); }}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', border: '1px solid #d4d4d4', borderRadius: 6, background: 'var(--card)', cursor: loading ? 'wait' : 'pointer' }}
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCreateForm((v) => !v)}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', border: '1px solid #6366f1', borderRadius: 6, background: '#6366f1', color: '#fff', cursor: 'pointer' }}
                    >
                        {showCreateForm ? 'Cancel' : '+ New Task'}
                    </button>
                </div>
            </div>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.83rem', marginBottom: '0.5rem' }}>{error}</p>}

            {/* Create form */}
            {showCreateForm && (
                <div style={{ padding: '0.9rem', border: '1px solid #6366f1', borderRadius: 8, background: '#fafafa', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Schedule New Routine Task</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.75rem' }}>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Schedule Type</label>
                            <select
                                value={formScheduleType}
                                onChange={(e) => setFormScheduleType(e.target.value as ScheduleType)}
                                style={{ ...inputStyle, background: 'var(--card)' }}
                            >
                                {SCHEDULE_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Schedule Expression</label>
                            <input
                                value={formExpression}
                                onChange={(e) => setFormExpression(e.target.value)}
                                placeholder="0 9 * * *"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Dedupe Key *</label>
                            <input
                                value={formDedupeKey}
                                onChange={(e) => setFormDedupeKey(e.target.value)}
                                placeholder="daily-standup"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Concurrency Policy</label>
                            <select
                                value={formConcurrency}
                                onChange={(e) => setFormConcurrency(e.target.value as 'queue' | 'replace' | 'skip')}
                                style={{ ...inputStyle, background: 'var(--card)' }}
                            >
                                {CONCURRENCY_POLICIES.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Max Retries</label>
                            <input
                                type="number"
                                min={0}
                                max={10}
                                value={formMaxRetries}
                                onChange={(e) => setFormMaxRetries(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Feature Flag Key</label>
                            <input
                                value={formFlagKey}
                                onChange={(e) => setFormFlagKey(e.target.value)}
                                placeholder="scheduler.routine_tasks"
                                style={inputStyle}
                            />
                        </div>
                    </div>
                    {createError && (
                        <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '0.5rem 0 0' }}>{createError}</p>
                    )}
                    <button
                        type="button"
                        disabled={creating}
                        onClick={() => { void handleCreate(); }}
                        style={{ marginTop: '0.75rem', padding: '0.45rem 1.1rem', background: creating ? '#d1d5db' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer' }}
                    >
                        {creating ? 'Creating…' : 'Create Task'}
                    </button>
                </div>
            )}

            {/* Task list */}
            {!loading && tasks.length === 0 && !error && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textAlign: 'center', padding: '2rem 0' }}>
                    No routine tasks scheduled for this bot.
                </p>
            )}

            {tasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {tasks.map((task) => {
                        const statusStyle = STATUS_STYLE[task.status] ?? { bg: '#f5f5f5', color: '#737373' };
                        const isTriggeringThis = triggeringId === task.id;
                        const resultForThis = triggerResult?.taskId === task.id ? triggerResult.message : null;

                        return (
                            <div
                                key={task.id}
                                style={{
                                    border: '1px solid var(--line)',
                                    borderRadius: 8,
                                    padding: '0.75rem 1rem',
                                    background: task.enabled ? '#fff' : '#fafafa',
                                    opacity: task.enabled ? 1 : 0.7,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                            <span style={{
                                                background: statusStyle.bg,
                                                color: statusStyle.color,
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                padding: '1px 8px',
                                                borderRadius: '999px',
                                                border: `1px solid ${statusStyle.color}30`,
                                            }}>
                                                {task.status}
                                            </span>
                                            {!task.enabled && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>disabled</span>
                                            )}
                                            {task.isFeatureFlagged && (
                                                <span style={{ fontSize: '0.7rem', background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 4 }}>
                                                    flagged: {task.featureFlagKey}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#1c1917' }}>
                                            {task.policy.dedupeKey}
                                        </p>
                                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.77rem', color: 'var(--ink-muted)' }}>
                                            {task.scheduleType} · <code style={{ fontSize: '0.72rem' }}>{task.scheduleExpression}</code>
                                            {' · '}
                                            concurrency: {task.policy.concurrencyPolicy}
                                        </p>
                                        {task.nextScheduledAt && (
                                            <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                                                Next run: {new Date(task.nextScheduledAt).toLocaleString()}
                                            </p>
                                        )}
                                        {task.lastTriggeredAt && (
                                            <p style={{ margin: '0.05rem 0 0', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                                                Last triggered: {new Date(task.lastTriggeredAt).toLocaleString()}
                                            </p>
                                        )}
                                        {task.failureCount > 0 && (
                                            <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--danger)' }}>
                                                ⚠ {task.failureCount} failure{task.failureCount > 1 ? 's' : ''}
                                                {task.lastFailureReason ? `: ${task.lastFailureReason}` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isTriggeringThis || !task.enabled}
                                        onClick={() => { void handleTrigger(task.id); }}
                                        style={{
                                            padding: '0.35rem 0.9rem',
                                            background: isTriggeringThis || !task.enabled ? '#d1d5db' : '#0f766e',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 6,
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            cursor: isTriggeringThis || !task.enabled ? 'not-allowed' : 'pointer',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                        }}
                                        title={!task.enabled ? 'Task is disabled' : 'Trigger an on-demand run'}
                                    >
                                        {isTriggeringThis ? 'Triggering…' : '▶ Run Now'}
                                    </button>
                                </div>
                                {resultForThis && (
                                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#0f766e', background: 'var(--ok-bg)', padding: '0.3rem 0.5rem', borderRadius: 4 }}>
                                        {resultForThis}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
