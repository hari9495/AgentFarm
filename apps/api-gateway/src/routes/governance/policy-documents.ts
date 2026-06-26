/**
 * policy-documents.ts — Phase 5 customer-uploaded policy documents.
 *
 *   POST   /v1/governance/policy-documents          multipart upload → ingest
 *   GET    /v1/governance/policy-documents          list (no extractedText)
 *   GET    /v1/governance/policy-documents/:id       one (candidates + text)
 *   POST   /v1/governance/policy-documents/:id/apply approve candidates → policy
 *   DELETE /v1/governance/policy-documents/:id       remove
 *
 * Upload ingests (convert → embed for RAG → LLM-extract candidate rules). Apply
 * is the HUMAN-review gate: selected candidates are merged (tighten-only, deny
 * effects) into the scope's active GovernancePolicy, which the runtime enforcers
 * read directly. tenantId always from session.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
    convertToMarkdown,
    detectMimeType,
    isSupportedMimeType,
    SUPPORTED_MIME_TYPES,
} from '@agentfarm/document-converter';
import { writeSemanticMemory, chunkText } from '@agentfarm/memory-service';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { ExtractedRuleCandidate, GovernancePolicyScope } from '@agentfarm/shared-types';
import {
    ingestPolicyDocument,
    createPolicyRuleExtractor,
    type ExtractRulesFn,
    type ConvertFn,
} from '../../lib/policy-doc-ingestion.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterPolicyDocumentRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    embedFn?: EmbedFn | null;
    embeddingDeployment?: string;
    /** Test seams */
    _convertFn?: ConvertFn;
    _extractRulesFn?: ExtractRulesFn;
};

type AppliedRule = {
    actionType: string;
    effect: 'deny' | 'require_approval';
    connector?: string;
    tool?: string;
    mode?: 'read_only';
    env?: string;
    reason?: string;
};

/** Maps an approved candidate to a tighten-only enforceable rule, or null if not enforceable. */
function candidateToRule(c: ExtractedRuleCandidate): AppliedRule | null {
    // deny and require_approval are both enforced (B4); `allow` is not tighten-only.
    if (c.effect !== 'deny' && c.effect !== 'require_approval') return null;
    const rule: AppliedRule = { actionType: c.actionType, effect: c.effect };
    if (c.connector) rule.connector = c.connector;
    if (c.tool) rule.tool = c.tool;
    if (c.mode === 'read_only') rule.mode = 'read_only';
    if (c.env) rule.env = c.env;
    if (c.reason) rule.reason = c.reason;
    return rule;
}

export async function registerPolicyDocumentRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: RegisterPolicyDocumentRoutesOptions,
): Promise<void> {
    const { getSession } = options;
    const embedFn = options.embedFn ?? null;
    const deployment = options.embeddingDeployment ?? 'text-embedding-3-small';
    const convertFn = options._convertFn ?? convertToMarkdown;
    const extractRulesFn = options._extractRulesFn ?? createPolicyRuleExtractor();

    const on = (
        m: 'get' | 'post' | 'delete',
        p: string,
        h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>,
    ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (app as any)[m](`/v1${p}`, h);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (app as any)[m](`/api/v1${p}`, h);
    };

    // ========== POST upload + ingest ==========
    on('post', '/governance/policy-documents', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        let fileBuffer: Buffer | undefined;
        let filename: string | undefined;
        let reportedMime: string | undefined;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parts = (req as any).parts();
            for await (const part of parts) {
                if (part.type === 'file' && part.fieldname === 'file') {
                    filename = part.filename;
                    reportedMime = part.mimetype;
                    const chunks: Buffer[] = [];
                    for await (const chunk of part.file) chunks.push(chunk as Buffer);
                    fileBuffer = Buffer.concat(chunks);
                }
            }
        } catch {
            return res.status(400).send({ error: 'Failed to parse multipart body.' });
        }

        if (!fileBuffer || fileBuffer.length === 0) {
            return res.status(400).send({ error: 'file field is required.' });
        }
        const mimeType = (filename ? detectMimeType(filename) : undefined) ?? reportedMime ?? 'text/plain';
        if (!isSupportedMimeType(mimeType)) {
            return res.status(415).send({ error: `Unsupported file type: ${mimeType}`, supported: SUPPORTED_MIME_TYPES });
        }

        const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

        // Bind the RAG writer to this tenant (null when embeddings unconfigured).
        const tenantEmbedWrite = embedFn
            ? async (markdown: string): Promise<void> => {
                  const chunks = chunkText(markdown);
                  const multi = chunks.length > 1;
                  await Promise.all(
                      chunks.map((chunk, i) =>
                          writeSemanticMemory(
                              {
                                  tenantId: session.tenantId,
                                  content: chunk,
                                  sourceType: 'policy_document',
                                  sourceUrl: multi ? `urn:policydoc:${sha256}#chunk-${i}` : `urn:policydoc:${sha256}`,
                              },
                              embedFn!,
                              prisma,
                              deployment,
                          ),
                      ),
                  );
              }
            : null;

        try {
            const result = await ingestPolicyDocument(
                {
                    tenantId: session.tenantId,
                    fileName: filename ?? 'policy.txt',
                    mimeType,
                    sha256,
                    buffer: fileBuffer,
                    createdBy: session.userId,
                },
                { prisma, convertFn, extractRulesFn, embedWriteFn: tenantEmbedWrite },
            );
            return res.status(result.deduped ? 200 : 201).send(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Ingestion failed: ${msg}` });
        }
    });

    // ========== GET list ==========
    on('get', '/governance/policy-documents', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        const rows = await prisma.policyDocument.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, fileName: true, mimeType: true, status: true, failureReason: true,
                extractedRulesJson: true, appliedPolicyId: true, appliedAt: true, createdAt: true, updatedAt: true,
            },
        });
        const documents = rows.map((r) => ({
            ...r,
            candidateCount: Array.isArray(r.extractedRulesJson) ? r.extractedRulesJson.length : 0,
            extractedRulesJson: undefined,
        }));
        return res.send({ documents });
    });

    // ========== GET one ==========
    on('get', '/governance/policy-documents/:id', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        const { id } = req.params as { id: string };
        const row = await prisma.policyDocument.findUnique({ where: { id } });
        if (!row || row.tenantId !== session.tenantId) return res.status(404).send({ error: 'Document not found' });
        return res.send({
            document: {
                id: row.id, fileName: row.fileName, mimeType: row.mimeType, status: row.status,
                failureReason: row.failureReason, extractedText: row.extractedText,
                candidates: Array.isArray(row.extractedRulesJson) ? row.extractedRulesJson : [],
                appliedPolicyId: row.appliedPolicyId, appliedAt: row.appliedAt,
                createdAt: row.createdAt, updatedAt: row.updatedAt,
            },
        });
    });

    // ========== POST apply (human review gate) ==========
    on('post', '/governance/policy-documents/:id/apply', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        const { id } = req.params as { id: string };
        const body = (req.body ?? {}) as { scope?: string; roleKey?: string; candidateIds?: unknown };

        const scope = (body.scope === 'tenant' || body.scope === 'role' ? body.scope : null) as GovernancePolicyScope | null;
        if (!scope) return res.status(400).send({ error: "scope must be 'tenant' or 'role'" });
        const roleKey = typeof body.roleKey === 'string' ? body.roleKey.trim() : '';
        if (scope === 'role' && !roleKey) return res.status(400).send({ error: 'roleKey is required for role scope' });
        const scopeRef = scope === 'role' ? roleKey : '';

        const row = await prisma.policyDocument.findUnique({ where: { id } });
        if (!row || row.tenantId !== session.tenantId) return res.status(404).send({ error: 'Document not found' });

        const all = (Array.isArray(row.extractedRulesJson) ? row.extractedRulesJson : []) as unknown as ExtractedRuleCandidate[];
        const wantIds = Array.isArray(body.candidateIds)
            ? new Set((body.candidateIds as unknown[]).filter((x): x is string => typeof x === 'string'))
            : null; // null = all
        const selected = all.filter((c) => (wantIds ? wantIds.has(c.id) : true));

        const newRules: AppliedRule[] = [];
        const skipped: { id: string; reason: string }[] = [];
        for (const c of selected) {
            const rule = candidateToRule(c);
            if (rule) newRules.push(rule);
            else skipped.push({ id: c.id, reason: `effect '${c.effect}' is not enforceable (only 'deny' and 'require_approval')` });
        }
        if (newRules.length === 0) {
            return res.status(400).send({ error: 'No enforceable (deny / require_approval) candidates selected.', skipped });
        }

        try {
            const policy = await prisma.$transaction(async (tx) => {
                const priorActive = await tx.governancePolicy.findFirst({
                    where: { tenantId: session.tenantId, scope, scopeRef, status: 'active' },
                    orderBy: { version: 'desc' },
                });
                const existingRules = priorActive && Array.isArray(priorActive.rulesJson)
                    ? (priorActive.rulesJson as unknown as AppliedRule[])
                    : [];
                // Merge + dedup by JSON identity (tighten-only union).
                const seen = new Set(existingRules.map((r) => JSON.stringify(r)));
                const merged = [...existingRules];
                for (const r of newRules) {
                    const key = JSON.stringify(r);
                    if (!seen.has(key)) { seen.add(key); merged.push(r); }
                }
                if (priorActive) {
                    await tx.governancePolicy.update({ where: { id: priorActive.id }, data: { status: 'archived' } });
                }
                const top = await tx.governancePolicy.findFirst({
                    where: { tenantId: session.tenantId, scope, scopeRef },
                    orderBy: { version: 'desc' },
                });
                const version = (Number(top?.version) || 0) + 1;
                const created = await tx.governancePolicy.create({
                    data: {
                        tenantId: session.tenantId, scope, scopeRef, version, status: 'active',
                        name: `${scope === 'role' ? roleKey : 'tenant'} policy v${version} (from ${row.fileName})`,
                        rulesJson: merged as unknown as object,
                        createdBy: session.userId, updatedBy: session.userId,
                    },
                });
                await tx.policyDocument.update({
                    where: { id: row.id },
                    data: { appliedPolicyId: created.id, appliedAt: new Date() },
                });
                return created;
            });
            return res.status(201).send({ policy, appliedCount: newRules.length, skipped });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to apply candidates: ${msg}` });
        }
    });

    // ========== DELETE ==========
    on('delete', '/governance/policy-documents/:id', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        const { id } = req.params as { id: string };
        const row = await prisma.policyDocument.findUnique({ where: { id } });
        if (!row || row.tenantId !== session.tenantId) return res.status(404).send({ error: 'Document not found' });
        await prisma.policyDocument.delete({ where: { id } });
        return res.send({ message: 'Document removed', id });
    });
}
