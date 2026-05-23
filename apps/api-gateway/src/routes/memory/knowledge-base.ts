/**
 * knowledge-base.ts — Sprint 9: Semantic Memory / Company Knowledge RAG
 *
 * REST endpoints for ingesting and searching company knowledge chunks.
 *
 * POST /v1/knowledge-base/write   — ingest a new knowledge chunk
 * POST /v1/knowledge-base/search  — cosine-similarity search over chunks
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    writeSemanticMemory,
    searchSemanticMemory,
} from '@agentfarm/memory-service';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { SemanticWriteRequest, SemanticSearchRequest } from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterKnowledgeBaseRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    embedFn?: EmbedFn | null;
    embeddingDeployment?: string;
    /** Test-only: override the write hook to avoid real DB calls */
    _writeHook?: typeof writeSemanticMemory;
    /** Test-only: override the search hook to avoid real DB calls */
    _searchHook?: typeof searchSemanticMemory;
};

export async function registerKnowledgeBaseRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: RegisterKnowledgeBaseRoutesOptions,
): Promise<void> {
    const getSession = options.getSession;
    const embedFn = options.embedFn ?? null;
    const deployment = options.embeddingDeployment ?? 'text-embedding-3-small';
    const writeHook = options._writeHook ?? writeSemanticMemory;
    const searchHook = options._searchHook ?? searchSemanticMemory;

    // Helper: register at both /v1/... and /api/v1/... (deprecated alias)
    const on = (
        method: 'post',
        path: string,
        handler: (req: FastifyRequest, res: import('fastify').FastifyReply) => Promise<unknown>,
    ) => {
        app[method](`/v1${path}`, handler);
        app[method](`/api/v1${path}`, handler);
    };

    // -----------------------------------------------------------------------
    // POST /v1/knowledge-base/write
    // Embed a knowledge chunk and store it in AgentKnowledgeBase.
    // Body: { tenantId, botId?, content, sourceUrl?, sourceType }
    // -----------------------------------------------------------------------
    on('post', '/knowledge-base/write', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }

        if (!embedFn) {
            return reply.code(503).send({
                error: 'Embedding service not configured. Set EPISODIC_EMBEDDING_ENDPOINT and EPISODIC_EMBEDDING_API_KEY.',
            });
        }

        const body = request.body as Record<string, unknown>;
        const tenantId = (body.tenantId as string) ?? session.tenantId;
        const content = body.content as string | undefined;
        const sourceType = body.sourceType as string | undefined;

        if (!content || !sourceType) {
            return reply.code(400).send({ error: 'content and sourceType are required.' });
        }

        const writeReq: SemanticWriteRequest = {
            tenantId,
            botId: (body.botId as string | undefined),
            content,
            sourceUrl: (body.sourceUrl as string | undefined),
            sourceType,
        };

        const record = await writeHook(writeReq, embedFn, prisma, deployment);

        return reply.code(201).send({ record });
    });

    // -----------------------------------------------------------------------
    // POST /v1/knowledge-base/search
    // Cosine-similarity search over AgentKnowledgeBase.
    // Body: { tenantId?, botId?, queryText, topK?, minSimilarity? }
    // -----------------------------------------------------------------------
    on('post', '/knowledge-base/search', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }

        if (!embedFn) {
            return reply.code(503).send({
                error: 'Embedding service not configured. Set EPISODIC_EMBEDDING_ENDPOINT and EPISODIC_EMBEDDING_API_KEY.',
            });
        }

        const body = request.body as Record<string, unknown>;
        const tenantId = (body.tenantId as string) ?? session.tenantId;
        const queryText = body.queryText as string | undefined;

        if (!queryText) {
            return reply.code(400).send({ error: 'queryText is required.' });
        }

        const searchReq: SemanticSearchRequest = {
            tenantId,
            botId: (body.botId as string | undefined),
            queryText,
            topK: (body.topK as number | undefined),
            minSimilarity: (body.minSimilarity as number | undefined),
        };

        const results = await searchHook(searchReq, embedFn, prisma);

        return reply.code(200).send({ results });
    });
}
