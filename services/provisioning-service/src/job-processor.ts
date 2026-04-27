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

export type ProvisioningExecutionContext = {
    resourceGroupName?: string;
    vmName?: string;
    vmPrivateIp?: string;
    containerEndpoint?: string;
    bootstrapScriptBase64?: string;
    cleanupPlan?: CleanupAction[];
};

export type CleanupAction =
    | "deprovision_vm"
    | "delete_storage"
    | "delete_network"
    | "delete_resource_group";

export interface ProvisioningJobRepository {
    listQueued(limit: number): Promise<ProvisioningJobRecord[]>;
    listCleanupPending(limit: number): Promise<ProvisioningJobRecord[]>;
    listActive(limit: number): Promise<ProvisioningJobRecord[]>;
    claimJob(jobId: string): Promise<ProvisioningJobRecord | null>;
    claimCleanupJob(jobId: string): Promise<ProvisioningJobRecord | null>;
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
    validateTenant(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    createResources(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    bootstrapVm(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    startContainer(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    registerRuntime(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    healthCheck(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext | void>;
    cleanupResources(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<void>;
}

const STEP_CHAIN: Array<{
    state: ProvisioningJobStatus;
    next: ProvisioningJobStatus;
    run: (
        executor: ProvisioningStepExecutor,
        job: ProvisioningJobRecord,
        context: ProvisioningExecutionContext,
    ) => Promise<ProvisioningExecutionContext | void>;
}> = [
        { state: "validating", next: "creating_resources", run: (e, j, c) => e.validateTenant(j, c) },
        { state: "creating_resources", next: "bootstrapping_vm", run: (e, j, c) => e.createResources(j, c) },
        { state: "bootstrapping_vm", next: "starting_container", run: (e, j, c) => e.bootstrapVm(j, c) },
        { state: "starting_container", next: "registering_runtime", run: (e, j, c) => e.startContainer(j, c) },
        { state: "registering_runtime", next: "healthchecking", run: (e, j, c) => e.registerRuntime(j, c) },
        { state: "healthchecking", next: "completed", run: (e, j, c) => e.healthCheck(j, c) },
    ];

const remediationHint = (state: ProvisioningJobStatus): string => {
    const hints: Record<ProvisioningJobStatus, string> = {
        queued: "Provisioning queue is delayed. Open dashboard deployments and retry if this persists.",
        validating: "Validation failed. Review tenant limits and then retry from dashboard deployments.",
        creating_resources: "Resource creation failed. Verify Azure quota/capacity, then retry from dashboard deployments.",
        bootstrapping_vm: "VM bootstrap failed. Check VM diagnostics and rerun provisioning from dashboard.",
        starting_container: "Container startup failed. Validate image/runtime config and retry from dashboard deployments.",
        registering_runtime: "Runtime registration failed. Check network egress and retry from dashboard deployments.",
        healthchecking: "Runtime health check failed. Check container logs and retry from dashboard deployments.",
        completed: "No remediation needed.",
        failed: "Provisioning failed. Open dashboard deployments to retry and contact support if repeated.",
        cleanup_pending: "Cleanup is in progress. Dashboard will show when resources are fully removed.",
        cleaned_up: "Cleanup completed. Safe to retry provisioning from dashboard.",
    };
    return hints[state];
};

const cleanupPlanForFailureState = (failedAt: ProvisioningJobStatus): CleanupAction[] => {
    if (failedAt === "queued" || failedAt === "validating") {
        return ["delete_resource_group"];
    }
    if (failedAt === "creating_resources") {
        return ["delete_network", "delete_storage", "delete_resource_group"];
    }
    if (
        failedAt === "bootstrapping_vm"
        || failedAt === "starting_container"
        || failedAt === "registering_runtime"
        || failedAt === "healthchecking"
    ) {
        return ["deprovision_vm", "delete_storage", "delete_network", "delete_resource_group"];
    }
    return ["delete_resource_group"];
};

const SLA_TARGET_MS = 10 * 60 * 1000;
const STUCK_ALERT_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

type ProcessOnceResult = {
    processed: number;
    failed: number;
    completed: number;
    slaBreaches: number;
    timeoutRemediations: number;
    stuckAlerts: number;
};

export class ProvisioningJobProcessor {
    constructor(
        private readonly repository: ProvisioningJobRepository,
        private readonly executor: ProvisioningStepExecutor,
        private readonly maxParallel = 3,
    ) { }

    async processOnce(): Promise<ProcessOnceResult> {
        const queuedJobs = await this.repository.listQueued(this.maxParallel);
        const cleanupJobs = await this.repository.listCleanupPending(this.maxParallel);
        const activeJobs = await this.repository.listActive(this.maxParallel * 4);
        let processed = 0;
        let failed = 0;
        let completed = 0;
        let slaBreaches = 0;
        let timeoutRemediations = 0;
        let stuckAlerts = 0;
        const remediatedJobIds = new Set<string>();

        for (const activeJob of activeJobs) {
            const elapsedMs = this.getElapsedMs(activeJob);
            if (elapsedMs >= STUCK_ALERT_MS) {
                stuckAlerts += 1;
                await this.repository.appendEvent({
                    jobId: activeJob.id,
                    correlationId: activeJob.correlationId,
                    from: activeJob.status,
                    to: activeJob.status,
                    at: new Date().toISOString(),
                    reason: `ALERT: provisioning job stuck in ${activeJob.status} for ${Math.floor(elapsedMs / 1000)} seconds`,
                });
            }

            if (elapsedMs >= TIMEOUT_MS) {
                timeoutRemediations += 1;
                processed += 1;
                failed += 1;
                remediatedJobIds.add(activeJob.id);

                let timeoutJob = activeJob;
                if (activeJob.status === "queued") {
                    timeoutJob = await this.transition(activeJob, "validating", {
                        startedAt: new Date().toISOString(),
                        reason: "Timeout remediation claimed queued job for failure handling.",
                    });
                }

                await this.handleFailure(
                    timeoutJob,
                    timeoutJob.status,
                    new Error("Provisioning timeout exceeded 24 hours; auto-remediation initiated."),
                    {
                        failureCode: "timeout_exceeded_24h",
                        remediationHintOverride:
                            "Provisioning exceeded 24 hours and auto-remediation started. Review quota/capacity, then retry from dashboard deployments.",
                    },
                );
            }
        }

        for (const cleanupJob of cleanupJobs) {
            const claimedCleanup = await this.repository.claimCleanupJob(cleanupJob.id);
            if (!claimedCleanup) {
                continue;
            }
            processed += 1;
            const cleanupResult = await this.processCleanupPendingJob(claimedCleanup);
            if (cleanupResult === "completed") {
                completed += 1;
            }
        }

        for (const queuedJob of queuedJobs) {
            if (remediatedJobIds.has(queuedJob.id)) {
                continue;
            }
            const claimed = await this.repository.claimJob(queuedJob.id);
            if (!claimed) {
                continue;
            }

            processed += 1;
            const result = await this.processClaimedJob(claimed);
            if (result.status === "failed") {
                failed += 1;
            }
            if (result.status === "completed") {
                completed += 1;
            }
            if (result.slaBreached) {
                slaBreaches += 1;
            }
        }

        return { processed, failed, completed, slaBreaches, timeoutRemediations, stuckAlerts };
    }

    private async processCleanupPendingJob(job: ProvisioningJobRecord): Promise<"completed"> {
        await this.repository.appendEvent({
            jobId: job.id,
            correlationId: job.correlationId,
            from: "cleanup_pending",
            to: "cleanup_pending",
            at: new Date().toISOString(),
            reason: "Cleanup retry picked up by provisioning processor.",
        });

        const fallbackContext: ProvisioningExecutionContext = {
            cleanupPlan: ["deprovision_vm", "delete_storage", "delete_network", "delete_resource_group"],
        };

        try {
            await this.executor.cleanupResources(job, fallbackContext);
            await this.transition(job, "cleaned_up", {
                reason: "Cleanup retry completed.",
                cleanupResult: "Resources deprovisioned after retry cleanup.",
                completedAt: new Date().toISOString(),
            });
        } catch (cleanupError) {
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            await this.repository.updateJobStatus({
                jobId: job.id,
                status: "cleanup_pending",
                cleanupResult: `Cleanup retry required: ${cleanupMessage}`,
                reason: "Cleanup retry failed; job remains cleanup_pending.",
            });
        }

        return "completed";
    }

    private async processClaimedJob(job: ProvisioningJobRecord): Promise<{ status: "completed" | "failed"; slaBreached: boolean }> {
        let current = await this.transition(job, "validating", {
            startedAt: new Date().toISOString(),
            reason: "Job claimed by provisioning processor.",
        });

        let executionContext: ProvisioningExecutionContext = {};

        for (const step of STEP_CHAIN) {
            try {
                const stepContext = await step.run(this.executor, current, executionContext);
                if (stepContext) {
                    executionContext = {
                        ...executionContext,
                        ...stepContext,
                    };
                }
            } catch (error) {
                await this.handleFailure(current, step.state, error);
                return { status: "failed", slaBreached: false };
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

        const elapsedMs = this.getElapsedMs(current);
        const slaBreached = elapsedMs > SLA_TARGET_MS;
        await this.repository.appendEvent({
            jobId: current.id,
            correlationId: current.correlationId,
            from: "completed",
            to: "completed",
            at: new Date().toISOString(),
            reason: `SLA metric: elapsed_ms=${elapsedMs}; target_ms=${SLA_TARGET_MS}; status=${slaBreached ? "breached" : "within_target"}`,
        });

        if (slaBreached) {
            await this.repository.appendEvent({
                jobId: current.id,
                correlationId: current.correlationId,
                from: "completed",
                to: "completed",
                at: new Date().toISOString(),
                reason: `ALERT: provisioning latency breached 10 minute target (${Math.floor(elapsedMs / 1000)} seconds)`,
            });
        }

        return { status: "completed", slaBreached };
    }

    private async handleFailure(
        job: ProvisioningJobRecord,
        failedAt: ProvisioningJobStatus,
        error: unknown,
        overrides?: {
            failureCode?: string;
            remediationHintOverride?: string;
        },
    ): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);

        let current = await this.transition(job, "failed", {
            completedAt: new Date().toISOString(),
            failureReason: overrides?.failureCode ? `[${failedAt}] ${overrides.failureCode}: ${message}` : `[${failedAt}] ${message}`,
            remediationHint: overrides?.remediationHintOverride ?? remediationHint(failedAt),
            reason: `Provisioning failed at ${failedAt}`,
        });

        if (
            failedAt === "bootstrapping_vm"
            || failedAt === "starting_container"
            || failedAt === "registering_runtime"
            || failedAt === "healthchecking"
        ) {
            await this.repository.markRuntimeFailed(current.botId);
        }
        await this.repository.markWorkspaceProvisioningFailed(current.workspaceId);
        await this.repository.markTenantDegraded(current.tenantId);
        await this.repository.markBotFailed(current.botId);

        const cleanupPlan = cleanupPlanForFailureState(failedAt);
        await this.repository.appendEvent({
            jobId: current.id,
            correlationId: current.correlationId,
            from: "failed",
            to: "failed",
            at: new Date().toISOString(),
            reason: `Rollback plan: ${cleanupPlan.join(", ")}`,
        });

        current = await this.transition(current, "cleanup_pending", {
            reason: "Cleanup requested after failure.",
        });

        try {
            await this.executor.cleanupResources(current, {
                cleanupPlan,
            });
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

    private getElapsedMs(job: ProvisioningJobRecord): number {
        const startIso = job.requestedAt;
        const startedMs = Date.parse(startIso);
        if (Number.isNaN(startedMs)) {
            return 0;
        }
        return Math.max(0, Date.now() - startedMs);
    }
}
