import type { RiskLevel } from './execution-engine.js';

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
};

export type ActionResultWriter = (record: ActionResultRecord) => Promise<void>;
