/**
 * hire-handler.ts — Sprint 5: Agent Hire → Provisioning Wire
 *
 * Extracted business logic for enrolling an agent after a successful payment.
 * Called from the billing webhook handlers (Stripe + Razorpay) after an order
 * is marked `paid`. Creates a ProvisioningJob row with status `queued` which
 * the provisioning-worker picks up automatically (polls every 5 s).
 *
 * Idempotent: keyed on orderId — if a ProvisioningJob already exists for this
 * order the existing result is returned without creating a duplicate.
 *
 * Multi-agent: reads plan.roleType from the purchased plan and finds or creates
 * the bot with that role in the tenant's workspace, so buying a developer_agent
 * plan and a tester_agent plan provisions two distinct bots.
 */

import type { PrismaClient } from '@prisma/client';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import type { AgentHireRecord } from '@agentfarm/shared-types';
import type { EmbedFn } from '@agentfarm/memory-service';
import { seedOnboardingKnowledge } from './onboarding-knowledge-seed.js';

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
    /** true when an existing job for this orderId was found and reused (idempotent). */
    reused: boolean;
    hireRecord: AgentHireRecord;
}

/**
 * Enrol an agent after a successful payment.
 *
 * Steps:
 *  1. Resolve workspace from tenantId.
 *  2. Look up plan.roleType so the correct agent type is provisioned.
 *  3. Guard against duplicate — idempotent on orderId.
 *  4. Find or create the bot for this role in the workspace.
 *  5. Create ProvisioningJob with status='queued'.
 *  6. Seed onboarding knowledge (non-blocking).
 *
 * @throws if no Workspace is found for the tenant.
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

    // 2. Look up the purchased plan to determine which agent role to provision
    const plan = await (prisma.plan as any).findUnique({
        where: { id: planId },
        select: { roleType: true },
    }) as { roleType: string } | null;
    const roleType = plan?.roleType ?? 'developer_agent';

    // 3. Idempotency guard keyed on orderId — consistent with the admin-provision path
    const existing = await (prisma.provisioningJob as any).findFirst({
        where: { orderId },
    }) as { id: string; botId: string } | null;

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
            botId: existing.botId,
            planId,
            triggerSource: 'payment_webhook',
            requestedAt: requestedAt.toISOString(),
        };
        return {
            jobId: existing.id,
            botId: existing.botId,
            workspaceId: workspace.id,
            reused: true,
            hireRecord,
        };
    }

    // 4. Find the bot for this role; create one if this role hasn't been purchased before
    let bot = await (prisma.bot as any).findFirst({
        where: { workspaceId: workspace.id, role: roleType },
    }) as { id: string; workspaceId: string; role: string } | null;

    if (!bot) {
        bot = await (prisma.bot as any).create({
            data: { workspaceId: workspace.id, role: roleType, status: 'created' },
        }) as { id: string; workspaceId: string; role: string };
    }

    // 4b. Bot-level idempotency: if this bot already has a live provisioning job
    // (not failed/cleaned-up), reuse it — prevents repeated purchases of the same
    // plan from triggering multiple Azure VM provisioning cycles for the same bot.
    const TERMINAL_STATUSES = ['failed', 'cleaned_up', 'cleanup_pending'];
    const liveJob = await (prisma.provisioningJob as any).findFirst({
        where: {
            botId: bot.id,
            status: { notIn: TERMINAL_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
    }) as { id: string; botId: string } | null;

    if (liveJob) {
        const hireRecord: AgentHireRecord = {
            contractVersion: CONTRACT_VERSIONS.AGENT_HIRE,
            correlationId,
            jobId: liveJob.id,
            orderId,
            tenantId,
            workspaceId: workspace.id,
            botId: bot.id,
            planId,
            triggerSource: 'payment_webhook',
            requestedAt: requestedAt.toISOString(),
        };
        return {
            jobId: liveJob.id,
            botId: bot.id,
            workspaceId: workspace.id,
            reused: true,
            hireRecord,
        };
    }

    // 5. Determine job type:
    //    • 'initial_provision' — no VM exists yet for this workspace; create one at small size.
    //    • 'vm_resize'         — VM already exists; resize it to accommodate the new agent.
    const existingVm = await (prisma as any).workspaceVm.findUnique({
        where: { workspaceId: workspace.id },
        select: { vmSize: true },
    }) as { vmSize: string } | null;

    const runtimeTier = existingVm ? 'vm_resize' : 'initial_provision';

    // 6. Create the provisioning job — worker will pick it up automatically
    const job = await prisma.provisioningJob.create({
        data: {
            tenantId,
            workspaceId: workspace.id,
            botId: bot.id,
            planId,
            runtimeTier,
            roleType: bot.role,
            correlationId,
            triggerSource: 'payment_webhook',
            status: 'queued',
            requestedBy,
            requestedAt,
            orderId,
            triggeredBy: 'billing',
            metadata: JSON.stringify({ source: 'payment_webhook', vmExists: existingVm !== null }),
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
