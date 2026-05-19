/**
 * provisioning-poller.ts — Sprint 10: VM Lifecycle Poller
 *
 * Public façade over the ProvisioningQueueConsumer that matches the Sprint 10
 * specification interface:
 *
 *   - Polls the ProvisioningJob table on a configurable interval
 *   - Handles status: 'queued' (mapped from spec's 'pending') → calls provisionAgentVM()
 *   - Handles status: 'cleanup_pending' → calls terminateAgentVM()
 *   - Retries up to PROVISIONING_MAX_RETRIES (default 3) before marking 'failed'
 *
 * The actual state-machine transitions (queued → validating → creating_resources
 * → bootstrapping_vm → … → completed) are owned by ProvisioningJobProcessor and
 * ProvisioningQueueConsumer.  This file provides the canonical Sprint 10 entry
 * point name and a simplified start/stop API.
 */

import type { PrismaClient } from "@prisma/client";
import { ProvisioningQueueConsumer } from "./queue-consumer.js";
import { ProvisioningJobProcessor } from "./job-processor.js";
import { DefaultProvisioningStepExecutor } from "./default-step-executor.js";
import { createPrismaJobRepository } from "./prisma-repository.js";
import { VmLifecycleManager, DefaultAzureArmAdapter } from "./vm-lifecycle-manager.js";

export type ProvisioningPollerOptions = {
    /**
     * How often the poller wakes up to check for new jobs.
     * Reads PROVISIONING_POLL_INTERVAL_MS env var; defaults to 30_000 ms.
     */
    pollIntervalMs?: number;
    /** Maximum batch size per poll cycle. Defaults to 3. */
    batchSize?: number;
    /**
     * Injected VmLifecycleManager — useful for testing without hitting Azure.
     * If omitted, a manager is constructed only when AZURE_SUBSCRIPTION_ID is set.
     */
    vmLifecycleManager?: VmLifecycleManager;
};

/**
 * ProvisioningPoller — thin Sprint 10 façade.
 *
 * Constructs the full provisioning pipeline (repository → executor → processor
 * → consumer) and exposes start() / stop() / isRunning().
 *
 * Usage (in-process startup):
 * ```ts
 * const poller = new ProvisioningPoller(prismaClient);
 * await poller.start();
 * ```
 */
export class ProvisioningPoller {
    private readonly consumer: ProvisioningQueueConsumer;

    constructor(
        prisma: PrismaClient,
        options: ProvisioningPollerOptions = {},
        env: NodeJS.ProcessEnv = process.env,
    ) {
        const pollIntervalMs =
            options.pollIntervalMs ??
            Number(env["PROVISIONING_POLL_INTERVAL_MS"] ?? 30_000);

        const vmLifecycleManager =
            options.vmLifecycleManager ??
            // Wire ARM lifecycle only when Azure credentials are configured.
            (env["AZURE_SUBSCRIPTION_ID"]
                ? new VmLifecycleManager(new DefaultAzureArmAdapter())
                : undefined);

        const repo = createPrismaJobRepository(prisma);
        const executor = new DefaultProvisioningStepExecutor(vmLifecycleManager);
        const processor = new ProvisioningJobProcessor(repo, executor);

        this.consumer = new ProvisioningQueueConsumer(prisma, processor, {
            ...env,
            PROVISIONING_POLL_INTERVAL_MS: String(pollIntervalMs),
            ...(options.batchSize !== undefined
                ? { PROVISIONING_BATCH_SIZE: String(options.batchSize) }
                : {}),
        });
    }

    /**
     * Start the polling loop.  Performs an immediate poll then sets up the
     * recurring interval.  Idempotent — safe to call multiple times.
     */
    async start(): Promise<void> {
        await this.consumer.start();
    }

    /** Stop the polling loop.  Safe to call multiple times. */
    stop(): void {
        this.consumer.stop();
    }

    isRunning(): boolean {
        return this.consumer.isRunning();
    }

    /**
     * Exposed for testing.  Run exactly one poll cycle synchronously.
     */
    async pollOnce(): Promise<void> {
        await this.consumer.pollOnce();
    }
}
