/**
 * main.ts — API Gateway bootstrap.
 *
 * Observability MUST be initialized before any other import (OpenTelemetry
 * requires this to patch modules at load time). After that this file only:
 *   1. Creates the configured Fastify server  (→ server.ts)
 *   2. Registers all domain routes            (→ route-registry.ts)
 *   3. Manages worker lifecycle               (→ worker-manager.ts)
 *   4. Binds OS signal handlers
 *
 * Nothing else lives here. Business logic, route handlers, and worker
 * implementations are in their own dedicated modules.
 */

import { initObservability } from '@agentfarm/observability';
initObservability({
    serviceName: 'api-gateway',
    azureConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

import { createServer, runStartupChecks } from './server.js';
import { registerAllRoutes } from './route-registry.js';
import { WorkerManager } from './worker-manager.js';
import { createDefaultSecretStore } from './lib/secret-store.js';
import { getInternalLoginPolicyConfig, isInternalLoginPolicyEmpty } from './lib/internal-login-policy.js';

// ---------------------------------------------------------------------------
// Composition root — wire dependencies, do not implement logic here
// ---------------------------------------------------------------------------

const secretStore = createDefaultSecretStore();
const app = await createServer();

await registerAllRoutes(app, { secretStore });

const workerManager = new WorkerManager({
    logger: app.log,
    secretStore,
    agentRuntimeUrl: process.env.AGENT_RUNTIME_URL ?? 'http://localhost:3001',
});

// ---------------------------------------------------------------------------
// Startup / shutdown
// ---------------------------------------------------------------------------

const start = async (): Promise<void> => {
    const internalLoginPolicy = getInternalLoginPolicyConfig();
    if (isInternalLoginPolicyEmpty(internalLoginPolicy)) {
        app.log.warn(
            'Internal login policy is empty: set API_INTERNAL_LOGIN_ALLOWED_DOMAINS and/or ' +
            'API_INTERNAL_LOGIN_ADMIN_ROLES. Internal login is currently deny-by-default.',
        );
    }

    await runStartupChecks(app);

    const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`api-gateway listening on ${port}`);

    // Workers run in a dedicated process when AF_WORKERS_DISABLED=1 (worker-runner service).
    // In local dev (no env var) they run in-process as before for simplicity.
    if (!process.env['AF_WORKERS_DISABLED']) {
        workerManager.startAll();
        app.log.info('workers started in-process (AF_WORKERS_DISABLED not set)');
    } else {
        app.log.info('workers disabled — expecting standalone worker-runner process');
    }
};

const stop = async (): Promise<void> => {
    if (!process.env['AF_WORKERS_DISABLED']) workerManager.stopAll();
    await app.close();
    process.exit(0);
};

process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());

void start();
