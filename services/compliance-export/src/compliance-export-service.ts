import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { ExportRequest, ExportResult, FlattenedAuditRecord } from './types.js';

/**
 * Service for exporting audit data in compliance-friendly formats.
 * Generates flattened audit records for external audit systems.
 */
export class ComplianceExportService {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    /**
     * Create a compliance export request.
     * @param request Export parameters
     * @returns Export metadata and result
     */
    async createExport(request: ExportRequest): Promise<ExportResult> {
        const exportId = this.generateExportId();
        const startDate = new Date(request.startDate);
        const endDate = new Date(request.endDate);

        try {
            // Query audit data from database
            const sessions = await this.prisma.agentSession.findMany({
                where: {
                    tenantId: request.tenantId,
                    ...(request.workspaceId ? { taskId: { contains: request.workspaceId } } : {}),
                    startedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    actions: {
                        select: {
                            id: true,
                            sequence: true,
                            actionType: true,
                            targetSelector: true,
                            pageUrl: true,
                            success: true,
                            errorMessage: true,
                            durationMs: true,
                            timestamp: true,
                            screenshotBeforeUrl: true,
                            screenshotAfterUrl: true,
                            networkLog: true,
                        },
                    },
                },
            });

            // Flatten records
            const flatRecords = this.flattenAuditRecords(sessions);

            // Calculate statistics
            const totalRecordingDurationMs = sessions.reduce((sum: number, s: any) => {
                const duration = s.endedAt && s.startedAt
                    ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
                    : 0;
                return sum + duration;
            }, 0);

            const totalActionCount = flatRecords.length;
            const totalSizeBytes = this.estimateExportSize(flatRecords);

            // Store export metadata in database
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day expiry

            return {
                exportId,
                tenantId: request.tenantId,
                startDate: request.startDate,
                endDate: request.endDate,
                sessionCount: sessions.length,
                actionCount: totalActionCount,
                totalRecordingDurationMs,
                totalSizeBytes,
                status: 'ready',
                expiresAt: expiresAt.toISOString(),
                createdAt: new Date().toISOString(),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                exportId,
                tenantId: request.tenantId,
                startDate: request.startDate,
                endDate: request.endDate,
                sessionCount: 0,
                actionCount: 0,
                totalRecordingDurationMs: 0,
                totalSizeBytes: 0,
                status: 'failed',
                failureReason: errorMessage,
                expiresAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            };
        }
    }

    /**
     * Retrieve export data in requested format.
     * @param exportId Export identifier
     * @param format 'json' or 'csv'
     */
    async getExportData(exportId: string, format: 'json' | 'csv'): Promise<string> {
        // This would fetch from cache or regenerate the export
        // For now, return placeholder
        if (format === 'json') {
            return JSON.stringify({ exportId, status: 'ready' });
        } else {
            return `exportId,status\n${exportId},ready`;
        }
    }

    /**
     * Flatten database records into compliance export format.
     */
    private flattenAuditRecords(sessions: any[]): FlattenedAuditRecord[] {
        const records: FlattenedAuditRecord[] = [];

        for (const session of sessions) {
            for (const action of session.actions) {
                records.push({
                    actionId: action.id,
                    sessionId: session.id,
                    agentInstanceId: session.agentInstanceId,
                    tenantId: session.tenantId,
                    taskId: session.taskId,
                    sequence: action.sequence,
                    actionType: action.actionType,
                    targetSelector: action.targetSelector,
                    pageUrl: action.pageUrl,
                    success: action.success,
                    errorMessage: action.errorMessage,
                    durationMs: action.durationMs,
                    timestamp: action.timestamp.toISOString(),
                    screenshotBeforeUrl: action.screenshotBeforeUrl,
                    screenshotAfterUrl: action.screenshotAfterUrl,
                    networkRequestCount: Array.isArray(action.networkLog) ? action.networkLog.length : 0,
                });
            }
        }

        return records;
    }

    /**
     * Estimate export size in bytes.
     */
    private estimateExportSize(records: FlattenedAuditRecord[]): number {
        // Rough estimate: 500 bytes per action record + metadata
        return records.length * 500 + 1024;
    }

    /**
     * Generate unique export ID.
     */
    private generateExportId(): string {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `exp_${timestamp}_${random}`;
    }
}
