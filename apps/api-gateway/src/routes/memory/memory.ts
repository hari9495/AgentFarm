/**
 * Agent Memory Service REST API (Fastify routes)
 *
 * Handles:
 * - GET    /v1/workspaces/:workspaceId/memory          — read recent patterns for LLM injection
 * - POST   /v1/workspaces/:workspaceId/memory          — write task memory after execution
 * - GET    /v1/workspaces/:workspaceId/memory/patterns — read learned long-term patterns
 * - POST   /v1/memory/patterns                         — ingest new patterns (e.g., from code review)
 * - POST   /v1/memory/patterns/:patternId/reinforce    — update pattern confidence
 * - POST   /v1/memory/cleanup                          — cleanup old low-confidence records
 * - POST   /v1/episodic-memory/search                  — semantic similarity search
 * - POST   /v1/episodic-memory/write                   — upsert with vector embedding
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    searchEpisodicMemory,
    writeEpisodicMemory,
    writeEpisodicMemoryNoEmbed,
    searchEpisodicMemoryNoEmbed,
    writeMemoryEdge,
    readEdgesFrom,
    readEdgesTo,
} from '@agentfarm/memory-service';
import type { EmbedFn, MemoryNodeType, MemoryEdgeType } from '@agentfarm/memory-service';
import type { EpisodicSearchRequest, EpisodicWriteRequest } from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterMemoryRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    fetch?: typeof globalThis.fetch;
    embedFn?: EmbedFn | null;
    embeddingDeployment?: string;
};

export async function registerMemoryRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options?: RegisterMemoryRoutesOptions,
) {
    const getSession = options?.getSession ?? (() => null);
    const embedFn = options?.embedFn ?? null;
    const embeddingDeployment = options?.embeddingDeployment ?? 'text-embedding-3-small';

    // Register route at both /v1/ and deprecated /api/v1/ alias
    const on = (
        m: 'get' | 'post' | 'patch' | 'delete',
        p: string,
        h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>,
    ) => {
        (app as unknown as Record<string, (p: string, h: unknown) => void>)[m](`/v1${p}`, h);
        (app as unknown as Record<string, (p: string, h: unknown) => void>)[m](`/api/v1${p}`, h);
    };

    // ── READ recent patterns for LLM injection ────────────────────────────────
    on('get', '/workspaces/:workspaceId/memory', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const { workspaceId } = req.params as { workspaceId: string };
            const { maxResults } = req.query as { maxResults?: string };
            const limit = maxResults ? parseInt(maxResults, 10) : 5;

            const records = await (prisma as any).agentLongTermMemory.findMany({
                where: { workspaceId, tenantId: session.tenantId },
                orderBy: { lastSeen: 'desc' },
                take: limit,
                select: { pattern: true, summary: true, confidence: true, lastSeen: true },
            });

            return res.send({
                workspaceId,
                records,
                count: records.length,
                message: 'Ready to inject into LLM prompt',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to read memory: ${msg}` });
        }
    });

    // ── WRITE task memory after execution ─────────────────────────────────────
    on('post', '/workspaces/:workspaceId/memory', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const body = req.body as Record<string, unknown>;
            const { workspaceId, tenantId, taskId, summary, executionStatus } = body;

            if (!workspaceId || !tenantId || !taskId || !summary) {
                return res.status(400).send({
                    error: 'Missing required: workspaceId, tenantId, taskId, summary',
                });
            }

            const request: EpisodicWriteRequest = {
                tenantId: String(tenantId),
                botId: '',
                workspaceId: String(workspaceId),
                summary: String(summary),
                pattern: `task:${String(executionStatus ?? 'success')}:${String(taskId)}`,
                confidence: 0.7,
                taskId: String(taskId),
            };

            await writeEpisodicMemoryNoEmbed(request, prisma);

            return res.status(201).send({
                message: 'Memory recorded successfully',
                taskId,
                ttlDays: 7,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to write memory: ${msg}` });
        }
    });

    // ── READ long-term learned patterns ───────────────────────────────────────
    on('get', '/workspaces/:workspaceId/memory/patterns', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const { workspaceId } = req.params as { workspaceId: string };
            const { minConfidence } = req.query as { minConfidence?: string };
            const threshold = minConfidence ? parseFloat(minConfidence) : 0.5;

            const patterns = await (prisma as any).agentLongTermMemory.findMany({
                where: {
                    workspaceId,
                    tenantId: session.tenantId,
                    confidence: { gte: threshold },
                },
                orderBy: { confidence: 'desc' },
                take: 50,
                select: { id: true, pattern: true, summary: true, confidence: true, observedCount: true, lastSeen: true },
            });

            return res.send({
                workspaceId,
                patternCount: patterns.length,
                patterns,
                usage: 'Inject high-confidence patterns into LLM system prompt',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to read patterns: ${msg}` });
        }
    });

    // ── WRITE long-term pattern (from code review feedback etc.) ──────────────
    on('post', '/memory/patterns', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const body = req.body as Record<string, unknown>;
            const { tenantId, workspaceId, pattern, confidence, sourceTaskId, sourcePrUrl } = body;

            if (!tenantId || !workspaceId || !pattern) {
                return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, pattern' });
            }

            const request: EpisodicWriteRequest = {
                tenantId: String(tenantId),
                botId: '',
                workspaceId: String(workspaceId),
                summary: String(pattern),
                pattern: String(pattern),
                confidence: typeof confidence === 'number' ? confidence : 0.5,
                taskId: '',
            };

            await writeEpisodicMemoryNoEmbed(request, prisma);

            return res.status(201).send({
                pattern: request.pattern,
                message: 'Pattern learned and will be applied to future tasks',
                sourceTaskId,
                sourcePrUrl,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to write pattern: ${msg}` });
        }
    });

    // ── REINFORCE pattern confidence ──────────────────────────────────────────
    on('post', '/memory/patterns/:patternId/reinforce', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const { patternId } = req.params as { patternId: string };

            await (prisma as any).agentLongTermMemory.updateMany({
                where: { id: patternId, tenantId: session.tenantId },
                data: {
                    confidence: { increment: 0.05 },
                    observedCount: { increment: 1 },
                    lastSeen: new Date(),
                },
            });

            return res.send({ patternId, message: 'Pattern confidence updated' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to reinforce pattern: ${msg}` });
        }
    });

    // ── CLEANUP old low-confidence records ────────────────────────────────────
    on('post', '/memory/cleanup', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
            const result = await (prisma as any).agentLongTermMemory.deleteMany({
                where: {
                    tenantId: session.tenantId,
                    confidence: { lt: 0.2 },
                    lastSeen: { lt: cutoff },
                },
            });

            return res.send({
                message: 'Cleanup complete',
                deletedCount: result.count,
                unit: 'low-confidence memory records',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to cleanup: ${msg}` });
        }
    });

    // ── WRITE memory edge ─────────────────────────────────────────────────────
    on('post', '/memory/edges', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const body = req.body as Record<string, unknown>;
            const { tenantId, workspaceId, fromId, fromType, toId, toType, edgeType, agentPrefix, weight } = body;

            if (!tenantId || !workspaceId || !fromId || !fromType || !toId || !toType || !edgeType) {
                return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, fromId, fromType, toId, toType, edgeType' });
            }

            const edge = await writeMemoryEdge(prisma, {
                tenantId: String(tenantId),
                workspaceId: String(workspaceId),
                fromId: String(fromId),
                fromType: String(fromType) as MemoryNodeType,
                toId: String(toId),
                toType: String(toType) as MemoryNodeType,
                edgeType: String(edgeType) as MemoryEdgeType,
                agentPrefix: typeof agentPrefix === 'string' ? agentPrefix : undefined,
                weight: typeof weight === 'number' ? weight : 1.0,
            });

            return res.status(201).send(edge);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to write memory edge: ${msg}` });
        }
    });

    // ── READ memory edges ─────────────────────────────────────────────────────
    on('get', '/memory/edges', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        try {
            const { nodeId, nodeType, direction } = req.query as { nodeId?: string; nodeType?: string; direction?: string };

            if (!nodeId || !nodeType) {
                return res.status(400).send({ error: 'Missing required query params: nodeId, nodeType' });
            }

            const edges = direction === 'to'
                ? await readEdgesTo(prisma, session.tenantId, nodeId, nodeType as MemoryNodeType)
                : await readEdgesFrom(prisma, session.tenantId, nodeId, nodeType as MemoryNodeType);

            return res.send({ edges, count: edges.length, direction: direction ?? 'from' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to read memory edges: ${msg}` });
        }
    });

    // ── SEARCH memory (proxy to agent-runtime) ────────────────────────────────
    const resolveFetch = options?.fetch ?? globalThis.fetch;
    function getRuntimeUrl(): string {
        return (process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:4000').replace(/\/+$/, '');
    }

    app.get('/v1/memory/search', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });

        const query = req.query as Record<string, string>;
        const q = query['q'];
        if (!q || q.trim() === '') {
            return res.status(400).send({ error: 'q param required' });
        }

        const params = new URLSearchParams({ q });
        if (query['repoName']) params.set('repoName', query['repoName']);
        if (query['types']) params.set('types', query['types']);
        if (query['limit']) params.set('limit', query['limit']);

        try {
            const upstream = await resolveFetch(
                `${getRuntimeUrl()}/memory/search?${params.toString()}`,
                { headers: { 'x-tenant-id': session.tenantId } },
            );
            const body = await upstream.json() as unknown;
            if (!upstream.ok) return res.status(502).send({ error: 'upstream error', detail: body });
            return res.send(body);
        } catch {
            return res.status(502).send({ error: 'agent-runtime unreachable' });
        }
    });

    // ── EPISODIC MEMORY SEARCH (semantic via pgvector) ────────────────────────
    on('post', '/episodic-memory/search', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        if (!embedFn) return res.status(503).send({ error: 'Episodic memory not configured: missing embedding provider' });

        const body = req.body as Record<string, unknown>;
        const { tenantId, botId, workspaceId, queryText, topK, minSimilarity } = body;

        if (!tenantId || !workspaceId || !queryText) {
            return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, queryText' });
        }

        const request: EpisodicSearchRequest = {
            tenantId: String(tenantId),
            botId: typeof botId === 'string' ? botId : '',
            workspaceId: String(workspaceId),
            queryText: String(queryText),
            topK: typeof topK === 'number' ? topK : undefined,
            minSimilarity: typeof minSimilarity === 'number' ? minSimilarity : undefined,
        };

        try {
            const results = await searchEpisodicMemory(request, embedFn, prisma);
            return res.send({ results, count: results.length });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Episodic memory search failed: ${msg}` });
        }
    });

    // ── EPISODIC MEMORY WRITE (upsert with vector embedding) ─────────────────
    on('post', '/episodic-memory/write', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });
        if (!embedFn) return res.status(503).send({ error: 'Episodic memory not configured: missing embedding provider' });

        const body = req.body as Record<string, unknown>;
        const { tenantId, botId, workspaceId, summary, pattern, confidence, taskId } = body;

        if (!tenantId || !workspaceId || !summary || !pattern) {
            return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, summary, pattern' });
        }

        const request: EpisodicWriteRequest = {
            tenantId: String(tenantId),
            botId: typeof botId === 'string' ? botId : '',
            workspaceId: String(workspaceId),
            summary: String(summary),
            pattern: String(pattern),
            confidence: typeof confidence === 'number' ? confidence : 0.7,
            taskId: typeof taskId === 'string' ? taskId : '',
        };

        try {
            await writeEpisodicMemory(request, embedFn, prisma, embeddingDeployment);
            return res.status(201).send({ pattern: request.pattern, message: 'Episodic memory written' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Episodic memory write failed: ${msg}` });
        }
    });

    // ── EPISODIC MEMORY SEARCH (no-embed fallback) ────────────────────────────
    on('post', '/episodic-memory/search/text', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'unauthorized' });

        const body = req.body as Record<string, unknown>;
        const { tenantId, botId, workspaceId, queryText, topK, minSimilarity } = body;

        if (!tenantId || !workspaceId || !queryText) {
            return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, queryText' });
        }

        const request: EpisodicSearchRequest = {
            tenantId: String(tenantId),
            botId: typeof botId === 'string' ? botId : '',
            workspaceId: String(workspaceId),
            queryText: String(queryText),
            topK: typeof topK === 'number' ? topK : undefined,
            minSimilarity: typeof minSimilarity === 'number' ? minSimilarity : undefined,
        };

        try {
            const results = await searchEpisodicMemoryNoEmbed(request, prisma);
            return res.send({ results, count: results.length });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Episodic memory text search failed: ${msg}` });
        }
    });
}
