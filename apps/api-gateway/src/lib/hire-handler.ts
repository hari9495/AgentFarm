/**
 * hire-handler.ts — Sprint 5: Agent Hire → Provisioning Wire
 *
 * Extracted business logic for enrolling an agent after a successful payment.
 * Called from the billing webhook handlers (Stripe + Razorpay) after an order
 * is marked `paid`. Creates a ProvisioningJob row with status `queued` which
 * the provisioning-worker picks up automatically (polls every 5 s).
 *
 * Idempotent: if an active ProvisioningJob already exists for the bot, the
 * existing jobId is returned without creating a duplicate.
 */

import type { PrismaClient } from '@prisma/client';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import type { AgentHireRecord } from '@agentfarm/shared-types';
import type { EmbedFn } from '@agentfarm/memory-service';
import { seedOnboardingKnowledge } from './onboarding-knowledge-seed.js';

// Active (in-flight) statuses — a new job should not be created if one of
// these already exists for the same botId.
const ACTIVE_STATUSES = [
    'queued',
    'validating',
    'creating_resources',
    'bootstrapping_vm',
    'starting_container',
    'registering_runtime',
    'healthchecking',
] as const;

export interface EnrollParams {
    orderId: string;
    tenantId: string;
    planId: string;
    /** The user / system actor that triggered the hire (e.g. 'payment_webhook'). */
    requestedBy: string;
    /** Optional: repo URL seeded into the agent's starting knowledge base. */
    repoUrl?: string;
    /** Optional: tech stack summary for knowledge seeding (e.g. 'TypeScript, Node.js, PostgreSQL'). */
    techStack?: string;
    /** Optional: team coding conventions for knowledge seeding. */
    teamConventions?: string;
}

export interface EnrollResult {
    jobId: string;
    botId: string;
    workspaceId: string;
    /** true when an existing active job was found and reused (idempotent). */
    reused: boolean;
    hireRecord: AgentHireRecord;
}

/**
 * Enrol an agent after a successful payment.
 *
 * Steps:
 *  1. Resolve workspace + bot from tenantId.
 *  2. Guard against duplicate active ProvisioningJobs (idempotent).
 *  3. Create ProvisioningJob with status='queued'.
 *  4. Seed onboarding knowledge into the agent's semantic memory (non-blocking).
 *  5. Return EnrollResult including the AgentHireRecord for audit logging.
 *
 * @throws if no Workspace or Bot is found for the tenant.
 */
export async function enrollAgentAfterPayment(
    params: EnrollParams,
    prisma: PrismaClient,
    embedFn?: EmbedFn | null,
): Promise<EnrollResult> {
    const { orderId, tenantId, planId, requestedBy, repoUrl, techStack, teamConventions } = params;

    // 1. Resolve workspace
    const workspace = await (prisma.workspace as any).findFirst({
        where: { tenantId },
    }) as { id: string; tenantId: string } | null;

    if (!workspace) {
        throw new Error(`[hire-handler] No workspace found for tenantId=${tenantId}`);
    }

    // 2. Resolve bot
    const bot = await (prisma.bot as any).findFirst({
        where: { workspaceId: workspace.id },
    }) as { id: string; workspaceId: string; role: string } | null;

    if (!bot) {
        throw new Error(`[hire-handler] No bot found for workspaceId=${workspace.id}`);
    }

    // 3. Guard against duplicate — return existing active job if present
    const existing = await (prisma.provisioningJob as any).findFirst({
        where: {
            botId: bot.id,
            status: { in: [...ACTIVE_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
    });

    const correlationId = `corr_hire_${orderId}_${Date.now()}`;
    const requestedAt = new Date();

    if (existing) {
        const hireRecord: AgentHireRecord = {
            contractVersion: CONTRACT_VERSIONS.AGENT_HIRE,
            correlationId,
            jobId: existing.id,
            orderId,
            tenantId,
            workspaceId: workspace.id,
            botId: bot.id,
            planId,
            triggerSource: 'payment_webhook',
            requestedAt: requestedAt.toISOString(),
        };
        return {
            jobId: existing.id,
            botId: bot.id,
            workspaceId: workspace.id,
            reused: true,
            hireRecord,
        };
    }

    // 4. Create the provisioning job — worker will pick it up automatically
    const job = await prisma.provisioningJob.create({
        data: {
            tenantId,
            workspaceId: workspace.id,
            botId: bot.id,
            planId,
            runtimeTier: 'dedicated_vm',
            roleType: bot.role,
            correlationId,
            triggerSource: 'payment_webhook',
            status: 'queued',
            requestedBy,
            requestedAt,
            orderId,
            triggeredBy: 'billing',
            metadata: JSON.stringify({ source: 'payment_webhook' }),
        },
    });

    const hireRecord: AgentHireRecord = {
        contractVersion: CONTRACT_VERSIONS.AGENT_HIRE,
        correlationId,
        jobId: job.id,
        orderId,
        tenantId,
        workspaceId: workspace.id,
        botId: bot.id,
        planId,
        triggerSource: 'payment_webhook',
        requestedAt: requestedAt.toISOString(),
    };

    // Non-blocking: seed the agent's starting knowledge base so first task session
    // begins with context instead of a cold start. Failures must not block enrolment.
    seedOnboardingKnowledge(
        {
            botId: bot.id,
            tenantId,
            workspaceId: workspace.id,
            roleKey: bot.role,
            repoUrl,
            techStack,
            teamConventions,
        },
        embedFn ?? null,
        prisma,
    ).catch(() => { /* non-blocking — knowledge seed failure must not abort enrolment */ });

    return {
        jobId: job.id,
        botId: bot.id,
        workspaceId: workspace.id,
        reused: false,
        hireRecord,
    };
}
