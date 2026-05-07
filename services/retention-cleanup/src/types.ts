/**
 * Statistics from a cleanup job run.
 */
export interface CleanupStats {
    jobId: string;
    tenantId?: string;           // If tenant-scoped
    sessionsScanned: number;
    sessionsDeleted: number;
    artifactsDeleted: number;
    totalBytesFreed: number;
    failedDeletions: number;
    errors: string[];
    startedAt: string;
    completedAt: string;
    durationMs: number;
}
