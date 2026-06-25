/**
 * policy-doc-ingestion.ts — Phase 5 ingestion pipeline for customer-uploaded
 * policy documents.
 *
 * One upload produces two outputs:
 *   1. RAG grounding   — the converted markdown is embedded into AgentKnowledgeBase
 *                        (best-effort; failure is logged, never fatal).
 *   2. Structured rules — an LLM extracts candidate GovernanceRules into
 *                        PolicyDocument.extractedRulesJson, awaiting HUMAN review
 *                        before they are applied into an enforced GovernancePolicy.
 *
 * Fail-safe by design: a conversion failure marks the doc `failed`; an extraction
 * or embedding failure still yields a `parsed` doc (with empty / partial output).
 * Nothing here applies a rule or weakens enforcement — that requires explicit
 * human approval via the apply route.
 */

import type { PrismaClient } from '@prisma/client';
import type { ExtractedRuleCandidate, PolicyEffect } from '@agentfarm/shared-types';

const VALID_EFFECTS: ReadonlySet<string> = new Set<PolicyEffect>([
    'allow',
    'require_approval',
    'deny',
]);

function clamp01(n: unknown): number {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
    return v < 0 ? 0 : v > 1 ? 1 : Number(v.toFixed(2));
}

/**
 * Normalizes raw LLM output into validated ExtractedRuleCandidate[]. Drops any
 * item missing a string `actionType` or a valid `effect`. Pure + exported for tests.
 */
export function normalizeCandidates(raw: unknown): ExtractedRuleCandidate[] {
    if (!Array.isArray(raw)) return [];
    const out: ExtractedRuleCandidate[] = [];
    raw.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        const r = item as Record<string, unknown>;
        const actionType = typeof r['actionType'] === 'string' ? r['actionType'].trim() : '';
        const effect = typeof r['effect'] === 'string' ? r['effect'].trim() : '';
        if (!actionType || !VALID_EFFECTS.has(effect)) return;

        const candidate: ExtractedRuleCandidate = {
            id: typeof r['id'] === 'string' && r['id'].trim() ? (r['id'] as string) : `cand_${i + 1}`,
            actionType,
            effect: effect as PolicyEffect,
            confidence: clamp01(r['confidence']),
        };
        if (typeof r['connector'] === 'string' && r['connector'].trim()) candidate.connector = r['connector'].trim();
        if (typeof r['tool'] === 'string' && r['tool'].trim()) candidate.tool = r['tool'].trim();
        if (r['mode'] === 'read_only' || r['mode'] === 'full') candidate.mode = r['mode'];
        if (typeof r['env'] === 'string' && r['env'].trim()) candidate.env = r['env'].trim();
        if (typeof r['reason'] === 'string' && r['reason'].trim()) candidate.reason = r['reason'].trim();
        if (typeof r['sourceQuote'] === 'string' && r['sourceQuote'].trim()) {
            candidate.sourceQuote = (r['sourceQuote'] as string).slice(0, 500);
        }
        out.push(candidate);
    });
    return out;
}

export type ConvertFn = (buffer: Buffer, mimeType: string) => Promise<string>;
export type ExtractRulesFn = (markdown: string) => Promise<ExtractedRuleCandidate[]>;
export type EmbedWriteFn = (markdown: string) => Promise<void>;

export interface IngestPolicyDocumentInput {
    tenantId: string;
    fileName: string;
    mimeType: string;
    sha256: string;
    buffer: Buffer;
    createdBy: string;
}

export interface IngestPolicyDocumentDeps {
    prisma: PrismaClient;
    convertFn: ConvertFn;
    extractRulesFn: ExtractRulesFn;
    /** Optional RAG-grounding writer; when omitted, embedding is skipped. */
    embedWriteFn?: EmbedWriteFn | null;
    /** Test seam: override console for warnings. */
    logger?: { warn: (msg: string) => void };
}

/**
 * Runs the full ingestion pipeline and persists the PolicyDocument row.
 * Idempotent on (tenantId, sha256): an existing row is returned unchanged.
 */
export async function ingestPolicyDocument(
    input: IngestPolicyDocumentInput,
    deps: IngestPolicyDocumentDeps,
): Promise<{ id: string; status: string; candidates: ExtractedRuleCandidate[]; deduped: boolean }> {
    const { prisma } = deps;
    const log = deps.logger ?? console;
    const storageKey = `urn:policydoc:${input.sha256}`;

    const existing = await prisma.policyDocument.findUnique({
        where: { tenantId_sha256: { tenantId: input.tenantId, sha256: input.sha256 } },
    });
    if (existing) {
        return {
            id: existing.id,
            status: existing.status,
            candidates: Array.isArray(existing.extractedRulesJson)
                ? (existing.extractedRulesJson as unknown as ExtractedRuleCandidate[])
                : [],
            deduped: true,
        };
    }

    // 1. Convert → markdown. Failure is terminal for this doc.
    let markdown: string;
    try {
        markdown = await deps.convertFn(input.buffer, input.mimeType);
    } catch (err) {
        const failed = await prisma.policyDocument.create({
            data: {
                tenantId: input.tenantId,
                fileName: input.fileName,
                mimeType: input.mimeType,
                storageKey,
                sha256: input.sha256,
                status: 'failed',
                failureReason: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
                createdBy: input.createdBy,
            },
        });
        return { id: failed.id, status: 'failed', candidates: [], deduped: false };
    }

    // 2. RAG grounding (best-effort).
    if (deps.embedWriteFn) {
        try {
            await deps.embedWriteFn(markdown);
        } catch (err) {
            log.warn(`[policy-doc] embedding failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 3. Structured extraction (best-effort → empty candidates).
    let candidates: ExtractedRuleCandidate[] = [];
    try {
        candidates = await deps.extractRulesFn(markdown);
    } catch (err) {
        log.warn(`[policy-doc] rule extraction failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }

    const created = await prisma.policyDocument.create({
        data: {
            tenantId: input.tenantId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            storageKey,
            sha256: input.sha256,
            status: 'parsed',
            extractedText: markdown,
            extractedRulesJson: candidates as unknown as object,
            createdBy: input.createdBy,
        },
    });

    return { id: created.id, status: 'parsed', candidates, deduped: false };
}

// ---------------------------------------------------------------------------
// Default LLM extractor (fetch-based; no heavy SDK dependency)
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You extract enforceable governance rules from a customer policy document.
Return ONLY a JSON array (no prose). Each element:
{ "actionType": string, "effect": "allow"|"require_approval"|"deny", "connector"?: string, "tool"?: string, "mode"?: "read_only"|"full", "env"?: string, "reason"?: string, "confidence": number (0..1), "sourceQuote"?: string }
Use snake_case actionType values like "deploy_production", "merge_pr", "send_email", "delete_resource", or "*" for any action.
Only emit rules the document clearly supports. If none, return [].`;

/**
 * Builds the default extractor. Calls an OpenAI-compatible chat endpoint using
 * AF_OPENAI_* env. Returns [] (never throws) when unconfigured or on any error —
 * the document is still parsed + embedded; candidates can be re-extracted later.
 */
export function createPolicyRuleExtractor(env: NodeJS.ProcessEnv = process.env): ExtractRulesFn {
    return async (markdown: string): Promise<ExtractedRuleCandidate[]> => {
        const apiKey = env['AF_OPENAI_API_KEY'] || env['OPENAI_API_KEY'];
        if (!apiKey) return [];
        const baseUrl = (env['AF_OPENAI_BASE_URL'] || 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = env['AF_OPENAI_MODEL'] || 'gpt-4o-mini';
        try {
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
                        {
                            role: 'user',
                            content: `Policy document:\n\n${markdown.slice(0, 24_000)}\n\nReturn {"rules": [...]}.`,
                        },
                    ],
                }),
                signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) return [];
            const body = (await res.json()) as {
                choices?: { message?: { content?: string } }[];
            };
            const content = body.choices?.[0]?.message?.content ?? '';
            if (!content) return [];
            const parsed = JSON.parse(content) as unknown;
            // Accept either a bare array or { rules: [...] }.
            const arr = Array.isArray(parsed)
                ? parsed
                : (parsed as { rules?: unknown })?.rules;
            return normalizeCandidates(arr);
        } catch {
            return [];
        }
    };
}
