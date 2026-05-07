import type { ProactiveSignalType } from '@agentfarm/shared-types';

export interface ProactivePullRequestInput {
    id: string;
    title: string;
    daysSinceUpdate: number;
}

export interface ProactiveTicketInput {
    id: string;
    title: string;
    hoursSinceUpdate: number;
}

export interface ProactiveCiFailureInput {
    workflowName: string;
    branch: string;
    failureCount: number;
}

export interface ProactiveDependencyCveInput {
    dependencyName: string;
    cveId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ProactiveSignalDetectionInput {
    tenantId: string;
    workspaceId: string;
    botId: string;
    correlationId: string;
    pullRequests?: ProactivePullRequestInput[];
    tickets?: ProactiveTicketInput[];
    budgetUtilizationRatio?: number;
    ciFailures?: ProactiveCiFailureInput[];
    dependencyVulnerabilities?: ProactiveDependencyCveInput[];
    stalePrThresholdDays?: number;
    staleTicketThresholdHours?: number;
    budgetWarningThreshold?: number;
    ciFailureThresholdCount?: number;
    dependencySeverityThreshold?: 'medium' | 'high' | 'critical';
}

export interface DetectedProactiveSignalInput {
    signalType: ProactiveSignalType;
    severity: 'low' | 'medium' | 'high';
    summary: string;
    sourceRef: string;
    metadata?: Record<string, unknown>;
}

const severityRank: Record<'low' | 'medium' | 'high' | 'critical', number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
};

export const detectStalePullRequests = (
    pullRequests: ProactivePullRequestInput[],
    stalePrThresholdDays: number,
): DetectedProactiveSignalInput[] => pullRequests
    .filter((pr) => pr.daysSinceUpdate >= stalePrThresholdDays)
    .map((pr) => ({
        signalType: 'stale_pr',
        severity: 'medium',
        summary: `PR ${pr.id} is stale for ${pr.daysSinceUpdate} day(s).`,
        sourceRef: `pr:${pr.id}`,
        metadata: {
            title: pr.title,
            days_since_update: pr.daysSinceUpdate,
            threshold_days: stalePrThresholdDays,
        },
    }));

export const detectStaleTickets = (
    tickets: ProactiveTicketInput[],
    staleTicketThresholdHours: number,
): DetectedProactiveSignalInput[] => tickets
    .filter((ticket) => ticket.hoursSinceUpdate >= staleTicketThresholdHours)
    .map((ticket) => ({
        signalType: 'stale_ticket',
        severity: 'medium',
        summary: `Ticket ${ticket.id} is stale for ${ticket.hoursSinceUpdate} hour(s).`,
        sourceRef: `ticket:${ticket.id}`,
        metadata: {
            title: ticket.title,
            hours_since_update: ticket.hoursSinceUpdate,
            threshold_hours: staleTicketThresholdHours,
        },
    }));

export const detectBudgetWarning = (
    budgetUtilizationRatio: number | undefined,
    budgetWarningThreshold: number,
): DetectedProactiveSignalInput[] => {
    if (typeof budgetUtilizationRatio !== 'number' || budgetUtilizationRatio < budgetWarningThreshold) {
        return [];
    }

    const utilizationPct = Math.round(budgetUtilizationRatio * 100);
    return [{
        signalType: 'budget_warning',
        severity: budgetUtilizationRatio >= 1 ? 'high' : 'medium',
        summary: `Budget utilization reached ${utilizationPct}% (threshold ${Math.round(budgetWarningThreshold * 100)}%).`,
        sourceRef: 'budget:workspace',
        metadata: {
            utilization_ratio: budgetUtilizationRatio,
            warning_threshold: budgetWarningThreshold,
        },
    }];
};

export const detectCiFailure = (
    ciFailures: ProactiveCiFailureInput[],
    ciFailureThresholdCount: number,
): DetectedProactiveSignalInput[] => ciFailures
    .filter((failure) => failure.branch === 'main' && failure.failureCount >= ciFailureThresholdCount)
    .map((failure) => ({
        signalType: 'ci_failure_on_main',
        severity: failure.failureCount >= ciFailureThresholdCount + 1 ? 'high' : 'medium',
        summary: `${failure.workflowName} failed ${failure.failureCount} time(s) on main.`,
        sourceRef: `ci:${failure.workflowName}:main`,
        metadata: {
            workflow_name: failure.workflowName,
            branch: failure.branch,
            failure_count: failure.failureCount,
            threshold_count: ciFailureThresholdCount,
        },
    }));

export const detectDependencyCve = (
    dependencyVulnerabilities: ProactiveDependencyCveInput[],
    dependencySeverityThreshold: 'medium' | 'high' | 'critical',
): DetectedProactiveSignalInput[] => dependencyVulnerabilities
    .filter((vulnerability) => severityRank[vulnerability.severity] >= severityRank[dependencySeverityThreshold])
    .map((vulnerability) => ({
        signalType: 'dependency_cve',
        severity: vulnerability.severity === 'critical' ? 'high' : 'medium',
        summary: `${vulnerability.dependencyName} has ${vulnerability.severity} vulnerability ${vulnerability.cveId}.`,
        sourceRef: `cve:${vulnerability.cveId}`,
        metadata: {
            dependency_name: vulnerability.dependencyName,
            cve_id: vulnerability.cveId,
            vulnerability_severity: vulnerability.severity,
            threshold_severity: dependencySeverityThreshold,
        },
    }));

export const detectProactiveSignals = (
    input: ProactiveSignalDetectionInput,
): DetectedProactiveSignalInput[] => {
    const stalePrThresholdDays = input.stalePrThresholdDays ?? 14;
    const staleTicketThresholdHours = input.staleTicketThresholdHours ?? 72;
    const budgetWarningThreshold = input.budgetWarningThreshold ?? 0.8;
    const ciFailureThresholdCount = input.ciFailureThresholdCount ?? 1;
    const dependencySeverityThreshold = input.dependencySeverityThreshold ?? 'high';

    return [
        ...detectStalePullRequests(input.pullRequests ?? [], stalePrThresholdDays),
        ...detectStaleTickets(input.tickets ?? [], staleTicketThresholdHours),
        ...detectBudgetWarning(input.budgetUtilizationRatio, budgetWarningThreshold),
        ...detectCiFailure(input.ciFailures ?? [], ciFailureThresholdCount),
        ...detectDependencyCve(input.dependencyVulnerabilities ?? [], dependencySeverityThreshold),
    ];
};