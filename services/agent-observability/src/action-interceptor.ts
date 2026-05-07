import { randomUUID } from 'node:crypto';

export type ActionCategory = 'browser' | 'desktop' | 'api';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ActionEvent {
    actionId: string;
    agentId: string;
    workspaceId: string;
    taskId: string;
    type: ActionCategory;
    action: string;
    target: string;
    payload: unknown;
    screenshotBefore: string;
    screenshotAfter: string;
    domSnapshotBefore?: string;
    domSnapshotAfter?: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
    riskLevel: RiskLevel;
}

export interface ActionRequest {
    agentId: string;
    workspaceId: string;
    taskId: string;
    sessionId: string;
    type: ActionCategory;
    action: string;
    target: string;
    payload: unknown;
    riskLevel?: RiskLevel;
}

export interface CaptureSnapshot {
    screenshot: string;
    domSnapshot?: string;
}

export interface ActionCaptureAdapter {
    captureBefore(action: ActionRequest): Promise<CaptureSnapshot>;
    captureAfter(action: ActionRequest): Promise<CaptureSnapshot>;
}

export interface ApprovalResult {
    approved: boolean;
    reason?: string;
}

export interface ApprovalGate {
    requestApproval(action: ActionRequest): Promise<ApprovalResult>;
}

export interface ActionEventSink {
    emit(event: ActionEvent): Promise<void>;
}

export interface InterceptorHooks {
    capture: ActionCaptureAdapter;
    eventSink: ActionEventSink;
    approvalGate?: ApprovalGate;
    riskClassifier?: (action: ActionRequest) => RiskLevel;
}

export const classifyRiskByAction = (action: ActionRequest): RiskLevel => {
    const normalized = `${action.action} ${action.target}`.toLowerCase();
    if (/(submit|delete|remove|payment|checkout|transfer|wire|purchase|drop table)/.test(normalized)) {
        return 'high';
    }
    if (/(upload|download|invite|share|bulk|replace|overwrite)/.test(normalized)) {
        return 'medium';
    }
    return action.riskLevel ?? 'low';
};

const approvalRequired = (risk: RiskLevel): boolean => risk === 'high';

export class ActionInterceptor {
    private readonly hooks: InterceptorHooks;

    constructor(hooks: InterceptorHooks) {
        this.hooks = hooks;
    }

    async execute<T>(action: ActionRequest, executeAction: () => Promise<T>): Promise<T> {
        const startedAt = new Date();
        const actionId = randomUUID();
        const classify = this.hooks.riskClassifier ?? classifyRiskByAction;
        const riskLevel = classify(action);

        if (approvalRequired(riskLevel) && this.hooks.approvalGate) {
            const approval = await this.hooks.approvalGate.requestApproval(action);
            if (!approval.approved) {
                const rejectedAt = new Date();
                await this.hooks.eventSink.emit({
                    actionId,
                    agentId: action.agentId,
                    workspaceId: action.workspaceId,
                    taskId: action.taskId,
                    type: action.type,
                    action: action.action,
                    target: action.target,
                    payload: action.payload,
                    screenshotBefore: '',
                    screenshotAfter: '',
                    startedAt,
                    completedAt: rejectedAt,
                    durationMs: Math.max(0, rejectedAt.getTime() - startedAt.getTime()),
                    success: false,
                    errorMessage: approval.reason ?? 'Action not approved.',
                    riskLevel,
                });
                throw new Error(approval.reason ?? 'Action not approved.');
            }
        }

        const before = await this.hooks.capture.captureBefore(action);

        try {
            const output = await executeAction();
            const after = await this.hooks.capture.captureAfter(action);
            const completedAt = new Date();

            await this.hooks.eventSink.emit({
                actionId,
                agentId: action.agentId,
                workspaceId: action.workspaceId,
                taskId: action.taskId,
                type: action.type,
                action: action.action,
                target: action.target,
                payload: action.payload,
                screenshotBefore: before.screenshot,
                screenshotAfter: after.screenshot,
                domSnapshotBefore: before.domSnapshot,
                domSnapshotAfter: after.domSnapshot,
                startedAt,
                completedAt,
                durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
                success: true,
                riskLevel,
            });

            return output;
        } catch (error) {
            const after = await this.hooks.capture.captureAfter(action);
            const completedAt = new Date();
            const errorMessage = error instanceof Error ? error.message : 'Unknown action error.';

            await this.hooks.eventSink.emit({
                actionId,
                agentId: action.agentId,
                workspaceId: action.workspaceId,
                taskId: action.taskId,
                type: action.type,
                action: action.action,
                target: action.target,
                payload: action.payload,
                screenshotBefore: before.screenshot,
                screenshotAfter: after.screenshot,
                domSnapshotBefore: before.domSnapshot,
                domSnapshotAfter: after.domSnapshot,
                startedAt,
                completedAt,
                durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
                success: false,
                errorMessage,
                riskLevel,
            });

            throw error;
        }
    }
}
