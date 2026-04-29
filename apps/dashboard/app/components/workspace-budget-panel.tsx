'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    formatUsd,
    getBudgetStatusBadgeClass,
    getBudgetStatusLabel,
    getUsagePercent,
    hasBudgetLimitChanges,
    normalizeBudgetLimitScope,
    parseBudgetLimitInput,
    type BudgetLimitConfig,
    type BudgetLimitScope,
    type WorkspaceBudgetSnapshot,
} from './workspace-budget-panel-utils';

type WorkspaceBudgetPanelProps = {
    budget: WorkspaceBudgetSnapshot;
    source: 'live' | 'fallback';
};

type BudgetLimitsResponse = {
    workspaceId?: string;
    scope?: BudgetLimitScope;
    dailyLimit?: number;
    monthlyLimit?: number;
    message?: string;
};

export function WorkspaceBudgetPanel({ budget, source }: WorkspaceBudgetPanelProps) {
    const [budgetState, setBudgetState] = useState(budget);
    const [panelSource, setPanelSource] = useState(source);
    const [config, setConfig] = useState<BudgetLimitConfig>({
        scope: 'workspace',
        dailyLimit: budget.dailyLimit,
        monthlyLimit: budget.monthlyLimit,
    });
    const [selectedScope, setSelectedScope] = useState<BudgetLimitScope>('workspace');
    const [dailyLimitInput, setDailyLimitInput] = useState(String(budget.dailyLimit));
    const [monthlyLimitInput, setMonthlyLimitInput] = useState(String(budget.monthlyLimit));
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const dailyPercent = getUsagePercent(budgetState.dailySpent, budgetState.dailyLimit);
    const monthlyPercent = getUsagePercent(budgetState.monthlySpent, budgetState.monthlyLimit);
    const status = getBudgetStatusLabel({
        dailyPercent,
        monthlyPercent,
        isHardStopActive: budgetState.isHardStopActive,
    });

    const draftLimits = useMemo(() => {
        const parsedDailyLimit = parseBudgetLimitInput(dailyLimitInput);
        const parsedMonthlyLimit = parseBudgetLimitInput(monthlyLimitInput);

        if (parsedDailyLimit === null || parsedMonthlyLimit === null) {
            return null;
        }

        return {
            scope: selectedScope,
            dailyLimit: parsedDailyLimit,
            monthlyLimit: parsedMonthlyLimit,
        } satisfies BudgetLimitConfig;
    }, [dailyLimitInput, monthlyLimitInput, selectedScope]);

    const hasChanges = draftLimits ? hasBudgetLimitChanges(config, draftLimits) : false;

    useEffect(() => {
        setBudgetState(budget);
        setPanelSource(source);
        setConfig({
            scope: 'workspace',
            dailyLimit: budget.dailyLimit,
            monthlyLimit: budget.monthlyLimit,
        });
        setSelectedScope('workspace');
        setDailyLimitInput(String(budget.dailyLimit));
        setMonthlyLimitInput(String(budget.monthlyLimit));
        setError(null);
        setSuccess(null);
    }, [budget, source]);

    useEffect(() => {
        let cancelled = false;

        const fetchLimits = async () => {
            setLoadingConfig(true);
            setError(null);

            try {
                const response = await fetch(`/api/workspaces/${encodeURIComponent(budget.workspaceId)}/budget-limits`, {
                    cache: 'no-store',
                });
                const body = (await response.json().catch(() => ({}))) as BudgetLimitsResponse;

                if (!response.ok) {
                    if (!cancelled) {
                        setError(body.message ?? `Unable to load budget limits (${response.status}).`);
                    }
                    return;
                }

                if (cancelled) {
                    return;
                }

                const scope = normalizeBudgetLimitScope(body.scope);
                const dailyLimit = typeof body.dailyLimit === 'number' ? body.dailyLimit : budget.dailyLimit;
                const monthlyLimit = typeof body.monthlyLimit === 'number' ? body.monthlyLimit : budget.monthlyLimit;

                setConfig({ scope, dailyLimit, monthlyLimit });
                setSelectedScope(scope);
                setDailyLimitInput(String(dailyLimit));
                setMonthlyLimitInput(String(monthlyLimit));
                setBudgetState((previous) => ({
                    ...previous,
                    dailyLimit,
                    monthlyLimit,
                }));
                setPanelSource('live');
            } catch {
                if (!cancelled) {
                    setError('Network error while loading budget limits.');
                }
            } finally {
                if (!cancelled) {
                    setLoadingConfig(false);
                }
            }
        };

        void fetchLimits();

        return () => {
            cancelled = true;
        };
    }, [budget.dailyLimit, budget.monthlyLimit, budget.workspaceId]);

    const handleReset = () => {
        setSelectedScope(config.scope);
        setDailyLimitInput(String(config.dailyLimit));
        setMonthlyLimitInput(String(config.monthlyLimit));
        setError(null);
        setSuccess(null);
    };

    const handleSave = async () => {
        setError(null);
        setSuccess(null);

        if (!draftLimits) {
            setError('Daily and monthly limits must be positive numbers.');
            return;
        }

        if (!hasBudgetLimitChanges(config, draftLimits)) {
            setSuccess('Budget limits are already up to date.');
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`/api/workspaces/${encodeURIComponent(budget.workspaceId)}/budget-limits`, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify(draftLimits),
            });
            const body = (await response.json().catch(() => ({}))) as BudgetLimitsResponse;

            if (!response.ok) {
                setError(body.message ?? `Unable to save budget limits (${response.status}).`);
                return;
            }

            const nextScope = normalizeBudgetLimitScope(body.scope ?? draftLimits.scope);
            const nextDailyLimit = typeof body.dailyLimit === 'number' ? body.dailyLimit : draftLimits.dailyLimit;
            const nextMonthlyLimit = typeof body.monthlyLimit === 'number' ? body.monthlyLimit : draftLimits.monthlyLimit;

            setConfig({
                scope: nextScope,
                dailyLimit: nextDailyLimit,
                monthlyLimit: nextMonthlyLimit,
            });
            setSelectedScope(nextScope);
            setDailyLimitInput(String(nextDailyLimit));
            setMonthlyLimitInput(String(nextMonthlyLimit));
            setBudgetState((previous) => ({
                ...previous,
                dailyLimit: nextDailyLimit,
                monthlyLimit: nextMonthlyLimit,
            }));
            setPanelSource('live');
            setSuccess(nextScope === 'tenant'
                ? 'Tenant default budget limits saved. Workspaces without overrides inherit these values.'
                : 'Workspace budget override saved.');
        } catch {
            setError('Network error while saving budget limits.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="card" aria-label="workspace-budget-guardrails">
            <div className="budget-panel-header">
                <h2>Workspace Budget Guardrails</h2>
                <span className={`badge ${getBudgetStatusBadgeClass(status)}`}>{status}</span>
            </div>
            <p className="panel-muted">
                Daily and monthly policy budget visibility for workspace <strong>{budgetState.workspaceId}</strong>. Source: {panelSource}.
            </p>

            <div className="panel-badge-row">
                <span className={`badge ${config.scope === 'tenant' ? 'warn' : 'low'}`}>
                    limit scope: {config.scope}
                </span>
                <span className="badge neutral">
                    editable via internal control plane
                </span>
            </div>

            <div className="budget-meter-group">
                <div>
                    <div className="budget-meter-label-row">
                        <span>Daily budget</span>
                        <strong>
                            {formatUsd(budgetState.dailySpent)} / {formatUsd(budgetState.dailyLimit)}
                        </strong>
                    </div>
                    <div className="budget-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dailyPercent}>
                        <span
                            className={`budget-meter-fill ${dailyPercent >= 100 ? 'critical' : dailyPercent >= 80 ? 'warning' : 'healthy'}`}
                            style={{ width: `${dailyPercent}%` }}
                        />
                    </div>
                </div>

                <div>
                    <div className="budget-meter-label-row">
                        <span>Monthly budget</span>
                        <strong>
                            {formatUsd(budgetState.monthlySpent)} / {formatUsd(budgetState.monthlyLimit)}
                        </strong>
                    </div>
                    <div className="budget-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={monthlyPercent}>
                        <span
                            className={`budget-meter-fill ${monthlyPercent >= 100 ? 'critical' : monthlyPercent >= 80 ? 'warning' : 'healthy'}`}
                            style={{ width: `${monthlyPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className="budget-meta-row">
                <span className={`badge ${budgetState.isHardStopActive ? 'high' : 'neutral'}`}>
                    Hard-stop: {budgetState.isHardStopActive ? 'active' : 'inactive'}
                </span>
                <span className="badge neutral">Daily reset: {new Date(budgetState.lastResetDaily).toLocaleDateString()}</span>
            </div>

            <div className="panel-stack">
                <p className="panel-subtitle">
                    Set a workspace-only override or update the tenant default budget inherited by workspaces without their own override.
                </p>

                <div className="panel-form-grid">
                    <label className="panel-field">
                        <span className="panel-field-label">Limit scope</span>
                        <select
                            className="panel-control"
                            value={selectedScope}
                            onChange={(event) => setSelectedScope(normalizeBudgetLimitScope(event.target.value))}
                            disabled={loadingConfig || saving}
                        >
                            <option value="workspace">Workspace override</option>
                            <option value="tenant">Tenant default</option>
                        </select>
                    </label>

                    <label className="panel-field">
                        <span className="panel-field-label">Daily limit (USD)</span>
                        <input
                            className="panel-control"
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={dailyLimitInput}
                            onChange={(event) => setDailyLimitInput(event.target.value)}
                            disabled={loadingConfig || saving}
                        />
                    </label>

                    <label className="panel-field">
                        <span className="panel-field-label">Monthly limit (USD)</span>
                        <input
                            className="panel-control"
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={monthlyLimitInput}
                            onChange={(event) => setMonthlyLimitInput(event.target.value)}
                            disabled={loadingConfig || saving}
                        />
                    </label>
                </div>

                <p className="panel-muted">
                    {selectedScope === 'tenant'
                        ? 'Tenant defaults affect workspaces that do not have an explicit override.'
                        : 'Workspace overrides apply only to the currently selected workspace.'}
                </p>

                {loadingConfig && (
                    <p className="panel-inline-note warn">Loading effective budget limits...</p>
                )}
                {error && (
                    <p role="alert" className="panel-inline-note error">{error}</p>
                )}
                {success && (
                    <p className="panel-inline-note success">{success}</p>
                )}

                <div className="panel-actions-end">
                    <button
                        type="button"
                        className="secondary-action"
                        onClick={handleReset}
                        disabled={loadingConfig || saving || !hasChanges}
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        className="primary-action"
                        onClick={handleSave}
                        disabled={loadingConfig || saving || !draftLimits || !hasChanges}
                    >
                        {saving ? 'Saving...' : 'Save limits'}
                    </button>
                </div>
            </div>
        </section>
    );
}
