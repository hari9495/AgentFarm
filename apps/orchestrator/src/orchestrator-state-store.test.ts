import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    FileOrchestratorStateStore,
    PrismaOrchestratorStateStore,
    createOrchestratorStateStore,
    type OrchestratorPersistedState,
} from './orchestrator-state-store.js';

const sampleState = (): OrchestratorPersistedState => ({
    version: 1,
    taskScheduler: {
        runs: [
            {
                id: 'run-1',
                botId: 'bot-1',
                tenantId: 'tenant-1',
                workspaceId: 'ws-1',
                wakeSource: 'timer',
                status: 'queued',
                dedupeKey: 'dedupe-1',
                activeTaskCount: 0,
                startedAt: new Date().toISOString(),
                lastHeartbeatAt: new Date().toISOString(),
                correlationId: 'corr-1',
            },
        ],
    },
    routineScheduler: {
        scheduledTasks: [],
        featureFlags: {
            'scheduler.routine_tasks': true,
        },
        schedulerErrors: [],
        proactiveSignals: [],
    },
});

test('FileOrchestratorStateStore saves and loads state', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agentfarm-orchestrator-file-store-'));
    const statePath = join(tempDir, 'state.json');
    const store = new FileOrchestratorStateStore(statePath);

    try {
        await store.save(sampleState());
        const loaded = await store.load();

        assert.ok(loaded);
        assert.equal(loaded?.version, 1);
        assert.equal(loaded?.taskScheduler.runs.length, 1);
        assert.equal(loaded?.routineScheduler.featureFlags['scheduler.routine_tasks'], true);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('PrismaOrchestratorStateStore saves and loads state via audit event ledger', async () => {
    const rows: Array<{ summary: string }> = [];
    const fakePrisma = {
        auditEvent: {
            async findFirst() {
                if (rows.length === 0) {
                    return null;
                }
                return rows[rows.length - 1] ?? null;
            },
            async create(input: { data: { summary: string } }) {
                rows.push({ summary: input.data.summary });
                return;
            },
        },
    };

    const store = new PrismaOrchestratorStateStore(fakePrisma as never);
    await store.save(sampleState());
    const loaded = await store.load();

    assert.ok(loaded);
    assert.equal(loaded?.version, 1);
    assert.equal(loaded?.taskScheduler.runs[0]?.id, 'run-1');
    assert.equal(loaded?.routineScheduler.featureFlags['scheduler.routine_tasks'], true);
});

test('createOrchestratorStateStore db backend requires DATABASE_URL', () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
        assert.throws(() => {
            createOrchestratorStateStore({
                backend: 'db',
                statePath: '.orchestrator/state.json',
            });
        }, /DATABASE_URL is required/);
    } finally {
        if (previous === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previous;
        }
    }
});

test('createOrchestratorStateStore auto backend falls back to file when DATABASE_URL is missing', () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
        const store = createOrchestratorStateStore({
            backend: 'auto',
            statePath: '.orchestrator/state.json',
        });
        assert.ok(store instanceof FileOrchestratorStateStore);
    } finally {
        if (previous === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previous;
        }
    }
});

test('FileOrchestratorStateStore recovery path sanitizes malformed persisted payload instead of crashing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agentfarm-orchestrator-file-store-corrupt-'));
    const statePath = join(tempDir, 'state.json');
    const store = new FileOrchestratorStateStore(statePath);

    try {
        const corrupted = {
            version: 1,
            taskScheduler: {
                runs: [{ id: 'run-corrupt-1', status: 'queued' }],
            },
            routineScheduler: {
                scheduledTasks: [{ id: 'task-1' }],
                featureFlags: {
                    'scheduler.routine_tasks': true,
                    invalid_flag_type: 'yes',
                },
                schedulerErrors: [{ taskId: 42, error: 'bad', timestamp: null }],
                proactiveSignals: [{ id: 1, signalType: 'stale_pr' }],
            },
        };

        await writeFile(statePath, JSON.stringify(corrupted), 'utf8');
        const loaded = await store.load();

        assert.ok(loaded);
        // Task scheduler keeps object rows and ignores scalar noise.
        assert.equal(loaded?.taskScheduler.runs.length, 1);
        // Feature flags are strictly boolean-only.
        assert.equal(loaded?.routineScheduler.featureFlags['scheduler.routine_tasks'], true);
        assert.equal('invalid_flag_type' in (loaded?.routineScheduler.featureFlags ?? {}), false);
        // Invalid scheduler error rows are dropped during recovery sanitization.
        assert.equal(loaded?.routineScheduler.schedulerErrors.length, 0);
        // Invalid proactive signal rows are dropped during recovery sanitization.
        assert.equal(loaded?.routineScheduler.proactiveSignals.length, 0);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('PrismaOrchestratorStateStore recovery path returns null for malformed ledger payload', async () => {
    const fakePrisma = {
        auditEvent: {
            async findFirst() {
                return {
                    summary: 'ORCHESTRATOR_STATE:{"version":1,"taskScheduler":',
                };
            },
            async create() {
                return;
            },
        },
    };

    const store = new PrismaOrchestratorStateStore(fakePrisma as never);
    const loaded = await store.load();

    assert.equal(loaded, null);
});

test('PrismaOrchestratorStateStore recovery loads the latest persisted state snapshot', async () => {
    const rows: Array<{ summary: string }> = [];
    const fakePrisma = {
        auditEvent: {
            async findFirst() {
                if (rows.length === 0) {
                    return null;
                }
                return rows[rows.length - 1] ?? null;
            },
            async create(input: { data: { summary: string } }) {
                rows.push({ summary: input.data.summary });
                return;
            },
        },
    };

    const store = new PrismaOrchestratorStateStore(fakePrisma as never);

    const first = sampleState();
    const second: OrchestratorPersistedState = {
        ...sampleState(),
        taskScheduler: {
            runs: [
                ...sampleState().taskScheduler.runs,
                {
                    id: 'run-2',
                    botId: 'bot-1',
                    tenantId: 'tenant-1',
                    workspaceId: 'ws-1',
                    wakeSource: 'automation',
                    status: 'queued',
                    dedupeKey: 'dedupe-2',
                    activeTaskCount: 0,
                    startedAt: new Date().toISOString(),
                    lastHeartbeatAt: new Date().toISOString(),
                    correlationId: 'corr-2',
                },
            ],
        },
    };

    await store.save(first);
    await store.save(second);
    const loaded = await store.load();

    assert.ok(loaded);
    assert.equal(loaded?.taskScheduler.runs.length, 2);
    assert.equal(loaded?.taskScheduler.runs[1]?.id, 'run-2');
});
