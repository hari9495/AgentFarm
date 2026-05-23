/**
 * SEO Optimizer
 *
 * Analyses a content draft against its brief to produce SEO metadata:
 *   - Focus keyword extraction from key messages
 *   - Keyword density score in draft body
 *   - Meta title (≤60 chars) and meta description (≤160 chars) generation
 *   - Heading keyword presence check
 *   - Readability signal (avg sentence length)
 *
 * Pure function — no LLM, no network.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeoSpec {
    focusKeyword: string | null;
    metaTitle: string;
    metaDescription: string;
    keywordDensityPercent: number;
    keywordInFirstParagraph: boolean;
    keywordInHeadings: boolean;
    avgSentenceLength: number;
    readabilityGrade: 'easy' | 'standard' | 'difficult';
    /** Flesch Reading Ease score (0–100; higher = easier to read). */
    fleschReadingEase: number;
    /** Total word count of the draft body. */
    wordCount: number;
    /** Number of internal links found (markdown or HTML, relative or same-domain). */
    internalLinkCount: number;
    /** Number of external links found (absolute http/https URLs to external domains). */
    externalLinkCount: number;
    suggestions: string[];
}

export interface SeoInput {
    draftBody: string;
    keyMessages: string[];
    audience: string | null;
    format: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function extractFirstParagraph(body: string): string {
    return body.split(/\n\n+/)[0] ?? '';
}

function extractHeadingText(body: string): string {
    const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1] ?? '');
    return headings.join(' ').toLowerCase();
}

/**
 * Derive a focus keyword from the key messages by finding the first phrase
 * (up to 4 words) that appears more than once in the body.
 * Falls back to the first 3 words of the first key message.
 */
function deriveFocusKeyword(keyMessages: string[], body: string): string | null {
    if (keyMessages.length === 0) return null;
    const lower = body.toLowerCase();

    for (const msg of keyMessages) {
        const candidate = msg.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
        if (candidate && lower.split(candidate).length - 1 > 1) {
            return candidate;
        }
    }
    return keyMessages[0]?.toLowerCase().split(/\s+/).slice(0, 3).join(' ') ?? null;
}

function computeKeywordDensity(keyword: string, body: string): number {
    if (!keyword) return 0;
    const totalWords = countWords(body);
    if (totalWords === 0) return 0;
    const occurrences = body.toLowerCase().split(keyword).length - 1;
    const kwWordCount = countWords(keyword);
    return parseFloat(((occurrences * kwWordCount * 100) / totalWords).toFixed(2));
}

function computeAvgSentenceLength(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    const totalWords = sentences.reduce((acc, s) => acc + countWords(s), 0);
    return Math.round(totalWords / sentences.length);
}

function toReadabilityGrade(avg: number): 'easy' | 'standard' | 'difficult' {
    if (avg <= 14) return 'easy';
    if (avg <= 22) return 'standard';
    return 'difficult';
}

/**
 * Estimate syllable count for a single word using a vowel-group heuristic.
 * Not perfect but good enough for a Flesch score approximation.
 */
function estimateSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length === 0) return 0;
    const groups = cleaned.match(/[aeiouy]+/g);
    const count = groups?.length ?? 1;
    // Silent trailing 'e' adjustment
    const adjusted = cleaned.endsWith('e') && count > 1 ? count - 1 : count;
    return Math.max(1, adjusted);
}

/**
 * Compute the Flesch Reading Ease score (0–100).
 * Higher scores indicate easier reading.
 */
function computeFleschReadingEase(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 100;

    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return 100;

    const totalSyllables = words.reduce((acc, w) => acc + estimateSyllables(w), 0);
    const asl = words.length / sentences.length; // avg sentence length
    const asw = totalSyllables / words.length;   // avg syllables per word

    const score = 206.835 - 1.015 * asl - 84.6 * asw;
    return parseFloat(Math.min(100, Math.max(0, score)).toFixed(1));
}

/**
 * Count internal and external links in a body containing markdown and/or HTML.
 * Internal: relative paths, anchors, or links whose host matches the content (no http/https).
 * External: absolute http/https URLs.
 */
function countLinks(body: string): { internal: number; external: number } {
    let internal = 0;
    let external = 0;

    // Markdown links: [text](url)
    const mdLinks = [...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)];
    for (const m of mdLinks) {
        const href = (m[1] ?? '').trim();
        if (/^https?:\/\//i.test(href)) external++;
        else internal++;
    }

    // HTML anchor tags: <a href="url"> (case-insensitive)
    const htmlLinks = [...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)];
    for (const m of htmlLinks) {
        const href = (m[1] ?? '').trim();
        if (/^https?:\/\//i.test(href)) external++;
        else internal++;
    }

    return { internal, external };
}

function buildMetaTitle(
    keyword: string | null,
    audience: string | null,
    format: string | null,
): string {
    const parts: string[] = [];
    if (keyword) parts.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    if (audience) parts.push(`for ${audience}`);
    const title = parts.join(' ');
    return title.slice(0, 60) || (format ? `${format} guide` : 'Content');
}

function buildMetaDescription(body: string, keyword: string | null): string {
    // Use the first sentence of the prose body (skip any heading)
    const bodyWithoutHeading = body.replace(/^#+\s+[^\n]+\n+/, '');
    const firstSentence = bodyWithoutHeading.split(/[.!?]/)[0]?.trim() ?? '';
    const base =
        keyword && !firstSentence.toLowerCase().includes(keyword)
            ? `${keyword}: ${firstSentence}`
            : firstSentence;
    return base.slice(0, 160) || 'Read more in this article.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a content draft and return SEO metadata and improvement suggestions.
 */
export function optimizeForSeo(input: SeoInput): SeoSpec {
    const { draftBody, keyMessages, audience, format } = input;

    const focusKeyword = deriveFocusKeyword(keyMessages, draftBody);
    const density = focusKeyword ? computeKeywordDensity(focusKeyword, draftBody) : 0;

    const firstPara = extractFirstParagraph(draftBody);
    const headingText = extractHeadingText(draftBody);
    const keywordInFirstParagraph = focusKeyword
        ? firstPara.toLowerCase().includes(focusKeyword)
        : false;
    const keywordInHeadings = focusKeyword
        ? headingText.includes(focusKeyword.toLowerCase())
        : false;

    const avgLen = computeAvgSentenceLength(draftBody);
    const grade = toReadabilityGrade(avgLen);
    const fleschScore = computeFleschReadingEase(draftBody);
    const wordCount = countWords(draftBody);
    const linkCounts = countLinks(draftBody);

    const metaTitle = buildMetaTitle(focusKeyword, audience, format);
    const metaDescription = buildMetaDescription(draftBody, focusKeyword);

    const suggestions: string[] = [];
    if (!focusKeyword)
        suggestions.push('No focus keyword detected — add key messages to the brief.');
    if (density > 3)
        suggestions.push(
            `Keyword density is ${density}% — reduce to under 3% to avoid over-optimisation.`,
        );
    if (density > 0 && density < 0.5)
        suggestions.push(`Keyword density is ${density}% — increase keyword presence for better SEO.`);
    if (!keywordInFirstParagraph && focusKeyword)
        suggestions.push('Add focus keyword to the first paragraph.');
    if (!keywordInHeadings && focusKeyword)
        suggestions.push('Include focus keyword in at least one heading.');
    if (grade === 'difficult')
        suggestions.push('Average sentence length is high — shorten sentences for readability.');
    if (fleschScore < 30)
        suggestions.push(`Flesch Reading Ease score is ${fleschScore} — content is very hard to read; simplify language.`);
    if (metaTitle.length >= 58)
        suggestions.push('Meta title is near the 60-character limit — consider shortening.');
    if (wordCount < 300)
        suggestions.push(`Article is only ${wordCount} words — aim for at least 300 words for SEO value.`);
    if (linkCounts.external === 0)
        suggestions.push('Add at least one external link to a reputable source.');
    if (linkCounts.internal === 0)
        suggestions.push('Add at least one internal link to a related page.');

    return {
        focusKeyword,
        metaTitle,
        metaDescription,
        keywordDensityPercent: density,
        keywordInFirstParagraph,
        keywordInHeadings,
        avgSentenceLength: avgLen,
        readabilityGrade: grade,
        fleschReadingEase: fleschScore,
        wordCount,
        internalLinkCount: linkCounts.internal,
        externalLinkCount: linkCounts.external,
        suggestions,
    };
}
