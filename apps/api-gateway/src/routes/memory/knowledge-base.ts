/**
 * knowledge-base.ts — Sprint 9: Semantic Memory / Company Knowledge RAG
 *
 * REST endpoints for ingesting and searching company knowledge chunks.
 *
 * POST /v1/knowledge-base/write        — ingest a text chunk (optional mimeType normalises HTML/JSON/CSV)
 * POST /v1/knowledge-base/ingest-file  — ingest a binary document (PDF, DOCX, XLSX, PPTX, HTML, …)
 * POST /v1/knowledge-base/search       — cosine-similarity search over chunks
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    writeSemanticMemory,
    searchSemanticMemory,
    chunkText,
} from '@agentfarm/memory-service';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { SemanticWriteRequest, SemanticSearchRequest } from '@agentfarm/shared-types';
import {
    convertToMarkdown,
    detectMimeType,
    isSupportedMimeType,
    SUPPORTED_MIME_TYPES,
    UnsupportedFormatError,
} from '@agentfarm/document-converter';

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
    // Body: { tenantId, botId?, content, sourceUrl?, sourceType, mimeType? }
    //
    // If mimeType is provided (e.g. 'text/html'), content is normalised to
    // Markdown before embedding. Unsupported mimeTypes are silently ignored
    // (content stored as-is) to preserve backwards-compatibility.
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
        const mimeType = body.mimeType as string | undefined;

        if (!content || !sourceType) {
            return reply.code(400).send({ error: 'content and sourceType are required.' });
        }

        // Normalise text-format content to Markdown when mimeType is provided
        let normalizedContent = content;
        if (mimeType) {
            const base = mimeType.split(';')[0].trim().toLowerCase();
            if (isSupportedMimeType(base)) {
                try {
                    normalizedContent = await convertToMarkdown(Buffer.from(content, 'utf8'), base);
                } catch {
                    // non-fatal: fall back to original content
                }
            }
        }

        const writeReq: SemanticWriteRequest = {
            tenantId,
            botId: (body.botId as string | undefined),
            content: normalizedContent,
            sourceUrl: (body.sourceUrl as string | undefined),
            sourceType,
        };

        const record = await writeHook(writeReq, embedFn, prisma, deployment);

        return reply.code(201).send({ record });
    });

    // -----------------------------------------------------------------------
    // POST /v1/knowledge-base/ingest-file
    // Accept a binary document upload, convert it to Markdown, then embed.
    // Content-Type: multipart/form-data
    // Fields:
    //   file       — the binary file (required)
    //   sourceType — knowledge category tag (required)
    //   botId      — scope to a specific bot (optional)
    //   sourceUrl  — original URL or URN for the document (optional)
    // -----------------------------------------------------------------------
    on('post', '/knowledge-base/ingest-file', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }

        if (!embedFn) {
            return reply.code(503).send({
                error: 'Embedding service not configured. Set EPISODIC_EMBEDDING_ENDPOINT and EPISODIC_EMBEDDING_API_KEY.',
            });
        }

        // Collect multipart parts
        let fileBuffer: Buffer | undefined;
        let filename: string | undefined;
        let detectedMimeType: string | undefined;
        let sourceType: string | undefined;
        let botId: string | undefined;
        let sourceUrl: string | undefined;

        try {
            const parts = request.parts();
            for await (const part of parts) {
                if (part.type === 'file' && part.fieldname === 'file') {
                    filename = part.filename;
                    detectedMimeType = part.mimetype;
                    const chunks: Buffer[] = [];
                    for await (const chunk of part.file) chunks.push(chunk as Buffer);
                    fileBuffer = Buffer.concat(chunks);
                } else if (part.type === 'field') {
                    if (part.fieldname === 'sourceType') sourceType = part.value as string;
                    if (part.fieldname === 'botId')      botId = part.value as string;
                    if (part.fieldname === 'sourceUrl')  sourceUrl = part.value as string;
                }
            }
        } catch {
            return reply.code(400).send({ error: 'Failed to parse multipart body.' });
        }

        if (!fileBuffer || fileBuffer.length === 0) {
            return reply.code(400).send({ error: 'file field is required.' });
        }
        if (!sourceType) {
            return reply.code(400).send({ error: 'sourceType field is required.' });
        }

        // Prefer extension-based MIME detection (more reliable than browser-reported type)
        const mimeType = (filename ? detectMimeType(filename) : undefined) ?? detectedMimeType ?? 'text/plain';

        if (!isSupportedMimeType(mimeType)) {
            return reply.code(415).send({
                error: `Unsupported file type: ${mimeType}`,
                supported: SUPPORTED_MIME_TYPES,
            });
        }

        let markdown: string;
        try {
            markdown = await convertToMarkdown(fileBuffer, mimeType);
        } catch (err) {
            if (err instanceof UnsupportedFormatError) {
                return reply.code(415).send({ error: err.message });
            }
            return reply.code(422).send({ error: `Conversion failed: ${(err as Error).message}` });
        }

        const resolvedSourceUrl = sourceUrl || (filename ? `urn:agentfarm:doc:${encodeURIComponent(filename)}` : undefined);
        const chunks = chunkText(markdown);
        const multiChunk = chunks.length > 1;

        await Promise.all(
            chunks.map((chunk, i) => {
                const writeReq: SemanticWriteRequest = {
                    tenantId: session.tenantId,
                    botId:    botId || undefined,
                    content:  chunk,
                    sourceUrl: multiChunk && resolvedSourceUrl ? `${resolvedSourceUrl}#chunk-${i}` : resolvedSourceUrl,
                    sourceType,
                };
                return writeHook(writeReq, embedFn, prisma, deployment);
            }),
        );

        return reply.code(201).send({
            ok:               true,
            originalFilename: filename ?? null,
            mimeType,
            charCount:        markdown.length,
            chunkCount:       chunks.length,
        });
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
