import type { ProvisioningJobRecord, ProvisioningJobStatus } from "@agentfarm/shared-types";
import { canTransition } from "./state-machine.js";

export type ProvisioningProcessingEvent = {
    jobId: string;
    correlationId: string;
    from: ProvisioningJobStatus;
    to: ProvisioningJobStatus;
    at: string;
    reason?: string;
};

export interface ProvisioningJobRepository {
    listQueued(limit: number): Promise<ProvisioningJobRecord[]>;
    claimJob(jobId: string): Promise<ProvisioningJobRecord | null>;
    updateJobStatus(input: {
        jobId: string;
        status: ProvisioningJobStatus;
        reason?: string;
        startedAt?: string;
        completedAt?: string;
        failureReason?: string;
        remediationHint?: string;
        cleanupResult?: string;
    }): Promise<ProvisioningJobRecord>;
    markRuntimeReady(botId: string): Promise<void>;
    markRuntimeFailed(botId: string): Promise<void>;
    markWorkspaceProvisioningCompleted(workspaceId: string): Promise<void>;
    markWorkspaceProvisioningFailed(workspaceId: string): Promise<void>;
    markTenantReady(tenantId: string): Promise<void>;
    markTenantDegraded(tenantId: string): Promise<void>;
    markBotActive(botId: string): Promise<void>;
    markBotFailed(botId: string): Promise<void>;
    appendEvent(event: ProvisioningProcessingEvent): Promise<void>;
}

export interface ProvisioningStepExecutor {
    validateTenant(job: ProvisioningJobRecord): Promise<void>;
    createResources(job: ProvisioningJobRecord): Promise<void>;
    bootstrapVm(job: ProvisioningJobRecord): Promise<void>;
    startContainer(job: ProvisioningJobRecord): Promise<void>;
    registerRuntime(job: ProvisioningJobRecord): Promise<void>;
    healthCheck(job: ProvisioningJobRecord): Promise<void>;
    cleanupResources(job: ProvisioningJobRecord): Promise<void>;
}

const STEP_CHAIN: Array<{
    state: ProvisioningJobStatus;
    next: ProvisioningJobStatus;
    run: (executor: ProvisioningStepExecutor, job: ProvisioningJobRecord) => Promise<void>;
}> = [
        { state: "validating", next: "creating_resources", run: (e, j) => e.validateTenant(j) },
        { state: "creating_resources", next: "bootstrapping_vm", run: (e, j) => e.createResources(j) },
        { state: "bootstrapping_vm", next: "starting_container", run: (e, j) => e.bootstrapVm(j) },
        { state: "starting_container", next: "registering_runtime", run: (e, j) => e.startContainer(j) },
        { state: "registering_runtime", next: "healthchecking", run: (e, j) => e.registerRuntime(j) },
        { state: "healthchecking", next: "completed", run: (e, j) => e.healthCheck(j) },
    ];

const remediationHint = (state: ProvisioningJobStatus): string => {
    const hints: Record<ProvisioningJobStatus, string> = {
        queued: "Worker did not pick up queued job. Verify processor health.",
        validating: "Tenant validation failed. Verify plan and tenant limits.",
        creating_resources: "Resource creation failed. Check cloud quota and region capacity.",
        bootstrapping_vm: "VM bootstrap failed. Check startup scripts and VM diagnostics.",
        starting_container: "Container start failed. Check image and runtime configuration.",
        registering_runtime: "Runtime registration failed. Check network egress and endpoint config.",
        healthchecking: "Health check failed. Verify service responds on expected endpoint.",
        completed: "No remediation needed.",
        failed: "Retry provisioning after investigating failure logs.",
        cleanup_pending: "Cleanup pending; verify cloud resources are removed.",
        cleaned_up: "Cleanup completed.",
    };
    return hints[state];
};

export class ProvisioningJobProcessor {
    constructor(
        private readonly repository: ProvisioningJobRepository,
        private readonly executor: ProvisioningStepExecutor,
        private readonly maxParallel = 3,
    ) { }

    async processOnce(): Promise<{ processed: number; failed: number; completed: number }> {
        const queuedJobs = await this.repository.listQueued(this.maxParallel);
        let processed = 0;
        let failed = 0;
        let completed = 0;

        for (const queuedJob of queuedJobs) {
            const claimed = await this.repository.claimJob(queuedJob.id);
            if (!claimed) {
                continue;
            }

            processed += 1;
            const result = await this.processClaimedJob(claimed);
            if (result === "failed") {
                failed += 1;
            }
            if (result === "completed") {
                completed += 1;
            }
        }

        return { processed, failed, completed };
    }

    private async processClaimedJob(job: ProvisioningJobRecord): Promise<"completed" | "failed"> {
        let current = await this.transition(job, "validating", {
            startedAt: new Date().toISOString(),
            reason: "Job claimed by provisioning processor.",
        });

        for (const step of STEP_CHAIN) {
            try {
                await step.run(this.executor, current);
            } catch (error) {
                await this.handleFailure(current, step.state, error);
                return "failed";
            }

            current = await this.transition(current, step.next, {
                reason: `State transition: ${step.state} -> ${step.next}`,
                completedAt: step.next === "completed" ? new Date().toISOString() : undefined,
            });
        }

        await this.repository.markRuntimeReady(current.botId);
        await this.repository.markWorkspaceProvisioningCompleted(current.workspaceId);
        await this.repository.markTenantReady(current.tenantId);
        await this.repository.markBotActive(current.botId);

        return "completed";
    }

    private async handleFailure(
        job: ProvisioningJobRecord,
        failedAt: ProvisioningJobStatus,
        error: unknown,
    ): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);

        let current = await this.transition(job, "failed", {
            completedAt: new Date().toISOString(),
            failureReason: `[${failedAt}] ${message}`,
            remediationHint: remediationHint(failedAt),
            reason: `Provisioning failed at ${failedAt}`,
        });

        await this.repository.markRuntimeFailed(current.botId);
        await this.repository.markWorkspaceProvisioningFailed(current.workspaceId);
        await this.repository.markTenantDegraded(current.tenantId);
        await this.repository.markBotFailed(current.botId);

        current = await this.transition(current, "cleanup_pending", {
            reason: "Cleanup requested after failure.",
        });

        try {
            await this.executor.cleanupResources(current);
            await this.transition(current, "cleaned_up", {
                reason: "Cleanup completed.",
                cleanupResult: "Resources deprovisioned after failed provisioning.",
                completedAt: new Date().toISOString(),
            });
        } catch (cleanupError) {
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            await this.repository.updateJobStatus({
                jobId: current.id,
                status: "cleanup_pending",
                cleanupResult: `Cleanup retry required: ${cleanupMessage}`,
                reason: "Cleanup attempt failed; job left in cleanup_pending.",
            });
        }
    }

    private async transition(
        job: ProvisioningJobRecord,
        nextStatus: ProvisioningJobStatus,
        extra?: {
            reason?: string;
            startedAt?: string;
            completedAt?: string;
            failureReason?: string;
            remediationHint?: string;
            cleanupResult?: string;
        },
    ): Promise<ProvisioningJobRecord> {
        const from = job.status;
        if (!canTransition(from, nextStatus) && from !== nextStatus) {
            throw new Error(`Invalid provisioning transition: ${from} -> ${nextStatus}`);
        }

        const updated = await this.repository.updateJobStatus({
            jobId: job.id,
            status: nextStatus,
            reason: extra?.reason,
            startedAt: extra?.startedAt,
            completedAt: extra?.completedAt,
            failureReason: extra?.failureReason,
            remediationHint: extra?.remediationHint,
            cleanupResult: extra?.cleanupResult,
        });

        await this.repository.appendEvent({
            jobId: job.id,
            correlationId: job.correlationId,
            from,
            to: nextStatus,
            at: new Date().toISOString(),
            reason: extra?.reason,
        });

        return updated;
    }
}
