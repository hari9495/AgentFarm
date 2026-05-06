import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOrchestratorServer } from './main.js';

const createIsolatedApp = async (options?: { now?: () => number }) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agentfarm-orchestrator-test-'));
    const app = await buildOrchestratorServer({
        now: options?.now,
        statePath: join(tempDir, 'state.json'),
    });
    return {
        app,
        cleanup: async () => {
            await app.close();
            await rm(tempDir, { recursive: true, force: true });
        },
    };
};

test('orchestrator wake route schedules and coalesces duplicate wake requests', async () => {
    const isolated = await createIsolatedApp({ now: () => 1_700_000_000_000 });
    const { app } = isolated;

    try {
        const first = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-1',
                workspace_id: 'ws-1',
                bot_id: 'bot-1',
                wake_source: 'timer',
                dedupe_key: 'dedupe-hourly',
                correlation_id: 'corr-1',
            },
        });

        assert.equal(first.statusCode, 201);
        const firstBody = first.json() as { run_id: string; is_new_run: boolean; coalesced: boolean };
        assert.equal(firstBody.is_new_run, true);
        assert.equal(firstBody.coalesced, false);

        const second = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-1',
                workspace_id: 'ws-1',
                bot_id: 'bot-1',
                wake_source: 'timer',
                dedupe_key: 'dedupe-hourly',
                correlation_id: 'corr-2',
            },
        });

        assert.equal(second.statusCode, 200);
        const secondBody = second.json() as { run_id: string; is_new_run: boolean; coalesced: boolean };
        assert.equal(secondBody.is_new_run, false);
        assert.equal(secondBody.coalesced, true);
        assert.equal(secondBody.run_id, firstBody.run_id);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator wake completion route rejects invalid terminal status', async () => {
    const isolated = await createIsolatedApp();
    const { app } = isolated;

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/runs/run-1/complete',
            payload: {
                final_status: 'queued',
            },
        });

        assert.equal(response.statusCode, 400);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator routine scheduler routes create and deduplicate queued runs', async () => {
    const isolated = await createIsolatedApp({ now: () => 1_700_000_123_000 });
    const { app } = isolated;

    try {
        const enable = await app.inject({
            method: 'POST',
            url: '/v1/feature-flags/scheduler.routine_tasks/enable',
        });
        assert.equal(enable.statusCode, 200);

        const create = await app.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: {
                tenant_id: 'tenant-1',
                workspace_id: 'ws-1',
                bot_id: 'bot-queue',
                schedule_type: 'daily',
                schedule_expression: '0 9 * * *',
                policy_pack_version: 'v1',
                feature_flag_key: 'scheduler.routine_tasks',
                task_payload: { action_type: 'read_task' },
                policy: {
                    dedupe_key: 'daily-queue',
                    concurrency_policy: 'queue',
                    max_retries: 2,
                    retry_backoff_ms: 1000,
                },
                correlation_id: 'corr-schedule',
            },
        });
        assert.equal(create.statusCode, 201);

        const createBody = create.json() as { id: string; enabled: boolean };
        assert.equal(createBody.enabled, true);

        const runOne = await app.inject({
            method: 'POST',
            url: `/v1/schedules/${createBody.id}/runs`,
            payload: { correlation_id: 'corr-run-1' },
        });
        assert.equal(runOne.statusCode, 201);
        const runOneBody = runOne.json() as { run_id: string; deduplicated: boolean };
        assert.equal(runOneBody.deduplicated, false);

        const runTwo = await app.inject({
            method: 'POST',
            url: `/v1/schedules/${createBody.id}/runs`,
            payload: { correlation_id: 'corr-run-2' },
        });
        assert.equal(runTwo.statusCode, 200);
        const runTwoBody = runTwo.json() as { run_id: string; deduplicated: boolean };
        assert.equal(runTwoBody.deduplicated, true);

        const complete = await app.inject({
            method: 'POST',
            url: `/v1/schedules/${createBody.id}/runs/${runOneBody.run_id}/complete`,
            payload: {
                final_status: 'completed',
                correlation_id: 'corr-complete',
            },
        });
        assert.equal(complete.statusCode, 200);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator proactive signal routes detect, list, and resolve signals', async () => {
    const isolated = await createIsolatedApp({ now: () => 1_700_000_222_000 });
    const { app } = isolated;

    try {
        const detect = await app.inject({
            method: 'POST',
            url: '/v1/proactive-signals/detect',
            payload: {
                tenant_id: 'tenant-signal',
                workspace_id: 'ws-signal',
                bot_id: 'bot-signal',
                correlation_id: 'corr-signal-1',
                pull_requests: [{ id: 'pr-1', title: 'Old PR', days_since_update: 17 }],
                tickets: [{ id: 'ticket-1', title: 'Old Ticket', hours_since_update: 96 }],
                budget_utilization_ratio: 0.85,
            },
        });

        assert.equal(detect.statusCode, 200);
        const detectBody = detect.json() as { detected_count: number; signals: Array<{ id: string; signalType: string; status: string }> };
        assert.equal(detectBody.detected_count, 3);

        const listOpen = await app.inject({
            method: 'GET',
            url: '/v1/proactive-signals?workspace_id=ws-signal&status=open&limit=10',
        });
        assert.equal(listOpen.statusCode, 200);
        const listOpenBody = listOpen.json() as { count: number; signals: Array<{ id: string }> };
        assert.equal(listOpenBody.count, 3);

        const resolve = await app.inject({
            method: 'POST',
            url: `/v1/proactive-signals/${detectBody.signals[0]!.id}/resolve`,
        });
        assert.equal(resolve.statusCode, 200);

        const listResolved = await app.inject({
            method: 'GET',
            url: '/v1/proactive-signals?workspace_id=ws-signal&status=resolved&limit=10',
        });
        assert.equal(listResolved.statusCode, 200);
        const listResolvedBody = listResolved.json() as { count: number };
        assert.equal(listResolvedBody.count, 1);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator proactive signal list rejects invalid signal_type', async () => {
    const isolated = await createIsolatedApp();
    const { app } = isolated;

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/proactive-signals?signal_type=unknown',
        });

        assert.equal(response.statusCode, 400);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator persists wake and schedule state across server restarts', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agentfarm-orchestrator-state-'));
    const statePath = join(tempDir, 'state.json');

    const appOne = await buildOrchestratorServer({
        now: () => 1_700_000_500_000,
        statePath,
    });

    let firstRunId = '';
    let scheduleId = '';
    let firstScheduleRunId = '';

    try {
        const wakeOne = await appOne.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-persist',
                workspace_id: 'ws-persist',
                bot_id: 'bot-persist',
                wake_source: 'timer',
                dedupe_key: 'persist-key',
                correlation_id: 'corr-persist-1',
            },
        });
        assert.equal(wakeOne.statusCode, 201);
        firstRunId = (wakeOne.json() as { run_id: string }).run_id;

        const enable = await appOne.inject({
            method: 'POST',
            url: '/v1/feature-flags/scheduler.routine_tasks/enable',
        });
        assert.equal(enable.statusCode, 200);

        const schedule = await appOne.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: {
                tenant_id: 'tenant-persist',
                workspace_id: 'ws-persist',
                bot_id: 'bot-persist',
                schedule_type: 'daily',
                schedule_expression: '0 9 * * *',
                feature_flag_key: 'scheduler.routine_tasks',
                task_payload: { action_type: 'read_task' },
                policy: {
                    dedupe_key: 'persist-dedupe',
                    concurrency_policy: 'queue',
                    max_retries: 1,
                    retry_backoff_ms: 1000,
                },
                correlation_id: 'corr-schedule-persist',
            },
        });
        assert.equal(schedule.statusCode, 201);
        scheduleId = (schedule.json() as { id: string }).id;

        const scheduleRun = await appOne.inject({
            method: 'POST',
            url: `/v1/schedules/${scheduleId}/runs`,
            payload: { correlation_id: 'corr-schedule-run-1' },
        });
        assert.equal(scheduleRun.statusCode, 201);
        firstScheduleRunId = (scheduleRun.json() as { run_id: string }).run_id;
    } finally {
        await appOne.close();
    }

    const appTwo = await buildOrchestratorServer({
        now: () => 1_700_000_600_000,
        statePath,
    });

    try {
        const wakeTwo = await appTwo.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-persist',
                workspace_id: 'ws-persist',
                bot_id: 'bot-persist',
                wake_source: 'timer',
                dedupe_key: 'persist-key',
                correlation_id: 'corr-persist-2',
            },
        });

        assert.equal(wakeTwo.statusCode, 200);
        const wakeTwoBody = wakeTwo.json() as { run_id: string; coalesced: boolean };
        assert.equal(wakeTwoBody.coalesced, true);
        assert.equal(wakeTwoBody.run_id, firstRunId);

        const scheduleRunTwo = await appTwo.inject({
            method: 'POST',
            url: `/v1/schedules/${scheduleId}/runs`,
            payload: { correlation_id: 'corr-schedule-run-2' },
        });

        assert.equal(scheduleRunTwo.statusCode, 200);
        const scheduleRunTwoBody = scheduleRunTwo.json() as { run_id: string; deduplicated: boolean };
        assert.equal(scheduleRunTwoBody.deduplicated, true);
        assert.notEqual(scheduleRunTwoBody.run_id, firstScheduleRunId);

        const scheduleTwo = await appTwo.inject({
            method: 'POST',
            url: '/v1/schedules',
            payload: {
                tenant_id: 'tenant-persist',
                workspace_id: 'ws-persist',
                bot_id: 'bot-persist',
                schedule_type: 'hourly',
                schedule_expression: '0 * * * *',
                feature_flag_key: 'scheduler.routine_tasks',
                task_payload: { action_type: 'read_task' },
                policy: {
                    dedupe_key: 'persist-dedupe-2',
                    concurrency_policy: 'skip',
                    max_retries: 1,
                    retry_backoff_ms: 1000,
                },
                correlation_id: 'corr-schedule-persist-2',
            },
        });

        assert.equal(scheduleTwo.statusCode, 201);
        const scheduleTwoBody = scheduleTwo.json() as { enabled: boolean };
        assert.equal(scheduleTwoBody.enabled, true);
    } finally {
        await appTwo.close();
        await rm(tempDir, { recursive: true, force: true });
    }
});