/**
 * Epic B2: Runtime Kill-Switch Routes
 *
 * POST   /v1/kill-switches             — Activate a kill-switch for risky execution
 * GET    /v1/kill-switches             — List active kill-switches for tenant
 * GET    /v1/kill-switches/:id         — Get a specific kill-switch record
 * POST   /v1/kill-switches/:id/resume  — Resume execution after kill-switch resolution
 *
 * All activate and resume decisions are logged as immutable evidence entries.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    CONTRACT_VERSIONS,
    type KillSwitchRecord,
    type KillSwitchType,
} from '@agentfarm/shared-types';
import { ApprovalEnforcer } from '@agentfarm/approval-service';
import { randomUUID } from 'node:crypto';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type EvidenceLogEntry = {
    id: string;
    event: 'kill_switch_activated' | 'kill_switch_resumed';
    killSwitchId: string;
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    actorId: string;
    reason: string;
    incidentRef?: string;
    correlationId: string;
    recordedAt: string;
    contractVersion: string;
};

interface KillSwitchStore {
    enforcer: ApprovalEnforcer;
    evidenceLog: EvidenceLogEntry[];
}

const createStore = (): KillSwitchStore => ({
    enforcer: new ApprovalEnforcer(),
    evidenceLog: [],
});

const VALID_SWITCH_TYPES = new Set<KillSwitchType>([
    'emergency',
    'manual',
    'threshold_breach',
    'security_incident',
]);

const normalizeKillSwitchType = (value: unknown): KillSwitchType | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase() as KillSwitchType;
    return VALID_SWITCH_TYPES.has(v) ? v : null;
};

const normalizeStringArray = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) return null;
    const result: string[] = [];
    for (const item of value) {
        if (typeof item === 'string' && item.trim()) result.push(item.trim());
    }
    return result.length > 0 ? result : null;
};

type RegisterKillSwitchRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: KillSwitchStore;
};

export const registerKillSwitchRoutes = async (
    app: FastifyInstance,
    options: RegisterKillSwitchRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();
    const now = options.now ?? (() => Date.now());

    const recordEvidence = (entry: Omit<EvidenceLogEntry, 'id' | 'recordedAt' | 'contractVersion'>): void => {
        store.evidenceLog.push({
            ...entry,
            id: randomUUID(),
            recordedAt: new Date(now()).toISOString(),
            contractVersion: CONTRACT_VERSIONS.KILL_SWITCH,
        });
    };

    // ── POST /v1/kill-switches — Activate a kill-switch
    app.post('/v1/kill-switches', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;

        const switchType = normalizeKillSwitchType(body.switch_type);
        if (!switchType) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'switch_type must be one of: emergency, manual, threshold_breach, security_incident.',
            });
        }

        const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : '';
        if (!reason) {
            return reply.code(400).send({ error: 'invalid_request', message: 'reason is required.' });
        }

        const affectedActionTypes = normalizeStringArray(body.affected_action_types);
        if (!affectedActionTypes) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'affected_action_types must be a non-empty array of strings (e.g. ["high"] or ["medium","high"] or ["*"]).',
            });
        }

        const workspaceId = typeof body.workspace_id === 'string' && body.workspace_id.trim()
            ? body.workspace_id.trim()
            : undefined;
        if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const botId = typeof body.bot_id === 'string' && body.bot_id.trim()
            ? body.bot_id.trim()
            : undefined;

        const incidentRef = typeof body.incident_ref === 'string' && body.incident_ref.trim()
            ? body.incident_ref.trim()
            : undefined;

        const controlWindowMs = typeof body.control_window_ms === 'number' && body.control_window_ms > 0
            ? body.control_window_ms
            : 30000;

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : randomUUID();

        const killSwitch = await store.enforcer.activateKillSwitch({
            tenantId: session.tenantId,
            workspaceId,
            botId,
            switchType,
            reason,
            affectedActionTypes,
            controlWindowMs,
            incidentRef,
            activatedBy: session.userId,
            correlationId,
        });

        recordEvidence({
            event: 'kill_switch_activated',
            killSwitchId: killSwitch.id,
            tenantId: session.tenantId,
            workspaceId,
            botId,
            actorId: session.userId,
            reason,
            incidentRef,
            correlationId,
        });

        return reply.code(201).send({ kill_switch: killSwitch });
    });

    // ── GET /v1/kill-switches — List active kill-switches for tenant
    app.get('/v1/kill-switches', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const active = await store.enforcer.listActiveKillSwitches(session.tenantId);
        return reply.code(200).send({ kill_switches: active, total: active.length });
    });

    // ── GET /v1/kill-switches/:id — Get a specific kill-switch
    app.get<{ Params: { id: string } }>('/v1/kill-switches/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const killSwitch = await store.enforcer.getKillSwitch(request.params.id);
        if (!killSwitch) {
            return reply.code(404).send({ error: 'not_found', message: 'Kill-switch not found.' });
        }

        if (killSwitch.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Kill-switch belongs to a different tenant.' });
        }

        return reply.code(200).send({ kill_switch: killSwitch });
    });

    // ── POST /v1/kill-switches/:id/resume — Resume after kill-switch resolution
    app.post<{ Params: { id: string } }>('/v1/kill-switches/:id/resume', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const killSwitch = await store.enforcer.getKillSwitch(request.params.id);
        if (!killSwitch) {
            return reply.code(404).send({ error: 'not_found', message: 'Kill-switch not found.' });
        }

        if (killSwitch.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Kill-switch belongs to a different tenant.' });
        }

        if (killSwitch.status !== 'active') {
            return reply.code(409).send({
                error: 'not_active',
                message: `Kill-switch is not active (status: ${killSwitch.status}). Resume only applies to active kill-switches.`,
            });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;

        const resumeApprovalId = typeof body.resume_approval_id === 'string' && body.resume_approval_id.trim()
            ? body.resume_approval_id.trim()
            : '';
        if (!resumeApprovalId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'resume_approval_id is required. Resume requires an authorized control-plane approval artifact.',
            });
        }

        const incidentRef = typeof body.incident_ref === 'string' && body.incident_ref.trim()
            ? body.incident_ref.trim()
            : '';
        if (!incidentRef) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'incident_ref is required. Resume requires an incident note reference for traceability.',
            });
        }

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : randomUUID();

        const resumed = await store.enforcer.resumeAfterKillSwitch({
            killSwitchId: request.params.id,
            resumeApprovalId,
            incidentRef,
            authorizedBy: session.userId,
            correlationId,
        });

        recordEvidence({
            event: 'kill_switch_resumed',
            killSwitchId: resumed.id,
            tenantId: session.tenantId,
            workspaceId: resumed.workspaceId,
            botId: resumed.botId,
            actorId: session.userId,
            reason: `Resumed: ${incidentRef}`,
            incidentRef,
            correlationId,
        });

        return reply.code(200).send({ kill_switch: resumed });
    });

    // ── GET /v1/kill-switches/evidence — Evidence log for audit traceability (B4)
    app.get('/v1/kill-switches/evidence', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const entries = store.evidenceLog.filter((e) => e.tenantId === session.tenantId);
        return reply.code(200).send({ evidence: entries, total: entries.length });
    });

    // Expose store for kill-switch check injection into runtime (B2 wire point)
    (app as any)._killSwitchStore = store;
};

/**
 * Build a KillSwitchCheckFn bound to the shared store.
 * Inject this into processDeveloperTask / processApprovedTask options.
 */
export const buildKillSwitchCheckFn = (
    store: KillSwitchStore,
): ((params: { taskId: string; riskLevel: string; tenantId: string; workspaceId: string; botId: string }) => Promise<{ blocked: boolean; killSwitchId?: string }>) => {
    return async ({ taskId, riskLevel, tenantId, workspaceId, botId }) => {
        const canExecute = await store.enforcer.canExecute(
            taskId,
            riskLevel as 'low' | 'medium' | 'high',
            tenantId,
            workspaceId,
            botId,
            'approved', // Pass 'approved' so only kill-switch (not missing approval) blocks here.
        );
        if (!canExecute) {
            const active = await store.enforcer.listActiveKillSwitches(tenantId);
            const relevant = active.find(
                (ks: KillSwitchRecord) =>
                    ks.affectedActionTypes.includes(riskLevel) || ks.affectedActionTypes.includes('*'),
            );
            return { blocked: true, killSwitchId: relevant?.id };
        }
        return { blocked: false };
    };
};
