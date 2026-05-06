import type { ActionResultStatus, RiskLevel } from './action-result-contract.js';

export type ExecutionLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type ExecutionLogEntry = {
    timestamp: string;
    level: ExecutionLogLevel;
    message: string;
    context?: Record<string, unknown>;
};

export type QualityGateCheckResult = {
    checkType: 'lint' | 'test' | 'security' | 'policy';
    status: 'passed' | 'failed' | 'skipped' | 'not_run';
    details?: string;
    errorMessage?: string;
    executedAt?: string;
    durationMs?: number;
};

export type EvidenceRecord = {
    evidenceId: string;
    createdAt: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    approvalId?: string;
    correlationId: string;
    actionType: string;
    actionStatus: ActionResultStatus;
    riskLevel: RiskLevel;
    route: 'execute' | 'approval';
    executionStartedAt: string;
    executionCompletedAt?: string;
    executionDurationMs?: number;
    executionLogs: ExecutionLogEntry[];
    qualityGateResults: QualityGateCheckResult[];
    actionOutcome: {
        success: boolean;
        resultSummary?: string;
        errorReason?: string;
        failureClass?: 'transient_error' | 'runtime_exception' | 'policy_violation';
    };
    connectorUsed?: string;
    connectorStatus?: 'local' | 'remote' | 'fallback';
    actorId?: string;
    approvalReason?: string;
};

export type EvidenceRecordWriter = (record: EvidenceRecord) => Promise<void>;
