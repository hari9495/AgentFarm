/**
 * Tone Adapter
 *
 * Rewrites a content body to match a requested tone style using an LLM.
 * Uses the same injectable ProseCallerFn pattern as llm-prose-writer.ts
 * so tests never require a live LLM endpoint.
 *
 * Also exports a heuristic detectCurrentTone() for audit/logging purposes.
 */

import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneStyle =
    | 'professional'
    | 'casual'
    | 'persuasive'
    | 'storytelling'
    | 'technical'
    | 'friendly'
    | 'authoritative';

export interface ToneAdaptRequest {
    body: string;
    targetTone: ToneStyle;
    /**
     * When true, keep headings and structure intact;
     * only rewrite the prose between them.
     */
    preserveStructure: boolean;
}

export interface ToneAdaptResult {
    body: string;
    toneApplied: ToneStyle;
    tokensUsed: number;
    adaptedByLlm: boolean;
}

// ---------------------------------------------------------------------------
// Tone instruction map
// ---------------------------------------------------------------------------

const TONE_INSTRUCTIONS: Record<ToneStyle, string> = {
    professional:
        'Rewrite in a professional, formal tone. Use clear, concise business language. ' +
        'Avoid slang, contractions, and casual phrases.',
    casual:
        'Rewrite in a casual, conversational tone. Use contractions, short sentences, ' +
        "and natural language as though talking to a friend.",
    persuasive:
        'Rewrite in a persuasive tone. Lead with the strongest benefit, use active voice, ' +
        'address objections, and end with a compelling call to action.',
    storytelling:
        'Rewrite using a storytelling narrative. Open with a relatable scenario or anecdote, ' +
        'build tension or interest, then resolve with the key message.',
    technical:
        'Rewrite in a precise technical tone. Use correct terminology, be specific about ' +
        'mechanisms and processes, and avoid vague marketing language.',
    friendly:
        'Rewrite in a warm, friendly tone. Use inclusive language ("you", "we"), ' +
        'show enthusiasm, and make the reader feel welcomed and supported.',
    authoritative:
        'Rewrite in an authoritative, expert tone. State facts confidently, cite logic, ' +
        'use data-driven language, and avoid hedging phrases like "maybe" or "might".',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildToneSystemPrompt(req: ToneAdaptRequest): string {
    const instruction = TONE_INSTRUCTIONS[req.targetTone];
    const structureNote = req.preserveStructure
        ? ' Keep all headings and structural elements exactly as they are. Only rewrite the prose between them.'
        : ' You may restructure paragraphs as needed to match the tone.';
    return (
        `You are a professional editor specialising in tone adaptation. ` +
        instruction +
        structureNote +
        ` Return only the rewritten content — no commentary.`
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adapt the tone of a content body using an LLM.
 *
 * Falls back to the original body without modification if the LLM call fails.
 */
export async function adaptTone(
    req: ToneAdaptRequest,
    caller: ProseCallerFn,
): Promise<ToneAdaptResult> {
    if (!req.body.trim()) {
        return { body: '', toneApplied: req.targetTone, tokensUsed: 0, adaptedByLlm: false };
    }

    const systemPrompt = buildToneSystemPrompt(req);
    const userPrompt = `Here is the content to adapt:\n\n${req.body}`;

    const result = await caller(systemPrompt, userPrompt);

    if (!result.text) {
        return {
            body: req.body,
            toneApplied: req.targetTone,
            tokensUsed: 0,
            adaptedByLlm: false,
        };
    }

    return {
        body: result.text,
        toneApplied: req.targetTone,
        tokensUsed: result.tokensUsed ?? 0,
        adaptedByLlm: true,
    };
}

/**
 * Detect the approximate current tone of a body using heuristic signals.
 * Returns the closest matching ToneStyle. Used for audit/logging.
 */
export function detectCurrentTone(body: string): ToneStyle {
    const lower = body.toLowerCase();
    const wordCount = Math.max(body.split(/\s+/).length, 1);

    const contractions = (
        body.match(/\b(don't|won't|can't|isn't|it's|we're|you're|they're|I'm|hasn't|didn't)\b/gi) ?? []
    ).length;
    const technicalTerms = (
        lower.match(
            /\b(api|sdk|protocol|algorithm|architecture|implementation|configuration|deployment)\b/g,
        ) ?? []
    ).length;
    const persuasionSignals = (
        lower.match(/\b(imagine|discover|transform|revolutionize|unlock|proven|guaranteed|results)\b/g) ??
        []
    ).length;
    const storySignals = (
        lower.match(/\b(once|story|journey|picture|moment|realized|discovered|remember when)\b/g) ?? []
    ).length;

    const contractionRatio = contractions / (wordCount / 100);
    const technicalRatio = technicalTerms / (wordCount / 100);

    if (technicalRatio > 2) return 'technical';
    if (storySignals > 3) return 'storytelling';
    if (persuasionSignals > 2) return 'persuasive';
    if (contractionRatio > 3) return 'casual';
    if (contractionRatio < 0.5 && technicalRatio < 1) return 'professional';
    return 'friendly';
}

/**
 * Detect the current tone of a body using the LLM.
 *
 * Asks the LLM to classify the text into one of the seven supported
 * ToneStyle values. Falls back to the heuristic `detectCurrentTone` if the
 * LLM call fails or returns an unrecognised value.
 */
export async function detectCurrentToneLlm(
    body: string,
    caller: ProseCallerFn,
): Promise<ToneStyle> {
    if (!body.trim()) return 'friendly';

    const VALID_TONES: ToneStyle[] = [
        'professional', 'casual', 'persuasive', 'storytelling',
        'technical', 'friendly', 'authoritative',
    ];

    const systemPrompt =
        'You are a writing tone analyst. Identify the single dominant tone of the text. ' +
        'Choose exactly one from: professional, casual, persuasive, storytelling, technical, ' +
        'friendly, authoritative. ' +
        'Respond with ONLY that one word — no punctuation, no explanation.';

    const result = await caller(
        systemPrompt,
        `Classify the tone of this text:\n\n${body.slice(0, 2000)}`,
    );

    const detected = result.text?.trim().toLowerCase() as ToneStyle | undefined;
    if (detected && (VALID_TONES as string[]).includes(detected)) return detected;
    return detectCurrentTone(body);
}
