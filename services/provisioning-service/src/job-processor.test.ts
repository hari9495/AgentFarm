import test from "node:test";
import assert from "node:assert/strict";
import type { ProvisioningJobRecord, ProvisioningJobStatus } from "@agentfarm/shared-types";
import {
    ProvisioningJobProcessor,
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
        async claimJob(jobId) {
            const job = jobs.get(jobId);
            if (!job || job.status !== "queued") {
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

    const maybeFail = async (state: ProvisioningJobStatus) => {
        calls.push(state);
        if (options?.failAt === state) {
            throw new Error(`forced failure at ${state}`);
        }
    };

    const executor: ProvisioningStepExecutor = {
        validateTenant: async () => maybeFail("validating"),
        createResources: async () => maybeFail("creating_resources"),
        bootstrapVm: async () => maybeFail("bootstrapping_vm"),
        startContainer: async () => maybeFail("starting_container"),
        registerRuntime: async () => maybeFail("registering_runtime"),
        healthCheck: async () => maybeFail("healthchecking"),
        cleanupResources: async () => {
            calls.push("cleanup_pending");
            if (options?.cleanupFails) {
                throw new Error("forced cleanup failure");
            }
        },
    };

    return { executor, calls };
};

test("processor: completes queued jobs through full happy path", async () => {
    const job = makeJob();
    const { repo, jobs, signals, events } = createRepo([job]);
    const { executor, calls } = createExecutor();

    const processor = new ProvisioningJobProcessor(repo, executor, 3);
    const result = await processor.processOnce();

    assert.equal(result.processed, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);

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

    assert.equal(signals.runtimeFailed, 1);
    assert.equal(signals.workspaceFailed, 1);
    assert.equal(signals.tenantDegraded, 1);
    assert.equal(signals.botFailed, 1);

    assert.equal(calls.includes("cleanup_pending"), true);
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
