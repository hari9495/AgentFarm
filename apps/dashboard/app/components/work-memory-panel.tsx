'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkMemoryState = {
    memoryVersion: number;
    entries: unknown[];
    summary: string | null;
    updatedAt: string | null;
};

type NextActionItem = {
    action: string;
    reason: string;
    confidence: number;
    requiresApproval: boolean;
    priority: string;
};

type DailyPlan = {
    planId: string;
    objective: string;
    constraints: string[];
    nextActions: NextActionItem[];
    risks: string[];
    approvalsNeeded: string[];
    correlationId: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { bg: string; color: string }> = {
    high: { bg: '#fee2e2', color: '#991b1b' },
    medium: { bg: '#fef9c3', color: '#854d0e' },
    low: { bg: '#dcfce7', color: '#166534' },
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

type WorkMemoryPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function WorkMemoryPanel({ tenantId, workspaceId }: WorkMemoryPanelProps) {
    // Memory state
    const [memory, setMemory] = useState<WorkMemoryState | null>(null);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memoryError, setMemoryError] = useState<string | null>(null);

    // Next actions state
    const [nextActions, setNextActions] = useState<NextActionItem[]>([]);
    const [actionsLoading, setActionsLoading] = useState(false);
    const [actionsError, setActionsError] = useState<string | null>(null);

    // Daily plan state
    const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planError, setPlanError] = useState<string | null>(null);

    // Edit state
    const [editing, setEditing] = useState(false);
    const [editSummary, setEditSummary] = useState('');
    const [editEntriesRaw, setEditEntriesRaw] = useState('[]');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Daily plan form
    const [planObjective, setPlanObjective] = useState('');
    const [planConstraintsRaw, setPlanConstraintsRaw] = useState('');
    const [planning, setPlanning] = useState(false);

    const fetchMemory = useCallback(async () => {
        setMemoryLoading(true);
        setMemoryError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/work-memory`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as WorkMemoryState & {
            message?: string;
        };

        if (!response.ok) {
            setMemoryError(data.message ?? 'Unable to load work memory.');
            setMemoryLoading(false);
            return;
        }

        setMemory(data);
        setMemoryLoading(false);
    }, [workspaceId]);

    const fetchNextActions = useCallback(async () => {
        setActionsLoading(true);
        setActionsError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/next-actions`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as {
            items?: NextActionItem[];
            message?: string;
        };

        if (!response.ok) {
            setActionsError(data.message ?? 'Unable to load next actions.');
            setActionsLoading(false);
            return;
        }

        setNextActions(Array.isArray(data.items) ? data.items : []);
        setActionsLoading(false);
    }, [workspaceId]);

    useEffect(() => {
        void Promise.all([fetchMemory(), fetchNextActions()]);
    }, [fetchMemory, fetchNextActions]);

    const saveMemory = async () => {
        setSaveError(null);

        let parsedEntries: unknown[];
        try {
            parsedEntries = JSON.parse(editEntriesRaw || '[]') as unknown[];
            if (!Array.isArray(parsedEntries)) throw new Error('not an array');
        } catch {
            setSaveError('Entries must be a valid JSON array.');
            return;
        }

        setSaving(true);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/work-memory`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    entries: parsedEntries,
                    summary: editSummary || undefined,
                    mergeMode: 'replace',
                }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setSaveError(data.message ?? 'Failed to save work memory.');
            setSaving(false);
            return;
        }

        setSaving(false);
        setEditing(false);
        void fetchMemory();
    };

    const generateDailyPlan = async () => {
        setPlanning(true);
        setPlanError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/daily-plan`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    objective: planObjective || undefined,
                    constraints: planConstraintsRaw
                        ? planConstraintsRaw.split(',').map((s) => s.trim())
                        : [],
                }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as DailyPlan & {
            message?: string;
        };

        if (!response.ok) {
            setPlanError(data.message ?? 'Failed to generate daily plan.');
            setPlanning(false);
            return;
        }

        setDailyPlan(data);
        setPlanning(false);
    };

    // Suppress unused — available for future server-side filtering
    void tenantId;

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

    const sectionHeaderStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.6rem',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>
            {/* ── Section 1: Work Memory ──────────────────────────────────── */}
            <div>
                <div style={sectionHeaderStyle}>
                    <h2 style={{ margin: 0 }}>Work Memory</h2>
                    {!editing && memory && (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                                setEditing(true);
                                setEditSummary(memory.summary ?? '');
                                setEditEntriesRaw(JSON.stringify(memory.entries, null, 2));
                                setSaveError(null);
                            }}
                        >
                            Edit
                        </button>
                    )}
                    {editing && (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                                setEditing(false);
                                setSaveError(null);
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {memoryLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading work memory…</p>
                )}

                {memoryError && <p className="message-inline">{memoryError}</p>}

                {!memoryLoading && !memoryError && memory && !editing && (
                    <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.86rem' }}>
                        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
                            Version: v{memory.memoryVersion}
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>Summary:</strong>{' '}
                            {memory.summary ? (
                                memory.summary
                            ) : (
                                <em style={{ color: 'var(--ink-soft)' }}>None</em>
                            )}
                        </p>
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                            Entries: {memory.entries.length} items
                        </p>
                    </div>
                )}

                {!memoryLoading && !memory && !memoryError && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                        No work memory found for this workspace.
                    </p>
                )}

                {editing && (
                    <div style={{ display: 'grid', gap: '0.55rem' }}>
                        <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                            Summary
                            <textarea
                                rows={2}
                                value={editSummary}
                                onChange={(e) => setEditSummary(e.target.value)}
                                placeholder="Optional summary of current working state"
                                style={{ ...inputStyle, resize: 'vertical', marginTop: '0.25rem', fontFamily: 'inherit' }}
                            />
                        </label>
                        <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                            Entries (JSON array)
                            <textarea
                                rows={8}
                                value={editEntriesRaw}
                                onChange={(e) => setEditEntriesRaw(e.target.value)}
                                style={{ ...inputStyle, resize: 'vertical', marginTop: '0.25rem', fontFamily: 'monospace' }}
                            />
                        </label>
                        {saveError && <p className="message-inline">{saveError}</p>}
                        <div>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={saving}
                                onClick={() => void saveMemory()}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 2: Next Actions ─────────────────────────────────── */}
            <div>
                <div style={sectionHeaderStyle}>
                    <h2 style={{ margin: 0 }}>Next Actions</h2>
                    <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void fetchNextActions()}
                    >
                        Refresh
                    </button>
                </div>

                {actionsLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading next actions…</p>
                )}

                {actionsError && <p className="message-inline">{actionsError}</p>}

                {!actionsLoading && !actionsError && nextActions.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.86rem' }}>
                        No next actions available.
                    </p>
                )}

                {!actionsLoading && nextActions.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                                    {['Action', 'Priority', 'Confidence', 'Approval', 'Reason'].map((h) => (
                                        <th
                                            key={h}
                                            style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {nextActions.map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)', maxWidth: '200px' }}>
                                            {item.action}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(item.priority, PRIORITY_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)' }}>
                                            {(item.confidence * 100).toFixed(0)}%
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', color: item.requiresApproval ? '#991b1b' : 'var(--ink-soft)' }}>
                                            {item.requiresApproval ? '✓ Required' : '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                                            {item.reason.length > 60
                                                ? item.reason.slice(0, 60) + '…'
                                                : item.reason}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Section 3: Daily Plan ───────────────────────────────────── */}
            <div>
                <div style={sectionHeaderStyle}>
                    <h2 style={{ margin: 0 }}>Daily Plan</h2>
                </div>

                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '520px' }}>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Objective
                        <input
                            type="text"
                            value={planObjective}
                            onChange={(e) => setPlanObjective(e.target.value)}
                            placeholder="Optional high-level objective"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Constraints
                        <input
                            type="text"
                            value={planConstraintsRaw}
                            onChange={(e) => setPlanConstraintsRaw(e.target.value)}
                            placeholder="audit, security, no-deploy"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={planning}
                            onClick={() => void generateDailyPlan()}
                        >
                            {planning ? 'Generating plan…' : 'Generate Plan'}
                        </button>
                    </div>
                </div>

                {planError && <p className="message-inline" style={{ marginTop: '0.6rem' }}>{planError}</p>}

                {dailyPlan && (
                    <div
                        className="card"
                        style={{ margin: '0.9rem 0 0', padding: '0.9rem', display: 'grid', gap: '0.6rem' }}
                    >
                        <p style={{ margin: 0, fontWeight: 700 }}>{dailyPlan.objective}</p>

                        <div>
                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', fontWeight: 600 }}>
                                Next Actions
                            </p>
                            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem' }}>
                                {dailyPlan.nextActions.map((a, i) => (
                                    <li key={i} style={{ marginBottom: '0.2rem' }}>
                                        {a.action}{' '}
                                        <span style={{ color: 'var(--ink-muted)' }}>
                                            ({(a.confidence * 100).toFixed(0)}%)
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div>
                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', fontWeight: 600 }}>
                                Risks
                            </p>
                            {dailyPlan.risks.length === 0 ? (
                                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem' }}>None</p>
                            ) : (
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem' }}>
                                    {dailyPlan.risks.map((r, i) => (
                                        <li key={i}>{r}</li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div>
                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', fontWeight: 600 }}>
                                Approvals Needed
                            </p>
                            {dailyPlan.approvalsNeeded.length === 0 ? (
                                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem' }}>None</p>
                            ) : (
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem' }}>
                                    {dailyPlan.approvalsNeeded.map((a, i) => (
                                        <li key={i}>{a}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
