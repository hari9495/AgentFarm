/**
 * worker-manager.ts — worker lifecycle facade.
 *
 * Encapsulates every background worker's start/stop pair behind a single
 * interface. The HTTP server (`server.ts`) and bootstrap (`main.ts`) never
 * need to know which individual workers exist — they only call startAll / stopAll.
 *
 * Adding or removing a worker is a one-file change here, not a change to main.ts.
 *
 * All worker imports are dynamic so they are never resolved when the container
 * runs with AF_WORKERS_DISABLED=1 (e.g. the api-gateway service delegates worker
 * execution to the standalone worker-runner service).
 */

import type { FastifyBaseLogger } from 'fastify';
import type { SecretStore } from './lib/secret-store.js';
import { prisma } from './lib/db.js';

export type WorkerManagerDeps = {
    logger: FastifyBaseLogger;
    secretStore: SecretStore;
    agentRuntimeUrl: string;
};

export class WorkerManager {
    private stopFns: Array<() => void> = [];

    constructor(private readonly deps: WorkerManagerDeps) {}

    async startAll(): Promise<void> {
        const log = this.makeLogger();

        const [
            { startProvisioningWorker, stopProvisioningWorker },
            { startConnectorTokenLifecycleWorker, stopConnectorTokenLifecycleWorker },
            { startConnectorHealthWorker, stopConnectorHealthWorker },
            { startNurtureWorker, stopNurtureWorker },
            { startSalesSequenceWorker, stopSalesSequenceWorker },
            { startMarketSignalWorker, stopMarketSignalWorker },
            { startNpsWorker, stopNpsWorker },
            { startUpsellWorker, stopUpsellWorker },
            { startCrmSyncWorker, stopCrmSyncWorker },
            { startDrainSweep, stopDrainSweep },
            { startMemoryConsolidationWorker, stopMemoryConsolidationWorker },
            { startShiftVmWorker, stopShiftVmWorker },
        ] = await Promise.all([
            import('./services/provisioning-worker.js'),
            import('./services/connector-token-lifecycle-worker.js'),
            import('./services/connector-health-worker.js'),
            import('./services/nurture-worker.js'),
            import('./services/sales-sequence-worker.js'),
            import('./services/market-signal-worker.js'),
            import('./services/nps-worker.js'),
            import('./services/upsell-worker.js'),
            import('./services/crm-sync-worker.js'),
            import('./lib/task-queue.js'),
            import('./services/memory-consolidation-worker.js'),
            import('./services/shift-vm-worker.js'),
        ]);

        startProvisioningWorker(log);
        this.stopFns.push(stopProvisioningWorker);

        startConnectorTokenLifecycleWorker(log, { secretStore: this.deps.secretStore });
        this.stopFns.push(stopConnectorTokenLifecycleWorker);

        startConnectorHealthWorker({ secretStore: this.deps.secretStore }, log);
        this.stopFns.push(stopConnectorHealthWorker);

        startNurtureWorker(prisma);
        this.stopFns.push(stopNurtureWorker);

        startSalesSequenceWorker(prisma);
        this.stopFns.push(stopSalesSequenceWorker);

        startMarketSignalWorker(prisma);
        this.stopFns.push(stopMarketSignalWorker);

        startNpsWorker(prisma);
        this.stopFns.push(stopNpsWorker);

        startUpsellWorker(prisma);
        this.stopFns.push(stopUpsellWorker);

        startCrmSyncWorker(prisma);
        this.stopFns.push(stopCrmSyncWorker);

        startDrainSweep({
            agentRuntimeUrl: this.deps.agentRuntimeUrl,
            prisma: prisma as never,
        });
        this.stopFns.push(stopDrainSweep);

        startMemoryConsolidationWorker();
        this.stopFns.push(stopMemoryConsolidationWorker);

        // H1 — shift-driven workspace VM power. Only meaningful with Azure configured;
        // without it the power calls would no-op, so gate on AZURE_SUBSCRIPTION_ID.
        if (process.env['AZURE_SUBSCRIPTION_ID']) {
            startShiftVmWorker(log);
            this.stopFns.push(stopShiftVmWorker);
        } else {
            log.info('shift VM worker not started — set AZURE_SUBSCRIPTION_ID to enable shift-driven VM power');
        }
    }

    stopAll(): void {
        for (const fn of this.stopFns) fn();
        this.stopFns = [];
    }

    private makeLogger() {
        return {
            info: (msg: string) => this.deps.logger.info(msg),
            error: (msg: string, err?: unknown) => this.deps.logger.error({ err }, msg),
        };
    }
}
