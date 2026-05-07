/**
 * Agent Memory Service REST API (Fastify routes)
 * Frozen 2026-05-07 — Completed Feature #7 Implementation
 *
 * Handles:
 * - GET    /api/v1/workspaces/:id/memory          — read short-term memory for LLM injection
 * - POST   /api/v1/workspaces/:id/memory          — write task memory after execution
 * - GET    /api/v1/workspaces/:id/memory/patterns — read learned long-term patterns
 * - POST   /api/v1/memory/patterns                — ingest new patterns (e.g., from code review)
 * - POST   /api/v1/memory/cleanup                 — cleanup expired short-term memory
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { MemoryStore } from '@agentfarm/memory-service';
import type { MemoryWriteRequest, MemoryReadResponse, LongTermMemoryWriteRequest } from '@agentfarm/memory-service';

export async function registerMemoryRoutes(app: FastifyInstance, prisma: PrismaClient) {
    const memoryStore = new MemoryStore(prisma);

    // ========== READ SHORT-TERM MEMORY (for LLM prompt injection) ==========
    app.get('/api/v1/workspaces/:workspaceId/memory', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const query = req.query as any;
            const { workspaceId } = params;
            const { maxResults } = query;

            const memoryResponse: MemoryReadResponse = await memoryStore.readMemoryForTask(
                workspaceId,
                maxResults ? parseInt(maxResults, 10) : 5
            );

            return res.send({
                workspaceId,
                ...memoryResponse,
                message: 'Ready to inject into LLM prompt',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to read memory: ${msg}` });
        }
    });

    // ========== WRITE SHORT-TERM MEMORY (after task execution) ==========
    app.post('/api/v1/workspaces/:workspaceId/memory', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const body = req.body as any;
            const {
                workspaceId,
                tenantId,
                taskId,
                actionsTaken,
                approvalOutcomes,
                connectorsUsed,
                llmProvider,
                executionStatus,
                summary,
            } = body;

            if (!workspaceId || !tenantId || !taskId || !summary) {
                return res.status(400).send({
                    error: 'Missing required: workspaceId, tenantId, taskId, summary',
                });
            }

            const request: MemoryWriteRequest = {
                workspaceId,
                tenantId,
                taskId,
                actionsTaken: actionsTaken || [],
                approvalOutcomes: approvalOutcomes || [],
                connectorsUsed: connectorsUsed || [],
                llmProvider,
                executionStatus: executionStatus || 'success',
                summary,
                correlationId: (req as any).id || 'unknown',
            };

            await memoryStore.writeMemoryAfterTask(request);

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

    // ========== READ LONG-TERM LEARNED PATTERNS ==========
    app.get('/api/v1/workspaces/:workspaceId/memory/patterns', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const query = req.query as any;
            const { workspaceId } = params;
            const { minConfidence } = query;

            const patterns = await memoryStore.readLongTermMemory(
                workspaceId,
                minConfidence ? parseFloat(minConfidence) : 0.5
            );

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

    // ========== WRITE LONG-TERM PATTERN (from code review feedback or manual learning) ==========
    app.post('/api/v1/memory/patterns', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const body = req.body as any;
            const { tenantId, workspaceId, pattern, confidence, observedCount, lastSeen, sourceTaskId, sourcePrUrl } = body;

            if (!tenantId || !workspaceId || !pattern) {
                return res.status(400).send({ error: 'Missing required: tenantId, workspaceId, pattern' });
            }

            const request: LongTermMemoryWriteRequest = {
                tenantId,
                workspaceId,
                pattern,
                confidence: confidence || 0.5,
                observedCount: observedCount || 1,
                lastSeen: lastSeen || new Date().toISOString(),
            };

            const record = await memoryStore.writeLongTermMemory(request);

            return res.status(201).send({
                pattern: record,
                message: 'Pattern learned and will be applied to future tasks',
                sourceTaskId,
                sourcePrUrl,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to write pattern: ${msg}` });
        }
    });

    // ========== UPDATE PATTERN CONFIDENCE (when pattern is reinforced) ==========
    app.post('/api/v1/memory/patterns/:patternId/reinforce', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { patternId } = params;

            await memoryStore.updateMemoryConfidence(patternId, new Date().toISOString());

            return res.send({ patternId, message: 'Pattern confidence updated' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to reinforce pattern: ${msg}` });
        }
    });

    // ========== CLEANUP EXPIRED SHORT-TERM MEMORY (background job) ==========
    app.post('/api/v1/memory/cleanup', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const deletedCount = await memoryStore.cleanupExpiredMemories();

            return res.send({
                message: 'Cleanup complete',
                deletedCount,
                unit: 'short-term memory records',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to cleanup: ${msg}` });
        }
    });
}
