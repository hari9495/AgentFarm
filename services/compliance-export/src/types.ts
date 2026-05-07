/**
 * Request for audit data export.
 */
export interface ExportRequest {
    tenantId: string;
    workspaceId?: string;        // Optional: narrow to workspace
    startDate: string;           // ISO 8601
    endDate: string;             // ISO 8601
    includeScreenshots: boolean;
    includeRecordings: boolean;
    includeNetworkLogs: boolean;
    format: 'json' | 'csv';
}

/**
 * Result of compliance export.
 */
export interface ExportResult {
    exportId: string;            // Unique export identifier
    tenantId: string;
    startDate: string;
    endDate: string;
    sessionCount: number;
    actionCount: number;
    totalRecordingDurationMs: number;
    totalSizeBytes: number;
    downloadUrl?: string;        // Signed URL for download (if applicable)
    status: 'generating' | 'ready' | 'expired' | 'failed';
    failureReason?: string;
    expiresAt: string;           // ISO 8601
    createdAt: string;
}

/**
 * Flattened audit record for export.
 */
export interface FlattenedAuditRecord {
    actionId: string;
    sessionId: string;
    agentInstanceId: string;
    tenantId: string;
    taskId: string;
    sequence: number;
    actionType: string;
    targetSelector: string;
    pageUrl: string;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
    timestamp: string;
    screenshotBeforeUrl?: string;
    screenshotAfterUrl?: string;
    networkRequestCount: number;
}
