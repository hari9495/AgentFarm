/**
 * Sprint 3 — Setup Wizard Routes
 *
 * POST   /v1/setup-wizard                         — start a new wizard session
 * GET    /v1/setup-wizard/:sessionId               — fetch session state
 * PATCH  /v1/setup-wizard/:sessionId/step          — advance one step
 * POST   /v1/setup-wizard/:sessionId/complete      — finalise and fire provisioning
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
    SETUP_STEPS,
    type SetupStep,
    type SetupWizardSessionRecord,
    type ConnectorConfig,
    type ApprovalPolicyConfig,
    type WizardCompletionPayload,
} from '@agentfarm/shared-types';
import { validateStepPayload } from '../lib/wizard-step-validator.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

type SessionIdParams = { sessionId: string };

export type WizardCompletionHandler = (payload: WizardCompletionPayload) => Promise<void> | void;

export type RegisterSetupWizardRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    /** Called when the deploy step completes — fires agent_provisioning_requested */
    onWizardComplete?: WizardCompletionHandler;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sessionToRecord(row: {
    id: string;
    tenantId: string;
    botId: string | null;
    currentStep: string;
    completedSteps: string[];
    selectedRole: string | null;
    connectors: unknown;
    personaBotId: string | null;
    approvalPolicy: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
}): SetupWizardSessionRecord {
    return {
        id: row.id,
        tenantId: row.tenantId,
        botId: row.botId,
        currentStep: row.currentStep as SetupStep,
        completedSteps: row.completedSteps as SetupStep[],
        selectedRole: row.selectedRole as SetupWizardSessionRecord['selectedRole'],
        connectors: (row.connectors as ConnectorConfig[]) ?? [],
        personaBotId: row.personaBotId,
        approvalPolicy: (row.approvalPolicy as ApprovalPolicyConfig) ?? null,
        status: row.status as SetupWizardSessionRecord['status'],
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerSetupWizardRoutes = async (
    app: FastifyInstance,
    options: RegisterSetupWizardRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/setup-wizard — start a new wizard session
    // -----------------------------------------------------------------------
    app.post<{ Body: { initialRoleKey?: string } }>(
        '/v1/setup-wizard',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { initialRoleKey } = request.body ?? {};
            const db = await resolvePrisma();

            const row = await db.setupWizardSession.create({
                data: {
                    tenantId: session.tenantId,
                    currentStep: initialRoleKey ? 'connect_tools' : 'select_role',
                    completedSteps: initialRoleKey ? ['select_role'] : [],
                    selectedRole: initialRoleKey ?? null,
                    connectors: [],
                    status: 'in_progress',
                },
            });

            return reply.code(201).send({ session: sessionToRecord(row) });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/setup-wizard/:sessionId — fetch session state
    // -----------------------------------------------------------------------
    app.get<{ Params: SessionIdParams }>(
        '/v1/setup-wizard/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { sessionId } = request.params;
            const db = await resolvePrisma();

            const row = await db.setupWizardSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!row) {
                return reply.code(404).send({ error: 'wizard_session_not_found' });
            }

            return reply.send({ session: sessionToRecord(row) });
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/setup-wizard/:sessionId/step — advance to the next step
    // -----------------------------------------------------------------------
    app.patch<{ Params: SessionIdParams; Body: { step: string; payload?: unknown } }>(
        '/v1/setup-wizard/:sessionId/step',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { sessionId } = request.params;
            const { step, payload } = request.body ?? {};

            // step param validation
            if (!SETUP_STEPS.includes(step as SetupStep)) {
                return reply.code(400).send({
                    error: 'invalid_step',
                    message: `step must be one of: ${SETUP_STEPS.join(', ')}`,
                });
            }

            const db = await resolvePrisma();
            const row = await db.setupWizardSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!row) {
                return reply.code(404).send({ error: 'wizard_session_not_found' });
            }
            if (row.status !== 'in_progress') {
                return reply.code(409).send({
                    error: 'wizard_not_in_progress',
                    message: `Wizard is ${row.status} and cannot be advanced`,
                });
            }

            const currentIdx = SETUP_STEPS.indexOf(row.currentStep as SetupStep);
            const targetIdx = SETUP_STEPS.indexOf(step as SetupStep);

            // Must advance exactly one step forward
            if (targetIdx !== currentIdx + 1) {
                return reply.code(400).send({
                    error: 'invalid_step_transition',
                    message: `Cannot jump from "${row.currentStep}" to "${step}"; must advance sequentially`,
                });
            }

            // Validate the step payload before accepting it
            const validation = validateStepPayload(row.currentStep as SetupStep, payload);
            if (!validation.valid) {
                return reply.code(422).send({
                    error: 'step_payload_invalid',
                    field: validation.field,
                    reason: validation.reason,
                });
            }

            // Build the update based on which step was just completed
            const completedStep = row.currentStep as SetupStep;
            const updateData: Record<string, unknown> = {
                currentStep: step,
                completedSteps: [...row.completedSteps, completedStep],
            };

            if (completedStep === 'select_role' && payload && typeof payload === 'object') {
                updateData.selectedRole = (payload as Record<string, unknown>).roleKey;
            }
            if (completedStep === 'connect_tools' && payload && typeof payload === 'object') {
                const p = payload as Record<string, unknown>;
                const connectors = (p.connectors as Array<Record<string, unknown>>).map((c) => ({
                    name: c.name as string,
                    displayName: c.displayName as string,
                    authType: c.authType as string,
                    status: 'pending',
                    configuredAt: null,
                }));
                updateData.connectors = connectors;
            }
            if (completedStep === 'configure_persona' && payload && typeof payload === 'object') {
                const p = payload as Record<string, unknown>;
                // Inline bot + persona creation so the wizard owns identity provisioning.
                const workspace = await (db.workspace as any).findFirst({
                    where: { tenantId: session.tenantId },
                });
                if (!workspace) {
                    return reply.code(422).send({
                        error: 'no_workspace',
                        message: 'No workspace found for tenant. Please contact support.',
                    });
                }
                const newBot = await (db.bot as any).create({
                    data: {
                        workspaceId: workspace.id,
                        role: row.selectedRole ?? 'developer',
                        status: 'created',
                    },
                });
                await (db.agentPersona as any).create({
                    data: {
                        botId: newBot.id,
                        tenantId: session.tenantId,
                        displayName: String(p.displayName),
                        emailAddress: String(p.emailAddress),
                        communicationStyle: String(p.communicationStyle ?? 'professional'),
                        disclosureStatement: String(
                            p.disclosureStatement ?? 'This message was sent by an AI agent.',
                        ),
                        language: 'en',
                        timezone: 'UTC',
                    },
                });
                updateData.personaBotId = newBot.id;
                updateData.botId = newBot.id;
            }
            if (completedStep === 'set_approval_rules' && payload && typeof payload === 'object') {
                updateData.approvalPolicy = (payload as Record<string, unknown>).approvalPolicy;
            }

            const updated = await db.setupWizardSession.update({
                where: { id: sessionId },
                data: updateData,
            });

            return reply.send({ session: sessionToRecord(updated) });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/setup-wizard/:sessionId/complete — finalise wizard
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/setup-wizard/:sessionId/complete',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { sessionId } = request.params;
            const db = await resolvePrisma();

            const row = await db.setupWizardSession.findFirst({
                where: { id: sessionId, tenantId: session.tenantId },
            });
            if (!row) {
                return reply.code(404).send({ error: 'wizard_session_not_found' });
            }
            if (row.status !== 'in_progress') {
                return reply.code(409).send({
                    error: 'wizard_not_in_progress',
                    message: `Wizard is already ${row.status}`,
                });
            }
            // All steps except 'deploy' must be completed
            const requiredSteps: SetupStep[] = ['select_role', 'connect_tools', 'configure_persona', 'set_approval_rules'];
            const missing = requiredSteps.filter((s) => !row.completedSteps.includes(s));
            if (missing.length > 0) {
                return reply.code(422).send({
                    error: 'wizard_incomplete',
                    message: `Cannot complete wizard; missing steps: ${missing.join(', ')}`,
                });
            }
            if (!row.botId || !row.selectedRole) {
                return reply.code(422).send({
                    error: 'wizard_incomplete',
                    message: 'botId and selectedRole are required before completing the wizard',
                });
            }

            const completedAt = new Date();
            const updated = await db.setupWizardSession.update({
                where: { id: sessionId },
                data: {
                    status: 'completed',
                    currentStep: 'deploy',
                    completedSteps: [...row.completedSteps, 'deploy'],
                    completedAt,
                },
            });

            const completionPayload: WizardCompletionPayload = {
                sessionId,
                tenantId: session.tenantId,
                botId: row.botId,
                roleKey: row.selectedRole as WizardCompletionPayload['roleKey'],
                correlationId: randomUUID(),
            };

            if (options.onWizardComplete) {
                await options.onWizardComplete(completionPayload);
            }

            return reply.send({
                session: sessionToRecord(updated),
                provisioning: completionPayload,
            });
        },
    );
};
