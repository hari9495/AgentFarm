'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetState = {
    workspaceId: string;
    dailySpent: number;
    dailyLimit: number | null;
    monthlySpent: number;
    monthlyLimit: number | null;
    isHardStopActive: boolean;
    lastResetDaily: string | null;
};

type BudgetLimits = {
    workspaceId: string;
    scope: string;
    dailyLimit: number | null;
    monthlyLimit: number | null;
};

type BudgetDecision = {
    decision: string;
    denialReason: string | null;
    isHardStopActive: boolean;
    [key: string]: unknown;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DECISION_BADGE: Record<string, { bg: string; color: string }> = {
    allowed: { bg: '#dcfce7', color: '#166534' },
    warning: { bg: '#fef9c3', color: '#854d0e' },
    denied: { bg: '#fee2e2', color: '#991b1b' },
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

function spendBarColor(ratio: number): string {
    if (ratio < 0.5) return '#166534';
    if (ratio < 0.8) return '#b45309';
    return '#991b1b';
}

// ── Component ─────────────────────────────────────────────────────────────────

type BudgetPolicyPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function BudgetPolicyPanel({ tenantId, workspaceId }: BudgetPolicyPanelProps) {
    // Budget state
    const [budgetState, setBudgetState] = useState<BudgetState | null>(null);
    const [stateLoading, setStateLoading] = useState(false);
    const [stateError, setStateError] = useState<string | null>(null);

    // Limits
    const [limits, setLimits] = useState<BudgetLimits | null>(null);
    const [limitsLoading, setLimitsLoading] = useState(false);
    const [hardStopToggling, setHardStopToggling] = useState(false);

    // Limits edit form
    const [editingLimits, setEditingLimits] = useState(false);
    const [editDailyLimit, setEditDailyLimit] = useState('');
    const [editMonthlyLimit, setEditMonthlyLimit] = useState('');
    const [limitsSaving, setLimitsSaving] = useState(false);
    const [limitsError, setLimitsError] = useState<string | null>(null);

    // Evaluate form
    const [evalTaskId, setEvalTaskId] = useState('');
    const [evalEstimatedCost, setEvalEstimatedCost] = useState('');
    const [evalResult, setEvalResult] = useState<BudgetDecision | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [evalError, setEvalError] = useState<string | null>(null);

    const fetchState = useCallback(async () => {
        setStateLoading(true);
        setStateError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/budget-state`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as BudgetState & {
            message?: string;
        };

        if (!response.ok) {
            setStateError(data.message ?? 'Unable to load budget state.');
            setStateLoading(false);
            return;
        }

        setBudgetState(data);
        setStateLoading(false);
    }, [workspaceId]);

    const fetchLimits = useCallback(async () => {
        setLimitsLoading(true);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/budget-limits`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as BudgetLimits & {
            message?: string;
        };

        if (response.ok) {
            setLimits(data);
        }
        setLimitsLoading(false);
    }, [workspaceId]);

    useEffect(() => {
        void Promise.all([fetchState(), fetchLimits()]);
    }, [fetchState, fetchLimits]);

    const toggleHardStop = async () => {
        if (!budgetState) return;
        const next = !budgetState.isHardStopActive;
        if (
            !window.confirm(
                `${next ? 'Activate' : 'Deactivate'} hard stop for this workspace?`,
            )
        )
            return;

        setHardStopToggling(true);

        await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/budget-hard-stop`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ isActive: next }),
        });

        await fetchState();
        setHardStopToggling(false);
    };

    const saveLimits = async () => {
        setLimitsSaving(true);
        setLimitsError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/budget-limits`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    dailyLimit: editDailyLimit ? parseFloat(editDailyLimit) : null,
                    monthlyLimit: editMonthlyLimit ? parseFloat(editMonthlyLimit) : null,
                }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setLimitsError(data.message ?? 'Failed to save limits.');
            setLimitsSaving(false);
            return;
        }

        await Promise.all([fetchLimits(), fetchState()]);
        setEditingLimits(false);
        setLimitsSaving(false);
    };

    const evaluateBudget = async () => {
        if (!evalTaskId.trim()) {
            setEvalError('Task ID is required.');
            return;
        }

        setEvaluating(true);
        setEvalError(null);
        setEvalResult(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/budget-evaluate`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    taskId: evalTaskId.trim(),
                    estimatedCost: evalEstimatedCost ? parseFloat(evalEstimatedCost) : undefined,
                }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as BudgetDecision & {
            message?: string;
        };

        if (!response.ok) {
            setEvalError(data.message ?? 'Budget evaluation failed.');
            setEvaluating(false);
            return;
        }

        setEvalResult(data);
        setEvaluating(false);
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
            {/* ── Section 1: Budget State ─────────────────────────────────── */}
            <div>
                <div style={sectionHeaderStyle}>
                    <h2 style={{ margin: 0 }}>Budget State</h2>
                    <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void fetchState()}
                    >
                        Refresh
                    </button>
                </div>

                {stateLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading budget state…</p>
                )}

                {stateError && <p className="message-inline">{stateError}</p>}

                {!stateLoading && !stateError && budgetState && (
                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                        {/* Hard stop badge + toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {budgetState.isHardStopActive ? (
                                <span
                                    style={{
                                        padding: '4px 14px',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        background: '#fee2e2',
                                        color: '#991b1b',
                                        letterSpacing: '0.05em',
                                    }}
                                >
                                    HARD STOP ACTIVE
                                </span>
                            ) : (
                                <span
                                    style={{
                                        padding: '4px 14px',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        background: '#dcfce7',
                                        color: '#166534',
                                    }}
                                >
                                    Normal
                                </span>
                            )}
                            <button
                                type="button"
                                className="secondary-action"
                                disabled={hardStopToggling}
                                onClick={() => void toggleHardStop()}
                                style={{
                                    background: budgetState.isHardStopActive ? '#fee2e2' : undefined,
                                    borderColor: budgetState.isHardStopActive ? '#fca5a5' : undefined,
                                    color: budgetState.isHardStopActive ? '#991b1b' : undefined,
                                }}
                            >
                                {hardStopToggling ? 'Toggling…' : 'Toggle Hard Stop'}
                            </button>
                        </div>

                        {/* Spend summary */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                                fontSize: '0.86rem',
                            }}
                        >
                            <div>
                                <p style={{ margin: '0 0 0.2rem', fontWeight: 600 }}>Daily</p>
                                <p style={{ margin: '0 0 0.3rem' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                        ${budgetState.dailySpent.toFixed(4)}
                                    </span>{' '}
                                    <span style={{ color: 'var(--ink-muted)' }}>
                                        / {budgetState.dailyLimit != null ? `$${budgetState.dailyLimit.toFixed(2)}` : '∞'} limit
                                    </span>
                                </p>
                                {budgetState.dailyLimit != null && (
                                    <div
                                        style={{
                                            height: '6px',
                                            background: 'var(--line)',
                                            borderRadius: '3px',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${Math.min((budgetState.dailySpent / budgetState.dailyLimit) * 100, 100)}%`,
                                                background: spendBarColor(
                                                    budgetState.dailySpent / budgetState.dailyLimit,
                                                ),
                                                borderRadius: '3px',
                                                transition: 'width 0.3s ease',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p style={{ margin: '0 0 0.2rem', fontWeight: 600 }}>Monthly</p>
                                <p style={{ margin: '0 0 0.3rem' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                        ${budgetState.monthlySpent.toFixed(4)}
                                    </span>{' '}
                                    <span style={{ color: 'var(--ink-muted)' }}>
                                        / {budgetState.monthlyLimit != null ? `$${budgetState.monthlyLimit.toFixed(2)}` : '∞'} limit
                                    </span>
                                </p>
                                {budgetState.monthlyLimit != null && (
                                    <div
                                        style={{
                                            height: '6px',
                                            background: 'var(--line)',
                                            borderRadius: '3px',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${Math.min((budgetState.monthlySpent / budgetState.monthlyLimit) * 100, 100)}%`,
                                                background: spendBarColor(
                                                    budgetState.monthlySpent / budgetState.monthlyLimit,
                                                ),
                                                borderRadius: '3px',
                                                transition: 'width 0.3s ease',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 2: Budget Limits ────────────────────────────────── */}
            <div>
                <div style={sectionHeaderStyle}>
                    <h2 style={{ margin: 0 }}>Limits</h2>
                    {!editingLimits && (
                        <button
                            type="button"
                            className="secondary-action"
                            disabled={limitsLoading}
                            onClick={() => {
                                setEditingLimits(true);
                                setEditDailyLimit(limits?.dailyLimit?.toString() ?? '');
                                setEditMonthlyLimit(limits?.monthlyLimit?.toString() ?? '');
                                setLimitsError(null);
                            }}
                        >
                            Edit
                        </button>
                    )}
                    {editingLimits && (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                                setEditingLimits(false);
                                setLimitsError(null);
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {!editingLimits && (
                    <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.86rem' }}>
                        <p style={{ margin: 0 }}>
                            <span style={{ color: 'var(--ink-muted)' }}>Daily Limit: </span>
                            <strong>
                                {limits?.dailyLimit != null ? `$${limits.dailyLimit.toFixed(2)}` : '∞'}
                            </strong>
                        </p>
                        <p style={{ margin: 0 }}>
                            <span style={{ color: 'var(--ink-muted)' }}>Monthly Limit: </span>
                            <strong>
                                {limits?.monthlyLimit != null ? `$${limits.monthlyLimit.toFixed(2)}` : '∞'}
                            </strong>
                        </p>
                    </div>
                )}

                {editingLimits && (
                    <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '360px' }}>
                        <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                            Daily Limit ($)
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editDailyLimit}
                                onChange={(e) => setEditDailyLimit(e.target.value)}
                                placeholder="Leave blank for unlimited"
                                style={{ ...inputStyle, marginTop: '0.25rem' }}
                            />
                        </label>
                        <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                            Monthly Limit ($)
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editMonthlyLimit}
                                onChange={(e) => setEditMonthlyLimit(e.target.value)}
                                placeholder="Leave blank for unlimited"
                                style={{ ...inputStyle, marginTop: '0.25rem' }}
                            />
                        </label>
                        {limitsError && <p className="message-inline">{limitsError}</p>}
                        <div>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={limitsSaving}
                                onClick={() => void saveLimits()}
                            >
                                {limitsSaving ? 'Saving…' : 'Save Limits'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 3: Evaluate Budget ──────────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.3rem' }}>Test Budget Evaluation</h2>
                <p style={{ margin: '0 0 0.75rem', color: 'var(--ink-soft)', fontSize: '0.83rem' }}>
                    Check if a task would be approved under current budget.
                </p>

                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '360px' }}>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Task ID *
                        <input
                            type="text"
                            value={evalTaskId}
                            onChange={(e) => setEvalTaskId(e.target.value)}
                            placeholder="task-abc-123"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Estimated Cost ($)
                        <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={evalEstimatedCost}
                            onChange={(e) => setEvalEstimatedCost(e.target.value)}
                            placeholder="Optional"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={evaluating}
                            onClick={() => void evaluateBudget()}
                        >
                            {evaluating ? 'Evaluating…' : 'Evaluate'}
                        </button>
                    </div>
                </div>

                {evalError && <p className="message-inline" style={{ marginTop: '0.6rem' }}>{evalError}</p>}

                {evalResult && (
                    <div
                        className="card"
                        style={{ margin: '0.9rem 0 0', padding: '0.9rem', display: 'grid', gap: '0.5rem' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontSize: '0.83rem', fontWeight: 600 }}>Decision:</span>
                            {inlineBadge(evalResult.decision, DECISION_BADGE)}
                        </div>

                        {evalResult.denialReason && (
                            <div
                                style={{
                                    padding: '0.5rem 0.8rem',
                                    background: '#fef9c3',
                                    border: '1px solid #fde68a',
                                    borderRadius: '4px',
                                    fontSize: '0.83rem',
                                    color: '#854d0e',
                                }}
                            >
                                Denial reason: {evalResult.denialReason}
                            </div>
                        )}

                        <p style={{ margin: 0, fontSize: '0.83rem' }}>
                            <span style={{ color: 'var(--ink-muted)' }}>Hard Stop Active: </span>
                            <strong>{evalResult.isHardStopActive ? 'Yes' : 'No'}</strong>
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
