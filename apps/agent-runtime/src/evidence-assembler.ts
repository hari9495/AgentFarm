import { randomUUID } from 'crypto';
import type { TaskEnvelope } from './execution-engine.js';
import type { ActionResultRecord } from './action-result-contract.js';
import type { EvidenceRecord, ExecutionLogEntry, QualityGateCheckResult } from './evidence-record-contract.js';

/**
 * Assemble an evidence record from task execution data, action results, and runtime logs.
 * Evidence captures the full audit trail of what happened during and after execution.
 */
export const assembleEvidenceRecord = (input: {
    task: TaskEnvelope;
    actionResult: ActionResultRecord;
    executionLogs: ExecutionLogEntry[];
    approvalId?: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
}): EvidenceRecord => {
    const { task, actionResult, executionLogs, approvalId, startedAt, completedAt, durationMs } = input;

    // Extract quality gate results from action result and logs
    const qualityGateResults: QualityGateCheckResult[] = [];

    // Add lint results if present in action result
    if (actionResult.route === 'execute') {
        const lintLog = executionLogs.find(
            (log) => log.message.toLowerCase().includes('lint') && log.context?.['check_type'] === 'lint',
        );
        if (lintLog) {
            qualityGateResults.push({
                checkType: 'lint',
                status:
                    lintLog.level === 'error'
                        ? 'failed'
                        : lintLog.message.toLowerCase().includes('passed')
                            ? 'passed'
                            : 'skipped',
                details: lintLog.message,
                executedAt: lintLog.timestamp,
            });
        }
    }

    // Add test results if present in logs
    const testLog = executionLogs.find(
        (log) => log.message.toLowerCase().includes('test') && log.context?.['check_type'] === 'test',
    );
    if (testLog) {
        qualityGateResults.push({
            checkType: 'test',
            status:
                testLog.level === 'error'
                    ? 'failed'
                    : testLog.message.toLowerCase().includes('passed')
                        ? 'passed'
                        : 'skipped',
            details: testLog.message,
            executedAt: testLog.timestamp,
        });
    }

    // Determine action outcome
    const actionOutcome = {
        success: actionResult.status === 'success',
        resultSummary:
            actionResult.status === 'success'
                ? `Action ${actionResult.actionType} completed successfully`
                : `Action ${actionResult.actionType} did not complete`,
        errorReason: actionResult.errorMessage ?? undefined,
        failureClass: actionResult.failureClass ?? undefined,
    };

    return {
        evidenceId: `ev_${randomUUID()}`,
        createdAt: new Date().toISOString(),
        tenantId: actionResult.tenantId,
        workspaceId: actionResult.workspaceId,
        botId: actionResult.botId,
        taskId: actionResult.taskId,
        approvalId: approvalId ?? actionResult.leaseIdempotencyKey,
        correlationId: actionResult.correlationId,
        actionType: actionResult.actionType,
        actionStatus: actionResult.status,
        riskLevel: actionResult.riskLevel,
        route: actionResult.route,
        executionStartedAt: startedAt,
        executionCompletedAt: completedAt,
        executionDurationMs: durationMs,
        executionLogs: executionLogs.slice(-50), // Keep last 50 logs for evidence
        qualityGateResults,
        actionOutcome,
        connectorUsed: actionResult.route === 'execute' ? 'local_workspace' : undefined,
        connectorStatus: actionResult.route === 'execute' ? 'local' : undefined,
        actorId: actionResult.actorId,
        approvalReason: actionResult.routeReason,
    };
};

/**
 * Extract execution logs from a plain-text log buffer (used during runtime execution).
 */
export const extractExecutionLogsFromBuffer = (logBuffer: string): ExecutionLogEntry[] => {
    if (!logBuffer) {
        return [];
    }

    const lines = logBuffer.split('\n').filter((line) => line.trim());
    const logs: ExecutionLogEntry[] = [];

    for (const line of lines) {
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\s+\[(\w+)\]\s+(.+)$/);
        if (match) {
            const [, timestamp, level, message] = match;
            logs.push({
                timestamp: timestamp!,
                level: (level?.toLowerCase() ?? 'info') as
                    | 'info'
                    | 'warn'
                    | 'error'
                    | 'debug',
                message: message!,
            });
        } else {
            // Fallback: parse line as-is
            logs.push({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: line,
            });
        }
    }

    return logs;
};

/**
 * Get a human-readable summary of evidence for audit display.
 */
export const getEvidenceSummary = (evidence: EvidenceRecord): string => {
    const parts: string[] = [];

    parts.push(`Action: ${evidence.actionType}`);
    parts.push(`Status: ${evidence.actionStatus}`);
    parts.push(`Duration: ${evidence.executionDurationMs}ms`);

    if (evidence.qualityGateResults.length > 0) {
        const checks = evidence.qualityGateResults
            .map((check) => `${check.checkType} ${check.status}`)
            .join(', ');
        parts.push(`Quality: ${checks}`);
    }

    if (!evidence.actionOutcome.success && evidence.actionOutcome.errorReason) {
        parts.push(`Error: ${evidence.actionOutcome.errorReason}`);
    }

    return parts.join(' | ');
};
