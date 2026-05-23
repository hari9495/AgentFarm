/**
 * Content Draft Builder
 *
 * Pure functions for assembling a content draft from a parsed brief and a
 * brand voice profile. No side effects; no LLM calls — the runtime server
 * uses these to build the initial scaffold before optionally enriching via LLM.
 */

import type { ContentBriefSpec, ContentFormat } from './brief-parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandVoice {
    /** Short style description, e.g. "conversational and upbeat". */
    style: string;
    /** Phrases/words that must NOT appear in the copy. */
    doNotUse: string[];
    /** Optional sentence appended at the end of every piece. */
    signaturePhrase: string | null;
}

export interface ContentDraft {
    title: string;
    body: string;
    format: ContentFormat;
    wordCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the format-specific heading for a given title. */
function buildHeading(title: string, format: ContentFormat): string {
    switch (format) {
        case 'blog_post':
            return `# ${title}\n\n`;
        case 'email_campaign':
            return `Subject: ${title}\n\n`;
        case 'social_post':
            // No heading — body flows directly
            return '';
        case 'internal_announcement':
            return `## Announcement: ${title}\n\n`;
        default: {
            // Exhaustive type check
            const _: never = format;
            return `# ${_}\n\n`;
        }
    }
}

/** Generate a format-aware structured section scaffold for the content draft. */
function buildBodyScaffold(spec: ContentBriefSpec): string {
    const format = spec.format ?? 'blog_post';
    const sections: string[] = [];

    switch (format) {
        case 'blog_post': {
            sections.push('## Introduction\n\n[Hook the reader and introduce the topic.]');
            if (spec.keyMessages.length > 0) {
                for (const msg of spec.keyMessages) {
                    const heading = msg.split(/\s+/).slice(0, 5).join(' ');
                    sections.push(`## ${heading}\n\n[Expand on: ${msg}]`);
                }
            } else {
                sections.push('## Key Insight\n\n[Develop the main argument or idea here.]');
                sections.push('## Why It Matters\n\n[Explain the significance and context.]');
                sections.push('## What To Do Next\n\n[Practical takeaways or action steps.]');
            }
            sections.push('## Conclusion\n\n[Summarise key points and reinforce the message.]');
            break;
        }
        case 'email_campaign': {
            sections.push('[Personalised greeting — use first name if available.]');
            if (spec.keyMessages.length > 0) {
                sections.push(spec.keyMessages.map((m) => `[${m}]`).join('\n\n'));
            } else {
                sections.push('[Opening hook — state the value proposition in one sentence.]');
                sections.push('[Supporting paragraph — build on the main benefit with 2-3 sentences.]');
            }
            break;
        }
        case 'social_post': {
            if (spec.keyMessages.length > 0) {
                sections.push(`[${spec.keyMessages[0]}]`);
            } else {
                sections.push('[Attention-grabbing opening — lead with value or a question.]');
            }
            sections.push('#[Topic] #[Brand] #[Hashtag]');
            break;
        }
        case 'internal_announcement': {
            sections.push('[Context: What is changing and why — clear and factual.]');
            if (spec.keyMessages.length > 0) {
                sections.push('**Key details:**\n' + spec.keyMessages.map((m) => `- ${m}`).join('\n'));
            } else {
                sections.push('**Key details:**\n- [Date / timeline]\n- [Who is affected]\n- [What action is required]');
            }
            sections.push('[Next steps — what the reader should do and by when.]');
            break;
        }
        default: {
            const _: never = format;
            void _;
            sections.push(`[Draft for ${spec.audience ?? 'target audience'} — expand this section.]`);
        }
    }

    if (spec.callToAction) {
        sections.push(`\n**${spec.callToAction}**`);
    }

    return sections.join('\n\n');
}

/** Count approximate words in a string. */
function countWords(text: string): number {
    return text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a content draft scaffold from a parsed brief spec and brand voice.
 *
 * Produces a heading (format-specific), a body scaffold from key messages,
 * and applies the brand voice inline via `applyBrandVoice`.
 */
export function buildContentDraft(
    spec: ContentBriefSpec,
    brandVoice: BrandVoice,
): ContentDraft {
    const format = spec.format ?? 'blog_post';
    const rawTitle = spec.audience
        ? `Draft for ${spec.audience}`
        : 'Content Draft';

    const heading = buildHeading(rawTitle, format);
    const rawBody = buildBodyScaffold(spec);
    const cleanedBody = applyBrandVoice(rawBody, brandVoice);

    const body = heading + cleanedBody;
    const wordCount = countWords(body);

    return {
        title: rawTitle,
        body,
        format,
        wordCount,
    };
}

/**
 * Apply brand voice rules to a draft body:
 *   1. Remove any phrases in brandVoice.doNotUse (case-insensitive).
 *   2. Append signaturePhrase if set.
 *
 * This is the single point of brand compliance enforcement for drafted copy.
 */
export function applyBrandVoice(
    draftBody: string,
    brandVoice: BrandVoice,
): string {
    let result = draftBody;

    for (const banned of brandVoice.doNotUse) {
        if (!banned) continue;
        const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), '');
    }

    // Collapse any double spaces/newlines that might result from removal
    result = result.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (brandVoice.signaturePhrase) {
        result = `${result}\n\n${brandVoice.signaturePhrase}`;
    }

    return result;
}
