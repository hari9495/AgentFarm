/**
 * Content Fact Checker
 *
 * Identifies potentially unverified factual claims in a draft body using
 * heuristic text analysis — numbers, percentages, and named-entity patterns.
 *
 * Optionally enriched with LLM-based verification via `verifyFactsWithLlm`.
 */

import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactFlag {
    /** The sentence or phrase that contains the claim. */
    claim: string;
    /** Human-readable reason the claim was flagged. */
    reason: string;
    /** 'warn' = needs verification; 'block' = known-false or policy violation. */
    severity: 'warn' | 'block';
}

export interface FactCheckReport {
    totalClaims: number;
    verified: number;
    flagged: FactFlag[];
}

// ---------------------------------------------------------------------------
// Claim detection patterns
// ---------------------------------------------------------------------------

/** Matches sentences that contain a percentage value, e.g. "increases by 40%". */
const PERCENTAGE_PATTERN = /[^.!?\n]+\d+\s*%[^.!?\n]*/g;

/** Matches sentences that contain standalone numbers ≥ 3 digits (avoid years). */
const NUMBER_STAT_PATTERN = /[^.!?\n]*\b(?!(?:20\d{2})\b)\d{3,}[^.!?\n]*/g;

/**
 * Matches capitalised multi-word phrases that look like named entities or
 * titles: two or more consecutive capitalised words NOT at sentence start.
 * Example: "Microsoft Azure", "Goldman Sachs report".
 */
const NAMED_ENTITY_PATTERN =
    /(?<!\.\s)(?<![.!?\n]\s)(?:[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})+)/g;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deduplicate<T extends { claim: string }>(flags: T[]): T[] {
    const seen = new Set<string>();
    return flags.filter((f) => {
        const key = f.claim.trim().toLowerCase().slice(0, 80);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function extractMatches(text: string, pattern: RegExp): string[] {
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    // Reset lastIndex on global regexes
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(text)) !== null) {
        const sentence = match[0].trim();
        if (sentence.length > 0) matches.push(sentence);
    }
    return matches;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a draft body for potentially unverified factual claims.
 *
 * When `sourcesConfig` is provided, each flagged claim is cross-referenced
 * against the research snippets. A claim is counted as verified if its
 * entity text appears verbatim in any snippet body.
 */
export function checkFactualClaims(
    draftBody: string,
    sourcesConfig: import('./content-research-service.js').ContentResearchResult | null,
): FactCheckReport {
    if (!draftBody || draftBody.trim().length === 0) {
        return { totalClaims: 0, verified: 0, flagged: [] };
    }

    const rawFlags: FactFlag[] = [];

    // Percentage claims
    for (const claim of extractMatches(draftBody, PERCENTAGE_PATTERN)) {
        rawFlags.push({
            claim,
            reason: 'Contains a percentage figure — verify against source data.',
            severity: 'warn',
        });
    }

    // Number / stat claims (skip pure percentage lines already captured)
    for (const claim of extractMatches(draftBody, NUMBER_STAT_PATTERN)) {
        // Skip if already covered by the percentage pass
        if (/\d+\s*%/.test(claim)) continue;
        rawFlags.push({
            claim,
            reason: 'Contains a numeric claim — verify against source data.',
            severity: 'warn',
        });
    }

    // Named entity claims
    for (const entity of extractMatches(draftBody, NAMED_ENTITY_PATTERN)) {
        rawFlags.push({
            claim: entity,
            reason: `Named entity "${entity}" — verify correct attribution or reference.`,
            severity: 'warn',
        });
    }

    const flagged = deduplicate(rawFlags);

    // Cross-reference flags against research snippets when available
    let verified = 0;
    if (sourcesConfig && sourcesConfig.snippets.length > 0) {
        const snippetText = sourcesConfig.snippets.map((s) => s.text.toLowerCase()).join(' ');
        for (const flag of flagged) {
            const claimLower = flag.claim.toLowerCase();
            // Consider verified if any 5+ character entity from the claim appears in snippets
            const words = claimLower.split(/\s+/).filter((w) => w.length >= 5);
            if (words.some((w) => snippetText.includes(w))) {
                verified++;
            }
        }
    }

    return {
        totalClaims: flagged.length,
        verified,
        flagged,
    };
}

/**
 * Render a FactCheckReport as a Markdown summary table.
 */
export function buildFactCheckSummary(report: FactCheckReport): string {
    if (report.flagged.length === 0) {
        return '**Fact Check**: No claims flagged — draft is ready for editorial review.';
    }

    const blocks = report.flagged.map(
        (f) => `| ${f.severity.toUpperCase()} | ${f.claim.replace(/\|/g, '\\|')} | ${f.reason} |`,
    );
    const blockCount = report.flagged.filter((f) => f.severity === 'block').length;
    const warnCount = report.flagged.filter((f) => f.severity === 'warn').length;

    return [
        `**Fact Check Summary**: ${report.flagged.length} claim(s) flagged` +
        (blockCount > 0 ? ` (${blockCount} BLOCKED, ${warnCount} warn)` : ` (${warnCount} warn)`) +
        `, ${report.verified} verified`,
        '',
        '| Severity | Claim | Reason |',
        '|----------|-------|--------|',
        ...blocks,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// LLM-based verification pass
// ---------------------------------------------------------------------------

/**
 * Run a second-pass LLM verification over an existing FactCheckReport.
 *
 * For each flagged claim, the LLM evaluates whether it is:
 * - VERIFIED   — consistent with research snippets (severity stays 'warn')
 * - UNCERTAIN  — cannot be determined (severity stays 'warn')
 * - LIKELY_FALSE — contradicts sources (severity upgraded to 'block')
 *
 * Returns an updated FactCheckReport with adjusted severities and verified count.
 * Falls back to the original report if the LLM is unavailable.
 */
export async function verifyFactsWithLlm(
    report: FactCheckReport,
    sourcesConfig: import('./content-research-service.js').ContentResearchResult | null,
    caller: ProseCallerFn,
): Promise<FactCheckReport> {
    if (report.flagged.length === 0) return report;

    const snippetContext =
        sourcesConfig && sourcesConfig.snippets.length > 0
            ? sourcesConfig.snippets
                .slice(0, 4)
                .map((s) => `[${s.source}] ${s.text}`)
                .join('\n\n')
            : 'No research sources available.';

    const systemPrompt =
        'You are a fact-checker. For each numbered claim, determine if it is: ' +
        'VERIFIED (consistent with sources), UNCERTAIN (cannot be determined), ' +
        'or LIKELY_FALSE (contradicts sources or is implausible). ' +
        'Respond ONLY with a JSON array: [{"index":0,"verdict":"VERIFIED","reason":"..."},...]. ' +
        'Use zero-based index matching the claim list order.';

    const claimsText = report.flagged
        .map((f, i) => `${i}. ${f.claim.slice(0, 120)}`)
        .join('\n');

    const userPrompt = `Research sources:\n${snippetContext}\n\nClaims to verify:\n${claimsText}`;

    const result = await caller(systemPrompt, userPrompt);
    if (!result.text) return report;

    type Verdict = { index: number; verdict: 'VERIFIED' | 'UNCERTAIN' | 'LIKELY_FALSE'; reason: string };
    let verdicts: Verdict[] = [];
    try {
        const jsonMatch = /\[[\s\S]+\]/.exec(result.text);
        if (jsonMatch) verdicts = JSON.parse(jsonMatch[0]) as Verdict[];
    } catch {
        return report;
    }

    let verified = 0;
    const updatedFlags = report.flagged.map((flag, idx) => {
        const verdict = verdicts.find((v) => v.index === idx);
        if (!verdict) return flag;
        if (verdict.verdict === 'VERIFIED') {
            verified++;
            return flag;
        }
        if (verdict.verdict === 'LIKELY_FALSE') {
            return {
                ...flag,
                severity: 'block' as const,
                reason: `${flag.reason} LLM: ${verdict.reason}`,
            };
        }
        return flag;
    });

    return { ...report, verified, flagged: updatedFlags };
}

// ---------------------------------------------------------------------------
// Auto-research cross-reference
// ---------------------------------------------------------------------------

/**
 * Enriched fact-check result that includes which named entities were researched.
 */
export interface FactCheckReportWithResearch extends FactCheckReport {
    /** Named entities that were looked up during auto-research. */
    researchedEntities: string[];
}

/**
 * Detect named entities in flagged claims, auto-research each one, then
 * re-run fact checking using the fetched snippets as cross-reference sources.
 *
 * This is the "live cross-reference" path — it calls Wikipedia, Hacker News,
 * and Reddit for up to three named entities found in the draft and uses those
 * results to mark claims as verified without requiring the caller to
 * pre-populate a ContentResearchResult.
 *
 * @param draftBody - The draft text to fact-check.
 * @param fetchFn   - Injectable fetch used by the research service (tests can
 *                    supply a stub; production uses the caller-supplied function).
 */
export async function researchAndCheckFacts(
    draftBody: string,
    fetchFn: import('./content-research-service.js').ResearchFetchFn,
): Promise<FactCheckReportWithResearch> {
    const { researchContentTopic } = await import('./content-research-service.js');

    // Initial pass to surface named-entity flags without sources
    const initialReport = checkFactualClaims(draftBody, null);

    // Collect unique named entities (length-bounded to avoid junk)
    const entityFlags = initialReport.flagged.filter((f) => f.reason.includes('Named entity'));
    const entities = Array.from(
        new Set(
            entityFlags
                .map((f) => f.claim.trim())
                .filter((c) => c.length >= 4 && c.length <= 50),
        ),
    ).slice(0, 3); // cap at 3 to avoid excessive API calls

    if (entities.length === 0) {
        return { ...initialReport, researchedEntities: [] };
    }

    // Research each entity and merge snippets
    const allSnippets: import('./content-research-service.js').ResearchSnippet[] = [];
    for (const entity of entities) {
        const research = await researchContentTopic(entity, fetchFn);
        allSnippets.push(...research.snippets);
    }

    const mergedResearch: import('./content-research-service.js').ContentResearchResult = {
        topic: entities[0]!,
        snippets: allSnippets,
        fetchedAt: new Date().toISOString(),
    };

    const enrichedReport = checkFactualClaims(draftBody, mergedResearch);
    return { ...enrichedReport, researchedEntities: entities };
}
