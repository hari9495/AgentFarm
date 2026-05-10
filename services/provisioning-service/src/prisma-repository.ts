import type { PrismaClient } from "@prisma/client";
import type { ProvisioningJobRecord, ProvisioningJobStatus } from "@agentfarm/shared-types";
import { CONTRACT_VERSIONS } from "@agentfarm/shared-types";
import type {
    ProvisioningJobRepository,
    ProvisioningProcessingEvent,
} from "./job-processor.js";

/**
 * Maps a raw Prisma ProvisioningJob row to the shared-type ProvisioningJobRecord shape.
 * contractVersion is not persisted in the DB; it is always set to the canonical value.
 */
function mapJob(row: {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    planId: string;
    runtimeTier: string;
    roleType: string;
    correlationId: string;
    triggerSource: string;
    status: ProvisioningJobStatus;
    failureReason: string | null;
    remediationHint: string | null;
    cleanupResult: string | null;
    requestedAt: Date;
    requestedBy: string;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
}): ProvisioningJobRecord {
    return {
        contractVersion: CONTRACT_VERSIONS.PROVISIONING,
        id: row.id,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        botId: row.botId,
        planId: row.planId,
        runtimeTier: row.runtimeTier,
        roleType: row.roleType,
        correlationId: row.correlationId,
        triggerSource: row.triggerSource,
        status: row.status,
        failureReason: row.failureReason ?? undefined,
        remediationHint: row.remediationHint ?? undefined,
        cleanupResult: row.cleanupResult ?? undefined,
        requestedAt: row.requestedAt.toISOString(),
        requestedBy: row.requestedBy,
        startedAt: row.startedAt?.toISOString(),
        completedAt: row.completedAt?.toISOString(),
    };
}

const JOB_SELECT = {
    id: true,
    tenantId: true,
    workspaceId: true,
    botId: true,
    planId: true,
    runtimeTier: true,
    roleType: true,
    correlationId: true,
    triggerSource: true,
    status: true,
    failureReason: true,
    remediationHint: true,
    cleanupResult: true,
    requestedAt: true,
    requestedBy: true,
    startedAt: true,
    completedAt: true,
    failedAt: true,
} as const;

export function createPrismaJobRepository(prisma: PrismaClient): ProvisioningJobRepository {
    return {
        async listQueued(limit) {
            const rows = await prisma.provisioningJob.findMany({
                where: { status: "queued" },
                orderBy: { requestedAt: "asc" },
                take: limit,
                select: JOB_SELECT,
            });
            return rows.map(mapJob);
        },

        async listCleanupPending(limit) {
            const rows = await prisma.provisioningJob.findMany({
                where: { status: "cleanup_pending" },
                orderBy: { requestedAt: "asc" },
                take: limit,
                select: JOB_SELECT,
            });
            return rows.map(mapJob);
        },

        async listActive(limit) {
            const rows = await prisma.provisioningJob.findMany({
                where: {
                    status: {
                        notIn: ["completed", "failed", "cleaned_up"],
                    },
                },
                orderBy: { requestedAt: "asc" },
                take: limit,
                select: JOB_SELECT,
            });
            return rows.map(mapJob);
        },

        /**
         * Atomically claims a queued job by transitioning queued → validating.
         * Returns null if the job was already claimed by another worker.
         */
        async claimJob(jobId) {
            const updated = await prisma.provisioningJob.updateMany({
                where: { id: jobId, status: "queued" },
                data: { status: "validating", startedAt: new Date() },
            });
            if (updated.count === 0) return null;
            const row = await prisma.provisioningJob.findUnique({
                where: { id: jobId },
                select: JOB_SELECT,
            });
            return row ? mapJob(row) : null;
        },

        async claimCleanupJob(jobId) {
            const row = await prisma.provisioningJob.findUnique({
                where: { id: jobId },
                select: JOB_SELECT,
            });
            if (!row || row.status !== "cleanup_pending") return null;
            return mapJob(row);
        },

        async updateJobStatus(input) {
            const data: Record<string, unknown> = { status: input.status };
            if (input.failureReason !== undefined) data["failureReason"] = input.failureReason;
            if (input.remediationHint !== undefined) data["remediationHint"] = input.remediationHint;
            if (input.cleanupResult !== undefined) data["cleanupResult"] = input.cleanupResult;
            if (input.startedAt !== undefined) data["startedAt"] = new Date(input.startedAt);
            if (input.completedAt !== undefined) data["completedAt"] = new Date(input.completedAt);
            if (input.status === "failed") data["failedAt"] = new Date();

            const row = await prisma.provisioningJob.update({
                where: { id: input.jobId },
                data,
                select: JOB_SELECT,
            });
            return mapJob(row);
        },

        async markRuntimeReady(botId) {
            await prisma.runtimeInstance.updateMany({
                where: { botId },
                data: { status: "ready" },
            });
        },

        async markRuntimeFailed(botId) {
            await prisma.runtimeInstance.updateMany({
                where: { botId },
                data: { status: "failed" },
            });
        },

        async markWorkspaceProvisioningCompleted(workspaceId) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: { status: "ready" },
            });
        },

        async markWorkspaceProvisioningFailed(workspaceId) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: { status: "failed" },
            });
        },

        async markTenantReady(tenantId) {
            await prisma.tenant.update({
                where: { id: tenantId },
                data: { status: "ready" },
            });
        },

        async markTenantDegraded(tenantId) {
            await prisma.tenant.update({
                where: { id: tenantId },
                data: { status: "degraded" },
            });
        },

        async markBotActive(botId) {
            await prisma.bot.update({
                where: { workspaceId: botId },
                data: { status: "active" },
            });
        },

        async markBotFailed(botId) {
            await prisma.bot.update({
                where: { workspaceId: botId },
                data: { status: "failed" },
            });
        },

        async appendEvent(event: ProvisioningProcessingEvent) {
            // Log the transition event; no dedicated provisioning events table in schema.
            console.log(
                `[provisioning-event] job=${event.jobId} correlationId=${event.correlationId} ${event.from}→${event.to} at=${event.at}${event.reason ? ` reason=${event.reason}` : ""}`,
            );
        },
    };
}
