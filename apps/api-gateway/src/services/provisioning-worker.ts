/**
 * Provisioning Worker — Tasks 2.1 through 2.4
 *
 * Implements the 11-state provisioning state machine for ProvisioningJob records.
 * Polls the DB for queued jobs, advances them through states, logs audit events,
 * and handles failure + cleanup.
 *
 * State sequence (happy path):
 *   queued → validating → creating_resources → bootstrapping_vm
 *   → starting_container → registering_runtime → healthchecking → completed
 *
 * Failure path:
 *   <any state> → failed → cleanup_pending → cleaned_up
 *
 * Azure SDK: real ARM calls implemented in azure-provisioning-steps.ts (Task 2.2).
 */

import { prisma } from '../lib/db.js';
import {
    validateTenant,
    createResources,
    bootstrapVm,
    startContainer,
    healthCheck,
    cleanupResources,
    resizeWorkspaceVm,
    startContainerOnVm,
    wsVmName,
} from './azure-provisioning-steps.js';
import { vmSkuForAgentCount } from '../lib/azure-client.js';
import {
    PROVISIONING_STUCK_ALERT_MS,
    STUCK_MONITOR_STATES,
    evaluateMonitoringActions,
    getJobStuckMs,
} from './provisioning-monitoring.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_ACTIVE_MS = 5_000;   // 5s when jobs are being processed
const POLL_INTERVAL_IDLE_MS = 30_000;  // 30s when queue is empty
const MAX_CONCURRENT_JOBS = 3;       // max parallel jobs per process
const CONTRACT_VERSION = '1.0';   // runtime contract version

/** Ordered happy-path states (queued is the trigger, not a "work" state). */
const HAPPY_PATH = [
    'queued',
    'validating',
    'creating_resources',
    'bootstrapping_vm',
    'starting_container',
    'registering_runtime',
    'healthchecking',
    'completed',
] as const;

type HappyState = (typeof HAPPY_PATH)[number];

/** Human-readable remediation hints keyed by the state where failure occurred. */
const REMEDIATION_HINTS: Record<string, string> = {
    queued: 'Job was never picked up. Check worker health and restart api-gateway.',
    validating: 'Quota or plan validation failed. Review tenant limits and retry.',
    creating_resources: 'Azure resource creation failed. Check subscription quota and region availability.',
    bootstrapping_vm: 'VM bootstrap failed. Verify VM SKU availability and init script logs in Azure portal.',
    starting_container: 'Container failed to start. Check Docker image registry access and image digest.',
    registering_runtime: 'Runtime registration timed out. Check VM network egress and health probe config.',
    healthchecking: 'Health check failed. Bot container may be crash-looping. Review container logs.',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProvisioningJobRecord {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    planId: string;
    runtimeTier: string;
    roleType: string;
    correlationId: string;
    status: string;
    requestedBy: string;
    cleanupResult?: string | null;
    requestedAt?: Date;
    startedAt?: Date | null;
    updatedAt?: Date;
}

interface StepResult {
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
    /** Extra data passed to next step handlers (e.g. VM endpoint). */
    context?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function emitAudit(
    job: ProvisioningJobRecord,
    summary: string,
    severity: 'info' | 'warn' | 'error' | 'critical' = 'info',
): Promise<void> {
    try {
        await prisma.auditEvent.create({
            data: {
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                botId: job.botId,
                eventType: 'provisioning_event',
                severity,
                summary,
                sourceSystem: 'provisioning-worker',
                correlationId: job.correlationId,
            },
        });
    } catch (err) {
        // Audit failure is non-fatal — log and continue
        console.error('[provisioning-worker] audit emit failed:', err);
    }
}

// ---------------------------------------------------------------------------
// State transition helper
// ---------------------------------------------------------------------------

async function transitionTo(
    job: ProvisioningJobRecord,
    nextStatus: string,
    extra?: {
        failureReason?: string;
        remediationHint?: string;
        cleanupResult?: string;
        startedAt?: Date;
        completedAt?: Date;
    },
): Promise<void> {
    await prisma.provisioningJob.update({
        where: { id: job.id },
        data: {
            status: nextStatus as never,
            failureReason: extra?.failureReason ?? undefined,
            remediationHint: extra?.remediationHint ?? undefined,
            cleanupResult: extra?.cleanupResult ?? undefined,
            startedAt: extra?.startedAt ?? undefined,
            completedAt: extra?.completedAt ?? undefined,
        },
    });
}

// ---------------------------------------------------------------------------
// Azure step wrappers (real SDK — Task 2.2)
// Delegates to azure-provisioning-steps.ts; keeps the worker free of ARM details.
// ---------------------------------------------------------------------------

async function azureValidateTenant(job: ProvisioningJobRecord): Promise<StepResult> {
    return validateTenant(job);
}

async function azureCreateResources(
    job: ProvisioningJobRecord,
    context: Record<string, string>,
): Promise<StepResult> {
    return createResources(job, context);
}

async function azureBootstrapVm(
    job: ProvisioningJobRecord,
    context: Record<string, string>,
): Promise<StepResult> {
    return bootstrapVm(job, context);
}

async function azureStartContainer(
    job: ProvisioningJobRecord,
    context: Record<string, string>,
): Promise<StepResult> {
    return startContainer(job, context);
}

async function azureRegisterRuntime(
    job: ProvisioningJobRecord,
    context: Record<string, string>,
): Promise<StepResult> {
    // DB-only step: upsert RuntimeInstance with endpoint from bootstrapVm
    await prisma.runtimeInstance.upsert({
        where: { botId: job.botId },
        create: {
            botId: job.botId,
            workspaceId: job.workspaceId,
            tenantId: job.tenantId,
            status: 'starting',
            contractVersion: CONTRACT_VERSION,
            endpoint: context['containerEndpoint'] ?? null,
        },
        update: {
            status: 'starting',
            contractVersion: CONTRACT_VERSION,
            endpoint: context['containerEndpoint'] ?? null,
            lastSeenAt: new Date(),
        },
    });
    return { success: true, context };
}

async function azureHealthCheck(
    job: ProvisioningJobRecord,
    context: Record<string, string>,
): Promise<StepResult> {
    return healthCheck(job, context);
}

async function azureCleanupResources(job: ProvisioningJobRecord): Promise<void> {
    return cleanupResources(job);
}

// ---------------------------------------------------------------------------
// Per-step handlers
// ---------------------------------------------------------------------------

type StepHandler = (
    job: ProvisioningJobRecord,
    context: Record<string, string>,
) => Promise<StepResult>;

const STEP_HANDLERS: Partial<Record<HappyState, StepHandler>> = {
    validating: (job) => azureValidateTenant(job),
    creating_resources: (job, ctx) => azureCreateResources(job, ctx),
    bootstrapping_vm: (job, ctx) => azureBootstrapVm(job, ctx),
    starting_container: (job, ctx) => azureStartContainer(job, ctx),
    registering_runtime: (job, ctx) => azureRegisterRuntime(job, ctx),
    healthchecking: (job, ctx) => azureHealthCheck(job, ctx),
};

// ---------------------------------------------------------------------------
// Failure + cleanup handlers
// ---------------------------------------------------------------------------

async function handleFailure(
    job: ProvisioningJobRecord,
    failedAtState: string,
    errorCode: string,
    errorMessage: string,
): Promise<void> {
    const hint = REMEDIATION_HINTS[failedAtState] ?? 'Contact support with the correlation ID.';
    const reason = `[${errorCode}] ${errorMessage} (failed at: ${failedAtState})`;

    console.error(`[provisioning-worker] [${job.correlationId}] FAILED at ${failedAtState}: ${reason}`);

    await transitionTo(job, 'failed', {
        failureReason: reason,
        remediationHint: hint,
        completedAt: new Date(),
    });
    await rollbackStateSideEffects(job, failedAtState);
    await emitAudit(job, `Provisioning failed at ${failedAtState}: ${errorCode}`, 'error');

    // Immediately queue cleanup
    await transitionTo(job, 'cleanup_pending');
    await emitAudit(job, 'Cleanup queued after provisioning failure', 'warn');

    // Run cleanup inline first; remaining cleanup_pending jobs are retried by poll worker.
    try {
        await azureCleanupResources(job);
        await transitionTo(job, 'cleaned_up', {
            cleanupResult: 'Resources deprovisioned after failure.',
            completedAt: new Date(),
        });
        await emitAudit(job, 'Cleanup completed — resources deprovisioned', 'info');
    } catch (cleanupErr) {
        // Cleanup failure is logged; job remains in cleanup_pending for retry worker.
        console.error(`[provisioning-worker] [${job.correlationId}] cleanup failed:`, cleanupErr);
        await transitionTo(job, 'cleanup_pending', {
            cleanupResult: `Cleanup retry required: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        });
        await emitAudit(job, 'Cleanup failed — manual intervention required', 'critical');
    }
}

async function rollbackStateSideEffects(job: ProvisioningJobRecord, failedAtState: string): Promise<void> {
    // Ensure downstream runtime records are marked failed for late-stage failures.
    const touchesRuntime =
        failedAtState === 'registering_runtime' ||
        failedAtState === 'healthchecking' ||
        failedAtState === 'cleanup_pending';

    if (touchesRuntime) {
        await prisma.runtimeInstance.updateMany({
            where: { botId: job.botId },
            data: {
                status: 'failed',
                lastSeenAt: new Date(),
            },
        });
    }

    await prisma.bot.updateMany({
        where: { id: job.botId },
        data: { status: 'failed' },
    });

    await prisma.workspace.updateMany({
        where: { id: job.workspaceId },
        data: { status: 'failed' },
    });

    await prisma.tenant.updateMany({
        where: { id: job.tenantId },
        data: { status: 'degraded' },
    });

    await emitAudit(job, `Rollback applied after ${failedAtState} failure`, 'warn');
}

async function processCleanupRecoveryJob(job: ProvisioningJobRecord): Promise<void> {
    // Claim cleanup job by setting an in-progress marker in cleanupResult.
    const claimed = await prisma.provisioningJob.updateMany({
        where: {
            id: job.id,
            status: 'cleanup_pending',
            OR: [
                { cleanupResult: null },
                { cleanupResult: { not: { startsWith: 'cleanup_in_progress:' } } },
            ],
        },
        data: {
            cleanupResult: `cleanup_in_progress:${new Date().toISOString()}`,
        },
    });

    if (claimed.count === 0) {
        return;
    }

    await emitAudit(job, 'Cleanup recovery worker picked up cleanup_pending job', 'warn');

    try {
        await azureCleanupResources(job);
        await transitionTo(job, 'cleaned_up', {
            cleanupResult: 'Resources deprovisioned after retry cleanup.',
            completedAt: new Date(),
        });
        await emitAudit(job, 'Cleanup retry completed — resources deprovisioned', 'info');
    } catch (err: unknown) {
        await transitionTo(job, 'cleanup_pending', {
            cleanupResult: `Cleanup retry failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        await emitAudit(job, 'Cleanup retry failed — manual intervention required', 'critical');
    }
}

const stuckAlertTimestamps = new Map<string, number>();

function getJobElapsedMs(job: ProvisioningJobRecord): number {
    const anchor = job.startedAt ?? job.requestedAt;
    if (!anchor) {
        return 0;
    }
    return Date.now() - anchor.getTime();
}

async function monitorAndRemediateProvisioning(logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }): Promise<boolean> {
    const monitoredJobs = await prisma.provisioningJob.findMany({
        where: {
            status: {
                in: [...STUCK_MONITOR_STATES] as never,
            },
        },
        select: {
            id: true,
            tenantId: true,
            workspaceId: true,
            botId: true,
            planId: true,
            runtimeTier: true,
            roleType: true,
            correlationId: true,
            status: true,
            requestedBy: true,
            cleanupResult: true,
            requestedAt: true,
            startedAt: true,
            updatedAt: true,
        },
    });

    let hadWork = false;
    const jobs = monitoredJobs as ProvisioningJobRecord[];
    const nowTs = Date.now();
    const actions = evaluateMonitoringActions(jobs, nowTs, stuckAlertTimestamps);
    stuckAlertTimestamps.clear();
    for (const [id, ts] of actions.nextAlertMap.entries()) {
        stuckAlertTimestamps.set(id, ts);
    }

    for (const jobId of actions.timedOutJobIds) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) {
            continue;
        }
        hadWork = true;
        const elapsedMs = getJobElapsedMs(job);
        logger.error(
            `[provisioning-worker] timeout remediation for job ${job.id}: elapsed ${Math.floor(elapsedMs / 60_000)}m`,
        );
        await handleFailure(
            job,
            job.status,
            'PROVISIONING_TIMEOUT_24H',
            `Provisioning exceeded 24h timeout (${Math.floor(elapsedMs / 60_000)} minutes elapsed).`,
        );
    }

    for (const jobId of actions.stuckAlertJobIds) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) {
            continue;
        }
        hadWork = true;
        const stuckMinutes = Math.floor(getJobStuckMs(job, nowTs) / 60_000);
        await emitAudit(
            job,
            `Provisioning stuck alert: job in state '${job.status}' for ${stuckMinutes} minutes (threshold: ${PROVISIONING_STUCK_ALERT_MS / 60_000} minutes).`,
            'critical',
        );
        logger.info(`[provisioning-worker] stuck alert emitted for job ${job.id} in state ${job.status}`);
    }

    for (const job of jobs) {
        if (!STUCK_MONITOR_STATES.includes(job.status as (typeof STUCK_MONITOR_STATES)[number])) {
            stuckAlertTimestamps.delete(job.id);
        }
    }

    return hadWork;
}

// ---------------------------------------------------------------------------
// Complete: mark RuntimeInstance ready + update Bot/Workspace status
// ---------------------------------------------------------------------------

async function handleCompletion(
    job: ProvisioningJobRecord,
    ctx: Record<string, string> = {},
): Promise<void> {
    // Mark RuntimeInstance as ready
    await prisma.runtimeInstance.updateMany({
        where: { botId: job.botId },
        data: { status: 'ready', lastSeenAt: new Date() },
    });

    // Advance Bot and Workspace to active / ready
    await prisma.bot.updateMany({
        where: { id: job.botId },
        data: { status: 'active' },
    });
    await prisma.workspace.updateMany({
        where: { id: job.workspaceId },
        data: { status: 'ready' },
    });
    await prisma.tenant.updateMany({
        where: { id: job.tenantId },
        data: { status: 'ready' },
    });

    // Write the per-agent subscription so isSubscriptionSuspended can enforce
    // per-agent isolation when the customer has multiple agents.
    // agentId = bot.id — the unique identifier for this specific agent instance.
    const now = new Date();
    const tenantSub = await prisma.tenantSubscription.findUnique({
        where: { tenantId: job.tenantId },
        select: { id: true, paymentProvider: true, expiresAt: true },
    });
    await prisma.agentSubscription.upsert({
        where: { tenantId_agentId: { tenantId: job.tenantId, agentId: job.botId } },
        create: {
            tenantId: job.tenantId,
            agentId: job.botId,
            tenantSubscriptionId: tenantSub?.id ?? null,
            planId: job.planId,
            status: 'active',
            paymentProvider: tenantSub?.paymentProvider ?? 'system',
            startedAt: now,
            expiresAt: tenantSub?.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
            status: 'active',
            planId: job.planId,
            reactivatedAt: now,
        },
    });

    // For initial provisioning: persist the WorkspaceVm record so subsequent
    // agent purchases can detect the existing VM and trigger a resize instead
    // of creating a duplicate VM.
    if (job.runtimeTier === 'initial_provision' && ctx['vmPrivateIp']) {
        const rg = `agentfarm-${job.tenantId.slice(-8)}-rg`;
        const vm = wsVmName(job.workspaceId);
        const subscriptionId = process.env['AZURE_SUBSCRIPTION_ID'] ?? '';
        const vmResourceId = `/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${vm}`;
        await (prisma as any).workspaceVm.upsert({
            where: { workspaceId: job.workspaceId },
            create: {
                workspaceId: job.workspaceId,
                tenantId: job.tenantId,
                vmName: vm,
                vmResourceId,
                resourceGroup: rg,
                privateIp: ctx['vmPrivateIp'],
                region: ctx['location'] ?? process.env['AZURE_REGION'] ?? 'eastus2',
                vmSize: ctx['vmSize'] ?? 'Standard_B2s',
                status: 'running',
                activeContainerCount: 1,
                nextContainerPort: 8081,
            },
            update: {
                status: 'running',
                privateIp: ctx['vmPrivateIp'],
                vmSize: ctx['vmSize'] ?? 'Standard_B2s',
                activeContainerCount: 1,
            },
        });
    }

    await transitionTo(job, 'completed', { completedAt: new Date() });
    await emitAudit(job, 'Provisioning completed — bot is active', 'info');
    console.log(`[provisioning-worker] [${job.correlationId}] provisioning COMPLETED`);
}

// ---------------------------------------------------------------------------
// Resize job: scale workspace VM up or down based on active agent count
// ---------------------------------------------------------------------------

async function processResizeJob(job: ProvisioningJobRecord): Promise<void> {
    console.log(`[provisioning-worker] [${job.correlationId}] starting vm_resize job ${job.id}`);

    const claimed = await prisma.provisioningJob.updateMany({
        where: { id: job.id, status: 'queued' },
        data: { status: 'validating', startedAt: new Date() },
    });
    if (claimed.count === 0) {
        return; // already claimed by another worker
    }

    try {
        // 1. Count bots in this workspace to determine target SKU.
        const activeBots = await prisma.bot.findMany({
            where: {
                workspaceId: job.workspaceId,
                status: { in: ['active', 'created'] as never },
            },
            select: { id: true },
        });
        const activeCount = activeBots.length;
        const targetSku = vmSkuForAgentCount(activeCount);

        // 2. Look up the current workspace VM — need port, IP, and name for all steps.
        const workspaceVm = await (prisma as any).workspaceVm.findUnique({
            where: { workspaceId: job.workspaceId },
        }) as {
            vmName: string;
            resourceGroup: string;
            vmSize: string;
            activeContainerCount: number;
            privateIp: string;
            nextContainerPort: number;
        } | null;

        if (!workspaceVm) {
            await handleFailure(job, 'validating', 'WORKSPACE_VM_NOT_FOUND',
                `No WorkspaceVm record found for workspaceId=${job.workspaceId}. Initial provisioning may still be in progress.`);
            return;
        }

        await transitionTo(job, 'creating_resources');

        // 3. Resize the VM if the tier has changed.
        if (workspaceVm.vmSize !== targetSku) {
            console.log(`[provisioning-worker] [${job.correlationId}] resizing VM from ${workspaceVm.vmSize} → ${targetSku} (${activeCount} active agents)`);
            const resizeResult = await resizeWorkspaceVm(workspaceVm.resourceGroup, workspaceVm.vmName, targetSku);
            if (!resizeResult.success) {
                await handleFailure(job, 'creating_resources', resizeResult.errorCode ?? 'VM_RESIZE_FAILED', resizeResult.errorMessage ?? 'Resize failed');
                return;
            }
            await (prisma as any).workspaceVm.update({
                where: { workspaceId: job.workspaceId },
                data: { vmSize: targetSku },
            });
            await emitAudit(job, `Workspace VM resized: ${workspaceVm.vmSize} → ${targetSku} (${activeCount} active agents)`, 'info');
        } else {
            await emitAudit(job, `Workspace VM size ${targetSku} already correct for ${activeCount} active agents`, 'info');
        }

        // 4. Start a new Docker container for this bot on the shared VM.
        //    Each bot gets a unique port allocated from nextContainerPort.
        //    Azure Run Command executes `docker run` on the live VM without SSH.
        const containerPort = workspaceVm.nextContainerPort;
        await transitionTo(job, 'starting_container');
        const startResult = await startContainerOnVm(
            job,
            workspaceVm.resourceGroup,
            workspaceVm.vmName,
            containerPort,
        );
        if (!startResult.success) {
            await handleFailure(job, 'starting_container', startResult.errorCode ?? 'START_CONTAINER_FAILED', startResult.errorMessage ?? 'Container start failed');
            return;
        }
        await emitAudit(job, `Container agentfarm-bot-${job.botId.slice(-8)} started on VM at port ${containerPort}`, 'info');

        // 5. Wait for the new container's /health endpoint to respond.
        const containerEndpoint = `http://${workspaceVm.privateIp}:${containerPort}`;
        const healthResult = await startContainer(job, { containerEndpoint });
        if (!healthResult.success) {
            await handleFailure(job, 'starting_container', healthResult.errorCode ?? 'CONTAINER_HEALTH_TIMEOUT', healthResult.errorMessage ?? 'Health check timed out');
            return;
        }

        // 6. Register the RuntimeInstance with the bot's own container endpoint.
        await transitionTo(job, 'registering_runtime');
        await prisma.runtimeInstance.upsert({
            where: { botId: job.botId },
            create: {
                botId: job.botId,
                workspaceId: job.workspaceId,
                tenantId: job.tenantId,
                status: 'starting',
                contractVersion: CONTRACT_VERSION,
                endpoint: containerEndpoint,
            },
            update: {
                status: 'starting',
                endpoint: containerEndpoint,
                lastSeenAt: new Date(),
            },
        });

        // 7. Final health check post-registration.
        await transitionTo(job, 'healthchecking');
        const finalHealth = await healthCheck(job, { containerEndpoint });
        if (!finalHealth.success) {
            await handleFailure(job, 'healthchecking', finalHealth.errorCode ?? 'HEALTH_CHECK_FAILED', finalHealth.errorMessage ?? 'Post-registration health check failed');
            return;
        }

        // 8. Update WorkspaceVm: increment port counter and container count.
        await (prisma as any).workspaceVm.update({
            where: { workspaceId: job.workspaceId },
            data: {
                activeContainerCount: activeCount,
                nextContainerPort: containerPort + 1,
            },
        });

        // 9. Write AgentSubscription, mark bot/workspace active, transition to completed.
        await handleCompletion(job, {});
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await handleFailure(job, job.status, 'RESIZE_UNEXPECTED_ERROR', msg);
    }
}

// ---------------------------------------------------------------------------
// Process a single job through all remaining states
// ---------------------------------------------------------------------------

async function processJob(job: ProvisioningJobRecord): Promise<void> {
    // vm_resize jobs run a shorter, separate path — no new VM created.
    if (job.runtimeTier === 'vm_resize') {
        return processResizeJob(job);
    }

    console.log(`[provisioning-worker] [${job.correlationId}] starting job ${job.id} from status=${job.status}`);

    // Claim the job: transition queued → validating atomically
    const claimed = await prisma.provisioningJob.updateMany({
        where: { id: job.id, status: 'queued' },
        data: { status: 'validating', startedAt: new Date() },
    });

    if (claimed.count === 0) {
        // Another worker (or process restart) already claimed it
        return;
    }

    await emitAudit(job, 'Provisioning job claimed by worker — starting validation', 'info');

    // Walk through each step starting from 'validating'
    const steps: HappyState[] = ['validating', 'creating_resources', 'bootstrapping_vm', 'starting_container', 'registering_runtime', 'healthchecking'];
    let ctx: Record<string, string> = {};

    for (const step of steps) {
        const handler = STEP_HANDLERS[step];
        if (!handler) {
            continue;
        }

        let result: StepResult;
        try {
            result = await handler(job, ctx);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await handleFailure(job, step, 'UNEXPECTED_ERROR', msg);
            return;
        }

        if (!result.success) {
            await handleFailure(
                job,
                step,
                result.errorCode ?? 'STEP_FAILED',
                result.errorMessage ?? 'Step returned failure without a message.',
            );
            return;
        }

        // Merge context for downstream steps
        if (result.context) {
            ctx = { ...ctx, ...result.context };
        }

        // Advance to next happy-path state (or 'completed' after healthchecking)
        const currentIdx = HAPPY_PATH.indexOf(step as HappyState);
        const nextState = HAPPY_PATH[currentIdx + 1];

        if (nextState && nextState !== 'completed') {
            await transitionTo(job, nextState);
            await emitAudit(job, `State transition: ${step} → ${nextState}`, 'info');
        }
    }

    // All steps passed — finalise (pass accumulated ctx so WorkspaceVm can be written)
    await handleCompletion(job, ctx);
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let workerRunning = false;

async function pollOnce(logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }): Promise<boolean> {
    const hadMonitoringWork = await monitorAndRemediateProvisioning(logger);

    // Retry previously failed cleanup jobs first.
    const cleanupJobs = await prisma.provisioningJob.findMany({
        where: { status: 'cleanup_pending' },
        orderBy: { updatedAt: 'asc' },
        take: MAX_CONCURRENT_JOBS,
        select: {
            id: true,
            tenantId: true,
            workspaceId: true,
            botId: true,
            planId: true,
            runtimeTier: true,
            roleType: true,
            correlationId: true,
            status: true,
            requestedBy: true,
            cleanupResult: true,
            requestedAt: true,
            startedAt: true,
            updatedAt: true,
        },
    });

    if (cleanupJobs.length > 0) {
        logger.info(`[provisioning-worker] retrying cleanup for ${cleanupJobs.length} cleanup_pending job(s)`);
        await Promise.allSettled(
            cleanupJobs.map(async (job: ProvisioningJobRecord) => {
                try {
                    await processCleanupRecoveryJob(job);
                } catch (err: unknown) {
                    logger.error(`[provisioning-worker] cleanup recovery error for job ${job.id}`, err);
                }
            }),
        );
    }

    // Fetch up to MAX_CONCURRENT_JOBS queued jobs
    const jobs = await prisma.provisioningJob.findMany({
        where: { status: 'queued' },
        orderBy: { requestedAt: 'asc' },
        take: MAX_CONCURRENT_JOBS,
        select: {
            id: true,
            tenantId: true,
            workspaceId: true,
            botId: true,
            planId: true,
            runtimeTier: true,
            roleType: true,
            correlationId: true,
            status: true,
            requestedBy: true,
            cleanupResult: true,
            requestedAt: true,
            startedAt: true,
            updatedAt: true,
        },
    });

    if (!hadMonitoringWork && jobs.length === 0 && cleanupJobs.length === 0) {
        return false; // idle
    }

    logger.info(`[provisioning-worker] picked up ${jobs.length} job(s)`);

    // Process concurrently (bounded by MAX_CONCURRENT_JOBS)
    await Promise.allSettled(
        jobs.map(async (job: ProvisioningJobRecord) => {
            try {
                await processJob(job);
            } catch (err: unknown) {
                logger.error(`[provisioning-worker] unhandled error for job ${job.id}`, err);
                try {
                    await handleFailure(job, job.status, 'WORKER_PANIC', err instanceof Error ? err.message : String(err));
                } catch {
                    // ignore secondary failure
                }
            }
        }),
    );

    return true; // had work
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the provisioning worker poll loop.
 * Safe to call once at process startup. Idempotent (subsequent calls are no-ops).
 */
export function startProvisioningWorker(logger: {
    info: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
}): void {
    if (workerRunning) {
        return;
    }
    workerRunning = true;

    const loop = async (): Promise<void> => {
        while (workerRunning) {
            let hadWork = false;
            try {
                hadWork = await pollOnce(logger);
            } catch (err: unknown) {
                logger.error('[provisioning-worker] poll error', err);
            }
            const delay = hadWork ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
    };

    void loop();
    logger.info('[provisioning-worker] started — polling for queued provisioning jobs');
}

/**
 * Stop the worker (graceful: finishes in-flight jobs before the next poll).
 */
export function stopProvisioningWorker(): void {
    workerRunning = false;
}
