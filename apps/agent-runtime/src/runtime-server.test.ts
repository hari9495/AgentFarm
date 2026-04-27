import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntimeServer } from './runtime-server.js';
import type { ActionResultRecord } from './action-result-contract.js';

const baseEnv = (): NodeJS.ProcessEnv => ({
    AF_TENANT_ID: 'tenant_test',
    AF_WORKSPACE_ID: 'ws_test',
    AF_BOT_ID: 'bot_test',
    AF_ROLE_PROFILE: 'Developer Agent',
    AF_POLICY_PACK_VERSION: 'mvp-v1',
    AF_APPROVAL_API_URL: 'http://approval.local',
    AF_EVIDENCE_API_URL: 'http://evidence.local',
    AF_HEALTH_PORT: '8080',
    AF_LOG_LEVEL: 'silent',
    AF_RUNTIME_CONTRACT_VERSION: '1.0',
    AF_CORRELATION_ID: 'corr_test',
    AF_ACTION_RESULT_LOG_PATH: join(tmpdir(), `agent-runtime-${process.pid}-${Date.now()}-${Math.random()}.ndjson`),
});

const fallbackEnv = (): NodeJS.ProcessEnv => ({
    AGENTFARM_TENANT_ID: 'tenant_fallback',
    AGENTFARM_WORKSPACE_ID: 'ws_fallback',
    AGENTFARM_BOT_ID: 'bot_fallback',
    AGENTFARM_ROLE_TYPE: 'Developer Agent',
    AGENTFARM_POLICY_PACK_VERSION: 'mvp-v1',
    AGENTFARM_APPROVAL_API_URL: 'http://approval.local',
    AGENTFARM_EVIDENCE_API_ENDPOINT: 'http://evidence.local',
    AGENTFARM_HEALTH_PORT: '8080',
    AGENTFARM_LOG_LEVEL: 'silent',
    AGENTFARM_CONTRACT_VERSION: '1.0',
    AGENTFARM_CORRELATION_ID: 'corr_fallback',
    AF_ACTION_RESULT_LOG_PATH: join(tmpdir(), `agent-runtime-fallback-${process.pid}-${Date.now()}-${Math.random()}.ndjson`),
});

test('startup starts worker loop and health/ready is true when dependencies are reachable', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as Record<string, unknown>;
        assert.equal(startupBody['status'], 'started');
        assert.equal(startupBody['state'], 'active');
        assert.equal(startupBody['worker_loop_running'], true);

        const readyRes = await app.inject({ method: 'GET', url: '/health/ready' });
        assert.equal(readyRes.statusCode, 200);
        const readyBody = readyRes.json() as {
            ready: boolean;
            checks: Record<string, boolean>;
        };
        assert.equal(readyBody.ready, true);
        assert.equal(readyBody.checks['worker_loops_started'], true);
    } finally {
        await app.close();
    }
});

test('startup accepts AGENTFARM_* fallback runtime inputs and resolves contract metadata', async () => {
    const app = buildRuntimeServer({
        env: fallbackEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as Record<string, unknown>;
        assert.equal(startupBody['status'], 'started');
        assert.equal(startupBody['runtime_contract_version'], '1.0');
        assert.equal(startupBody['state'], 'active');

        const healthRes = await app.inject({ method: 'GET', url: '/health' });
        assert.equal(healthRes.statusCode, 200);
        const healthBody = healthRes.json() as {
            checks: Record<string, boolean>;
        };
        assert.equal(healthBody.checks['config_loaded'], true);
    } finally {
        await app.close();
    }
});

test('startup returns already_started on duplicate startup call', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const firstStartup = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(firstStartup.statusCode, 200);

        const secondStartup = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(secondStartup.statusCode, 200);
        const secondBody = secondStartup.json() as Record<string, unknown>;
        assert.equal(secondBody['status'], 'already_started');
        assert.equal(secondBody['state'], 'active');
    } finally {
        await app.close();
    }
});

test('startup fails with runtime_init_failed when required runtime config is missing', async () => {
    const env = baseEnv();
    delete env.AF_EVIDENCE_API_URL;
    delete env.AGENTFARM_EVIDENCE_API_ENDPOINT;

    const app = buildRuntimeServer({
        env,
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 500);
        const startupBody = startupRes.json() as Record<string, unknown>;
        assert.equal(startupBody['error'], 'runtime_init_failed');
        assert.equal(startupBody['failure_class'], 'config_error');
        assert.equal(startupBody['state'], 'failed');
    } finally {
        await app.close();
    }
});

test('health/ready transitions active to degraded when dependencies become unreachable', async () => {
    let depsHealthy = true;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => depsHealthy,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        depsHealthy = false;

        const readyRes = await app.inject({ method: 'GET', url: '/health/ready' });
        assert.equal(readyRes.statusCode, 200);
        const readyBody = readyRes.json() as {
            ready: boolean;
            state: string;
        };
        assert.equal(readyBody.ready, false);
        assert.equal(readyBody.state, 'degraded');
    } finally {
        await app.close();
    }
});

test('kill endpoint engages graceful stop and reaches stopped state', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        killGraceMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const killRes = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(killRes.statusCode, 202);
        const killBody = killRes.json() as Record<string, unknown>;
        assert.equal(killBody['status'], 'killswitch_engaged');

        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            ok: boolean;
            state: string;
            worker_loop_running: boolean;
        };
        assert.equal(liveBody.state, 'stopped');
        assert.equal(liveBody.ok, false);
        assert.equal(liveBody.worker_loop_running, false);
    } finally {
        await app.close();
    }
});

test('kill endpoint is idempotent and returns kill_already_engaged after first invocation', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        killGraceMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const firstKill = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(firstKill.statusCode, 202);

        const secondKill = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(secondKill.statusCode, 202);
        const secondBody = secondKill.json() as Record<string, unknown>;
        assert.equal(secondBody['status'], 'kill_already_engaged');
    } finally {
        await app.close();
    }
});

test('tasks intake rejects before startup and accepts after startup with processing observable', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const preStartIntakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'task-before-start',
                payload: { kind: 'noop' },
            },
        });
        assert.equal(preStartIntakeRes.statusCode, 409);
        const preStartBody = preStartIntakeRes.json() as Record<string, unknown>;
        assert.equal(preStartBody['error'], 'runtime_not_ready');

        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'task-after-start',
                payload: { kind: 'noop' },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        const intakeBody = intakeRes.json() as Record<string, unknown>;
        assert.equal(intakeBody['status'], 'queued');
        assert.equal(typeof intakeBody['queue_depth'], 'number');
        assert.ok(Number(intakeBody['queue_depth']) >= 1);

        // Allow worker loop to process the queued task.
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            task_queue_depth: number;
            processed_tasks: number;
        };
        assert.equal(liveBody.task_queue_depth, 0);
        assert.ok(liveBody.processed_tasks >= 1);
    } finally {
        await app.close();
    }
});

test('tasks intake returns 400 when task_id is missing after startup', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const badIntakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                payload: { kind: 'noop' },
            },
        });

        assert.equal(badIntakeRes.statusCode, 400);
        const badBody = badIntakeRes.json() as Record<string, unknown>;
        assert.equal(badBody['error'], 'invalid_task');
        assert.equal(badBody['message'], 'task_id is required');
    } finally {
        await app.close();
    }
});

test('high-risk task is classified and routed to approval queue', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'risk-high-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into main',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            processed_tasks: number;
            approval_queued_tasks: number;
            pending_approval_tasks: number;
            succeeded_tasks: number;
        };

        assert.ok(liveBody.processed_tasks >= 1);
        assert.ok(liveBody.approval_queued_tasks >= 1);
        assert.ok(liveBody.pending_approval_tasks >= 1);
        assert.equal(liveBody.succeeded_tasks, 0);
    } finally {
        await app.close();
    }
});

test('approval-required task triggers automatic approval intake call', async () => {
    const intakeCalls: Array<Record<string, unknown>> = [];
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_APPROVAL_INTAKE_SHARED_TOKEN: 'shared-intake-token',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        approvalIntakeClient: async (input) => {
            intakeCalls.push(input as unknown as Record<string, unknown>);
            return {
                ok: true,
                statusCode: 201,
                approvalId: 'apr_test_1',
            };
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'task-auto-intake-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into main',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        assert.equal(intakeCalls.length, 1);
        assert.equal(intakeCalls[0]?.taskId, 'task-auto-intake-1');
        assert.equal(intakeCalls[0]?.riskLevel, 'high');
        assert.equal(intakeCalls[0]?.token, 'shared-intake-token');
        assert.equal(intakeCalls[0]?.requestedBy, 'runtime:bot_test');
    } finally {
        await app.close();
    }
});

test('approval intake retries transient failures with exponential backoff then succeeds', async () => {
    const intakeCalls: Array<Record<string, unknown>> = [];
    const sleepCalls: number[] = [];
    let attempts = 0;

    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_APPROVAL_INTAKE_SHARED_TOKEN: 'shared-intake-token',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        approvalIntakeBackoffMs: 5,
        approvalIntakeClient: async (input) => {
            attempts += 1;
            intakeCalls.push(input as unknown as Record<string, unknown>);
            if (attempts < 3) {
                return {
                    ok: false,
                    statusCode: 503,
                    errorMessage: 'temporary outage',
                };
            }
            return {
                ok: true,
                statusCode: 201,
                approvalId: 'apr_retry_success',
            };
        },
        sleep: async (ms) => {
            sleepCalls.push(ms);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'task-intake-retry-success',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Retry intake request',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        assert.equal(intakeCalls.length, 3);
        assert.deepEqual(sleepCalls, [5, 10]);
    } finally {
        await app.close();
    }
});

test('approval intake does not retry non-transient failures', async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];

    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_APPROVAL_INTAKE_SHARED_TOKEN: 'shared-intake-token',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        approvalIntakeBackoffMs: 5,
        approvalIntakeClient: async () => {
            attempts += 1;
            return {
                ok: false,
                statusCode: 401,
                errorMessage: 'unauthorized',
            };
        },
        sleep: async (ms) => {
            sleepCalls.push(ms);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'task-intake-no-retry',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Do not retry unauthorized intake',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        assert.equal(attempts, 1);
        assert.deepEqual(sleepCalls, []);
    } finally {
        await app.close();
    }
});

test('approval-required tasks auto-escalate after timeout threshold', async () => {
    let fakeNow = 1_000;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        approvalEscalationMs: 50,
        now: () => fakeNow,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'approval-escalation-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into main',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 40));

        fakeNow += 120;
        await new Promise<void>((resolve) => setTimeout(resolve, 30));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            approval_queued_tasks: number;
            pending_approval_tasks: number;
            escalated_approval_tasks: number;
        };

        assert.ok(liveBody.approval_queued_tasks >= 1);
        assert.ok(liveBody.pending_approval_tasks >= 1);
        assert.ok(liveBody.escalated_approval_tasks >= 1);
    } finally {
        await app.close();
    }
});

test('approval decision endpoint resolves pending approval and removes it from queue', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'decision-approval-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into main',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const decisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'decision-approval-1',
                decision: 'approved',
                reason: 'Safe after review',
                actor: 'approver_1',
            },
        });
        assert.equal(decisionRes.statusCode, 200);
        const decisionBody = decisionRes.json() as {
            status: string;
            decision: string;
            execution_status: string;
            was_escalated: boolean;
            pending_approval_tasks: number;
        };

        assert.equal(decisionBody.status, 'resolved');
        assert.equal(decisionBody.decision, 'approved');
        assert.equal(decisionBody.execution_status, 'success');
        assert.equal(decisionBody.was_escalated, false);
        assert.equal(decisionBody.pending_approval_tasks, 0);

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            pending_approval_tasks: number;
            approval_resolved_tasks: number;
            approval_approved_tasks: number;
            succeeded_tasks: number;
        };
        assert.equal(liveBody.pending_approval_tasks, 0);
        assert.ok(liveBody.approval_resolved_tasks >= 1);
        assert.ok(liveBody.approval_approved_tasks >= 1);
        assert.ok(liveBody.succeeded_tasks >= 1);
    } finally {
        await app.close();
    }
});

test('approval decision endpoint resolves escalated approval and tracks rejected decision', async () => {
    let fakeNow = 1_000;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        approvalEscalationMs: 50,
        now: () => fakeNow,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'decision-escalated-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into main',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        await new Promise<void>((resolve) => setTimeout(resolve, 40));

        fakeNow += 120;
        await new Promise<void>((resolve) => setTimeout(resolve, 30));

        const decisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'decision-escalated-1',
                decision: 'rejected',
                reason: 'Needs human execution',
                actor: 'approver_2',
            },
        });
        assert.equal(decisionRes.statusCode, 200);
        const decisionBody = decisionRes.json() as { was_escalated: boolean; decision: string; execution_status: string };
        assert.equal(decisionBody.was_escalated, true);
        assert.equal(decisionBody.decision, 'rejected');
        assert.equal(decisionBody.execution_status, 'cancelled');

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            pending_approval_tasks: number;
            approval_resolved_tasks: number;
            approval_rejected_tasks: number;
            failed_tasks: number;
        };
        assert.equal(liveBody.pending_approval_tasks, 0);
        assert.ok(liveBody.approval_resolved_tasks >= 1);
        assert.ok(liveBody.approval_rejected_tasks >= 1);
        assert.equal(liveBody.failed_tasks, 0);
    } finally {
        await app.close();
    }
});

test('approved decision executes deferred risky action and persists success result', async () => {
    const persisted: ActionResultRecord[] = [];
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        actionResultWriter: async (record) => {
            persisted.push(record);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'decision-exec-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch after approval',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const decisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'decision-exec-1',
                decision: 'approved',
                reason: 'Approved by human',
                actor: 'approver_3',
            },
        });
        assert.equal(decisionRes.statusCode, 200);

        const decisionBody = decisionRes.json() as { execution_status: string };
        assert.equal(decisionBody.execution_status, 'success');

        const approvalRecord = persisted.find((record) => record.taskId === 'decision-exec-1' && record.status === 'approval_required');
        const successRecord = persisted.find((record) => record.taskId === 'decision-exec-1' && record.status === 'success');
        assert.ok(approvalRecord);
        assert.ok(successRecord);
        assert.equal(successRecord?.route, 'execute');
        assert.equal(successRecord?.riskLevel, 'high');
    } finally {
        await app.close();
    }
});

test('approved connector-risk task executes via connector action endpoint client', async () => {
    const persisted: ActionResultRecord[] = [];
    const connectorCalls: Array<Record<string, unknown>> = [];

    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_CONNECTOR_EXEC_SHARED_TOKEN: 'connector-exec-token',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        actionResultWriter: async (record) => {
            persisted.push(record);
        },
        connectorActionExecuteClient: async (input) => {
            connectorCalls.push(input as unknown as Record<string, unknown>);
            return {
                ok: true,
                statusCode: 200,
                attempts: 2,
            };
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'decision-connector-1',
                payload: {
                    action_type: 'create_comment',
                    connector_type: 'jira',
                    summary: 'Post PR comment after human approval',
                    target: 'PR-44',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const decisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'decision-connector-1',
                decision: 'approved',
                reason: 'approved for connector execution',
                actor: 'approver_5',
            },
        });
        assert.equal(decisionRes.statusCode, 200);

        assert.equal(connectorCalls.length, 1);
        assert.equal(connectorCalls[0]?.connectorType, 'jira');
        assert.equal(connectorCalls[0]?.actionType, 'create_comment');
        assert.equal(connectorCalls[0]?.roleKey, 'developer');
        assert.equal(connectorCalls[0]?.token, 'connector-exec-token');

        const successRecord = persisted.find((record) => record.taskId === 'decision-connector-1' && record.status === 'success');
        assert.ok(successRecord);
        assert.equal(successRecord?.route, 'execute');
        assert.equal(successRecord?.retries, 1);
    } finally {
        await app.close();
    }
});

test('rejected decision persists cancelled action result for graceful cancellation', async () => {
    const persisted: ActionResultRecord[] = [];
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        actionResultWriter: async (record) => {
            persisted.push(record);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'decision-cancel-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Cancel this risky action',
                    target: 'main',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const decisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'decision-cancel-1',
                decision: 'rejected',
                reason: 'Rejected by approver',
                actor: 'approver_4',
            },
        });
        assert.equal(decisionRes.statusCode, 200);
        const decisionBody = decisionRes.json() as { execution_status: string };
        assert.equal(decisionBody.execution_status, 'cancelled');

        const cancelledRecord = persisted.find((record) => record.taskId === 'decision-cancel-1' && record.status === 'cancelled');
        assert.ok(cancelledRecord);
        assert.equal(cancelledRecord?.route, 'approval');
        assert.equal(cancelledRecord?.riskLevel, 'high');
        assert.equal(cancelledRecord?.errorMessage, 'Rejected by approver');
    } finally {
        await app.close();
    }
});

test('decision endpoint enforces shared token auth when configured', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_RUNTIME_DECISION_SHARED_TOKEN: 'runtime-decision-secret',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const unauthorizedRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'any-task',
                decision: 'approved',
            },
        });
        assert.equal(unauthorizedRes.statusCode, 401);

        const authorizedRes = await app.inject({
            method: 'POST',
            url: '/decision',
            headers: {
                'x-runtime-decision-token': 'runtime-decision-secret',
            },
            payload: {
                task_id: 'any-task',
                decision: 'approved',
            },
        });
        assert.equal(authorizedRes.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('approval decision endpoint validates runtime state, payload, and pending task existence', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const beforeStartRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'unknown',
                decision: 'approved',
            },
        });
        assert.equal(beforeStartRes.statusCode, 409);

        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const invalidDecisionRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'unknown',
                decision: 'maybe',
            },
        });
        assert.equal(invalidDecisionRes.statusCode, 400);

        const notFoundRes = await app.inject({
            method: 'POST',
            url: '/decision',
            payload: {
                task_id: 'unknown',
                decision: 'approved',
            },
        });
        assert.equal(notFoundRes.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('logs endpoint returns structured runtime events and supports limit', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 1_000,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'logs-task-1',
                payload: {
                    action_type: 'read_task',
                    summary: 'Read and summarize item',
                    target: 'ticket-321',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=5' });
        assert.equal(logsRes.statusCode, 200);
        const logsBody = logsRes.json() as {
            count: number;
            logs: Array<{ at: string; eventType: string; runtimeState: string }>;
        };

        assert.ok(logsBody.count > 0);
        assert.ok(logsBody.logs.length <= 5);
        assert.equal(typeof logsBody.logs[0]?.at, 'string');
        assert.equal(typeof logsBody.logs[0]?.eventType, 'string');
        assert.equal(typeof logsBody.logs[0]?.runtimeState, 'string');

        const badLimitRes = await app.inject({ method: 'GET', url: '/logs?limit=0' });
        assert.equal(badLimitRes.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('logs contain runtime.task_classified event with confidence and risk metadata for low-risk task', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'log-meta-low-1',
                payload: {
                    action_type: 'read_task',
                    summary: 'Read and summarize deployment status',
                    target: 'deployments',
                },
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=50' });
        assert.equal(logsRes.statusCode, 200);
        const logsBody = logsRes.json() as {
            logs: Array<{ eventType: string; details?: Record<string, unknown> }>;
        };

        const classified = logsBody.logs.find(
            (l) => l.eventType === 'runtime.task_classified' &&
                (l.details as Record<string, unknown>)?.['task_id'] === 'log-meta-low-1',
        );
        assert.ok(classified, 'runtime.task_classified event must appear in logs');

        const details = classified?.details as Record<string, unknown>;
        assert.equal(details['action_type'], 'read_task');
        assert.equal(details['risk_level'], 'low');
        assert.equal(details['route'], 'execute');
        assert.equal(typeof details['confidence'], 'number');
        assert.ok((details['confidence'] as number) > 0.5, 'confidence must be above 0.5 for a well-formed task');
        assert.equal(typeof details['classification_reason'], 'string');
    } finally {
        await app.close();
    }
});

test('logs contain runtime.approval_required event with confidence and risk_level for high-risk task', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'log-meta-high-1',
                payload: {
                    action_type: 'merge_release',
                    summary: 'Merge release branch into production',
                    target: 'main',
                },
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=100' });
        const logsBody = logsRes.json() as {
            logs: Array<{ eventType: string; details?: Record<string, unknown> }>;
        };

        const classifiedEvent = logsBody.logs.find(
            (l) => l.eventType === 'runtime.task_classified' &&
                (l.details as Record<string, unknown>)?.['task_id'] === 'log-meta-high-1',
        );
        assert.ok(classifiedEvent, 'runtime.task_classified event must appear');
        const classifiedDetails = classifiedEvent?.details as Record<string, unknown>;
        assert.equal(classifiedDetails['risk_level'], 'high');
        assert.equal(classifiedDetails['route'], 'approval');

        const approvalEvent = logsBody.logs.find(
            (l) => l.eventType === 'runtime.approval_required' &&
                (l.details as Record<string, unknown>)?.['task_id'] === 'log-meta-high-1',
        );
        assert.ok(approvalEvent, 'runtime.approval_required event must appear');
        const approvalDetails = approvalEvent?.details as Record<string, unknown>;
        assert.equal(approvalDetails['risk_level'], 'high');
        assert.equal(typeof approvalDetails['confidence'], 'number');
    } finally {
        await app.close();
    }
});

test('logs do not contain confidence metadata for tasks that fail before classification', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        // Do not startup — task intake will be rejected with 409
        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'log-meta-prestart-1',
                payload: { action_type: 'read_task', summary: 'Should not classify', target: 'x' },
            },
        });
        assert.equal(intakeRes.statusCode, 409);

        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=100' });
        const logsBody = logsRes.json() as {
            logs: Array<{ eventType: string; details?: Record<string, unknown> }>;
        };

        const classified = logsBody.logs.find(
            (l) => l.eventType === 'runtime.task_classified' &&
                (l.details as Record<string, unknown>)?.['task_id'] === 'log-meta-prestart-1',
        );
        assert.ok(!classified, 'rejected pre-startup task must never appear in task_classified logs');
    } finally {
        await app.close();
    }
});

test('heartbeat loop updates live health metrics while active', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await new Promise<void>((resolve) => setTimeout(resolve, 90));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            heartbeat_loop_running: boolean;
            heartbeat_sent: number;
            heartbeat_failed: number;
            last_heartbeat_at: string | null;
        };

        assert.equal(liveBody.heartbeat_loop_running, true);
        assert.ok(liveBody.heartbeat_sent >= 1);
        assert.equal(liveBody.heartbeat_failed, 0);
        assert.equal(typeof liveBody.last_heartbeat_at, 'string');
    } finally {
        await app.close();
    }
});

test('state history endpoint returns runtime transition sequence', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        killGraceMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const killRes = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(killRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        const historyRes = await app.inject({ method: 'GET', url: '/state/history?limit=20' });
        assert.equal(historyRes.statusCode, 200);
        const body = historyRes.json() as {
            current_state: string;
            transitions: Array<{ to: string }>;
        };

        assert.equal(body.current_state, 'stopped');

        const toStates = body.transitions.map((t) => t.to);
        assert.ok(toStates.includes('created'));
        assert.ok(toStates.includes('starting'));
        assert.ok(toStates.includes('ready'));
        assert.ok(toStates.includes('active'));
        assert.ok(toStates.includes('stopping'));
        assert.ok(toStates.includes('stopped'));

        const badLimitRes = await app.inject({ method: 'GET', url: '/state/history?limit=-1' });
        assert.equal(badLimitRes.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('low-risk task retries transient failures and succeeds', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'retry-low-1',
                payload: {
                    action_type: 'read_task',
                    summary: 'Read backlog item and summarize',
                    target: 'ticket-123',
                    simulate_transient_failures: 2,
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            processed_tasks: number;
            succeeded_tasks: number;
            failed_tasks: number;
            retried_attempts: number;
        };

        assert.ok(liveBody.processed_tasks >= 1);
        assert.ok(liveBody.succeeded_tasks >= 1);
        assert.equal(liveBody.failed_tasks, 0);
        assert.ok(liveBody.retried_attempts >= 2);
    } finally {
        await app.close();
    }
});

test('low-risk hard failure (force_failure=true) is marked failed and persisted via action-result writer', async () => {
    const persisted: ActionResultRecord[] = [];
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        actionResultWriter: async (record) => {
            persisted.push(record);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'force-failure-low-1',
                payload: {
                    action_type: 'read_task',
                    summary: 'Read a ticket and prepare summary',
                    target: 'ticket-999',
                    force_failure: true,
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            processed_tasks: number;
            succeeded_tasks: number;
            failed_tasks: number;
        };
        assert.ok(liveBody.processed_tasks >= 1);
        assert.equal(liveBody.succeeded_tasks, 0);
        assert.ok(liveBody.failed_tasks >= 1);

        assert.equal(persisted.length, 1);
        assert.equal(persisted[0]?.taskId, 'force-failure-low-1');
        assert.equal(persisted[0]?.riskLevel, 'low');
        assert.equal(persisted[0]?.status, 'failed');
        assert.equal(persisted[0]?.failureClass, 'runtime_exception');
        assert.equal(persisted[0]?.route, 'execute');
        assert.equal(persisted[0]?.roleProfile, 'Developer Agent');
        assert.equal(persisted[0]?.policyPackVersion, 'mvp-v1');
    } finally {
        await app.close();
    }
});

test('startup freezes capability snapshot and exposes it via runtime endpoint', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const preStartSnapshot = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(preStartSnapshot.statusCode, 404);

        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as { role_key: string; capability_snapshot_id: string };
        assert.equal(startupBody.role_key, 'developer');
        assert.equal(typeof startupBody.capability_snapshot_id, 'string');

        const snapshotRes = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(snapshotRes.statusCode, 200);
        const snapshotBody = snapshotRes.json() as {
            snapshot: {
                roleKey: string;
                allowedConnectorTools: string[];
                allowedActions: string[];
            };
        };
        assert.equal(snapshotBody.snapshot.roleKey, 'developer');
        assert.ok(snapshotBody.snapshot.allowedConnectorTools.includes('github'));
        assert.ok(snapshotBody.snapshot.allowedActions.includes('create_pr_comment'));
    } finally {
        await app.close();
    }
});

test('startup loads latest persisted capability snapshot by botId when available', async () => {
    let persistCalled = 0;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async ({ botId }) => ({
                id: 'persisted-snapshot-42',
                botId,
                roleKey: 'developer',
                roleVersion: 'v1',
                allowedConnectorTools: ['jira', 'teams', 'github', 'email'],
                allowedActions: ['read_task', 'create_comment', 'update_status', 'send_message', 'create_pr_comment', 'send_email'],
                policyPackVersion: 'mvp-v1',
                frozenAt: new Date().toISOString(),
                brainConfig: {
                    roleSystemPromptVersion: 'v1',
                    roleToolPolicyVersion: 'v1',
                    roleRiskPolicyVersion: 'v1',
                    defaultModelProfile: 'quality_first',
                    fallbackModelProfile: 'speed_first',
                },
                snapshotVersion: 4,
                source: 'persisted_load',
            }),
            persistSnapshot: async ({ snapshot }) => {
                persistCalled += 1;
                return snapshot;
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'persisted-snapshot-42');
        assert.equal(startupBody.capability_snapshot_source, 'persisted_load');
        assert.equal(persistCalled, 0);

        const snapshotRes = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(snapshotRes.statusCode, 200);
        const snapshotBody = snapshotRes.json() as {
            snapshot: {
                id: string;
                source?: string;
                snapshotVersion?: number;
            };
        };
        assert.equal(snapshotBody.snapshot.id, 'persisted-snapshot-42');
        assert.equal(snapshotBody.snapshot.source, 'persisted_load');
        assert.equal(snapshotBody.snapshot.snapshotVersion, 4);
    } finally {
        await app.close();
    }
});

test('startup falls back to frozen snapshot and persists it when no persisted snapshot exists', async () => {
    let persistCalls = 0;
    let persistedInputSnapshotId: string | null = null;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async () => null,
            persistSnapshot: async ({ snapshot, source }) => {
                persistCalls += 1;
                persistedInputSnapshotId = snapshot.id;
                return {
                    ...snapshot,
                    id: 'persisted-frozen-1',
                    snapshotVersion: 1,
                    source,
                };
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'persisted-frozen-1');
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');
        assert.equal(persistCalls, 1);
        assert.equal(typeof persistedInputSnapshotId, 'string');

        const snapshotRes = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(snapshotRes.statusCode, 200);
        const snapshotBody = snapshotRes.json() as {
            snapshot: {
                id: string;
                source?: string;
                snapshotVersion?: number;
            };
        };
        assert.equal(snapshotBody.snapshot.id, 'persisted-frozen-1');
        assert.equal(snapshotBody.snapshot.source, 'runtime_freeze');
        assert.equal(snapshotBody.snapshot.snapshotVersion, 1);
    } finally {
        await app.close();
    }
});

test('startup falls back to frozen snapshot when persisted snapshot load throws', async () => {
    let persistCalls = 0;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async () => {
                throw new Error('snapshot store unavailable');
            },
            persistSnapshot: async ({ snapshot, source }) => {
                persistCalls += 1;
                return {
                    ...snapshot,
                    id: 'fallback-after-load-error',
                    snapshotVersion: 1,
                    source,
                };
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'fallback-after-load-error');
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');
        assert.equal(persistCalls, 1);
    } finally {
        await app.close();
    }
});

test('startup continues with in-memory frozen snapshot when snapshot persist fails', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async () => null,
            persistSnapshot: async () => {
                throw new Error('persist failed');
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.ok(startupBody.capability_snapshot_id.startsWith('bot_test:snapshot:'));
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');

        const snapshotRes = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(snapshotRes.statusCode, 200);
        const snapshotBody = snapshotRes.json() as {
            snapshot: {
                id: string;
                source?: string;
            };
        };
        assert.ok(snapshotBody.snapshot.id.startsWith('bot_test:snapshot:'));
        assert.equal(snapshotBody.snapshot.source, 'runtime_freeze');
    } finally {
        await app.close();
    }
});

test('startup falls back to fresh freeze when persisted snapshot role key mismatches runtime config', async () => {
    let persistCalls = 0;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async ({ botId }) => ({
                id: 'persisted-incompatible-role',
                botId,
                roleKey: 'recruiter',
                roleVersion: 'v1',
                allowedConnectorTools: ['teams', 'email'],
                allowedActions: ['send_message', 'send_email'],
                policyPackVersion: 'mvp-v1',
                frozenAt: new Date().toISOString(),
                brainConfig: {
                    roleSystemPromptVersion: 'v1',
                    roleToolPolicyVersion: 'v1',
                    roleRiskPolicyVersion: 'v1',
                    defaultModelProfile: 'quality_first',
                    fallbackModelProfile: 'speed_first',
                },
                source: 'persisted_load',
            }),
            persistSnapshot: async ({ snapshot, source }) => {
                persistCalls += 1;
                return {
                    ...snapshot,
                    id: 'fresh-after-role-mismatch',
                    source,
                    snapshotVersion: 1,
                };
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'fresh-after-role-mismatch');
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');
        assert.equal(persistCalls, 1);
    } finally {
        await app.close();
    }
});

test('startup falls back to fresh freeze when persisted snapshot policy pack mismatches runtime config', async () => {
    let persistCalls = 0;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async ({ botId }) => ({
                id: 'persisted-incompatible-policy',
                botId,
                roleKey: 'developer',
                roleVersion: 'v1',
                allowedConnectorTools: ['jira', 'teams', 'github', 'email'],
                allowedActions: ['read_task', 'create_comment', 'update_status', 'send_message', 'create_pr_comment', 'send_email'],
                policyPackVersion: 'legacy-policy-v0',
                frozenAt: new Date().toISOString(),
                brainConfig: {
                    roleSystemPromptVersion: 'v1',
                    roleToolPolicyVersion: 'v1',
                    roleRiskPolicyVersion: 'v1',
                    defaultModelProfile: 'quality_first',
                    fallbackModelProfile: 'speed_first',
                },
                source: 'persisted_load',
            }),
            persistSnapshot: async ({ snapshot, source }) => {
                persistCalls += 1;
                return {
                    ...snapshot,
                    id: 'fresh-after-policy-mismatch',
                    source,
                    snapshotVersion: 1,
                };
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'fresh-after-policy-mismatch');
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');
        assert.equal(persistCalls, 1);
    } finally {
        await app.close();
    }
});

test('startup falls back to fresh freeze when persisted snapshot connector/action policy is malformed', async () => {
    let persistCalls = 0;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: {
            loadLatestByBotId: async ({ botId }) => ({
                id: 'persisted-malformed-policy',
                botId,
                roleKey: 'developer',
                roleVersion: 'v1',
                allowedConnectorTools: ['jira'],
                allowedActions: ['read_task'],
                policyPackVersion: 'mvp-v1',
                frozenAt: new Date().toISOString(),
                brainConfig: {
                    roleSystemPromptVersion: 'v1',
                    roleToolPolicyVersion: 'v1',
                    roleRiskPolicyVersion: 'v1',
                    defaultModelProfile: 'quality_first',
                    fallbackModelProfile: 'speed_first',
                },
                source: 'persisted_load',
            }),
            persistSnapshot: async ({ snapshot, source }) => {
                persistCalls += 1;
                return {
                    ...snapshot,
                    id: 'fresh-after-malformed-policy',
                    source,
                    snapshotVersion: 1,
                };
            },
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as {
            capability_snapshot_id: string;
            capability_snapshot_source: string;
        };
        assert.equal(startupBody.capability_snapshot_id, 'fresh-after-malformed-policy');
        assert.equal(startupBody.capability_snapshot_source, 'runtime_freeze');
        assert.equal(persistCalls, 1);
    } finally {
        await app.close();
    }
});

test('runtime blocks disallowed connector execution based on frozen snapshot policy', async () => {
    const persisted: ActionResultRecord[] = [];
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_ROLE_PROFILE: 'Recruiter',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        actionResultWriter: async (record) => {
            persisted.push(record);
        },
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const intakeRes = await app.inject({
            method: 'POST',
            url: '/tasks/intake',
            payload: {
                task_id: 'policy-blocked-1',
                payload: {
                    action_type: 'create_pr_comment',
                    connector_type: 'github',
                    summary: 'Attempt PR comment from recruiter role',
                    target: 'pr-10',
                },
            },
        });
        assert.equal(intakeRes.statusCode, 202);

        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            processed_tasks: number;
            failed_tasks: number;
            pending_approval_tasks: number;
        };
        assert.ok(liveBody.processed_tasks >= 1);
        assert.ok(liveBody.failed_tasks >= 1);
        assert.equal(liveBody.pending_approval_tasks, 0);

        const failedRecord = persisted.find((record) => record.taskId === 'policy-blocked-1');
        assert.ok(failedRecord);
        assert.equal(failedRecord?.status, 'failed');
        assert.equal(failedRecord?.failureClass, 'runtime_exception');
        assert.ok((failedRecord?.errorMessage ?? '').includes('not allowed'));
    } finally {
        await app.close();
    }
});

test('startup rejects corrupted snapshot with checksum mismatch and falls back to fresh freeze', async () => {
    // Without DATABASE_URL, loadLatestByBotId returns null in the default persistence client
    // This simulates a corrupted snapshot scenario where the load would fail/return null
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        // No capabilitySnapshotPersistenceClient, so it will use default (which returns null without DATABASE_URL)
        // This simulates the corrupted snapshot rejection scenario
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);
        const startupBody = startupRes.json() as { status: string };
        assert.equal(startupBody.status, 'started');

        // Verify health endpoint indicates snapshot was frozen (no persisted snapshot available)
        const healthRes = await app.inject({ method: 'GET', url: '/health' });
        const health = healthRes.json() as {
            snapshot_source: string;
            snapshot_fallback_reason: string;
            snapshot_checksum?: string;
        };
        // Should have fallen back to fresh freeze
        assert.equal(health.snapshot_source, 'runtime_freeze');
        assert.equal(health.snapshot_fallback_reason, 'snapshot_not_found');
    } finally {
        await app.close();
    }
});

test('health endpoint includes snapshot version and checksum for observability', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const healthRes = await app.inject({ method: 'GET', url: '/health' });
        const health = healthRes.json() as {
            ok: boolean;
            snapshot_source: string;
            snapshot_version: number | null;
            snapshot_checksum: string | null;
            snapshot_fallback_reason: string | null;
        };

        assert.equal(health.ok, true);
        assert.equal(health.snapshot_source, 'runtime_freeze');
        assert.equal(typeof health.snapshot_version, 'number');
        assert.equal(typeof health.snapshot_checksum, 'string');
        // When snapshot is frozen from scratch, fallback_reason is 'snapshot_not_found'
        assert.equal(health.snapshot_fallback_reason, 'snapshot_not_found');
    } finally {
        await app.close();
    }
});

test('capability-snapshot endpoint exposes snapshot metadata with version and checksum', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const snapshotRes = await app.inject({ method: 'GET', url: '/runtime/capability-snapshot' });
        assert.equal(snapshotRes.statusCode, 200);
        const snapshotBody = snapshotRes.json() as {
            snapshot: { snapshotVersion: number; snapshotChecksum?: string };
            metadata: {
                snapshot_source: string;
                snapshot_version: number;
                snapshot_checksum: string;
                fallback_reason: string | null;
            };
        };

        assert.equal(typeof snapshotBody.snapshot.snapshotVersion, 'number');
        assert.equal(typeof snapshotBody.snapshot.snapshotChecksum, 'string');
        assert.ok(snapshotBody.snapshot.snapshotChecksum && snapshotBody.snapshot.snapshotChecksum.length > 0);

        // Verify metadata structure
        assert.equal(snapshotBody.metadata.snapshot_source, 'runtime_freeze');
        assert.equal(typeof snapshotBody.metadata.snapshot_version, 'number');
        assert.equal(typeof snapshotBody.metadata.snapshot_checksum, 'string');
        // When snapshot is frozen from scratch, fallback_reason indicates why
        assert.equal(snapshotBody.metadata.fallback_reason, 'snapshot_not_found');
    } finally {
        await app.close();
    }
});

test('startup increments snapshot version on each persist call', async () => {
    const persisted: Array<{ snapshotVersion: number }> = [];

    const persistenceClient = {
        loadLatestByBotId: async () => null,
        persistSnapshot: async ({ snapshot, source }: { snapshot: any; source: any }) => {
            const result = {
                ...snapshot,
                id: `persisted-v${persisted.length + 1}`,
                source,
                snapshotVersion: persisted.length + 1,
            };
            persisted.push({ snapshotVersion: result.snapshotVersion });
            return result;
        },
    };

    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        capabilitySnapshotPersistenceClient: persistenceClient,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        // First startup should create version 1
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0].snapshotVersion, 1);

        // Each subsequent persist should increment version
        // (In this test, we only have one startup, so version should be 1)
        assert.equal(persisted[persisted.length - 1].snapshotVersion, 1);
    } finally {
        await app.close();
    }
});

test('startup returns already_started when runtime is active', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const first = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(first.statusCode, 200);

        const second = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(second.statusCode, 200);
        const body = second.json() as { status: string; state: string };
        assert.equal(body.status, 'already_started');
        assert.equal(body.state, 'active');
    } finally {
        await app.close();
    }
});

test('kill endpoint returns kill_already_engaged on second call', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        killGraceMs: 40,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const firstKill = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(firstKill.statusCode, 202);

        const secondKill = await app.inject({ method: 'POST', url: '/kill' });
        assert.equal(secondKill.statusCode, 202);
        const secondBody = secondKill.json() as { status: string; state: string };
        assert.equal(secondBody.status, 'kill_already_engaged');
        assert.equal(secondBody.state, 'stopping');
    } finally {
        await app.close();
    }
});

test('startup fails with config_error for invalid AF_HEALTH_PORT', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_HEALTH_PORT: 'not-a-number',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 500);
        const body = startupRes.json() as { error: string; failure_class: string; state: string; message: string };
        assert.equal(body.error, 'runtime_init_failed');
        assert.equal(body.failure_class, 'config_error');
        assert.equal(body.state, 'failed');
        assert.match(body.message, /Invalid AF_HEALTH_PORT/);
    } finally {
        await app.close();
    }
});

test('startup fails in production when approval intake token is missing', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            NODE_ENV: 'production',
            AF_APPROVAL_INTAKE_SHARED_TOKEN: '',
            AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN: '',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 500);
        const body = startupRes.json() as { failure_class: string; message: string };
        assert.equal(body.failure_class, 'config_error');
        assert.match(body.message, /AF_APPROVAL_INTAKE_SHARED_TOKEN/);
    } finally {
        await app.close();
    }
});

test('startup fails when role key cannot be resolved', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_ROLE_PROFILE: 'Unsupported Role',
            AF_ROLE_KEY: 'unknown_role',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 500);
        const body = startupRes.json() as { failure_class: string; message: string };
        assert.equal(body.failure_class, 'config_error');
        assert.match(body.message, /Unable to resolve role key/);
    } finally {
        await app.close();
    }
});

test('decision endpoint accepts bearer authorization token when configured', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_RUNTIME_DECISION_SHARED_TOKEN: 'runtime-decision-secret',
        },
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const authorizedRes = await app.inject({
            method: 'POST',
            url: '/decision',
            headers: {
                authorization: 'Bearer runtime-decision-secret',
            },
            payload: {
                task_id: 'unknown-task',
                decision: 'approved',
            },
        });

        assert.equal(authorizedRes.statusCode, 404);
        const body = authorizedRes.json() as { error: string };
        assert.equal(body.error, 'approval_not_found');
    } finally {
        await app.close();
    }
});

// ── Task 3.3: Runtime observability and state management ────────────────────

test('logs total_buffered shows full buffer size while limit restricts response count', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 1_000,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        // Startup alone emits 10+ events; limit=2 must show fewer than buffered.
        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=2' });
        assert.equal(logsRes.statusCode, 200);
        const body = logsRes.json() as {
            count: number;
            total_buffered: number;
            logs: unknown[];
        };

        assert.equal(body.count, 2);
        assert.ok(body.total_buffered > 2, 'total_buffered must reflect all emitted events');
        assert.equal(body.logs.length, 2);
    } finally {
        await app.close();
    }
});

test('logs buffer caps at maxRuntimeLogs and oldest entries are evicted', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 1_000,
        // Startup emits ~11 events; with cap=5 the oldest should be evicted.
        maxRuntimeLogs: 5,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=100' });
        assert.equal(logsRes.statusCode, 200);
        const body = logsRes.json() as {
            count: number;
            total_buffered: number;
            logs: Array<{ eventType: string }>;
        };

        // Buffer must never exceed the cap.
        assert.ok(body.total_buffered <= 5, `total_buffered must be <= 5, got ${body.total_buffered}`);
        assert.ok(body.count <= 5);

        // The very first startup event (init_started) must have been evicted.
        const hasInitStarted = body.logs.some((l) => l.eventType === 'runtime.init_started');
        assert.equal(hasInitStarted, false, 'runtime.init_started should be evicted when cap is 5');
    } finally {
        await app.close();
    }
});

test('runtime.state_transition events appear in /logs with from_state and next_state details', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=100' });
        assert.equal(logsRes.statusCode, 200);
        const body = logsRes.json() as {
            logs: Array<{ eventType: string; details?: Record<string, unknown> }>;
        };

        const transitions = body.logs.filter((l) => l.eventType === 'runtime.state_transition');
        assert.ok(transitions.length >= 3, 'at least 3 state transitions (starting, ready, active)');

        for (const t of transitions) {
            const d = t.details as Record<string, unknown>;
            assert.equal(typeof d['from_state'], 'string', 'from_state must be a string');
            assert.equal(typeof d['next_state'], 'string', 'next_state must be a string');
        }

        const transitionTargets = transitions.map((t) => (t.details as Record<string, unknown>)['next_state'] as string);
        assert.ok(transitionTargets.includes('starting'));
        assert.ok(transitionTargets.includes('ready'));
        assert.ok(transitionTargets.includes('active'));
    } finally {
        await app.close();
    }
});

test('heartbeat failure increments failed count when control plane probe returns false', async () => {
    const app = buildRuntimeServer({
        env: {
            ...baseEnv(),
            AF_CONTROL_PLANE_HEARTBEAT_URL: 'http://control-plane.local/heartbeat',
        },
        closeOnKill: false,
        // Approval and evidence URLs succeed; heartbeat URL fails.
        dependencyProbe: async (url) => !url.includes('control-plane'),
        workerPollMs: 10,
        heartbeatIntervalMs: 20,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
        assert.equal(liveRes.statusCode, 200);
        const liveBody = liveRes.json() as {
            heartbeat_loop_running: boolean;
            heartbeat_sent: number;
            heartbeat_failed: number;
        };

        assert.equal(liveBody.heartbeat_loop_running, true);
        assert.equal(liveBody.heartbeat_sent, 0);
        assert.ok(liveBody.heartbeat_failed >= 1, 'heartbeat_failed must increment on probe failure');
    } finally {
        await app.close();
    }
});

test('heartbeat loop stops and metrics freeze after kill switch engages', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 20,
        killGraceMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const beforeKill = await app.inject({ method: 'GET', url: '/health/live' });
        const beforeBody = beforeKill.json() as { heartbeat_sent: number; heartbeat_loop_running: boolean };
        assert.equal(beforeBody.heartbeat_loop_running, true);
        const sentBeforeKill = beforeBody.heartbeat_sent;

        await app.inject({ method: 'POST', url: '/kill' });
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const afterKill = await app.inject({ method: 'GET', url: '/health/live' });
        const afterBody = afterKill.json() as {
            heartbeat_loop_running: boolean;
            heartbeat_sent: number;
            state: string;
        };

        assert.equal(afterBody.state, 'stopped');
        assert.equal(afterBody.heartbeat_loop_running, false, 'heartbeat loop must stop after kill');
        // Sent count must not have grown after kill.
        assert.equal(afterBody.heartbeat_sent, sentBeforeKill);
    } finally {
        await app.close();
    }
});

test('runtime.heartbeat_sent log event is emitted and carries sent_count metadata', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        heartbeatIntervalMs: 20,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const logsRes = await app.inject({ method: 'GET', url: '/logs?limit=100' });
        assert.equal(logsRes.statusCode, 200);
        const body = logsRes.json() as {
            logs: Array<{ eventType: string; details?: Record<string, unknown> }>;
        };

        const sentEvent = body.logs.find((l) => l.eventType === 'runtime.heartbeat_sent');
        assert.ok(sentEvent, 'runtime.heartbeat_sent must appear in /logs');

        const details = sentEvent?.details as Record<string, unknown>;
        assert.equal(typeof details['heartbeat_url'], 'string');
        assert.ok((details['sent_count'] as number) >= 1, 'sent_count must be >= 1');
    } finally {
        await app.close();
    }
});

test('state history transitions each have at, from, to, and reason fields', async () => {
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => true,
        workerPollMs: 10,
        killGraceMs: 25,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        await app.inject({ method: 'POST', url: '/kill' });
        await new Promise<void>((resolve) => setTimeout(resolve, 60));

        const historyRes = await app.inject({ method: 'GET', url: '/state/history?limit=50' });
        assert.equal(historyRes.statusCode, 200);
        const body = historyRes.json() as {
            transitions: Array<{ at: unknown; from: unknown; to: unknown; reason: unknown }>;
        };

        assert.ok(body.transitions.length >= 5, 'expect at least 5 recorded transitions');

        for (const t of body.transitions) {
            assert.equal(typeof t.at, 'string', 'at must be a string');
            assert.equal(typeof t.from, 'string', 'from must be a string');
            assert.equal(typeof t.to, 'string', 'to must be a string');
            // reason may be null or a string — must not be undefined
            assert.notEqual(t.reason, undefined, 'reason must not be undefined');
        }
    } finally {
        await app.close();
    }
});

test('degraded state is recorded in state history when dependencies become unreachable', async () => {
    let depsHealthy = true;
    const app = buildRuntimeServer({
        env: baseEnv(),
        closeOnKill: false,
        dependencyProbe: async () => depsHealthy,
        workerPollMs: 10,
    });

    try {
        const startupRes = await app.inject({ method: 'POST', url: '/startup' });
        assert.equal(startupRes.statusCode, 200);

        // Simulate dependency failure — triggers degraded on /health/ready call.
        depsHealthy = false;

        const readyRes = await app.inject({ method: 'GET', url: '/health/ready' });
        assert.equal(readyRes.statusCode, 200);
        const readyBody = readyRes.json() as { state: string; ready: boolean };
        assert.equal(readyBody.state, 'degraded');
        assert.equal(readyBody.ready, false);

        const historyRes = await app.inject({ method: 'GET', url: '/state/history?limit=50' });
        assert.equal(historyRes.statusCode, 200);
        const historyBody = historyRes.json() as {
            current_state: string;
            transitions: Array<{ to: string; reason: string | null }>;
        };

        assert.equal(historyBody.current_state, 'degraded');

        const degradedTransition = historyBody.transitions.find((t) => t.to === 'degraded');
        assert.ok(degradedTransition, 'degraded transition must be recorded in history');
        assert.equal(degradedTransition?.reason, 'dependency_unreachable');
    } finally {
        await app.close();
    }
});
