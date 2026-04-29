export type WorkspaceBudgetSnapshot = {
    workspaceId: string;
    dailySpent: number;
    dailyLimit: number;
    monthlySpent: number;
    monthlyLimit: number;
    isHardStopActive: boolean;
    lastResetDaily: string;
};

export type BudgetLimitScope = 'tenant' | 'workspace';

export type BudgetLimitConfig = {
    scope: BudgetLimitScope;
    dailyLimit: number;
    monthlyLimit: number;
};

const clampPercent = (value: number): number => {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }
    if (value > 100) {
        return 100;
    }
    return Number(value.toFixed(1));
};

export const getUsagePercent = (spent: number, limit: number): number => {
    if (!Number.isFinite(limit) || limit <= 0) {
        return 0;
    }
    return clampPercent((spent / limit) * 100);
};

export const getBudgetStatusLabel = (input: {
    dailyPercent: number;
    monthlyPercent: number;
    isHardStopActive: boolean;
}): 'hard-stop active' | 'critical' | 'warning' | 'healthy' => {
    if (input.isHardStopActive) {
        return 'hard-stop active';
    }

    const maxUsage = Math.max(input.dailyPercent, input.monthlyPercent);
    if (maxUsage >= 100) {
        return 'critical';
    }
    if (maxUsage >= 80) {
        return 'warning';
    }
    return 'healthy';
};

export const getBudgetStatusBadgeClass = (status: ReturnType<typeof getBudgetStatusLabel>): 'high' | 'warn' | 'ok' => {
    if (status === 'hard-stop active' || status === 'critical') {
        return 'high';
    }
    if (status === 'warning') {
        return 'warn';
    }
    return 'ok';
};

export const formatUsd = (value: number): string => {
    if (!Number.isFinite(value)) {
        return '$0.00';
    }
    return `$${value.toFixed(2)}`;
};

export const normalizeBudgetLimitScope = (value: unknown): BudgetLimitScope => {
    return value === 'tenant' ? 'tenant' : 'workspace';
};

export const parseBudgetLimitInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    return Number(numericValue.toFixed(2));
};

export const hasBudgetLimitChanges = (current: BudgetLimitConfig, next: BudgetLimitConfig): boolean => {
    return current.scope !== next.scope
        || current.dailyLimit !== next.dailyLimit
        || current.monthlyLimit !== next.monthlyLimit;
};
