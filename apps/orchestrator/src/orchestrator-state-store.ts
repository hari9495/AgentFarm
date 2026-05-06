import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type { RoutineSchedulerState } from './routine-scheduler.js';
import type { TaskSchedulerState } from './task-scheduler.js';

export interface OrchestratorPersistedState {
    version: 1;
    taskScheduler: TaskSchedulerState;
    routineScheduler: RoutineSchedulerState;
}

export interface OrchestratorStateStore {
    load(): Promise<OrchestratorPersistedState | null>;
    save(state: OrchestratorPersistedState): Promise<void>;
}

export type OrchestratorStateBackend = 'auto' | 'file' | 'db';

export interface CreateOrchestratorStateStoreOptions {
    backend?: OrchestratorStateBackend;
    statePath: string;
}

const sanitizeTaskSchedulerState = (value: unknown): TaskSchedulerState => {
    if (typeof value !== 'object' || value === null) {
        return { runs: [] };
    }

    const candidate = value as { runs?: unknown };
    return {
        runs: Array.isArray(candidate.runs)
            ? candidate.runs.filter((item): item is TaskSchedulerState['runs'][number] => typeof item === 'object' && item !== null)
            : [],
    };
};

const sanitizeRoutineSchedulerState = (value: unknown): RoutineSchedulerState => {
    if (typeof value !== 'object' || value === null) {
        return {
            scheduledTasks: [],
            featureFlags: {},
            schedulerErrors: [],
            proactiveSignals: [],
        };
    }

    const candidate = value as {
        scheduledTasks?: unknown;
        featureFlags?: unknown;
        schedulerErrors?: unknown;
        proactiveSignals?: unknown;
    };

    const featureFlags: Record<string, boolean> = {};
    if (typeof candidate.featureFlags === 'object' && candidate.featureFlags !== null) {
        for (const [key, value] of Object.entries(candidate.featureFlags as Record<string, unknown>)) {
            if (typeof value === 'boolean') {
                featureFlags[key] = value;
            }
        }
    }

    return {
        scheduledTasks: Array.isArray(candidate.scheduledTasks)
            ? candidate.scheduledTasks.filter((item): item is RoutineSchedulerState['scheduledTasks'][number] => typeof item === 'object' && item !== null)
            : [],
        featureFlags,
        schedulerErrors: Array.isArray(candidate.schedulerErrors)
            ? candidate.schedulerErrors.filter((item): item is RoutineSchedulerState['schedulerErrors'][number] => {
                if (typeof item !== 'object' || item === null) {
                    return false;
                }
                const row = item as Record<string, unknown>;
                return typeof row.taskId === 'string'
                    && typeof row.error === 'string'
                    && typeof row.timestamp === 'string';
            })
            : [],
        proactiveSignals: Array.isArray(candidate.proactiveSignals)
            ? candidate.proactiveSignals.filter((item): item is RoutineSchedulerState['proactiveSignals'][number] => {
                if (typeof item !== 'object' || item === null) {
                    return false;
                }
                const row = item as Record<string, unknown>;
                return typeof row.id === 'string'
                    && typeof row.signalType === 'string'
                    && typeof row.status === 'string'
                    && typeof row.workspaceId === 'string'
                    && typeof row.tenantId === 'string'
                    && typeof row.botId === 'string'
                    && typeof row.summary === 'string'
                    && typeof row.sourceRef === 'string'
                    && typeof row.detectedAt === 'string'
                    && typeof row.updatedAt === 'string';
            })
            : [],
    };
};

export class FileOrchestratorStateStore implements OrchestratorStateStore {
    constructor(private readonly filePath: string) { }

    async load(): Promise<OrchestratorPersistedState | null> {
        try {
            const payload = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(payload) as {
                version?: unknown;
                taskScheduler?: unknown;
                routineScheduler?: unknown;
            };

            return {
                version: 1,
                taskScheduler: sanitizeTaskSchedulerState(parsed.taskScheduler),
                routineScheduler: sanitizeRoutineSchedulerState(parsed.routineScheduler),
            };
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    async save(state: OrchestratorPersistedState): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.tmp`;
        await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
        await rename(tempPath, this.filePath);
    }
}

type PrismaAuditEventReader = {
    findFirst: (input: {
        where: {
            tenantId: string;
            workspaceId: string;
            botId: string;
            sourceSystem: string;
            summary: { startsWith: string };
        };
        orderBy: { createdAt: 'desc' };
        select: { summary: true };
    }) => Promise<{ summary: string } | null>;
};

type PrismaAuditEventWriter = {
    create: (input: {
        data: {
            tenantId: string;
            workspaceId: string;
            botId: string;
            eventType: 'audit_event';
            severity: 'info';
            sourceSystem: string;
            correlationId: string;
            summary: string;
        };
    }) => Promise<unknown>;
};

type PrismaClientLike = {
    auditEvent: PrismaAuditEventReader & PrismaAuditEventWriter;
};

const ORCHESTRATOR_STATE_SOURCE = 'orchestrator-state-store';
const ORCHESTRATOR_STATE_PREFIX = 'ORCHESTRATOR_STATE:';
const ORCHESTRATOR_STATE_TENANT_ID = '__orchestrator__';
const ORCHESTRATOR_STATE_WORKSPACE_ID = '__orchestrator__';
const ORCHESTRATOR_STATE_BOT_ID = 'state_store';

const parsePersistedState = (payload: string): OrchestratorPersistedState | null => {
    try {
        const parsed = JSON.parse(payload) as {
            version?: unknown;
            taskScheduler?: unknown;
            routineScheduler?: unknown;
        };

        return {
            version: 1,
            taskScheduler: sanitizeTaskSchedulerState(parsed.taskScheduler),
            routineScheduler: sanitizeRoutineSchedulerState(parsed.routineScheduler),
        };
    } catch {
        return null;
    }
};

const loadPrismaClient = async (): Promise<PrismaClientLike> => {
    const mod = await import('@prisma/client');
    const PrismaClientCtor = (mod as { PrismaClient: new () => PrismaClientLike }).PrismaClient;
    return new PrismaClientCtor();
};

export class PrismaOrchestratorStateStore implements OrchestratorStateStore {
    private prismaPromise: Promise<PrismaClientLike> | null;

    constructor(prisma?: PrismaClientLike) {
        this.prismaPromise = prisma ? Promise.resolve(prisma) : null;
    }

    private async getPrisma(): Promise<PrismaClientLike> {
        if (!this.prismaPromise) {
            this.prismaPromise = loadPrismaClient();
        }
        return this.prismaPromise;
    }

    async load(): Promise<OrchestratorPersistedState | null> {
        const prisma = await this.getPrisma();
        const row = await prisma.auditEvent.findFirst({
            where: {
                tenantId: ORCHESTRATOR_STATE_TENANT_ID,
                workspaceId: ORCHESTRATOR_STATE_WORKSPACE_ID,
                botId: ORCHESTRATOR_STATE_BOT_ID,
                sourceSystem: ORCHESTRATOR_STATE_SOURCE,
                summary: {
                    startsWith: ORCHESTRATOR_STATE_PREFIX,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                summary: true,
            },
        });

        if (!row) {
            return null;
        }

        return parsePersistedState(row.summary.slice(ORCHESTRATOR_STATE_PREFIX.length));
    }

    async save(state: OrchestratorPersistedState): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.auditEvent.create({
            data: {
                tenantId: ORCHESTRATOR_STATE_TENANT_ID,
                workspaceId: ORCHESTRATOR_STATE_WORKSPACE_ID,
                botId: ORCHESTRATOR_STATE_BOT_ID,
                eventType: 'audit_event',
                severity: 'info',
                sourceSystem: ORCHESTRATOR_STATE_SOURCE,
                correlationId: `orchestrator_state_${randomUUID()}`,
                summary: `${ORCHESTRATOR_STATE_PREFIX}${JSON.stringify(state)}`,
            },
        });
    }
}

export const createOrchestratorStateStore = (
    options: CreateOrchestratorStateStoreOptions,
): OrchestratorStateStore => {
    const backend = options.backend ?? 'auto';
    if (backend === 'file') {
        return new FileOrchestratorStateStore(options.statePath);
    }

    if (backend === 'db') {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required when ORCHESTRATOR_STATE_BACKEND is set to db.');
        }
        return new PrismaOrchestratorStateStore();
    }

    if (process.env.DATABASE_URL) {
        return new PrismaOrchestratorStateStore();
    }
    return new FileOrchestratorStateStore(options.statePath);
};
