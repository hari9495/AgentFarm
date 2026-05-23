/**
 * LLM Prose Writer
 *
 * Replaces the structural scaffold produced by draft-builder with actual
 * LLM-generated prose. Accepts an injectable caller so the module is testable
 * without a live LLM endpoint.
 *
 * The production caller is built in content-writer-action-handler.ts by binding
 * callLLMWithTools with the tenant's configured provider.
 */

import type { ContentBriefSpec, ContentFormat } from './brief-parser.js';
import type { BrandVoice } from './draft-builder.js';
import type { ContentResearchResult } from './content-research-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injectable LLM caller — returns null on hard failure. */
export type ProseCallerFn = (
    systemPrompt: string,
    userPrompt: string,
) => Promise<{ text: string | null; tokensUsed?: number; error?: string }>;

export interface ProseRequest {
    spec: ContentBriefSpec;
    brandVoice: BrandVoice;
    research: ContentResearchResult | null;
}

export interface ProseResult {
    body: string;
    tokensUsed: number;
    generatedByLlm: boolean;
}

// ---------------------------------------------------------------------------
// System/user prompt builders
// ---------------------------------------------------------------------------

const FORMAT_INSTRUCTIONS: Record<ContentFormat, string> = {
    blog_post:
        'Write a blog post with a compelling title, introduction paragraph, ' +
        '3-5 subheadings with body paragraphs, and a concluding paragraph with a call to action.',
    email_campaign:
        'Write an email with a subject line, short greeting, 2-3 concise body paragraphs, ' +
        'a clear call to action button label, and a brief sign-off.',
    social_post:
        'Write a social media post: 1-3 short punchy sentences, 2-4 relevant hashtags, no headings.',
    internal_announcement:
        'Write an internal company announcement with a clear headline, context paragraph, ' +
        'key details section, and a next-steps paragraph.',
};

function buildSystemPrompt(brandVoice: BrandVoice): string {
    const doNotUse =
        brandVoice.doNotUse.length > 0
            ? `\nAvoid these words/phrases: ${brandVoice.doNotUse.join(', ')}.`
            : '';
    const signature = brandVoice.signaturePhrase
        ? `\nEnd with this signature phrase on its own line: "${brandVoice.signaturePhrase}"`
        : '';
    return (
        `You are a professional content writer. Write clear, engaging, human-sounding prose.` +
        ` Match the requested tone exactly.` +
        doNotUse +
        signature +
        `\nReturn only the final copy — no meta-commentary, no "here is your draft" preamble.`
    );
}

function buildUserPrompt(req: ProseRequest): string {
    const { spec, research } = req;
    const format = spec.format ?? 'blog_post';
    const formatInstruction = FORMAT_INSTRUCTIONS[format];
    const audience = spec.audience ? `Target audience: ${spec.audience}.` : '';
    const tone = spec.tone ? `Tone: ${spec.tone}.` : '';
    const wordCount = spec.wordCount ? `Target length: ~${spec.wordCount} words.` : '';
    const cta = spec.callToAction ? `Include this call to action: "${spec.callToAction}".` : '';
    const messages =
        spec.keyMessages.length > 0
            ? `Cover these key messages:\n${spec.keyMessages.map((m) => `- ${m}`).join('\n')}`
            : '';

    const researchContext =
        research && research.snippets.length > 0
            ? `\n\nBackground research (use for accuracy, do not copy verbatim):\n` +
            research.snippets
                .slice(0, 3)
                .map((s) => `[${s.source}] ${s.text}`)
                .join('\n\n')
            : '';

    return [formatInstruction, audience, tone, wordCount, messages, cta, researchContext]
        .filter(Boolean)
        .join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a full prose draft using the LLM.
 *
 * Falls back to a placeholder body if the LLM is unavailable so the pipeline
 * can continue and the editorial-router can flag this for human retry.
 */
export async function writeProse(
    req: ProseRequest,
    caller: ProseCallerFn,
): Promise<ProseResult> {
    const systemPrompt = buildSystemPrompt(req.brandVoice);
    const userPrompt = buildUserPrompt(req);

    const result = await caller(systemPrompt, userPrompt);

    if (!result.text) {
        return {
            body:
                `[LLM prose generation failed` +
                (result.error ? `: ${result.error}` : '') +
                `. Please retry or write manually.]`,
            tokensUsed: 0,
            generatedByLlm: false,
        };
    }

    return {
        body: result.text,
        tokensUsed: result.tokensUsed ?? 0,
        generatedByLlm: true,
    };
}

/**
 * Self-review pass — runs the draft through a second LLM call that acts as
 * a senior editor reviewing for clarity, coherence, and engagement.
 *
 * Returns the improved body. Falls back to the original body (with
 * `generatedByLlm: false`) if the LLM is unavailable.
 */
export async function reviewAndRefineProse(
    body: string,
    spec: ContentBriefSpec,
    caller: ProseCallerFn,
): Promise<ProseResult> {
    if (!body.trim()) {
        return { body, tokensUsed: 0, generatedByLlm: false };
    }

    const audience = spec.audience ? `Target audience: ${spec.audience}.` : '';
    const tone = spec.tone ? `Expected tone: ${spec.tone}.` : '';
    const wordCount = spec.wordCount ? `Target word count: ~${spec.wordCount} words.` : '';

    const systemPrompt =
        'You are a senior content editor. Review the draft against the criteria below and ' +
        'improve it. Focus on: ' +
        '(1) Clarity — every sentence must communicate one clear idea. ' +
        '(2) Engagement — the opening must hook the reader; interest must be sustained. ' +
        '(3) Brief adherence — correct audience, tone, structure, and call to action. ' +
        '(4) Conciseness — remove filler words and redundant sentences. ' +
        'Return only the improved draft text — no meta-commentary or "here is the edited version" preamble.';

    const userPrompt = [audience, tone, wordCount, `Draft to improve:\n\n${body}`]
        .filter(Boolean)
        .join('\n');

    const result = await caller(systemPrompt, userPrompt);

    if (!result.text) {
        return { body, tokensUsed: 0, generatedByLlm: false };
    }

    return {
        body: result.text,
        tokensUsed: result.tokensUsed ?? 0,
        generatedByLlm: true,
    };
}
