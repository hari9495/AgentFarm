'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Pipeline = {
    id: string;
    name?: string;
    description?: string;
    steps?: unknown[];
    [key: string]: unknown;
};

type PipelineRun = {
    runId: string;
    pipelineId: string;
    status: string;
    result?: unknown;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    dryRun?: boolean;
    [key: string]: unknown;
};

type SchedulerJob = {
    id: string;
    name: string;
    target: string;
    frequency: string;
    enabled: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
    [key: string]: unknown;
};

type SchedulerHistoryEntry = Record<string, unknown>;

// ── Constants ─────────────────────────────────────────────────────────────────

const RUN_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    success: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    running: { bg: '#dbeafe', color: '#1d4ed8' },
    pending: { bg: '#fef9c3', color: '#854d0e' },
};

const JOB_ENABLED_BADGE: Record<string, { bg: string; color: string }> = {
    Active: { bg: '#dcfce7', color: '#166534' },
    Paused: { bg: '#f1f5f9', color: '#475569' },
};

function inlineBadge(label: string, map: Record<string, { bg: string; color: string }>) {
    const style = map[label] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: style.bg,
                color: style.color,
            }}
        >
            {label}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SkillPipelinesPanel() {
    const [activeTab, setActiveTab] = useState<'pipelines' | 'scheduler'>('pipelines');

    // ── Pipelines tab state ────────────────────────────────────────────────────
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);
    const [pipelinesError, setPipelinesError] = useState<string | null>(null);
    const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
    const [runsLoading, setRunsLoading] = useState(false);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
    const [runDetailLoading, setRunDetailLoading] = useState(false);
    const [runPipelineId, setRunPipelineId] = useState('');
    const [runDryRun, setRunDryRun] = useState(false);
    const [runInputsRaw, setRunInputsRaw] = useState('{}');
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [runResult, setRunResult] = useState<PipelineRun | null>(null);

    // ── Scheduler tab state ────────────────────────────────────────────────────
    const [jobs, setJobs] = useState<SchedulerJob[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);
    const [history, setHistory] = useState<SchedulerHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [pausing, setPausing] = useState<string | null>(null);
    const [resuming, setResuming] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [newJobName, setNewJobName] = useState('');
    const [newJobTarget, setNewJobTarget] = useState('');
    const [newJobFrequency, setNewJobFrequency] = useState('daily');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // ── Pipelines fetchers ─────────────────────────────────────────────────────

    const fetchPipelines = useCallback(async () => {
        setPipelinesLoading(true);
        setPipelinesError(null);

        const response = await fetch('/api/pipelines', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as {
            pipelines?: Pipeline[];
            message?: string;
        };

        if (!response.ok) {
            setPipelinesError(data.message ?? 'Unable to load pipelines.');
            setPipelinesLoading(false);
            return;
        }

        setPipelines(data.pipelines ?? []);
        setPipelinesLoading(false);
    }, []);

    const fetchRuns = useCallback(async () => {
        setRunsLoading(true);

        const response = await fetch('/api/pipelines/runs?limit=20', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as { runs?: PipelineRun[] };

        setPipelineRuns(data.runs ?? []);
        setRunsLoading(false);
    }, []);

    // ── Scheduler fetchers ─────────────────────────────────────────────────────

    const fetchJobs = useCallback(async () => {
        setJobsLoading(true);
        setJobsError(null);

        const response = await fetch('/api/scheduler', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as {
            jobs?: SchedulerJob[];
            message?: string;
        };

        if (!response.ok) {
            setJobsError(data.message ?? 'Unable to load scheduler jobs.');
            setJobsLoading(false);
            return;
        }

        setJobs(data.jobs ?? []);
        setJobsLoading(false);
    }, []);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);

        const response = await fetch('/api/scheduler/history?limit=20', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as { history?: SchedulerHistoryEntry[] };

        setHistory(data.history ?? []);
        setHistoryLoading(false);
    }, []);

    // ── Tab effect ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (activeTab === 'pipelines') {
            void fetchPipelines();
            void fetchRuns();
        } else {
            void fetchJobs();
            void fetchHistory();
        }
    }, [activeTab, fetchPipelines, fetchRuns, fetchJobs, fetchHistory]);

    // ── Pipeline actions ───────────────────────────────────────────────────────

    const runPipeline = async () => {
        if (!runPipelineId.trim()) {
            setRunError('Pipeline ID is required.');
            return;
        }

        let parsedInputs: Record<string, unknown> = {};
        try {
            const parsed = JSON.parse(runInputsRaw) as unknown;
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('Expected a JSON object.');
            }
            parsedInputs = parsed as Record<string, unknown>;
        } catch {
            setRunError('Initial Inputs must be a valid JSON object.');
            return;
        }

        setRunning(true);
        setRunError(null);
        setRunResult(null);

        const response = await fetch('/api/pipelines/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                pipeline_id: runPipelineId.trim(),
                initial_inputs: parsedInputs,
                dry_run: runDryRun,
            }),
        });

        const data = (await response.json().catch(() => ({}))) as PipelineRun & { message?: string };

        if (!response.ok) {
            setRunError(data.message ?? 'Pipeline run failed.');
            setRunning(false);
            return;
        }

        setRunResult(data);
        await fetchRuns();
        setRunning(false);
    };

    const fetchRunDetail = async (runId: string) => {
        setSelectedRunId(runId);
        setRunDetailLoading(true);

        const response = await fetch(`/api/pipelines/runs/${encodeURIComponent(runId)}`, {
            cache: 'no-store',
        });
        const data = (await response.json().catch(() => null)) as PipelineRun | null;

        setSelectedRun(data);
        setRunDetailLoading(false);
    };

    // ── Scheduler actions ──────────────────────────────────────────────────────

    const createJob = async () => {
        if (!newJobName.trim() || !newJobTarget.trim() || !newJobFrequency.trim()) {
            setCreateError('Name, Target, and Frequency are all required.');
            return;
        }

        setCreating(true);
        setCreateError(null);

        const response = await fetch('/api/scheduler', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: newJobName.trim(),
                target: newJobTarget.trim(),
                frequency: newJobFrequency.trim(),
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to create job.');
            setCreating(false);
            return;
        }

        await fetchJobs();
        setNewJobName('');
        setNewJobTarget('');
        setNewJobFrequency('daily');
        setCreating(false);
    };

    const pauseJob = async (jobId: string) => {
        setPausing(jobId);

        await fetch(`/api/scheduler/${encodeURIComponent(jobId)}/pause`, { method: 'POST' });
        await fetchJobs();
        setPausing(null);
    };

    const resumeJob = async (jobId: string) => {
        setResuming(jobId);

        await fetch(`/api/scheduler/${encodeURIComponent(jobId)}/resume`, { method: 'POST' });
        await fetchJobs();
        setResuming(null);
    };

    const deleteJob = async (jobId: string) => {
        if (!window.confirm('Delete this scheduler job?')) return;
        setDeleting(jobId);

        await fetch(`/api/scheduler/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
        await fetchJobs();
        setDeleting(null);
    };

    const inputStyle: React.CSSProperties = {
        padding: '0.35rem 0.55rem',
        fontSize: '0.83rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
        boxSizing: 'border-box',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>

            {/* ── Tab bar ───────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
                {(['pipelines', 'scheduler'] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.35rem 0.85rem',
                            fontSize: '0.82rem',
                            fontWeight: activeTab === tab ? 700 : 400,
                            border: activeTab === tab ? '1px solid var(--accent)' : '1px solid var(--line)',
                            borderRadius: '4px',
                            background: activeTab === tab ? 'var(--accent)' : 'var(--bg)',
                            color: activeTab === tab ? '#fff' : 'var(--ink)',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                        }}
                    >
                        {tab === 'pipelines' ? 'Pipelines' : 'Scheduler'}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* PIPELINES TAB                                               */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeTab === 'pipelines' && (
                <div style={{ display: 'grid', gap: '1.5rem' }}>

                    {/* ── Section A: Run a Pipeline ─────────────────────── */}
                    <div>
                        <h2 style={{ margin: '0 0 0.6rem' }}>Run a Pipeline</h2>

                        <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '480px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                    Pipeline ID
                                </label>
                                <input
                                    type="text"
                                    value={runPipelineId}
                                    onChange={(e) => setRunPipelineId(e.target.value)}
                                    placeholder="my-pipeline"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                    Initial Inputs (JSON)
                                </label>
                                <textarea
                                    value={runInputsRaw}
                                    onChange={(e) => setRunInputsRaw(e.target.value)}
                                    rows={3}
                                    style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={runDryRun}
                                    onChange={(e) => setRunDryRun(e.target.checked)}
                                />
                                Dry Run
                            </label>

                            {runError && <p className="message-inline">{runError}</p>}

                            <button
                                type="button"
                                className="primary-action"
                                disabled={running}
                                onClick={() => void runPipeline()}
                            >
                                {running ? 'Running…' : 'Run Pipeline'}
                            </button>
                        </div>

                        {runResult && (
                            <div style={{ marginTop: '0.85rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Result:</span>
                                    {inlineBadge(runResult.status ?? 'unknown', RUN_STATUS_BADGE)}
                                </div>
                                <pre
                                    style={{
                                        background: '#1e1e2e',
                                        color: '#cdd6f4',
                                        padding: '0.75rem',
                                        borderRadius: '4px',
                                        fontSize: '0.76rem',
                                        overflowX: 'auto',
                                        margin: 0,
                                    }}
                                >
                                    {JSON.stringify(runResult, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* ── Section B: Available Pipelines ───────────────── */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <h2 style={{ margin: 0 }}>Available Pipelines</h2>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => void fetchPipelines()}
                            >
                                Refresh
                            </button>
                        </div>

                        {pipelinesLoading && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading pipelines…</p>
                        )}
                        {pipelinesError && <p className="message-inline">{pipelinesError}</p>}

                        {!pipelinesLoading && !pipelinesError && pipelines.length === 0 && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                No pipelines registered.
                            </p>
                        )}

                        {!pipelinesLoading && pipelines.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>ID</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Name</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Description</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Steps</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pipelines.map((p, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{p.id}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>{p.name ?? '—'}</td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    {p.description
                                                        ? p.description.length > 40
                                                            ? `${p.description.slice(0, 40)}…`
                                                            : p.description
                                                        : '—'}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {Array.isArray(p.steps) ? p.steps.length : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── Section C: Recent Runs ────────────────────────── */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <h2 style={{ margin: 0 }}>Recent Runs</h2>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => void fetchRuns()}
                            >
                                Refresh
                            </button>
                        </div>

                        {runsLoading && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading runs…</p>
                        )}

                        {!runsLoading && pipelineRuns.length === 0 && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                No recent runs.
                            </p>
                        )}

                        {!runsLoading && pipelineRuns.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Run ID</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Pipeline</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Dry Run</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Started</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pipelineRuns.map((run, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{run.runId.slice(0, 12)}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{run.pipelineId}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {inlineBadge(run.status, RUN_STATUS_BADGE)}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {run.dryRun ? 'Yes' : 'No'}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    {run.startedAt ?? '—'}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                                                        onClick={() => void fetchRunDetail(run.runId)}
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {selectedRunId && (
                            <div
                                style={{
                                    marginTop: '0.85rem',
                                    border: '1px solid var(--line)',
                                    borderRadius: '4px',
                                    padding: '0.75rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                        Run detail: <code style={{ fontSize: '0.76rem' }}>{selectedRunId.slice(0, 12)}</code>
                                    </span>
                                    <button
                                        type="button"
                                        className="secondary-action"
                                        style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                                        onClick={() => { setSelectedRunId(null); setSelectedRun(null); }}
                                    >
                                        Close
                                    </button>
                                </div>
                                {runDetailLoading && (
                                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading detail…</p>
                                )}
                                {!runDetailLoading && selectedRun && (
                                    <pre
                                        style={{
                                            background: '#1e1e2e',
                                            color: '#cdd6f4',
                                            padding: '0.75rem',
                                            borderRadius: '4px',
                                            fontSize: '0.76rem',
                                            overflowX: 'auto',
                                            margin: 0,
                                        }}
                                    >
                                        {JSON.stringify(selectedRun, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SCHEDULER TAB                                               */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeTab === 'scheduler' && (
                <div style={{ display: 'grid', gap: '1.5rem' }}>

                    {/* ── Section A: Create Job ─────────────────────────── */}
                    <div>
                        <h2 style={{ margin: '0 0 0.6rem' }}>Create Job</h2>

                        <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '480px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                    Name <span style={{ color: '#991b1b' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newJobName}
                                    onChange={(e) => setNewJobName(e.target.value)}
                                    placeholder="daily-plan"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                    Target <span style={{ color: '#991b1b' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newJobTarget}
                                    onChange={(e) => setNewJobTarget(e.target.value)}
                                    placeholder="agent:plan_daily or skill:summarize"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                    Frequency <span style={{ color: '#991b1b' }}>*</span>
                                </label>
                                <select
                                    value={newJobFrequency}
                                    onChange={(e) => setNewJobFrequency(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="hourly">Hourly</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>

                            {createError && <p className="message-inline">{createError}</p>}

                            <button
                                type="button"
                                className="primary-action"
                                disabled={creating}
                                onClick={() => void createJob()}
                            >
                                {creating ? 'Creating…' : 'Create Job'}
                            </button>
                        </div>
                    </div>

                    {/* ── Section B: Jobs ───────────────────────────────── */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <h2 style={{ margin: 0 }}>Jobs</h2>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => void fetchJobs()}
                            >
                                Refresh
                            </button>
                        </div>

                        {jobsLoading && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading jobs…</p>
                        )}
                        {jobsError && <p className="message-inline">{jobsError}</p>}

                        {!jobsLoading && !jobsError && jobs.length === 0 && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                No scheduler jobs.
                            </p>
                        )}

                        {!jobsLoading && jobs.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Name</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Target</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Frequency</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Last Run</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Next Run</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map((job, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{job.name}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{job.target}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>{job.frequency}</td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {inlineBadge(job.enabled ? 'Active' : 'Paused', JOB_ENABLED_BADGE)}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    {job.lastRunAt ?? '—'}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    {job.nextRunAt ?? '—'}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                        {job.enabled ? (
                                                            <button
                                                                type="button"
                                                                className="secondary-action"
                                                                style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                                                                disabled={pausing === job.id}
                                                                onClick={() => void pauseJob(job.id)}
                                                            >
                                                                {pausing === job.id ? '…' : 'Pause'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="secondary-action"
                                                                style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                                                                disabled={resuming === job.id}
                                                                onClick={() => void resumeJob(job.id)}
                                                            >
                                                                {resuming === job.id ? '…' : 'Resume'}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="secondary-action"
                                                            style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem', color: '#991b1b', borderColor: '#fca5a5' }}
                                                            disabled={deleting === job.id}
                                                            onClick={() => void deleteJob(job.id)}
                                                        >
                                                            {deleting === job.id ? '…' : 'Delete'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── Section C: History ────────────────────────────── */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <h2 style={{ margin: 0 }}>History</h2>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => void fetchHistory()}
                            >
                                Load History
                            </button>
                        </div>

                        {historyLoading && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading history…</p>
                        )}

                        {!historyLoading && history.length === 0 && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                No history.
                            </p>
                        )}

                        {!historyLoading && history.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>ID</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Name</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Completed At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((entry, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.76rem' }}>{String(entry.id ?? '—')}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>{String(entry.name ?? '—')}</td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {inlineBadge(String(entry.status ?? 'unknown'), RUN_STATUS_BADGE)}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                    {String(entry.completedAt ?? '—')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </section>
    );
}
