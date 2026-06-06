'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStatus = 'idle' | 'busy' | 'terminated';
type TaskStatus = 'queued' | 'running' | 'completed' | 'timeout' | 'failed';

type SessionInfo = {
    sessionId: string;
    status: SessionStatus;
    streamUrl: string;
    createdAt: string;
};

type VisionStep = {
    step: number;
    action: string;
    target: string;
    value: string;
    ok: boolean;
    errorMessage?: string;
    durationMs: number;
    timestamp: string;
};

type TaskInfo = {
    taskId: string;
    goal: string;
    status: TaskStatus;
    result: string | null;
    stepCount: number;
    steps: VisionStep[];
    startedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const GW = process.env.NEXT_PUBLIC_API_BASE ?? '';

async function apiFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; data: unknown }> {
    try {
        const res = await fetch(`${GW}${path}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            ...init,
        });
        let data: unknown;
        try { data = await res.json(); } catch { data = null; }
        return { ok: res.ok, data };
    } catch {
        return { ok: false, data: null };
    }
}

const STATUS_BADGE: Record<string, string> = {
    idle: 'var(--ink-muted)',
    busy: 'var(--brand)',
    completed: 'var(--ok)',
    timeout: '#854d0e',
    failed: 'var(--danger)',
    queued: 'var(--ink-soft)',
    running: 'var(--brand)',
    terminated: 'var(--ink-muted)',
};

function StatusDot({ status }: { status: string }) {
    return (
        <span
            style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_BADGE[status] ?? 'var(--line)',
                marginRight: 6,
            }}
        />
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

type DesktopStreamPanelProps = {
    tenantId: string;
    botId?: string;
};

export default function DesktopStreamPanel({ botId }: DesktopStreamPanelProps) {
    const [session, setSession] = useState<SessionInfo | null>(null);
    const [task, setTask] = useState<TaskInfo | null>(null);
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Poll task status while running ────────────────────────────────────────

    const stopPolling = useCallback(() => {
        if (pollRef.current !== null) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const pollTask = useCallback(
        async (sid: string) => {
            const r = await apiFetch(`/v1/desktop-sessions/${encodeURIComponent(sid)}/task`);
            if (!r.ok) return;
            const t = r.data as TaskInfo;
            setTask(t);
            if (t.status !== 'queued' && t.status !== 'running') {
                stopPolling();
                // Refresh session status
                const sr = await apiFetch(`/v1/desktop-sessions/${encodeURIComponent(sid)}`);
                if (sr.ok) setSession(sr.data as SessionInfo);
            }
        },
        [stopPolling],
    );

    const startPolling = useCallback(
        (sid: string) => {
            stopPolling();
            pollRef.current = setInterval(() => { void pollTask(sid); }, 2000);
        },
        [pollTask, stopPolling],
    );

    useEffect(() => () => stopPolling(), [stopPolling]);

    // ── Session lifecycle ─────────────────────────────────────────────────────

    const createSession = useCallback(async () => {
        setLoading(true);
        setError(null);
        const r = await apiFetch('/v1/desktop-sessions', {
            method: 'POST',
            body: JSON.stringify({ botId: botId ?? undefined }),
        });
        setLoading(false);
        if (!r.ok) {
            setError('Failed to create session');
            return;
        }
        setSession(r.data as SessionInfo);
        setTask(null);
    }, [botId]);

    const terminateSession = useCallback(async () => {
        if (!session) return;
        stopPolling();
        await apiFetch(`/v1/desktop-sessions/${encodeURIComponent(session.sessionId)}`, {
            method: 'DELETE',
        });
        setSession(null);
        setTask(null);
    }, [session, stopPolling]);

    // ── Task submission ───────────────────────────────────────────────────────

    const submitTask = useCallback(async () => {
        if (!session || !goal.trim()) return;
        setLoading(true);
        setError(null);
        const r = await apiFetch(
            `/v1/desktop-sessions/${encodeURIComponent(session.sessionId)}/task`,
            { method: 'POST', body: JSON.stringify({ goal: goal.trim() }) },
        );
        setLoading(false);
        if (!r.ok) {
            setError('Failed to submit task');
            return;
        }
        setTask(r.data as TaskInfo);
        startPolling(session.sessionId);
        setGoal('');
    }, [session, goal, startPolling]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="desktop-stream-panel">
            <div className="desktop-stream-header">
                <h2 className="desktop-stream-title">Desktop Agent</h2>
                {session ? (
                    <div className="desktop-stream-session-bar">
                        <span className="desktop-stream-session-id">
                            <StatusDot status={session.status} />
                            {session.sessionId.slice(0, 8)}…
                        </span>
                        <button className="desktop-stream-btn desktop-stream-btn--danger" onClick={terminateSession}>
                            End session
                        </button>
                    </div>
                ) : (
                    <button className="desktop-stream-btn" onClick={createSession} disabled={loading}>
                        {loading ? 'Starting…' : 'Start desktop session'}
                    </button>
                )}
            </div>

            {error && <p className="desktop-stream-error">{error}</p>}

            {session && (
                <>
                    {/* noVNC stream iframe */}
                    <div className="desktop-stream-viewport">
                        <iframe
                            src={session.streamUrl}
                            title="Desktop VM stream"
                            className="desktop-stream-iframe"
                            allow="autoplay"
                        />
                    </div>

                    {/* Task input */}
                    <div className="desktop-stream-task-form">
                        <input
                            className="desktop-stream-input"
                            type="text"
                            placeholder="Enter a goal for the agent (e.g. 'Open browser and go to github.com')"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { void submitTask(); } }}
                            disabled={loading || session.status === 'busy'}
                        />
                        <button
                            className="desktop-stream-btn"
                            onClick={submitTask}
                            disabled={loading || !goal.trim() || session.status === 'busy'}
                        >
                            Run
                        </button>
                    </div>

                    {/* Task status */}
                    {task && (
                        <div className="desktop-stream-task card">
                            <div className="desktop-stream-task-header">
                                <StatusDot status={task.status} />
                                <strong>{task.status}</strong>
                                <span className="desktop-stream-task-goal">{task.goal}</span>
                                {task.result && (
                                    <span className="desktop-stream-task-result">{task.result}</span>
                                )}
                            </div>

                            {task.steps.length > 0 && (
                                <table className="desktop-stream-steps">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Action</th>
                                            <th>Target</th>
                                            <th>ms</th>
                                            <th>OK</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {task.steps.map((s, i) => (
                                            <tr key={i} className={s.ok ? '' : 'desktop-stream-step--err'}>
                                                <td>{s.step}</td>
                                                <td>{s.action}</td>
                                                <td className="desktop-stream-step-target">{s.target || '—'}</td>
                                                <td>{s.durationMs}</td>
                                                <td>{s.ok ? '✓' : '✗'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
