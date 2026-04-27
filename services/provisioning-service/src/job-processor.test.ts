import test from "node:test";
import assert from "node:assert/strict";
import type { ProvisioningJobRecord, ProvisioningJobStatus } from "@agentfarm/shared-types";
import {
    ProvisioningJobProcessor,
    type ProvisioningExecutionContext,
    type ProvisioningJobRepository,
    type ProvisioningProcessingEvent,
    type ProvisioningStepExecutor,
} from "./job-processor.js";

type MutableJob = ProvisioningJobRecord & {
    failureReason?: string;
    remediationHint?: string;
    cleanupResult?: string;
};

const makeJob = (overrides?: Partial<MutableJob>): MutableJob => ({
    id: "job_1",
    tenantId: "tnt_1",
    workspaceId: "wsp_1",
    botId: "bot_1",
    planId: "starter",
    runtimeTier: "standard",
    roleType: "developer",
    correlationId: "cor_1",
    triggerSource: "signup_complete",
    status: "queued",
    requestedAt: new Date().toISOString(),
    requestedBy: "user_1",
    ...overrides,
});

const createRepo = (seed: MutableJob[]) => {
    const jobs = new Map(seed.map((job) => [job.id, { ...job }]));
    const events: ProvisioningProcessingEvent[] = [];
    const signals = {
        runtimeReady: 0,
        runtimeFailed: 0,
        workspaceCompleted: 0,
        workspaceFailed: 0,
        tenantReady: 0,
        tenantDegraded: 0,
        botActive: 0,
        botFailed: 0,
    };

    const repo: ProvisioningJobRepository = {
        async listQueued(limit) {
            return [...jobs.values()].filter((job) => job.status === "queued").slice(0, limit);
        },
        async listCleanupPending(limit) {
            return [...jobs.values()].filter((job) => job.status === "cleanup_pending").slice(0, limit);
        },
        async listActive(limit) {
            return [...jobs.values()].filter((job) => !["completed", "failed", "cleaned_up"].includes(job.status)).slice(0, limit);
        },
        async claimJob(jobId) {
            const job = jobs.get(jobId);
            if (!job || job.status !== "queued") {
                return null;
            }
            return { ...job };
        },
        async claimCleanupJob(jobId) {
            const job = jobs.get(jobId);
            if (!job || job.status !== "cleanup_pending") {
                return null;
            }
            return { ...job };
        },
        async updateJobStatus(input) {
            const job = jobs.get(input.jobId);
            if (!job) {
                throw new Error("Job not found");
            }
            const next = {
                ...job,
                status: input.status,
                startedAt: input.startedAt ?? job.startedAt,
                completedAt: input.completedAt ?? job.completedAt,
                failureReason: input.failureReason ?? job.failureReason,
                remediationHint: input.remediationHint ?? job.remediationHint,
                cleanupResult: input.cleanupResult ?? job.cleanupResult,
            } as MutableJob;
            jobs.set(input.jobId, next);
            return { ...next };
        },
        async markRuntimeReady() {
            signals.runtimeReady += 1;
        },
        async markRuntimeFailed() {
            signals.runtimeFailed += 1;
        },
        async markWorkspaceProvisioningCompleted() {
            signals.workspaceCompleted += 1;
        },
        async markWorkspaceProvisioningFailed() {
            signals.workspaceFailed += 1;
        },
        async markTenantReady() {
            signals.tenantReady += 1;
        },
        async markTenantDegraded() {
            signals.tenantDegraded += 1;
        },
        async markBotActive() {
            signals.botActive += 1;
        },
        async markBotFailed() {
            signals.botFailed += 1;
        },
        async appendEvent(event) {
            events.push(event);
        },
    };

    return { repo, jobs, events, signals };
};

const createExecutor = (options?: {
    failAt?: ProvisioningJobStatus;
    cleanupFails?: boolean;
}) => {
    const calls: ProvisioningJobStatus[] = [];
    const contexts: ProvisioningExecutionContext[] = [];

    const maybeFail = async (state: ProvisioningJobStatus, context: ProvisioningExecutionContext) => {
        calls.push(state);
        contexts.push({ ...context });
        if (options?.failAt === state) {
            throw new Error(`forced failure at ${state}`);
        }

        if (state === "creating_resources") {
            return {
                resourceGroupName: "agentfarm-rg",
            };
        }

        if (state === "bootstrapping_vm") {
            return {
                vmName: "agentfarm-vm",
                vmPrivateIp: "10.0.1.10",
            };
        }

        if (state === "starting_container") {
            return {
                containerEndpoint: "http://10.0.1.10:8080",
            };
        }

        return undefined;
    };

    const executor: ProvisioningStepExecutor = {
        validateTenant: async (_job, context) => maybeFail("validating", context),
        createResources: async (_job, context) => maybeFail("creating_resources", context),
        bootstrapVm: async (_job, context) => maybeFail("bootstrapping_vm", context),
        startContainer: async (_job, context) => maybeFail("starting_container", context),
        registerRuntime: async (_job, context) => maybeFail("registering_runtime", context),
        healthCheck: async (_job, context) => maybeFail("healthchecking", context),
        cleanupResources: async () => {
            calls.push("cleanup_pending");
            if (options?.cleanupFails) {
                throw new Error("forced cleanup failure");
            }
        },
    };

    return { executor, calls, contexts };
};

test("processor: completes queued jobs through full happy path", async () => {
    const job = makeJob();
    const { repo, jobs, signals, events } = createRepo([job]);
    const { executor, calls, contexts } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.slaBreaches, 0);
    assert.equal(result.timeoutRemediations, 0);
    assert.equal(result.stuckAlerts, 0);

    const updated = jobs.get(job.id);
    assert.ok(updated);
    assert.equal(updated?.status, "completed");
    assert.equal(signals.runtimeReady, 1);
    assert.equal(signals.workspaceCompleted, 1);
    assert.equal(signals.tenantReady, 1);
    assert.equal(signals.botActive, 1);

    assert.deepEqual(calls, [
        "validating",
        "creating_resources",
        "bootstrapping_vm",
        "starting_container",
        "registering_runtime",
        "healthchecking",
    ]);

    // Context from earlier states is visible in later states.
    assert.equal(contexts[3]?.vmName, "agentfarm-vm");
    assert.equal(contexts[4]?.containerEndpoint, "http://10.0.1.10:8080");

    assert.equal(events.length >= 7, true);
});

test("processor: failure transitions to cleanup and cleaned_up", async () => {
    const job = makeJob({ id: "job_fail" });
    const { repo, jobs, signals } = createRepo([job]);
    const { executor, calls } = createExecutor({ failAt: "creating_resources" });

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    assert.equal(result.completed, 0);
    assert.equal(result.failed, 1);

    const updated = jobs.get(job.id);
    assert.ok(updated);
    assert.equal(updated?.status, "cleaned_up");
    assert.match(updated?.failureReason ?? "", /creating_resources/);
    assert.ok(updated?.remediationHint);

    assert.equal(signals.runtimeFailed, 0);
    assert.equal(signals.workspaceFailed, 1);
    assert.equal(signals.tenantDegraded, 1);
    assert.equal(signals.botFailed, 1);

    assert.equal(calls.includes("cleanup_pending"), true);
});

test("processor: runtime rollback marks runtime failed for late-stage failures", async () => {
    const job = makeJob({ id: "job_runtime_fail" });
    const { repo, signals } = createRepo([job]);
    const { executor } = createExecutor({ failAt: "healthchecking" });

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    await processor.processOnce();

    assert.equal(signals.runtimeFailed, 1);
});

test("processor: cleanup_pending jobs are retried and marked cleaned_up", async () => {
    const cleanupJob = makeJob({
        id: "job_cleanup_retry",
        status: "cleanup_pending",
        failureReason: "[healthchecking] prior failure",
    });

    const { repo, jobs } = createRepo([cleanupJob]);
    const { executor } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    const updated = jobs.get(cleanupJob.id);
    assert.equal(updated?.status, "cleaned_up");
    assert.match(updated?.cleanupResult ?? "", /retry cleanup/i);
});

test("processor: logs rollback plan event for failed jobs", async () => {
    const job = makeJob({ id: "job_rollback_event" });
    const { repo, events } = createRepo([job]);
    const { executor } = createExecutor({ failAt: "bootstrapping_vm" });

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    await processor.processOnce();

    assert.equal(
        events.some((event) => (event.reason ?? "").includes("Rollback plan:")),
        true,
    );
});

test("processor: failed cleanup leaves job in cleanup_pending", async () => {
    const job = makeJob({ id: "job_cleanup_fail" });
    const { repo, jobs } = createRepo([job]);
    const { executor } = createExecutor({ failAt: "healthchecking", cleanupFails: true });

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    assert.equal(result.completed, 0);
    assert.equal(result.failed, 1);

    const updated = jobs.get(job.id);
    assert.ok(updated);
    assert.equal(updated?.status, "cleanup_pending");
    assert.match(updated?.cleanupResult ?? "", /Cleanup retry required/);
});

test("processor: emits SLA breach metric when elapsed time exceeds 10 minutes", async () => {
    const requestedAt = new Date(Date.now() - (11 * 60 * 1000)).toISOString();
    const job = makeJob({ id: "job_sla_breach", requestedAt });
    const { repo, events } = createRepo([job]);
    const { executor } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.completed, 1);
    assert.equal(result.slaBreaches, 1);
    assert.equal(
        events.some((event) => (event.reason ?? "").includes("SLA metric:")),
        true,
    );
    assert.equal(
        events.some((event) => (event.reason ?? "").includes("latency breached 10 minute target")),
        true,
    );
});

test("processor: enforces 24h timeout with auto-remediation", async () => {
    const requestedAt = new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString();
    const job = makeJob({ id: "job_timeout_24h", requestedAt });
    const { repo, jobs } = createRepo([job]);
    const { executor } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.timeoutRemediations, 1);
    const updated = jobs.get(job.id);
    assert.equal(updated?.status, "cleaned_up");
    assert.match(updated?.failureReason ?? "", /timeout_exceeded_24h/);
    assert.match(updated?.remediationHint ?? "", /auto-remediation/i);
});

test("processor: creates stuck-state alert when active job is older than one hour", async () => {
    const requestedAt = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
    const job = makeJob({
        id: "job_stuck_alert",
        status: "cleanup_pending",
        requestedAt,
    });

    const { repo, events } = createRepo([job]);
    const { executor } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.stuckAlerts, 1);
    assert.equal(
        events.some((event) => (event.reason ?? "").includes("ALERT: provisioning job stuck")),
        true,
    );
});
