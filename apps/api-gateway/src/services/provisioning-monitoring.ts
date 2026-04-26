export const PROVISIONING_SLA_TARGET_MS = 10 * 60_000;
export const PROVISIONING_STUCK_ALERT_MS = 60 * 60_000;
export const PROVISIONING_TIMEOUT_MS = 24 * 60 * 60_000;
export const STUCK_ALERT_COOLDOWN_MS = 15 * 60_000;

export const ACTIVE_WORK_STATES = [
    'queued',
    'validating',
    'creating_resources',
    'bootstrapping_vm',
    'starting_container',
    'registering_runtime',
    'healthchecking',
] as const;

export const STUCK_MONITOR_STATES = [
    ...ACTIVE_WORK_STATES,
    'failed',
    'cleanup_pending',
] as const;

export type ActiveWorkState = (typeof ACTIVE_WORK_STATES)[number];
export type StuckMonitorState = (typeof STUCK_MONITOR_STATES)[number];

export interface MonitoringJobLike {
    id: string;
    status: string;
    requestedAt?: Date;
    startedAt?: Date | null;
    updatedAt?: Date;
}

export interface MonitoringActions {
    timedOutJobIds: string[];
    stuckAlertJobIds: string[];
    nextAlertMap: Map<string, number>;
}

export function getJobElapsedMs(job: MonitoringJobLike, nowMs: number): number {
    const anchor = job.startedAt ?? job.requestedAt;
    if (!anchor) {
        return 0;
    }
    return Math.max(0, nowMs - anchor.getTime());
}

export function getJobStuckMs(job: MonitoringJobLike, nowMs: number): number {
    if (!job.updatedAt) {
        return 0;
    }
    return Math.max(0, nowMs - job.updatedAt.getTime());
}

export function evaluateMonitoringActions(
    jobs: MonitoringJobLike[],
    nowMs: number,
    alertMap: Map<string, number>,
): MonitoringActions {
    const timedOutJobIds: string[] = [];
    const stuckAlertJobIds: string[] = [];
    const nextAlertMap = new Map(alertMap);

    for (const job of jobs) {
        const elapsedMs = getJobElapsedMs(job, nowMs);
        const stuckMs = getJobStuckMs(job, nowMs);

        if (ACTIVE_WORK_STATES.includes(job.status as ActiveWorkState) && elapsedMs > PROVISIONING_TIMEOUT_MS) {
            timedOutJobIds.push(job.id);
            continue;
        }

        if (STUCK_MONITOR_STATES.includes(job.status as StuckMonitorState) && stuckMs > PROVISIONING_STUCK_ALERT_MS) {
            const lastAlertTs = nextAlertMap.get(job.id) ?? 0;
            if (nowMs - lastAlertTs >= STUCK_ALERT_COOLDOWN_MS) {
                stuckAlertJobIds.push(job.id);
                nextAlertMap.set(job.id, nowMs);
            }
            continue;
        }

        // Keep map bounded for jobs not currently stuck.
        nextAlertMap.delete(job.id);
    }

    return {
        timedOutJobIds,
        stuckAlertJobIds,
        nextAlertMap,
    };
}
