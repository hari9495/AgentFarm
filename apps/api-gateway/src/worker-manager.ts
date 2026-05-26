/**
 * worker-manager.ts — worker lifecycle facade.
 *
 * Encapsulates every background worker's start/stop pair behind a single
 * interface. The HTTP server (`server.ts`) and bootstrap (`main.ts`) never
 * need to know which individual workers exist — they only call startAll / stopAll.
 *
 * Adding or removing a worker is a one-file change here, not a change to main.ts.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { SecretStore } from './lib/secret-store.js';
import { startProvisioningWorker, stopProvisioningWorker } from './services/provisioning-worker.js';
import {
    startConnectorTokenLifecycleWorker,
    stopConnectorTokenLifecycleWorker,
} from './services/connector-token-lifecycle-worker.js';
import { startConnectorHealthWorker, stopConnectorHealthWorker } from './services/connector-health-worker.js';
import { startNurtureWorker, stopNurtureWorker } from './services/nurture-worker.js';
import { startSalesSequenceWorker, stopSalesSequenceWorker } from './services/sales-sequence-worker.js';
import { startMarketSignalWorker, stopMarketSignalWorker } from './services/market-signal-worker.js';
import { startNpsWorker, stopNpsWorker } from './services/nps-worker.js';
import { startUpsellWorker, stopUpsellWorker } from './services/upsell-worker.js';
import { startCrmSyncWorker, stopCrmSyncWorker } from './services/crm-sync-worker.js';
import { startDrainSweep, stopDrainSweep } from './lib/task-queue.js';
import { prisma } from './lib/db.js';

export type WorkerManagerDeps = {
    logger: FastifyBaseLogger;
    secretStore: SecretStore;
    agentRuntimeUrl: string;
};

export class WorkerManager {
    constructor(private readonly deps: WorkerManagerDeps) {}

    startAll(): void {
        const log = this.makeLogger();

        startProvisioningWorker(log);

        startConnectorTokenLifecycleWorker(log, { secretStore: this.deps.secretStore });

        startConnectorHealthWorker({ secretStore: this.deps.secretStore }, log);

        startNurtureWorker(prisma);
        startSalesSequenceWorker(prisma);
        startMarketSignalWorker(prisma);
        startNpsWorker(prisma);
        startUpsellWorker(prisma);
        startCrmSyncWorker(prisma);

        startDrainSweep({
            agentRuntimeUrl: this.deps.agentRuntimeUrl,
            prisma: prisma as never,
        });
    }

    stopAll(): void {
        stopProvisioningWorker();
        stopConnectorTokenLifecycleWorker();
        stopConnectorHealthWorker();
        stopNurtureWorker();
        stopSalesSequenceWorker();
        stopMarketSignalWorker();
        stopNpsWorker();
        stopUpsellWorker();
        stopCrmSyncWorker();
        stopDrainSweep();
    }

    private makeLogger() {
        return {
            info: (msg: string) => this.deps.logger.info(msg),
            error: (msg: string, err?: unknown) => this.deps.logger.error({ err }, msg),
        };
    }
}
