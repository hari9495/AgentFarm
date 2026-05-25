import type { ProactiveSignalType } from '@agentfarm/shared-types';

type ConnectorDefinition = { tool: string };

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

// ---------------------------------------------------------------------------
// BA-specific input types
// ---------------------------------------------------------------------------

/** A Jira/Linear story passed in for acceptance-criteria coverage checks. */
export interface ProactiveBaStoryInput {
    id: string;
    title: string;
    type: 'story' | 'task' | 'bug' | 'epic';
    hasAcceptanceCriteria: boolean;
    hoursSinceCreated: number;
}

/**
 * A pair of requirements detected as semantically contradictory.
 * Conflict detection (e.g. via semantic memory search) happens upstream;
 * this detector simply surfaces each conflict as a signal.
 */
export interface ProactiveBaRequirementConflictInput {
    requirementAId: string;
    requirementAText: string;
    requirementBId: string;
    requirementBText: string;
    conflictDescription: string;
    severity: 'low' | 'medium' | 'high';
}

/**
 * A Slack / Teams thread pre-classified upstream as potentially containing
 * an undocumented requirement.
 */
export interface ProactiveBaStakeholderThreadInput {
    threadId: string;
    channel: string;
    platform: 'slack' | 'teams';
    /** One-sentence summary of why the thread implies a new requirement. */
    summary: string;
    hoursSincePosted: number;
}

/** An epic in Jira/Linear that has no linked BRD document. */
export interface ProactiveBaEpicInput {
    id: string;
    title: string;
    hasLinkedBrd: boolean;
    daysSinceCreated: number;
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
    // BA-specific inputs
    storiesWithoutAcceptanceCriteria?: ProactiveBaStoryInput[];
    requirementConflicts?: ProactiveBaRequirementConflictInput[];
    stakeholderThreads?: ProactiveBaStakeholderThreadInput[];
    epicsWithoutBrd?: ProactiveBaEpicInput[];
    // BA-specific thresholds
    /** Hours a story may exist without AC before being flagged. Default: 24. */
    missingAcThresholdHours?: number;
    /** Days an epic may exist without a BRD before being flagged. Default: 3. */
    epicWithoutBrdThresholdDays?: number;
    /** Hours a stakeholder thread may exist before being flagged. Default: 48. */
    stakeholderThreadThresholdHours?: number;
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
            recommended_action: 'workspace_run_ci_checks',
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
            recommended_action: 'workspace_dependency_audit',
        },
    }));

// ---------------------------------------------------------------------------
// BA-specific detector functions
// ---------------------------------------------------------------------------

/**
 * Flag stories that have existed longer than `thresholdHours` without any
 * acceptance criteria. Only stories (type === 'story') are checked.
 */
export const detectMissingAcceptanceCriteria = (
    stories: ProactiveBaStoryInput[],
    thresholdHours: number,
): DetectedProactiveSignalInput[] => stories
    .filter((story) => story.type === 'story' && !story.hasAcceptanceCriteria && story.hoursSinceCreated >= thresholdHours)
    .map((story) => ({
        signalType: 'ba_missing_acceptance_criteria' as const,
        severity: 'medium' as const,
        summary: `Story "${story.title}" (${story.id}) has no acceptance criteria after ${story.hoursSinceCreated}h.`,
        sourceRef: `story:${story.id}`,
        metadata: {
            story_id: story.id,
            title: story.title,
            hours_since_created: story.hoursSinceCreated,
            threshold_hours: thresholdHours,
            recommended_action: 'workspace_ba_draft_user_story',
        },
    }));

/**
 * Surface each pre-detected requirement conflict as a signal.
 * Semantic conflict detection happens upstream (e.g. via the memory-service
 * vector search); this function simply converts the results to signals.
 */
export const detectContradictoryRequirements = (
    conflicts: ProactiveBaRequirementConflictInput[],
): DetectedProactiveSignalInput[] => conflicts.map((conflict) => ({
    signalType: 'ba_contradictory_requirements' as const,
    severity: conflict.severity,
    summary: `Requirements ${conflict.requirementAId} and ${conflict.requirementBId} conflict: ${conflict.conflictDescription}`,
    sourceRef: `conflict:${conflict.requirementAId}:${conflict.requirementBId}`,
    metadata: {
        requirement_a_id: conflict.requirementAId,
        requirement_a_text: conflict.requirementAText,
        requirement_b_id: conflict.requirementBId,
        requirement_b_text: conflict.requirementBText,
        conflict_description: conflict.conflictDescription,
        recommended_action: 'workspace_ba_gap_analysis',
    },
}));

/**
 * Flag stakeholder threads that are older than `thresholdHours` and have been
 * pre-classified as potentially containing an undocumented requirement.
 */
export const detectUndocumentedRequirements = (
    threads: ProactiveBaStakeholderThreadInput[],
    thresholdHours: number,
): DetectedProactiveSignalInput[] => threads
    .filter((thread) => thread.hoursSincePosted >= thresholdHours)
    .map((thread) => ({
        signalType: 'ba_undocumented_requirement' as const,
        severity: 'medium' as const,
        summary: `${thread.platform}#${thread.channel} thread may contain undocumented requirements (${thread.hoursSincePosted}h old): ${thread.summary}`,
        sourceRef: `thread:${thread.platform}:${thread.threadId}`,
        metadata: {
            thread_id: thread.threadId,
            channel: thread.channel,
            platform: thread.platform,
            summary: thread.summary,
            hours_since_posted: thread.hoursSincePosted,
            threshold_hours: thresholdHours,
            recommended_action: 'workspace_ba_elicit_requirements',
        },
    }));

/**
 * Flag epics that have no linked BRD and have existed longer than
 * `thresholdDays`. Severity escalates to 'high' once the epic is 2× the
 * threshold age.
 */
export const detectEpicsWithoutBrd = (
    epics: ProactiveBaEpicInput[],
    thresholdDays: number,
): DetectedProactiveSignalInput[] => epics
    .filter((epic) => !epic.hasLinkedBrd && epic.daysSinceCreated >= thresholdDays)
    .map((epic) => ({
        signalType: 'ba_epic_without_brd' as const,
        severity: (epic.daysSinceCreated >= thresholdDays * 2 ? 'high' : 'medium') as 'high' | 'medium',
        summary: `Epic "${epic.title}" (${epic.id}) has no linked BRD after ${epic.daysSinceCreated} day(s).`,
        sourceRef: `epic:${epic.id}`,
        metadata: {
            epic_id: epic.id,
            title: epic.title,
            days_since_created: epic.daysSinceCreated,
            threshold_days: thresholdDays,
            recommended_action: 'workspace_ba_draft_brd',
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
    const missingAcThresholdHours = input.missingAcThresholdHours ?? 24;
    const epicWithoutBrdThresholdDays = input.epicWithoutBrdThresholdDays ?? 3;
    const stakeholderThreadThresholdHours = input.stakeholderThreadThresholdHours ?? 48;

    return [
        ...detectStalePullRequests(input.pullRequests ?? [], stalePrThresholdDays),
        ...detectStaleTickets(input.tickets ?? [], staleTicketThresholdHours),
        ...detectBudgetWarning(input.budgetUtilizationRatio, budgetWarningThreshold),
        ...detectCiFailure(input.ciFailures ?? [], ciFailureThresholdCount),
        ...detectDependencyCve(input.dependencyVulnerabilities ?? [], dependencySeverityThreshold),
        // BA-specific detectors
        ...detectMissingAcceptanceCriteria(input.storiesWithoutAcceptanceCriteria ?? [], missingAcThresholdHours),
        ...detectContradictoryRequirements(input.requirementConflicts ?? []),
        ...detectUndocumentedRequirements(input.stakeholderThreads ?? [], stakeholderThreadThresholdHours),
        ...detectEpicsWithoutBrd(input.epicsWithoutBrd ?? [], epicWithoutBrdThresholdDays),
    ];
};

export const runProactiveDetection = async (
    workspaceId: string,
    connectors: ConnectorDefinition[],
    input?: Omit<ProactiveSignalDetectionInput, 'workspaceId'>,
    writeAuditEvent?: (event: {
        action: 'proactive_signal_detected';
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata: Record<string, unknown>;
    }) => void,
): Promise<DetectedProactiveSignalInput[]> => {
    const signalInput: ProactiveSignalDetectionInput = {
        tenantId: input?.tenantId ?? 'unknown_tenant',
        workspaceId,
        botId: input?.botId ?? 'system:proactive-detector',
        correlationId: input?.correlationId ?? `proactive_detection_${Date.now()}`,
        pullRequests: input?.pullRequests,
        tickets: input?.tickets,
        budgetUtilizationRatio: input?.budgetUtilizationRatio,
        ciFailures: input?.ciFailures,
        dependencyVulnerabilities: input?.dependencyVulnerabilities,
        stalePrThresholdDays: input?.stalePrThresholdDays,
        staleTicketThresholdHours: input?.staleTicketThresholdHours,
        budgetWarningThreshold: input?.budgetWarningThreshold,
        ciFailureThresholdCount: input?.ciFailureThresholdCount,
        dependencySeverityThreshold: input?.dependencySeverityThreshold,
        storiesWithoutAcceptanceCriteria: input?.storiesWithoutAcceptanceCriteria,
        requirementConflicts: input?.requirementConflicts,
        stakeholderThreads: input?.stakeholderThreads,
        epicsWithoutBrd: input?.epicsWithoutBrd,
        missingAcThresholdHours: input?.missingAcThresholdHours,
        epicWithoutBrdThresholdDays: input?.epicWithoutBrdThresholdDays,
        stakeholderThreadThresholdHours: input?.stakeholderThreadThresholdHours,
    };

    const connectorHints = connectors.map((connector) => connector.tool);
    const detected = detectProactiveSignals(signalInput);
    const withMetadata = detected.map((signal) => ({
        ...signal,
        metadata: {
            ...signal.metadata,
            connectors_considered: connectorHints,
        },
    }));

    if (writeAuditEvent) {
        for (const signal of withMetadata) {
            writeAuditEvent({
                action: 'proactive_signal_detected',
                actorEmail: 'agent@system',
                tenantId: signalInput.tenantId,
                workspaceId,
                metadata: {
                    signalType: signal.signalType,
                    severity: signal.severity,
                },
            });
        }
    }

    return withMetadata;
};