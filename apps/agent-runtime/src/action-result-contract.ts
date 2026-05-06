import type { RiskLevel } from './execution-engine.js';

export type { RiskLevel };

export type ActionResultStatus = 'success' | 'approval_required' | 'failed' | 'cancelled';

export type ActionResultRecord = {
    recordId: string;
    recordedAt: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleProfile: string;
    policyPackVersion: string;
    correlationId: string;
    taskId: string;
    actionType: string;
    riskLevel: RiskLevel;
    confidence: number;
    route: 'execute' | 'approval';
    status: ActionResultStatus;
    attempts: number;
    retries: number;
    failureClass?: 'transient_error' | 'runtime_exception';
    errorMessage?: string;
    claimToken?: string;
    leaseId?: string;
    leaseStatus?: 'claimed' | 'released' | 'expired';
    leaseClaimedBy?: string;
    leaseIdempotencyKey?: string;
    leaseExpiresAt?: number;
    budgetDecision?: 'allowed' | 'denied' | 'warning';
    budgetDenialReason?: string;
    budgetLimitScope?: string;
    budgetLimitType?: string;
    payloadOverrideSource?: 'none' | 'llm_generated' | 'executor_inferred';
    payloadOverridesApplied?: boolean;
    actorId?: string;
    routeReason?: string;
    evidenceLink?: string;
    approvalSummary?: string;
};

export type ActionResultWriter = (record: ActionResultRecord) => Promise<void>;
