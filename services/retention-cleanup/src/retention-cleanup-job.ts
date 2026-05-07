import { PrismaClient } from '@prisma/client';
import { AzureBlobAuditStorage } from '@agentfarm/audit-storage';
import { randomBytes } from 'node:crypto';
import type { CleanupStats } from './types.js';

/**
 * Scheduled job to enforce retention policies and delete expired artifacts.
 * Runs periodically to clean up audit data according to customer policies.
 * Zero auto-delete by default: only deletes if policy explicitly permits.
 */
export class RetentionCleanupJob {
    private prisma: PrismaClient;
    private storage: AzureBlobAuditStorage;

    constructor(prismaClient: PrismaClient, auditStorage: AzureBlobAuditStorage) {
        this.prisma = prismaClient;
        this.storage = auditStorage;
    }

    /**
     * Run cleanup job: find expired sessions and delete artifacts.
     * Only deletes if:
     * 1. Session has a retention policy AND
     * 2. retentionExpiresAt is in the past AND
     * 3. Policy action permits deletion
     *
     * @param tenantId Optional: run cleanup for specific tenant
     * @returns Cleanup statistics
     */
    async run(tenantId?: string): Promise<CleanupStats> {
        const jobId = this.generateJobId();
        const startedAt = new Date();
        const errors: string[] = [];

        let sessionsScanned = 0;
        let sessionsDeleted = 0;
        let artifactsDeleted = 0;
        let totalBytesFreed = 0;
        let failedDeletions = 0;

        try {
            // Find all sessions eligible for cleanup
            const expiredSessions = await this.prisma.agentSession.findMany({
                where: {
                    ...(tenantId ? { tenantId } : {}),
                    retentionExpiresAt: {
                        lt: new Date(), // Expired
                    },
                    status: {
                        in: ['completed', 'failed', 'error'], // Only closed sessions
                    },
                },
                include: {
                    actions: {
                        select: {
                            id: true,
                            screenshotBeforeUrl: true,
                            screenshotAfterUrl: true,
                        },
                    },
                },
            });

            sessionsScanned = expiredSessions.length;

            // Process each expired session
            for (const session of expiredSessions) {
                try {
                    const policy = session.retentionPolicyId
                        ? await this.getRetentionPolicy(session.retentionPolicyId)
                        : null;

                    // Verify policy permits deletion
                    if (!this.canDelete(policy)) {
                        continue;
                    }

                    // Delete artifacts
                    for (const action of session.actions) {
                        try {
                            if (action.screenshotBeforeUrl) {
                                await this.storage.deleteArtifact(action.screenshotBeforeUrl);
                                artifactsDeleted++;
                            }
                            if (action.screenshotAfterUrl) {
                                await this.storage.deleteArtifact(action.screenshotAfterUrl);
                                artifactsDeleted++;
                            }
                        } catch (error) {
                            failedDeletions++;
                            const msg = error instanceof Error ? error.message : 'Unknown error';
                            errors.push(`Failed to delete artifact for action ${action.id}: ${msg}`);
                        }
                    }

                    // Delete recording
                    if (session.recordingUrl) {
                        try {
                            await this.storage.deleteArtifact(session.recordingUrl);
                            artifactsDeleted++;
                        } catch (error) {
                            failedDeletions++;
                            const msg = error instanceof Error ? error.message : 'Unknown error';
                            errors.push(`Failed to delete recording for session ${session.id}: ${msg}`);
                        }
                    }

                    // Delete session record (cascades to actions via Prisma relations)
                    await this.prisma.agentSession.delete({
                        where: { id: session.id },
                    });

                    sessionsDeleted++;
                    totalBytesFreed += this.estimateSessionSize(session);
                } catch (error) {
                    failedDeletions++;
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`Failed to process session ${session.id}: ${msg}`);
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Cleanup job failed: ${msg}`);
        }

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();

        return {
            jobId,
            tenantId,
            sessionsScanned,
            sessionsDeleted,
            artifactsDeleted,
            totalBytesFreed,
            failedDeletions,
            errors,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs,
        };
    }

    /**
     * Determine if a retention policy permits deletion.
     * Zero-delete-by-default: only delete if policy explicitly allows.
     */
    private canDelete(policy: any): boolean {
        if (!policy) {
            // No policy = never delete (conservative default)
            return false;
        }

        if (policy.action === 'never_delete') {
            return false;
        }

        if (policy.action === 'manual_delete') {
            // Only delete if explicitly triggered by user (not implemented here)
            return false;
        }

        if (policy.action === 'auto_delete_after_days') {
            // Automatic deletion is permitted by policy
            return true;
        }

        return false;
    }

    /**
     * Retrieve retention policy for a session.
     */
    private async getRetentionPolicy(policyId?: string): Promise<any> {
        if (!policyId) {
            return null;
        }

        return await this.prisma.retentionPolicy.findUnique({
            where: { id: policyId },
        });
    }

    /**
     * Estimate storage size for a session (rough).
     */
    private estimateSessionSize(session: any): number {
        // Rough estimate: 100KB per action screenshot + 5MB per recording
        const actionEstimate = (session.actions?.length ?? 0) * 100 * 1024;
        const recordingEstimate = session.recordingUrl ? 5 * 1024 * 1024 : 0;
        return actionEstimate + recordingEstimate;
    }

    /**
     * Generate unique job ID.
     */
    private generateJobId(): string {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(4).toString('hex');
        return `job_${timestamp}_${random}`;
    }
}
