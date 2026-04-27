export type RuntimeLogEntry = {
    at: string;
    eventType: string;
    runtimeState: string;
    tenantId?: string | null;
    workspaceId?: string | null;
    botId?: string | null;
    correlationId?: string | null;
    details?: Record<string, unknown> | null;
};

export const filterRuntimeLogs = (logs: RuntimeLogEntry[], filter: string): RuntimeLogEntry[] => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) {
        return logs;
    }

    return logs.filter((log) => (
        log.eventType.toLowerCase().includes(normalized)
        || log.runtimeState.toLowerCase().includes(normalized)
        || (log.correlationId ?? '').toLowerCase().includes(normalized)
    ));
};

export const computeHeartbeatSuccessRate = (
    heartbeatSent: number | undefined,
    heartbeatFailed: number | undefined,
): number | null => {
    const sent = heartbeatSent ?? 0;
    const failed = heartbeatFailed ?? 0;
    const total = sent + failed;

    if (total <= 0) {
        return null;
    }

    return Math.round((sent / total) * 100);
};
