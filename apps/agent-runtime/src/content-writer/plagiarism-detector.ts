/**
 * Plagiarism Detector
 *
 * Uses an LLM to identify passages in a content draft that appear to be
 * verbatim or near-verbatim copies of well-known texts, overly generic
 * marketing boilerplate, or phrases that lack original thought.
 *
 * Optionally enriched with a Copyscape API check when
 * COPYSCAPE_API_USERNAME and COPYSCAPE_API_KEY env vars are set.
 *
 * Note: LLM detection is a heuristic, not a database comparison.
 * Flagged passages should be reviewed by the human editor before action.
 *
 * Uses the same injectable ProseCallerFn pattern as the rest of the
 * content-writer module so tests never require a live LLM endpoint.
 */

import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Fetch abstraction (injectable for tests)
// ---------------------------------------------------------------------------

export type PlagiarismFetchFn = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

// ---------------------------------------------------------------------------
// Copyscape types
// ---------------------------------------------------------------------------

export interface CopyscapeMatch {
    /** Source URL where duplication was detected. */
    url: string;
    /** Percentage of text matched (0–100). */
    percentMatched: number;
    /** Number of words matched. */
    wordsMatched: number;
    /** Title of the matching page. */
    title: string;
}

export interface CopyscapeResult {
    /** Whether any duplicated content was found externally. */
    duplicatesFound: boolean;
    /** Individual matches. */
    matches: CopyscapeMatch[];
    /** Human-readable one-line summary. */
    summary: string;
    /** True when env vars were not set and the check was skipped. */
    skipped: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlagiarismFlag {
    /** The excerpt that was flagged. */
    excerpt: string;
    /** Human-readable explanation of why this was flagged. */
    suspicion: string;
    /** Confidence level of the flag. */
    severity: 'low' | 'medium' | 'high';
}

export interface PlagiarismReport {
    /** True when no flags were found. */
    clean: boolean;
    /** Individual flagged excerpts. */
    flags: PlagiarismFlag[];
    /** True when at least one medium or high-severity flag was found. */
    reviewRecommended: boolean;
    /** Human-readable summary of findings. */
    summary: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a content body for potential plagiarism using an LLM.
 *
 * Sends up to 3000 characters of the draft to the LLM and asks it to
 * identify any phrases or ideas that appear to be copied from known sources,
 * generic boilerplate, or unoriginal filler.
 *
 * Falls back to a clean report with a note if the LLM is unavailable.
 */
export async function detectPlagiarism(
    body: string,
    caller: ProseCallerFn,
): Promise<PlagiarismReport> {
    if (!body.trim()) {
        return {
            clean: true,
            flags: [],
            reviewRecommended: false,
            summary: 'No content to check.',
        };
    }

    const systemPrompt =
        'You are a plagiarism detection assistant. Review the content for:\n' +
        '1. Phrases or sentences that appear to be verbatim or near-verbatim copies of ' +
        'well-known texts, news articles, Wikipedia entries, or common marketing copy.\n' +
        '2. Overly generic boilerplate that shows a lack of original thought ' +
        '(e.g. "In today\'s fast-paced world...", "Unlock your potential...").\n' +
        'Respond ONLY with a JSON object in this exact shape:\n' +
        '{"clean":boolean,"flags":[{"excerpt":"...","suspicion":"...","severity":"low"|"medium"|"high"}],' +
        '"summary":"one sentence summary"}\n' +
        'If the content is original, return {"clean":true,"flags":[],"summary":"Content appears original."}';

    const result = await caller(
        systemPrompt,
        `Check this content for plagiarism:\n\n${body.slice(0, 3000)}`,
    );

    if (!result.text) {
        return {
            clean: true,
            flags: [],
            reviewRecommended: false,
            summary: 'Plagiarism check unavailable — LLM call failed. Manual review recommended.',
        };
    }

    try {
        const jsonMatch = /\{[\s\S]+\}/.exec(result.text);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        const parsed = JSON.parse(jsonMatch[0]) as {
            clean?: boolean;
            flags?: Array<{ excerpt?: unknown; suspicion?: unknown; severity?: unknown }>;
            summary?: string;
        };

        const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;
        const flags: PlagiarismFlag[] = (parsed.flags ?? []).map((f) => ({
            excerpt: String(f.excerpt ?? ''),
            suspicion: String(f.suspicion ?? ''),
            severity: VALID_SEVERITIES.includes(f.severity as typeof VALID_SEVERITIES[number])
                ? (f.severity as PlagiarismFlag['severity'])
                : 'low',
        }));

        const reviewRecommended = flags.some(
            (f) => f.severity === 'high' || f.severity === 'medium',
        );

        return {
            clean: parsed.clean ?? flags.length === 0,
            flags,
            reviewRecommended,
            summary:
                parsed.summary ??
                (flags.length === 0
                    ? 'Content appears original.'
                    : `${flags.length} potentially plagiarised passage(s) found.`),
        };
    } catch {
        return {
            clean: true,
            flags: [],
            reviewRecommended: false,
            summary:
                'Plagiarism check parse error — LLM response was not valid JSON. Manual review recommended.',
        };
    }
}

// ---------------------------------------------------------------------------
// Copyscape API adapter
// ---------------------------------------------------------------------------

const COPYSCAPE_API_URL = 'https://www.copyscape.com/api/';

/**
 * Run a Copyscape full-text search for duplicated content.
 *
 * Requires `COPYSCAPE_API_USERNAME` and `COPYSCAPE_API_KEY` env vars.
 * When not set, returns a skipped result so callers can proceed gracefully.
 *
 * @param body    The content body to check (will be truncated to 25 000 chars).
 * @param fetchFn Injectable fetch function — defaults to globalThis.fetch.
 */
export async function copyscapeCheck(
    body: string,
    fetchFn: PlagiarismFetchFn = (url, init) =>
        (globalThis.fetch as (u: string, i?: RequestInit) => Promise<Response>)(url, {
            method: init?.method,
            headers: init?.headers as Record<string, string>,
            body: init?.body,
        }).then((r) => ({ ok: r.ok, status: r.status, text: () => r.text() })),
): Promise<CopyscapeResult> {
    const username = process.env['COPYSCAPE_API_USERNAME'];
    const apiKey = process.env['COPYSCAPE_API_KEY'];

    if (!username || !apiKey) {
        return {
            duplicatesFound: false,
            matches: [],
            summary: 'Copyscape check skipped — COPYSCAPE_API_USERNAME or COPYSCAPE_API_KEY not set.',
            skipped: true,
        };
    }

    const params = new URLSearchParams({
        u: username,
        k: apiKey,
        o: 'csearch',
        e: 'UTF-8',
        c: body.slice(0, 25_000),
    });

    let xml: string;
    try {
        const response = await fetchFn(COPYSCAPE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!response.ok) {
            return {
                duplicatesFound: false,
                matches: [],
                summary: `Copyscape API error: HTTP ${response.status}.`,
                skipped: false,
            };
        }
        xml = await response.text();
    } catch (err) {
        return {
            duplicatesFound: false,
            matches: [],
            summary: `Copyscape request failed: ${String(err)}.`,
            skipped: false,
        };
    }

    // Parse XML response — Copyscape returns simple XML, no library needed.
    const matches: CopyscapeMatch[] = [];
    const resultBlocks = xml.match(/<result>[\s\S]*?<\/result>/g) ?? [];

    for (const block of resultBlocks) {
        const url = /<url>([\s\S]*?)<\/url>/.exec(block)?.[1]?.trim() ?? '';
        const title = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1]?.trim() ?? url;
        const percentRaw = /<percentmatched>([\s\S]*?)<\/percentmatched>/.exec(block)?.[1]?.trim();
        const wordsRaw = /<wordsmatched>([\s\S]*?)<\/wordsmatched>/.exec(block)?.[1]?.trim();
        if (!url) continue;
        matches.push({
            url,
            title,
            percentMatched: percentRaw !== undefined ? parseFloat(percentRaw) : 0,
            wordsMatched: wordsRaw !== undefined ? parseInt(wordsRaw, 10) : 0,
        });
    }

    const duplicatesFound = matches.length > 0;
    const summary = duplicatesFound
        ? `Copyscape found ${matches.length} duplicate source(s). Review before publishing.`
        : 'Copyscape found no external duplicates.';

    return { duplicatesFound, matches, summary, skipped: false };
}

// ---------------------------------------------------------------------------
// Combined check: LLM heuristic + optional Copyscape
// ---------------------------------------------------------------------------

export interface PlagiarismReportWithCopyscape extends PlagiarismReport {
    copyscape: CopyscapeResult;
}

/**
 * Run the full plagiarism pipeline:
 * 1. LLM heuristic check via `detectPlagiarism`.
 * 2. Copyscape API check (gated on env vars).
 *
 * Results are merged: `reviewRecommended` is true when either check flags issues.
 */
export async function detectPlagiarismWithCopyscape(
    body: string,
    caller: ProseCallerFn,
    fetchFn?: PlagiarismFetchFn,
): Promise<PlagiarismReportWithCopyscape> {
    const [llmReport, copyscapeResult] = await Promise.all([
        detectPlagiarism(body, caller),
        copyscapeCheck(body, fetchFn),
    ]);

    const reviewRecommended =
        llmReport.reviewRecommended || copyscapeResult.duplicatesFound;

    return {
        ...llmReport,
        reviewRecommended,
        copyscape: copyscapeResult,
    };
}
