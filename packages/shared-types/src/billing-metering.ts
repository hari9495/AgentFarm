// ============================================================================
// BILLING METERING CONTRACT (Sprint 7, 2026-05-16)
// ============================================================================
// Per-task platform fee metering.  Every successful task execution emits a
// UsageMeteringEvent.  The api-gateway aggregates these into a
// MeteringPeriodSummary used for invoicing and the dashboard billing panel.
//
// contractVersion: CONTRACT_VERSIONS.USAGE_METERING
// ============================================================================

/**
 * Fixed platform fee charged per successfully completed task.
 * This is the AgentFarm charge on top of underlying LLM inference costs.
 */
export const PER_TASK_PLATFORM_FEE_USD = 0.10;

/**
 * UsageMeteringEvent — written to audit log at task completion.
 * One record per task execution; only 'success' outcomes incur a platform fee.
 */
export interface UsageMeteringEvent {
    contractVersion: string;
    correlationId: string;
    tenantId: string;
    botId: string;
    taskId: string;
    /** AgentFarm platform fee for this task (0 for non-success outcomes). */
    platformFeeUsd: number;
    /** LLM inference cost estimated from token counts. */
    llmCostUsd: number;
    /** Total charge = platformFeeUsd + llmCostUsd. */
    totalChargeUsd: number;
    outcome: 'success' | 'failed' | 'approval_queued';
    billedAt: string; // ISO 8601
}

/**
 * MeteringPeriodSummary — returned by GET /v1/billing/metering/period.
 * Represents the aggregated billing charges for a given date range.
 */
export interface MeteringPeriodSummary {
    tenantId: string;
    periodStart: string;  // ISO 8601
    periodEnd: string;    // ISO 8601
    /** Total task executions (all outcomes). */
    taskCount: number;
    /** Tasks that completed successfully and incurred a platform fee. */
    billableTaskCount: number;
    /** Sum of per-task platform fees (billableTaskCount × PER_TASK_PLATFORM_FEE_USD). */
    platformFeeUsd: number;
    /** Sum of estimated LLM inference costs. */
    llmCostUsd: number;
    /** Total estimated charge = platformFeeUsd + llmCostUsd. */
    totalChargeUsd: number;
}
