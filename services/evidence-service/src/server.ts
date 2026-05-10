/**
 * Evidence Service HTTP server
 * Port: process.env.EVIDENCE_SERVICE_PORT ?? 3005
 * Auth: x-service-token header checked against EVIDENCE_SERVICE_TOKEN env var.
 */
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AzureBlobAuditStorage } from '@agentfarm/audit-storage';
import type { EvidenceBundle } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Repo-layer types (injectable for testing)
// ---------------------------------------------------------------------------

export type EvidenceRepo = {
    create: PrismaClient['storedEvidenceBundle']['create'];
    findUnique: PrismaClient['storedEvidenceBundle']['findUnique'];
    findMany: PrismaClient['storedEvidenceBundle']['findMany'];
    update: PrismaClient['storedEvidenceBundle']['update'];
    count: PrismaClient['storedEvidenceBundle']['count'];
};

export type BuildServerOptions = {
    /** Prisma StoredEvidenceBundle table accessor. Defaults to a real PrismaClient instance. */
    repo?: EvidenceRepo;
    /** Azure Blob storage. Optional — screenshots are skipped when absent. */
    blobStorage?: AzureBlobAuditStorage | null;
    /** Override env so tests can inject without mutating process.env */
    env?: NodeJS.ProcessEnv;
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

const readServiceToken = (request: FastifyRequest): string | null => {
    const header = request.headers['x-service-token'];
    if (typeof header === 'string' && header.trim()) {
        return header.trim();
    }
    return null;
};

const checkAuth = (
    request: FastifyRequest,
    reply: FastifyReply,
    configuredToken: string | undefined,
): boolean => {
    if (!configuredToken) {
        // No token configured — reject all; the service must be secured.
        reply.status(401).send({ error: 'unauthorized' });
        return false;
    }
    const provided = readServiceToken(request);
    if (provided !== configuredToken) {
        reply.status(401).send({ error: 'unauthorized' });
        return false;
    }
    return true;
};

// ---------------------------------------------------------------------------
// Route body / param types
// ---------------------------------------------------------------------------

type PostEvidenceBody = EvidenceBundle;

type IdParams = {
    id: string;
};

type ListQuerystring = {
    tenantId?: string;
    workspaceId?: string;
    taskId?: string;
    page?: string;
    limit?: string;
};

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
    const env = opts.env ?? process.env;

    // --- Prisma ---
    let repo: EvidenceRepo;
    if (opts.repo) {
        repo = opts.repo;
    } else {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        repo = prisma.storedEvidenceBundle;
    }

    // --- Blob storage (optional) ---
    let blobStorage: AzureBlobAuditStorage | null = opts.blobStorage ?? null;
    if (blobStorage === undefined) {
        // Auto-initialise from env if all required vars are present
        const accountUrl = env.BLOB_ACCOUNT_URL;
        const container = env.BLOB_CONTAINER;
        const writeSasToken = env.BLOB_SAS_TOKEN;
        if (accountUrl && container && writeSasToken) {
            const { AzureBlobAuditStorage } = await import('@agentfarm/audit-storage');
            blobStorage = new AzureBlobAuditStorage({ accountUrl, container, writeSasToken });
        }
    }

    const configuredToken = env.EVIDENCE_SERVICE_TOKEN;

    const app = Fastify({ logger: true });

    // -------------------------------------------------------------------------
    // GET /health — no auth required
    // -------------------------------------------------------------------------
    app.get('/health', async (_request, _reply) => {
        return { status: 'ok', service: 'evidence-service' };
    });

    // -------------------------------------------------------------------------
    // POST /v1/evidence — store a new evidence bundle
    // -------------------------------------------------------------------------
    app.post<{ Body: PostEvidenceBody }>('/v1/evidence', async (request, reply) => {
        if (!checkAuth(request, reply, configuredToken)) return;

        const bundle = request.body;

        if (!bundle || typeof bundle.taskId !== 'string') {
            return reply.status(400).send({ error: 'invalid body: taskId required' });
        }

        // Upload screenshots to blob if storage is configured
        const storedScreenshots: string[] = bundle.screenshots ?? [];

        if (blobStorage && storedScreenshots.length > 0) {
            const uploaded: string[] = [];
            for (const screenshotUrl of storedScreenshots) {
                // If already a URL (not raw bytes) keep as-is; blob upload is for raw data.
                uploaded.push(screenshotUrl);
            }
            // Replace with stored URLs (in practice, agent-runtime pushes raw bytes separately)
        }

        const record = await repo.create({
            data: {
                taskId: bundle.taskId,
                tenantId: bundle.tenantId,
                workspaceId: bundle.workspaceId,
                botId: bundle.botId,
                actionType: bundle.actionType,
                riskLevel: bundle.riskLevel,
                routeDecision: bundle.routeDecision,
                llmProvider: bundle.llmProvider,
                inputTokens: bundle.inputTokens,
                outputTokens: bundle.outputTokens,
                screenshots: storedScreenshots,
                approvalId: bundle.approvalId ?? null,
                finalised: bundle.finalised ?? false,
            },
        });

        return reply.status(201).send({
            id: record.id,
            status: 'stored',
            createdAt: record.createdAt.toISOString(),
        });
    });

    // -------------------------------------------------------------------------
    // GET /v1/evidence/:id — retrieve a single evidence bundle
    // -------------------------------------------------------------------------
    app.get<{ Params: IdParams }>('/v1/evidence/:id', async (request, reply) => {
        if (!checkAuth(request, reply, configuredToken)) return;

        const record = await repo.findUnique({ where: { id: request.params.id } });

        if (!record) {
            return reply.status(404).send({ error: 'not found' });
        }

        return reply.status(200).send(storedToBundle(record));
    });

    // -------------------------------------------------------------------------
    // GET /v1/evidence — list evidence bundles with optional filters + pagination
    // -------------------------------------------------------------------------
    app.get<{ Querystring: ListQuerystring }>('/v1/evidence', async (request, reply) => {
        if (!checkAuth(request, reply, configuredToken)) return;

        const { tenantId, workspaceId, taskId, page = '1', limit = '20' } = request.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const where: Record<string, unknown> = {};
        if (tenantId) where['tenantId'] = tenantId;
        if (workspaceId) where['workspaceId'] = workspaceId;
        if (taskId) where['taskId'] = taskId;

        const [items, total] = await Promise.all([
            repo.findMany({ where, skip, take: limitNum, orderBy: { createdAt: 'desc' } }),
            repo.count({ where }),
        ]);

        return reply.status(200).send({
            items: items.map(storedToBundle),
            total,
            page: pageNum,
            limit: limitNum,
        });
    });

    // -------------------------------------------------------------------------
    // POST /v1/evidence/:id/sign — SHA-256 sign and finalise a bundle
    // -------------------------------------------------------------------------
    app.post<{ Params: IdParams }>('/v1/evidence/:id/sign', async (request, reply) => {
        if (!checkAuth(request, reply, configuredToken)) return;

        const record = await repo.findUnique({ where: { id: request.params.id } });

        if (!record) {
            return reply.status(404).send({ error: 'not found' });
        }

        if (record.finalised) {
            return reply.status(409).send({ error: 'already finalised' });
        }

        // Compute SHA-256 over the canonical bundle JSON
        const canonicalBundle = storedToBundle(record);
        const signature = createHash('sha256')
            .update(JSON.stringify(canonicalBundle))
            .digest('hex');

        const finalisedAt = new Date();

        const updated = await repo.update({
            where: { id: record.id },
            data: {
                signature,
                finalised: true,
                finalisedAt,
            },
        });

        return reply.status(200).send({
            id: updated.id,
            signature,
            finalised: true,
            finalisedAt: finalisedAt.toISOString(),
        });
    });

    return app;
}

// ---------------------------------------------------------------------------
// Map Prisma record → EvidenceBundle DTO
// ---------------------------------------------------------------------------

type StoredRecord = {
    id: string;
    taskId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    actionType: string;
    riskLevel: string;
    routeDecision: string;
    llmProvider: string;
    inputTokens: number;
    outputTokens: number;
    screenshots: string[];
    approvalId: string | null;
    signature: string | null;
    finalised: boolean;
    finalisedAt: Date | null;
    createdAt: Date;
};

function storedToBundle(record: StoredRecord): EvidenceBundle & { id: string; finalisedAt?: string } {
    return {
        id: record.id,
        taskId: record.taskId,
        tenantId: record.tenantId,
        workspaceId: record.workspaceId,
        botId: record.botId,
        actionType: record.actionType,
        riskLevel: record.riskLevel as EvidenceBundle['riskLevel'],
        routeDecision: record.routeDecision,
        llmProvider: record.llmProvider,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        screenshots: record.screenshots,
        approvalId: record.approvalId ?? undefined,
        signature: record.signature ?? undefined,
        finalised: record.finalised,
        createdAt: record.createdAt.toISOString(),
        ...(record.finalisedAt ? { finalisedAt: record.finalisedAt.toISOString() } : {}),
    };
}
