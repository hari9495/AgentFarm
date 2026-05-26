/**
 * worker-main.ts — standalone worker process.
 *
 * Runs every background worker in its own OS process, isolated from the HTTP
 * server. A worker crash or runaway CPU spike can no longer affect request
 * latency or bring down the API gateway.
 *
 * Usage:
 *   node apps/api-gateway/dist/worker-main.js
 *
 * In production this is the entrypoint for the `worker-runner` docker-compose
 * service, which uses the same Docker image as `api-gateway` but with a
 * different CMD. The api-gateway service sets AF_WORKERS_DISABLED=1 so it
 * never starts workers in-process.
 */

import { initObservability } from '@agentfarm/observability';
initObservability({
    serviceName: 'worker-runner',
    azureConnectionString: process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    otlpEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'],
});

import { WorkerManager } from './worker-manager.js';
import { createDefaultSecretStore } from './lib/secret-store.js';

const secretStore = createDefaultSecretStore();

// Lightweight console logger — this process has no Fastify instance.
const log = {
    info:  (msg: string)              => console.log(`[worker-runner] INFO  ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[worker-runner] ERROR ${msg}`, err ?? ''),
};

const workerManager = new WorkerManager({
    logger: log as never,
    secretStore,
    agentRuntimeUrl: process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:3001',
});

workerManager.startAll();
log.info('all workers started');

const stop = (): void => {
    log.info('stopping workers…');
    workerManager.stopAll();
    process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

// Keep the process alive (workers use setInterval / event listeners internally).
// An unhandled rejection in a worker should not silently swallow — log and exit
// so the container orchestrator restarts only this process, not the HTTP server.
process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection in worker process — exiting', reason);
    stop();
});
