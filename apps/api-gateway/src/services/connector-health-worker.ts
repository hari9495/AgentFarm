import { prisma } from '../lib/db.js';
import type { SecretStore } from '../lib/secret-store.js';
import { createRealConnectorHealthProbe, type ConnectorHealthProbe } from '../lib/provider-clients.js';

type ConnectorType = 'jira' | 'teams' | 'github' | 'email' | 'custom_api';
type ScopeStatus = 'full' | 'partial' | 'insufficient';
type ConnectorStatus =
    | 'not_configured'
    | 'auth_initiated'
    | 'consent_pending'
    | 'token_received'
    | 'validation_in_progress'
    | 'connected'
    | 'degraded'
    | 'token_expired'
    | 'permission_invalid'
    | 'revoked'
    | 'disconnected';
type ErrorClass =
    | 'oauth_state_mismatch'
    | 'oauth_code_exchange_failed'
    | 'token_refresh_failed'
    | 'token_expired'
    | 'insufficient_scope'
    | 'provider_rate_limited'
    | 'provider_unavailable'
    | 'secret_store_unavailable';

type ConnectorAuthMetadataRecord = {
    connectorId: string;
    tenantId: string;
    workspaceId: string;
    connectorType: string;
    status: ConnectorStatus;
    secretRefId: string | null;
    scopeStatus: ScopeStatus | null;
    lastErrorClass: ErrorClass | null;
    lastHealthcheckAt: Date | null;
};

type ConnectorHealthWorkerRepo = {
    findCandidates(input: {
        staleBefore: Date;
        unhealthyStatuses: ConnectorStatus[];
        limit: number;
    }): Promise<ConnectorAuthMetadataRecord[]>;
    updateMetadata(input: {
        connectorId: string;
        status: ConnectorStatus;
        scopeStatus?: ScopeStatus | null;
        lastErrorClass?: ErrorClass | null;
        lastHealthcheckAt: Date;
    }): Promise<void>;
    createAuthEvent(input: {
        connectorId: string;
        tenantId: string;
        eventType: string;
        result: string;
        errorClass?: ErrorClass | null;
        correlationId: string;
        actor: string;
    }): Promise<void>;
};

type WorkerLogger = {
    info: (message: string) => void;
    error: (message: string, error?: unknown) => void;
};

type ProbeOutcome = Awaited<ReturnType<ConnectorHealthProbe>>['outcome'];

const POLL_INTERVAL_ACTIVE_MS = 15 * 60_000;
const POLL_INTERVAL_IDLE_MS = 6 * 60 * 60_000;
const SCOPE_VALIDATION_INTERVAL_MS = 30 * 24 * 60 * 60_000;
const MAX_BATCH_SIZE = 50;

const UNHEALTHY_STATUSES: ConnectorStatus[] = ['degraded', 'permission_invalid', 'token_expired', 'consent_pending'];

const defaultLogger: WorkerLogger = {
    info: (message) => console.log(`[connector-health-worker] ${message}`),
    error: (message, error) => console.error(`[connector-health-worker] ${message}`, error),
};

const normalizeConnectorType = (value: string): ConnectorType | null => {
    const normalized = value.trim().toLowerCase();
    if (
        normalized === 'jira'
        || normalized === 'teams'
        || normalized === 'github'
        || normalized === 'email'
        || normalized === 'custom_api'
    ) {
        return normalized;
    }
    return null;
};

const defaultRepo: ConnectorHealthWorkerRepo = {
    async findCandidates({ staleBefore, unhealthyStatuses, limit }) {
        return prisma.connectorAuthMetadata.findMany({
            where: {
                OR: [
                    { lastHealthcheckAt: null },
                    { lastHealthcheckAt: { lte: staleBefore } },
                    { status: { in: unhealthyStatuses as never } },
                ],
            },
            orderBy: [{ lastHealthcheckAt: 'asc' }, { updatedAt: 'asc' }],
            take: limit,
            select: {
                connectorId: true,
                tenantId: true,
                workspaceId: true,
                connectorType: true,
                status: true,
                secretRefId: true,
                scopeStatus: true,
                lastErrorClass: true,
                lastHealthcheckAt: true,
            },
        }) as Promise<ConnectorAuthMetadataRecord[]>;
    },
    async updateMetadata(input) {
        await prisma.connectorAuthMetadata.update({
            where: { connectorId: input.connectorId },
            data: {
                status: input.status as never,
                scopeStatus: input.scopeStatus as never,
                lastErrorClass: input.lastErrorClass as never,
                lastHealthcheckAt: input.lastHealthcheckAt,
            },
        });
    },
    async createAuthEvent(input) {
        await prisma.connectorAuthEvent.create({
            data: {
                connectorId: input.connectorId,
                tenantId: input.tenantId,
                eventType: input.eventType,
                result: input.result,
                errorClass: input.errorClass as never,
                correlationId: input.correlationId,
                actor: input.actor,
            },
        });
    },
};

const evaluateHealthRemediation = (input: {
    currentStatus: ConnectorStatus;
    currentScope: ScopeStatus | null;
    currentLastError: ErrorClass | null;
    probeOutcome: ProbeOutcome;
}): {
    status: ConnectorStatus;
    scopeStatus: ScopeStatus | null;
    lastErrorClass: ErrorClass | null;
    result: string;
} => {
    if (input.currentScope === 'insufficient') {
        return {
            status: 'consent_pending',
            scopeStatus: 'insufficient',
            lastErrorClass: 'insufficient_scope',
            result: 'requires_reconsent',
        };
    }

    if (input.probeOutcome === 'ok') {
        return {
            status: 'connected',
            scopeStatus: input.currentScope ?? 'full',
            lastErrorClass: null,
            result: 'healthy',
        };
    }

    if (input.probeOutcome === 'auth_failure') {
        return {
            status: 'permission_invalid',
            scopeStatus: 'insufficient',
            lastErrorClass: 'insufficient_scope',
            result: 'auth_failure',
        };
    }

    if (input.probeOutcome === 'rate_limited') {
        return {
            status: 'degraded',
            scopeStatus: input.currentScope,
            lastErrorClass: 'provider_rate_limited',
            result: 'rate_limited',
        };
    }

    // network_timeout
    return {
        status: 'degraded',
        scopeStatus: input.currentScope,
        lastErrorClass: 'provider_unavailable',
        result: 'network_timeout',
    };
};

export const runConnectorHealthTick = async (input: {
    secretStore: SecretStore;
    repo?: ConnectorHealthWorkerRepo;
    healthProbe?: ConnectorHealthProbe;
    now?: () => number;
    staleIntervalMs?: number;
    limit?: number;
}): Promise<{ checked: number }> => {
    const repo = input.repo ?? defaultRepo;
    const healthProbe = input.healthProbe ?? createRealConnectorHealthProbe(input.secretStore);
    const now = input.now ?? (() => Date.now());
    const staleIntervalMs = input.staleIntervalMs ?? SCOPE_VALIDATION_INTERVAL_MS;
    const limit = input.limit ?? MAX_BATCH_SIZE;

    const checkedAt = new Date(now());
    const staleBefore = new Date(checkedAt.getTime() - staleIntervalMs);

    const candidates = await repo.findCandidates({
        staleBefore,
        unhealthyStatuses: UNHEALTHY_STATUSES,
        limit,
    });

    for (const candidate of candidates) {
        const connectorType = normalizeConnectorType(candidate.connectorType);
        if (!connectorType) {
            continue;
        }

        const probe = await healthProbe({
            connectorType,
            metadata: {
                connectorId: candidate.connectorId,
                connectorType,
                status: candidate.status,
                secretRefId: candidate.secretRefId,
                scopeStatus: candidate.scopeStatus,
                lastErrorClass: candidate.lastErrorClass,
            },
        });

        const remediation = evaluateHealthRemediation({
            currentStatus: candidate.status,
            currentScope: candidate.scopeStatus,
            currentLastError: candidate.lastErrorClass,
            probeOutcome: probe.outcome,
        });

        await repo.updateMetadata({
            connectorId: candidate.connectorId,
            status: remediation.status,
            scopeStatus: remediation.scopeStatus,
            lastErrorClass: remediation.lastErrorClass,
            lastHealthcheckAt: checkedAt,
        });

        await repo.createAuthEvent({
            connectorId: candidate.connectorId,
            tenantId: candidate.tenantId,
            eventType: 'oauth_healthcheck',
            result: remediation.result,
            errorClass: remediation.lastErrorClass,
            correlationId: `corr_connector_health_${candidate.connectorId}_${checkedAt.getTime()}`,
            actor: 'connector_health_worker',
        });
    }

    return { checked: candidates.length };
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let workerInProgress = false;

const scheduleNext = (logger: WorkerLogger, deps: Parameters<typeof runConnectorHealthTick>[0], delayMs: number): void => {
    if (workerStopping) {
        return;
    }

    workerTimer = setTimeout(async () => {
        if (workerStopping) {
            return;
        }

        if (workerInProgress) {
            scheduleNext(logger, deps, POLL_INTERVAL_ACTIVE_MS);
            return;
        }

        workerInProgress = true;
        try {
            const result = await runConnectorHealthTick(deps);
            const nextDelay = result.checked > 0 ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
            scheduleNext(logger, deps, nextDelay);
        } catch (error) {
            logger.error('connector health tick failed', error);
            scheduleNext(logger, deps, POLL_INTERVAL_ACTIVE_MS);
        } finally {
            workerInProgress = false;
        }
    }, delayMs);
};

export const startConnectorHealthWorker = (
    deps: Parameters<typeof runConnectorHealthTick>[0],
    logger: WorkerLogger = defaultLogger,
): void => {
    if (workerTimer) {
        logger.info('connector health worker already running');
        return;
    }

    workerStopping = false;
    scheduleNext(logger, deps, 2_000);
    logger.info('connector health worker started');
};

export const stopConnectorHealthWorker = (): void => {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
};
