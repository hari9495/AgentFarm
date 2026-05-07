import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrchestratorServer } from './main.js';
import type { OrchestratorPersistedState, OrchestratorStateStore } from './orchestrator-state-store.js';

const createInMemoryStateStore = (): OrchestratorStateStore => {
    let current: OrchestratorPersistedState | null = null;
    return {
        async load() {
            return current ? structuredClone(current) : null;
        },
        async save(state) {
            current = structuredClone(state);
        },
    };
};

const createIsolatedApp = async (options?: Parameters<typeof buildOrchestratorServer>[0] & { now?: () => number }) => {
    const app = await buildOrchestratorServer({
        ...options,
        now: options?.now,
        statePath: options?.statePath ?? '.orchestrator-test-state.json',
        stateStore: options?.stateStore ?? createInMemoryStateStore(),
    });
    return {
        app,
        cleanup: async () => {
            await app.close();
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
                ci_failures: [{ workflow_name: 'ci-main', branch: 'main', failure_count: 2 }],
                dependency_vulnerabilities: [{ dependency_name: 'openssl', cve_id: 'CVE-2026-0001', severity: 'critical' }],
            },
        });

        assert.equal(detect.statusCode, 200);
        const detectBody = detect.json() as { detected_count: number; signals: Array<{ id: string; signalType: string; status: string }> };
        assert.equal(detectBody.detected_count, 5);

        const listOpen = await app.inject({
            method: 'GET',
            url: '/v1/proactive-signals?workspace_id=ws-signal&status=open&limit=10',
        });
        assert.equal(listOpen.statusCode, 200);
        const listOpenBody = listOpen.json() as { count: number; signals: Array<{ id: string }> };
        assert.equal(listOpenBody.count, 5);

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

test('orchestrator wake scheduling accepts proactive_signal wake source', async () => {
    const isolated = await createIsolatedApp({ now: () => 1_700_000_333_000 });
    const { app } = isolated;

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-ps',
                workspace_id: 'ws-ps',
                bot_id: 'bot-ps',
                wake_source: 'proactive_signal',
                correlation_id: 'corr-ps-1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { wake_source: string };
        assert.equal(body.wake_source, 'proactive_signal');
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator wake scheduling accepts agent_handoff wake source', async () => {
    const isolated = await createIsolatedApp({ now: () => 1_700_000_333_500 });
    const { app } = isolated;

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-hs',
                workspace_id: 'ws-hs',
                bot_id: 'bot-hs',
                wake_source: 'agent_handoff',
                correlation_id: 'corr-hs-1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { wake_source: string };
        assert.equal(body.wake_source, 'agent_handoff');
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator wake route fetches question sweep and memory context', async () => {
    const isolated = await createIsolatedApp({
        questionSweepFetcher: async () => ({
            expiredCount: 1,
            resolutions: [{ questionId: 'q-1', taskId: 'task-1', policy: 'escalate', action: 'escalated' }],
        }),
        workspaceMemoryFetcher: async () => ({
            recentMemoryCount: 2,
            memoryCountThisWeek: 5,
            mostCommonConnectors: ['github', 'teams'],
            approvalRejectionRate: 0.2,
        }),
    });
    const { app } = isolated;

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-hooks',
                workspace_id: 'ws-hooks',
                bot_id: 'bot-hooks',
                wake_source: 'automation',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as {
            question_sweep: { expiredCount: number };
            memory_context: { recentMemoryCount: number; mostCommonConnectors: string[] };
        };
        assert.equal(body.question_sweep.expiredCount, 1);
        assert.equal(body.memory_context.recentMemoryCount, 2);
        assert.deepEqual(body.memory_context.mostCommonConnectors, ['github', 'teams']);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator run completion records task memory when task details are provided', async () => {
    let recorded = false;
    const isolated = await createIsolatedApp({
        taskMemoryRecorder: async (input) => {
            recorded = input.taskId === 'task-memory' && input.summary === 'Completed connector sync';
            return true;
        },
    });
    const { app } = isolated;

    try {
        const scheduled = await app.inject({
            method: 'POST',
            url: '/v1/wake/schedule',
            payload: {
                tenant_id: 'tenant-memory',
                workspace_id: 'ws-memory',
                bot_id: 'bot-memory',
                wake_source: 'on_demand',
            },
        });
        const runId = (scheduled.json() as { run_id: string }).run_id;

        const response = await app.inject({
            method: 'POST',
            url: `/v1/wake/runs/${runId}/complete`,
            payload: {
                final_status: 'completed',
                task_id: 'task-memory',
                summary: 'Completed connector sync',
                actions_taken: ['read_task', 'update_status'],
                connectors_used: ['github'],
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { memory_recorded: boolean };
        assert.equal(body.memory_recorded, true);
        assert.equal(recorded, true);
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator agent handoff routes create, list, and update status', async () => {
    const isolated = await createIsolatedApp();
    const { app } = isolated;

    try {
        const createResponse = await app.inject({
            method: 'POST',
            url: '/v1/agent-handoffs',
            payload: {
                tenant_id: 'tenant-handoff',
                workspace_id: 'ws-handoff',
                task_id: 'task-handoff-1',
                from_bot_id: 'bot-a',
                to_bot_id: 'bot-b',
                reason: 'handoff for specialized review',
                correlation_id: 'corr-handoff-1',
            },
        });
        assert.equal(createResponse.statusCode, 201);
        const createBody = createResponse.json() as { handoff: { id: string; status: string } };
        assert.equal(createBody.handoff.status, 'pending');

        const listResponse = await app.inject({
            method: 'GET',
            url: '/v1/agent-handoffs?workspace_id=ws-handoff&status=pending',
        });
        assert.equal(listResponse.statusCode, 200);
        const listBody = listResponse.json() as { count: number; handoffs: Array<{ id: string }> };
        assert.equal(listBody.count, 1);
        assert.equal(listBody.handoffs[0]?.id, createBody.handoff.id);

        const updateResponse = await app.inject({
            method: 'POST',
            url: `/v1/agent-handoffs/${createBody.handoff.id}/status`,
            payload: {
                status: 'accepted',
            },
        });
        assert.equal(updateResponse.statusCode, 200);
        const updateBody = updateResponse.json() as { handoff: { status: string } };
        assert.equal(updateBody.handoff.status, 'accepted');
    } finally {
        await isolated.cleanup();
    }
});

test('orchestrator persists wake and schedule state across server restarts', async () => {
    const stateStore = createInMemoryStateStore();

    const appOne = await buildOrchestratorServer({
        now: () => 1_700_000_500_000,
        statePath: '.orchestrator-persist-test.json',
        stateStore,
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
        statePath: '.orchestrator-persist-test.json',
        stateStore,
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
    }
});

test('orchestrator persists agent handoffs across server restarts', async () => {
    const stateStore = createInMemoryStateStore();

    const appOne = await buildOrchestratorServer({ statePath: '.orchestrator-handoff-test.json', stateStore });

    let handoffId = '';

    try {
        const createResp = await appOne.inject({
            method: 'POST',
            url: '/v1/agent-handoffs',
            payload: {
                tenant_id: 'tenant-persist-h',
                workspace_id: 'ws-persist-h',
                task_id: 'task-persist-h-1',
                from_bot_id: 'bot-alpha',
                to_bot_id: 'bot-beta',
                reason: 'durable handoff test',
                correlation_id: 'corr-persist-h-1',
            },
        });
        assert.equal(createResp.statusCode, 201);
        handoffId = (createResp.json() as { handoff: { id: string } }).handoff.id;

        // Update to accepted before restart
        const updateResp = await appOne.inject({
            method: 'POST',
            url: `/v1/agent-handoffs/${handoffId}/status`,
            payload: { status: 'accepted' },
        });
        assert.equal(updateResp.statusCode, 200);
    } finally {
        await appOne.close();
    }

    // Restart — handoff must survive
    const appTwo = await buildOrchestratorServer({ statePath: '.orchestrator-handoff-test.json', stateStore });

    try {
        const listResp = await appTwo.inject({
            method: 'GET',
            url: '/v1/agent-handoffs?workspace_id=ws-persist-h',
        });
        assert.equal(listResp.statusCode, 200);
        const listBody = listResp.json() as { count: number; handoffs: Array<{ id: string; status: string }> };
        assert.equal(listBody.count, 1);
        assert.equal(listBody.handoffs[0]?.id, handoffId);
        assert.equal(listBody.handoffs[0]?.status, 'accepted');
    } finally {
        await appTwo.close();
    }
});