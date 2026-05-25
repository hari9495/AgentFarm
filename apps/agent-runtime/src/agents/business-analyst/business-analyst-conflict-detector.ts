/**
 * Business Analyst — Cross-Document Requirement Conflict Detector
 *
 * Fetches BA documents from the knowledge base and identifies requirements
 * that contradict each other across different stories, BRDs, or specs.
 *
 * Called by the proactive monitoring cron (workspace_ba_proactive_conflict_scan)
 * and by the action handler when a new BRD or user story is finalised.
 *
 * Detection approach:
 *   1. Search the KB for all approved BA documents (sourceType = 'ba_approved_document')
 *   2. Extract requirement sentences from each document
 *   3. Group requirements into semantically related clusters via keyword overlap
 *   4. For each cluster, use LLM to check whether any pair contradicts
 *   5. Return RequirementConflict[] — deduplicated, severity-classified
 *
 * Without an LLM caller, falls back to a heuristic rule set that catches
 * common patterns: "must/must not" conflicts, contradictory capacity claims,
 * mutually exclusive state requirements.
 */

import type { KbSearchResult } from './business-analyst-rag-retriever.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequirementConflict {
    /** Opaque ID for deduplication. */
    id: string;
    reqAText: string;
    reqASource?: string;
    reqBText: string;
    reqBSource?: string;
    conflictDescription: string;
    severity: 'low' | 'medium' | 'high';
    detectedAt: string;
}

export interface ConflictDetectionInput {
    tenantId: string;
    botId?: string;
    workspaceId: string;
    gatewayBaseUrl: string;
    serviceToken: string;
    /** LLM caller — enables semantic conflict detection beyond keyword heuristics. */
    callLlm?: (prompt: string, systemPrompt?: string) => Promise<string>;
    /** Maximum number of documents to scan. Default: 20. */
    maxDocuments?: number;
    /** Skip pairs with fewer than this many shared keywords (reduces false positives). Default: 2. */
    minKeywordOverlap?: number;
}

export interface ConflictDetectionResult {
    conflicts: RequirementConflict[];
    documentsScanned: number;
    requirementsExtracted: number;
    detectedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge base fetcher
// ---------------------------------------------------------------------------

interface KbSearchResponse {
    results?: Array<{
        id?: string;
        content?: string;
        sourceUrl?: string;
        sourceType?: string;
        similarity?: number;
    }>;
}

async function fetchApprovedDocuments(
    tenantId: string,
    botId: string | undefined,
    maxDocuments: number,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId,
                botId,
                // Broad query to retrieve all approved BA docs
                queryText: 'business requirements user story acceptance criteria system must shall',
                topK: maxDocuments,
                minSimilarity: 0.0, // retrieve all, not just similar
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as KbSearchResponse;
        return (data.results ?? [])
            .filter((r) => r.id && r.content && r.sourceType === 'ba_approved_document')
            .map((r) => ({
                id: r.id ?? '',
                content: r.content ?? '',
                sourceUrl: r.sourceUrl,
                sourceType: r.sourceType,
                similarity: r.similarity ?? 0,
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Requirement extractor
// ---------------------------------------------------------------------------

interface ExtractedRequirement {
    text: string;
    sourceDocId: string;
    sourceUrl?: string;
}

/**
 * Extract individual requirement sentences from a document chunk.
 *
 * Looks for lines that contain requirement signals:
 *   - "must", "shall", "will", "should", "must not", "shall not"
 *   - "As a … I want …" story format
 *   - "REQ-NNN" numbered requirements
 */
function extractRequirements(doc: KbSearchResult): ExtractedRequirement[] {
    const requirements: ExtractedRequirement[] = [];
    const lines = doc.content.split('\n');

    const REQ_PATTERN =
        /\b(must(?:\s+not)?|shall(?:\s+not)?|will(?:\s+not)?|should(?:\s+not)?|(?:as\s+a\b).*(?:\bi\s+want\b)|REQ-\d+)\b/i;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 20) continue;    // too short to be a requirement
        if (/^#{1,4}\s/.test(trimmed)) continue; // headings are not requirements

        if (REQ_PATTERN.test(trimmed)) {
            requirements.push({
                text: trimmed.replace(/^\|.*?\|\s*/, '').trim(), // strip table cell prefix
                sourceDocId: doc.id,
                sourceUrl: doc.sourceUrl,
            });
        }
    }

    return requirements;
}

// ---------------------------------------------------------------------------
// Heuristic conflict rules
// ---------------------------------------------------------------------------

interface HeuristicConflict {
    description: string;
    severity: 'low' | 'medium' | 'high';
}

/**
 * Apply keyword-based rules to find common requirement contradictions.
 *
 * Catches:
 *   - "must <X>" vs "must not <X>" for the same X
 *   - "always <X>" vs "never <X>"
 *   - Contradictory capacity claims (e.g. "at least 100" vs "maximum 50")
 */
function applyHeuristicRules(
    reqA: ExtractedRequirement,
    reqB: ExtractedRequirement,
): HeuristicConflict | null {
    const a = reqA.text.toLowerCase();
    const b = reqB.text.toLowerCase();

    // "must X" vs "must not X" — extract the verb phrase
    const mustMatch = a.match(/\bmust\s+([\w\s]+)\b/i);
    const mustNotMatch = b.match(/\bmust\s+not\s+([\w\s]+)\b/i);
    if (mustMatch && mustNotMatch) {
        const aVerb = mustMatch[1]?.trim().slice(0, 20) ?? '';
        const bVerb = mustNotMatch[1]?.trim().slice(0, 20) ?? '';
        if (aVerb && bVerb && aVerb.startsWith(bVerb.slice(0, 6))) {
            return {
                description: `Contradictory obligations: one requirement says "must ${aVerb}" while another says "must not ${bVerb}".`,
                severity: 'high',
            };
        }
    }

    // "always" vs "never"
    if (/\balways\b/.test(a) && /\bnever\b/.test(b)) {
        return {
            description: 'One requirement specifies "always" while another specifies "never" — both cannot hold simultaneously.',
            severity: 'high',
        };
    }

    // Contradictory capacity: "at least N" vs "maximum M" where N > M
    const atLeast = a.match(/at\s+least\s+(\d+)/);
    const maximum = b.match(/(?:maximum|max|no\s+more\s+than)\s+(\d+)/);
    if (atLeast && maximum) {
        const lower = parseInt(atLeast[1] ?? '0', 10);
        const upper = parseInt(maximum[1] ?? '0', 10);
        if (lower > upper) {
            return {
                description: `Contradictory capacity: one requirement specifies a minimum of ${lower} while another caps at ${upper}.`,
                severity: 'high',
            };
        }
    }

    // "real-time" vs "batch" in the same topic area
    if (/\breal[\s-]?time\b/.test(a) && /\bbatch\b/.test(b)) {
        const overlap = a.split(/\s+/).filter((w) => w.length > 4 && b.includes(w)).length;
        if (overlap >= 2) {
            return {
                description: 'One requirement specifies real-time processing while another specifies batch processing for what appears to be the same data flow.',
                severity: 'medium',
            };
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// LLM-based pairwise check
// ---------------------------------------------------------------------------

interface LlmConflictCheckResult {
    conflicts: boolean;
    description?: string;
    severity?: 'low' | 'medium' | 'high';
}

async function llmPairwiseCheck(
    reqA: ExtractedRequirement,
    reqB: ExtractedRequirement,
    callLlm: (prompt: string, systemPrompt?: string) => Promise<string>,
): Promise<LlmConflictCheckResult> {
    const prompt = `You are a business analyst reviewing two requirements for contradictions.

Requirement A: "${reqA.text}"
Requirement B: "${reqB.text}"

Do these requirements contradict each other? Respond with JSON only:
{"conflicts": true|false, "description": "one sentence explanation if conflicts=true", "severity": "low|medium|high"}

A conflict exists when both requirements cannot be satisfied simultaneously. Minor overlaps, redundancy, or unclear wording do NOT count as conflicts.`;

    try {
        const raw = await callLlm(prompt, 'You are a requirements analysis engine. Return valid JSON only, no markdown.');
        const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned) as Partial<LlmConflictCheckResult>;
        return {
            conflicts: parsed.conflicts === true,
            description: parsed.description,
            severity: parsed.severity ?? 'medium',
        };
    } catch {
        return { conflicts: false };
    }
}

// ---------------------------------------------------------------------------
// Keyword overlap scorer
// ---------------------------------------------------------------------------

function keywordOverlap(a: string, b: string): number {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'not', 'must', 'shall', 'will', 'should', 'be', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'that', 'this', 'as']);
    const words = (text: string): Set<string> =>
        new Set(
            text.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w)),
        );

    const aWords = words(a);
    const bWords = words(b);
    let overlap = 0;
    for (const w of aWords) {
        if (bWords.has(w)) overlap++;
    }
    return overlap;
}

function conflictId(reqADocId: string, reqBDocId: string, idxA: number, idxB: number): string {
    return `${reqADocId.slice(0, 8)}-${idxA}-${reqBDocId.slice(0, 8)}-${idxB}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan approved BA documents for cross-document requirement conflicts.
 *
 * Returns a deduplicated list of conflicts sorted by severity (high first).
 *
 * With a `callLlm` function, uses LLM pairwise comparison for semantic
 * conflicts that heuristics would miss.  Without it, uses keyword-based
 * rules only.
 *
 * Performance note: the number of comparisons is O(n²) in the number of
 * requirements. `maxDocuments` and `minKeywordOverlap` control the search
 * space. For large workspaces (>500 requirements), set `minKeywordOverlap`
 * to 3 or higher.
 */
export async function detectRequirementConflicts(
    input: ConflictDetectionInput,
): Promise<ConflictDetectionResult> {
    const {
        tenantId,
        botId,
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
        callLlm,
        maxDocuments = 20,
        minKeywordOverlap = 2,
    } = input;

    const detectedAt = new Date().toISOString();
    const conflicts: RequirementConflict[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch approved documents from KB
    const docs = await fetchApprovedDocuments(tenantId, botId, maxDocuments, gatewayBaseUrl, serviceToken);

    if (docs.length === 0) {
        return { conflicts: [], documentsScanned: 0, requirementsExtracted: 0, detectedAt };
    }

    // 2. Extract requirements from all documents
    const allRequirements: ExtractedRequirement[] = docs.flatMap(extractRequirements);

    if (allRequirements.length === 0) {
        return { conflicts: [], documentsScanned: docs.length, requirementsExtracted: 0, detectedAt };
    }

    // 3. Pairwise comparison — only compare requirements from DIFFERENT documents
    //    and only when keyword overlap meets the threshold (reduces false positives)
    const crossDocPairs: Array<[ExtractedRequirement, ExtractedRequirement, number, number]> = [];

    for (let i = 0; i < allRequirements.length; i++) {
        for (let j = i + 1; j < allRequirements.length; j++) {
            const reqA = allRequirements[i]!;
            const reqB = allRequirements[j]!;

            // Skip same-document pairs — intra-document contradictions are
            // caught by the BRD completeness checker's contradiction check
            if (reqA.sourceDocId === reqB.sourceDocId) continue;

            const overlap = keywordOverlap(reqA.text, reqB.text);
            if (overlap >= minKeywordOverlap) {
                crossDocPairs.push([reqA, reqB, i, j]);
            }
        }
    }

    // 4. Check each candidate pair
    for (const [reqA, reqB, i, j] of crossDocPairs) {
        const id = conflictId(reqA.sourceDocId, reqB.sourceDocId, i, j);
        if (seenIds.has(id)) continue;

        // First try heuristic rules (no LLM cost)
        const heuristic = applyHeuristicRules(reqA, reqB);
        if (heuristic) {
            seenIds.add(id);
            conflicts.push({
                id,
                reqAText: reqA.text,
                reqASource: reqA.sourceUrl,
                reqBText: reqB.text,
                reqBSource: reqB.sourceUrl,
                conflictDescription: heuristic.description,
                severity: heuristic.severity,
                detectedAt,
            });
            continue;
        }

        // LLM pairwise check for semantically close pairs
        if (callLlm) {
            const llmResult = await llmPairwiseCheck(reqA, reqB, callLlm);
            if (llmResult.conflicts && llmResult.description) {
                seenIds.add(id);
                conflicts.push({
                    id,
                    reqAText: reqA.text,
                    reqASource: reqA.sourceUrl,
                    reqBText: reqB.text,
                    reqBSource: reqB.sourceUrl,
                    conflictDescription: llmResult.description,
                    severity: llmResult.severity ?? 'medium',
                    detectedAt,
                });
            }
        }
    }

    // Sort by severity: high → medium → low
    const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
    conflicts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2));

    return {
        conflicts,
        documentsScanned: docs.length,
        requirementsExtracted: allRequirements.length,
        detectedAt,
    };
}

/**
 * Format detected conflicts into a Slack/email notification block.
 */
export function formatConflictsForNotification(result: ConflictDetectionResult): string {
    if (result.conflicts.length === 0) {
        return `✅ No requirement conflicts detected across ${result.documentsScanned} documents (${result.requirementsExtracted} requirements scanned).`;
    }

    const lines: string[] = [
        `⚠️ *${result.conflicts.length} requirement conflict(s) detected* across ${result.documentsScanned} documents:`,
        '',
    ];

    for (const c of result.conflicts.slice(0, 10)) {
        const emoji = c.severity === 'high' ? '🔴' : c.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`${emoji} *${c.severity.toUpperCase()}*: ${c.conflictDescription}`);
        lines.push(`   • Req A: "${c.reqAText.slice(0, 100)}${c.reqAText.length > 100 ? '…' : ''}" _(${c.reqASource ?? 'unknown source'})_`);
        lines.push(`   • Req B: "${c.reqBText.slice(0, 100)}${c.reqBText.length > 100 ? '…' : ''}" _(${c.reqBSource ?? 'unknown source'})_`);
        lines.push('');
    }

    if (result.conflicts.length > 10) {
        lines.push(`_… and ${result.conflicts.length - 10} more. Review the full conflict report._`);
    }

    return lines.join('\n');
}
