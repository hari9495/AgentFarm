import type { PrismaClient } from "@prisma/client";
import type { ProvisioningJobProcessor } from "./job-processor.js";

/**
 * Polls the database for queued provisioning jobs and delegates processing
 * to ProvisioningJobProcessor. The processor handles atomic job claiming and
 * all status transitions internally via processOnce().
 */
export class ProvisioningQueueConsumer {
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private readonly pollIntervalMs: number;
    private readonly batchSize: number;

    constructor(
        private readonly prisma: Pick<PrismaClient, "provisioningJob">,
        private readonly processor: ProvisioningJobProcessor,
        env: NodeJS.ProcessEnv = process.env,
    ) {
        this.pollIntervalMs = Number(env["PROVISIONING_POLL_INTERVAL_MS"] ?? 5000);
        this.batchSize = Number(env["PROVISIONING_BATCH_SIZE"] ?? 3);
    }

    /**
     * Starts the poll loop. Runs an immediate poll then sets up the interval.
     * Idempotent — calling start() when already running is a no-op.
     */
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        await this.pollOnce();

        this.intervalHandle = setInterval(() => {
            void this.pollOnce();
        }, this.pollIntervalMs);
    }

    /** Stops the poll loop. Safe to call multiple times. */
    stop(): void {
        this.running = false;
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    isRunning(): boolean {
        return this.running;
    }

    /**
     * Exposed for testing. Runs a single poll cycle:
     * 1. Count queued jobs for observability logging.
     * 2. If any exist, delegate to processor.processOnce() which handles
     *    atomic claiming and status transitions.
     */
    async pollOnce(): Promise<void> {
        try {
            const jobs = await this.prisma.provisioningJob.findMany({
                where: { status: "queued" },
                orderBy: { createdAt: "asc" },
                take: this.batchSize,
                select: { id: true },
            });

            console.log(
                `[provisioning-consumer] poll: found ${jobs.length} queued job(s)`,
            );

            if (jobs.length === 0) return;

            const result = await this.processor.processOnce();

            console.log(
                `[provisioning-consumer] cycle done: processed=${result.processed} completed=${result.completed} failed=${result.failed} slaBreaches=${result.slaBreaches}`,
            );
        } catch (err) {
            console.error("[provisioning-consumer] poll cycle error:", err);
        }
    }
}
