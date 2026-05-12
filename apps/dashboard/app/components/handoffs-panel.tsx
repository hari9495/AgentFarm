'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type HandoffRecord = {
    handoffId?: string;
    taskId: string;
    fromBotId: string;
    toBotId: string;
    reason: string;
    status: string;
    correlationId?: string;
    [key: string]: unknown;
};

type PendingHandoff = Record<string, unknown>;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#854d0e' },
    accepted: { bg: '#dbeafe', color: '#1d4ed8' },
    completed: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    timed_out: { bg: '#f1f5f9', color: '#475569' },
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

type HandoffsPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function HandoffsPanel({ tenantId, workspaceId }: HandoffsPanelProps) {
    const [pendingHandoffs, setPendingHandoffs] = useState<PendingHandoff[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingError, setPendingError] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState('');

    const [initiated, setInitiated] = useState<HandoffRecord[]>([]);
    const [initiating, setInitiating] = useState(false);
    const [initiateError, setInitiateError] = useState<string | null>(null);
    const [completing, setCompleting] = useState<string | null>(null);
    const [completeError, setCompleteError] = useState<string | null>(null);

    const [formTaskId, setFormTaskId] = useState('');
    const [formFromBotId, setFormFromBotId] = useState('');
    const [formToBotId, setFormToBotId] = useState('');
    const [formReason, setFormReason] = useState('');
    const [formContext, setFormContext] = useState('{}');

    // Suppress unused — available for future tenant-scoped requests
    void tenantId;

    const fetchPending = useCallback(async () => {
        if (!pendingRole.trim()) return;
        setPendingLoading(true);
        setPendingError(null);

        const response = await fetch(
            `/api/handoffs/pending/${encodeURIComponent(pendingRole.trim())}?workspace_id=${encodeURIComponent(workspaceId)}`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as {
            handoffs?: PendingHandoff[];
            message?: string;
        };

        if (!response.ok) {
            setPendingError(data.message ?? 'Unable to load pending handoffs.');
            setPendingLoading(false);
            return;
        }

        setPendingHandoffs(data.handoffs ?? []);
        setPendingLoading(false);
    }, [pendingRole, workspaceId]);

    useEffect(() => {
        // no auto-fetch — user triggers via "Load Pending" button
    }, [fetchPending]);

    const initiateHandoff = async () => {
        if (!formTaskId.trim() || !formFromBotId.trim() || !formToBotId.trim() || !formReason.trim()) {
            setInitiateError('Task ID, From Bot ID, To Bot ID, and Reason are all required.');
            return;
        }

        let parsedContext: Record<string, unknown> = {};
        try {
            const parsed = JSON.parse(formContext) as unknown;
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('Expected a JSON object.');
            }
            parsedContext = parsed as Record<string, unknown>;
        } catch {
            setInitiateError('Handoff Context must be a valid JSON object (e.g. {}).');
            return;
        }

        setInitiating(true);
        setInitiateError(null);

        const response = await fetch('/api/handoffs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                workspace_id: workspaceId,
                task_id: formTaskId.trim(),
                from_bot_id: formFromBotId.trim(),
                to_bot_id: formToBotId.trim(),
                reason: formReason.trim(),
                correlation_id: `handoff_${Date.now()}`,
                handoff_context: parsedContext,
            }),
        });

        const data = (await response.json().catch(() => ({}))) as HandoffRecord & {
            message?: string;
        };

        if (!response.ok) {
            setInitiateError(data.message ?? 'Failed to initiate handoff.');
            setInitiating(false);
            return;
        }

        const record: HandoffRecord = {
            handoffId: data.handoffId,
            taskId: formTaskId.trim(),
            fromBotId: formFromBotId.trim(),
            toBotId: formToBotId.trim(),
            reason: formReason.trim(),
            status: data.status ?? 'pending',
            correlationId: data.correlationId,
        };

        setInitiated((prev) => [record, ...prev]);
        setFormTaskId('');
        setFormFromBotId('');
        setFormToBotId('');
        setFormReason('');
        setFormContext('{}');
        setInitiating(false);
    };

    const completeHandoff = async (handoffId: string) => {
        if (!window.confirm('Mark handoff as completed?')) return;
        setCompleting(handoffId);
        setCompleteError(null);

        const response = await fetch(`/api/handoffs/${encodeURIComponent(handoffId)}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                workspace_id: workspaceId,
                status: 'completed',
                reason: 'manual_completion',
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setCompleteError(data.message ?? 'Failed to complete handoff.');
            setCompleting(null);
            return;
        }

        setPendingHandoffs((prev) =>
            prev.filter((h) => {
                const hId = (h.handoffId ?? h.id) as string | undefined;
                return hId !== handoffId;
            }),
        );
        await fetchPending();
        setCompleting(null);
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

            {/* ── Section 1: Initiate Handoff ──────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Initiate Handoff</h2>

                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '480px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            Task ID <span style={{ color: '#991b1b' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={formTaskId}
                            onChange={(e) => setFormTaskId(e.target.value)}
                            placeholder="task_abc123"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            From Bot ID <span style={{ color: '#991b1b' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={formFromBotId}
                            onChange={(e) => setFormFromBotId(e.target.value)}
                            placeholder="developer-bot"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            To Bot ID <span style={{ color: '#991b1b' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={formToBotId}
                            onChange={(e) => setFormToBotId(e.target.value)}
                            placeholder="reviewer-bot"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            Reason <span style={{ color: '#991b1b' }}>*</span>
                        </label>
                        <textarea
                            value={formReason}
                            onChange={(e) => setFormReason(e.target.value)}
                            rows={2}
                            placeholder="Reason for handoff…"
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            Handoff Context (JSON object)
                        </label>
                        <textarea
                            value={formContext}
                            onChange={(e) => setFormContext(e.target.value)}
                            rows={3}
                            style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                        />
                    </div>

                    {initiateError && (
                        <p className="message-inline">{initiateError}</p>
                    )}

                    <button
                        type="button"
                        className="primary-action"
                        disabled={initiating}
                        onClick={() => void initiateHandoff()}
                    >
                        {initiating ? 'Initiating…' : 'Initiate'}
                    </button>
                </div>

                {initiated.length > 0 && (
                    <div style={{ marginTop: '0.85rem' }}>
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
                            Recently initiated ({initiated.length}):
                        </p>
                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                            {initiated.slice(0, 5).map((h, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        fontSize: '0.8rem',
                                        padding: '0.3rem 0.5rem',
                                        background: 'var(--surface)',
                                        borderRadius: '4px',
                                        border: '1px solid var(--line)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <code style={{ fontSize: '0.76rem' }}>{h.fromBotId}</code>
                                    <span style={{ color: 'var(--ink-muted)' }}>→</span>
                                    <code style={{ fontSize: '0.76rem' }}>{h.toBotId}</code>
                                    <span style={{ color: 'var(--ink-soft)' }}>
                                        {h.reason.length > 40 ? `${h.reason.slice(0, 40)}…` : h.reason}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 2: Pending Handoffs ───────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Pending Handoffs</h2>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            Filter by toBotId role
                        </label>
                        <input
                            type="text"
                            value={pendingRole}
                            onChange={(e) => setPendingRole(e.target.value)}
                            placeholder="reviewer-bot"
                            style={inputStyle}
                        />
                    </div>
                    <button
                        type="button"
                        className="secondary-action"
                        disabled={pendingLoading || !pendingRole.trim()}
                        onClick={() => void fetchPending()}
                    >
                        {pendingLoading ? 'Loading…' : 'Load Pending'}
                    </button>
                </div>

                {pendingLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading pending handoffs…</p>
                )}

                {pendingError && (
                    <p className="message-inline">{pendingError}</p>
                )}

                {completeError && (
                    <p className="message-inline">{completeError}</p>
                )}

                {!pendingLoading && !pendingError && pendingHandoffs.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No pending handoffs for this role.
                    </p>
                )}

                {!pendingLoading && pendingHandoffs.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Handoff ID</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>From</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>To</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingHandoffs.map((handoff, idx) => {
                                    const hId = ((handoff.handoffId ?? handoff.id) as string | undefined) ?? '';
                                    const fromBot = (handoff.fromBotId ?? handoff.from_bot_id ?? '—') as string;
                                    const toBot = (handoff.toBotId ?? handoff.to_bot_id ?? '—') as string;
                                    const status = (handoff.status ?? 'pending') as string;
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <td style={{ padding: '0.35rem 0.5rem' }}>
                                                <code style={{ fontSize: '0.76rem' }}>
                                                    {hId ? hId.slice(0, 12) : '—'}
                                                </code>
                                            </td>
                                            <td style={{ padding: '0.35rem 0.5rem' }}>
                                                <code style={{ fontSize: '0.76rem' }}>{fromBot}</code>
                                            </td>
                                            <td style={{ padding: '0.35rem 0.5rem' }}>
                                                <code style={{ fontSize: '0.76rem' }}>{toBot}</code>
                                            </td>
                                            <td style={{ padding: '0.35rem 0.5rem' }}>
                                                {inlineBadge(status, STATUS_BADGE)}
                                            </td>
                                            <td style={{ padding: '0.35rem 0.5rem' }}>
                                                {hId && (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        style={{ fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                                                        disabled={completing === hId}
                                                        onClick={() => void completeHandoff(hId)}
                                                    >
                                                        {completing === hId ? 'Completing…' : 'Complete'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </section>
    );
}
