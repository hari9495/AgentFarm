import process from 'node:process';
import { buildRuntimeServer } from './runtime-server.js';

type StartupBody = {
    capability_snapshot_id?: string;
    capability_snapshot_source?: string;
};

const required = (env: NodeJS.ProcessEnv, name: string, fallback?: string): string => {
    const value = env[name] ?? (fallback ? env[fallback] : undefined);
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable ${name}${fallback ? ` (or ${fallback})` : ''}`);
    }
    return value;
};

const run = async (): Promise<void> => {
    // Use a unique bot id by default so first startup is deterministic for smoke checks.
    const botId = process.env.AF_DB_SMOKE_BOT_ID ?? `bot_db_smoke_${Date.now()}`;

    // These defaults mirror existing runtime tests and avoid external dependencies.
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        AF_TENANT_ID: process.env.AF_DB_SMOKE_TENANT_ID ?? 'tenant_db_smoke',
        AF_WORKSPACE_ID: process.env.AF_DB_SMOKE_WORKSPACE_ID ?? 'ws_db_smoke',
        AF_BOT_ID: botId,
        AF_ROLE_PROFILE: process.env.AF_DB_SMOKE_ROLE_PROFILE ?? 'Developer Agent',
        AF_POLICY_PACK_VERSION: process.env.AF_DB_SMOKE_POLICY_PACK_VERSION ?? 'mvp-v1',
        AF_APPROVAL_API_URL: process.env.AF_DB_SMOKE_APPROVAL_API_URL ?? 'http://approval.local',
        AF_EVIDENCE_API_URL: process.env.AF_DB_SMOKE_EVIDENCE_API_URL ?? 'http://evidence.local',
        AF_HEALTH_PORT: process.env.AF_DB_SMOKE_HEALTH_PORT ?? '8080',
        AF_LOG_LEVEL: process.env.AF_DB_SMOKE_LOG_LEVEL ?? 'silent',
        AF_RUNTIME_CONTRACT_VERSION: process.env.AF_DB_SMOKE_RUNTIME_CONTRACT_VERSION ?? '1.0',
        AF_CORRELATION_ID: process.env.AF_DB_SMOKE_CORRELATION_ID ?? 'corr_db_smoke',
    };

    required(env, 'DATABASE_URL');
    required(env, 'AF_TENANT_ID', 'AGENTFARM_TENANT_ID');
    required(env, 'AF_WORKSPACE_ID', 'AGENTFARM_WORKSPACE_ID');
    required(env, 'AF_BOT_ID', 'AGENTFARM_BOT_ID');

    const app1 = buildRuntimeServer({
        env,
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    const startupRes1 = await app1.inject({ method: 'POST', url: '/startup' });
    const startupBody1 = startupRes1.json<StartupBody>();
    await app1.close();

    const app2 = buildRuntimeServer({
        env,
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    const startupRes2 = await app2.inject({ method: 'POST', url: '/startup' });
    const startupBody2 = startupRes2.json<StartupBody>();
    await app2.close();

    if (startupRes1.statusCode !== 200) {
        throw new Error(`First startup failed with status ${startupRes1.statusCode}`);
    }
    if (startupRes2.statusCode !== 200) {
        throw new Error(`Second startup failed with status ${startupRes2.statusCode}`);
    }

    if (startupBody1.capability_snapshot_source !== 'runtime_freeze') {
        throw new Error(
            `First startup expected source runtime_freeze, received ${startupBody1.capability_snapshot_source ?? 'undefined'}`,
        );
    }

    if (startupBody2.capability_snapshot_source !== 'persisted_load') {
        throw new Error(
            `Second startup expected source persisted_load, received ${startupBody2.capability_snapshot_source ?? 'undefined'}`,
        );
    }

    if (!startupBody1.capability_snapshot_id || !startupBody2.capability_snapshot_id) {
        throw new Error('Missing capability snapshot id in startup responses.');
    }

    if (startupBody1.capability_snapshot_id !== startupBody2.capability_snapshot_id) {
        throw new Error(
            `Expected snapshot id to remain stable across restart, got ${startupBody1.capability_snapshot_id} -> ${startupBody2.capability_snapshot_id}`,
        );
    }

    process.stdout.write(`${JSON.stringify({
        ok: true,
        scenario: 'db_snapshot_restart_load',
        first: startupBody1,
        second: startupBody2,
        stable_snapshot_id: startupBody1.capability_snapshot_id,
    }, null, 2)}\n`);
};

run().catch((err: unknown) => {
    process.stderr.write(`[db-snapshot-smoke] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
});
