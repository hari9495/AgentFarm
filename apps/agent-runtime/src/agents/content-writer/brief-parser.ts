/**
 * Content Brief Parser
 *
 * Extracts a structured ContentBriefSpec from free-text content briefs using
 * heuristic keyword anchors — no LLM call. If confidence is 'low' and required
 * fields are missing, the agent should surface a clarification request before
 * generating any draft.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentFormat =
    | 'blog_post'
    | 'email_campaign'
    | 'social_post'
    | 'internal_announcement';

export interface ContentBriefSpec {
    audience: string | null;
    tone: string | null;
    format: ContentFormat | null;
    wordCount: number | null;
    keyMessages: string[];
    callToAction: string | null;
    deadline: string | null;
}

export interface ParsedBrief {
    spec: ContentBriefSpec;
    confidence: 'high' | 'low';
    missingFields: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: Array<keyof ContentBriefSpec> = [
    'audience',
    'tone',
    'format',
];

/** Extract the value following a label anchor, up to the next newline. */
function extractAfterLabel(text: string, ...labels: string[]): string | null {
    for (const label of labels) {
        const regex = new RegExp(
            `(?:^|\\n)\\s*${label}\\s*:?\\s*(.+?)(?:\\n|$)`,
            'im',
        );
        const match = regex.exec(text);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}

/**
 * Detect the content format from the brief text.
 * Checks explicit "format:" labels first, then falls back to keyword heuristics.
 */
function detectFormat(text: string): ContentFormat | null {
    const lower = text.toLowerCase();

    const explicit = extractAfterLabel(text, 'format', 'content type', 'type');
    if (explicit) {
        const expl = explicit.toLowerCase();
        if (expl.includes('blog') || expl.includes('article') || expl.includes('post')) {
            return 'blog_post';
        }
        if (expl.includes('email') || expl.includes('campaign') || expl.includes('newsletter')) {
            return 'email_campaign';
        }
        if (expl.includes('social') || expl.includes('tweet') || expl.includes('linkedin') || expl.includes('instagram')) {
            return 'social_post';
        }
        if (expl.includes('announcement') || expl.includes('internal') || expl.includes('memo')) {
            return 'internal_announcement';
        }
    }

    // Keyword fallback
    if (lower.includes('blog post') || lower.includes('blog article')) return 'blog_post';
    if (lower.includes('email campaign') || lower.includes('newsletter')) return 'email_campaign';
    if (lower.includes('social post') || lower.includes('linkedin post') || lower.includes('twitter')) return 'social_post';
    if (lower.includes('internal announcement') || lower.includes('company memo')) return 'internal_announcement';

    return null;
}

/**
 * Extract word count from patterns like "500 words", "500–800 words",
 * "around 600 words", "~1000 words".
 * Returns the lower bound of a range.
 */
function extractWordCount(text: string): number | null {
    // Range: "500-800 words" or "500–800 words"
    const rangeMatch = /(\d{2,5})\s*[-–]\s*(\d{2,5})\s*words?/i.exec(text);
    if (rangeMatch && rangeMatch[1]) {
        return parseInt(rangeMatch[1], 10);
    }

    // Single: "500 words", "~1000 words", "around 600 words"
    const singleMatch = /(?:~|about|around|approximately)?\s*(\d{2,5})\s*words?/i.exec(text);
    if (singleMatch && singleMatch[1]) {
        return parseInt(singleMatch[1], 10);
    }

    // Explicit label: "word count: 800"
    const labelMatch = /word\s*count\s*:?\s*(\d{2,5})/i.exec(text);
    if (labelMatch && labelMatch[1]) {
        return parseInt(labelMatch[1], 10);
    }

    return null;
}

/**
 * Extract key messages from the brief.
 * Looks for a "key messages:" / "key points:" block and splits on list markers.
 */
function extractKeyMessages(text: string): string[] {
    // Try to find a labelled list block
    const blockMatch = /(?:key\s*messages?|key\s*points?|talking\s*points?)\s*:?\s*\n((?:[\s\S](?!(?:\n\n|\n[A-Z])))*)/im.exec(text);
    if (blockMatch && blockMatch[1]) {
        const block = blockMatch[1];
        // Split on list markers: -, *, •, numbered
        const items = block
            .split(/\n/)
            .map((line) => line.replace(/^\s*[-*•\d.]+\s*/, '').trim())
            .filter((line) => line.length > 0);
        if (items.length > 0) return items.slice(0, 5);
    }

    // Inline comma-separated after label
    const inlineMatch = /(?:key\s*messages?|key\s*points?)\s*:?\s*(.+)/i.exec(text);
    if (inlineMatch && inlineMatch[1]) {
        return inlineMatch[1]
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 5);
    }

    return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a free-text content brief into a structured ContentBriefSpec.
 *
 * Returns the spec along with a confidence rating and a list of missing
 * required fields. When confidence is 'low', the caller should request
 * clarification before starting a draft.
 */
export function parseContentBrief(rawBriefText: string): ParsedBrief {
    if (!rawBriefText || rawBriefText.trim().length === 0) {
        return {
            spec: {
                audience: null,
                tone: null,
                format: null,
                wordCount: null,
                keyMessages: [],
                callToAction: null,
                deadline: null,
            },
            confidence: 'low',
            missingFields: [...REQUIRED_FIELDS],
        };
    }

    const audience =
        extractAfterLabel(rawBriefText, 'audience', 'target audience', 'readers', 'for') ??
        null;

    const tone =
        extractAfterLabel(rawBriefText, 'tone', 'voice', 'style', 'writing style') ??
        null;

    const format = detectFormat(rawBriefText);

    const wordCount = extractWordCount(rawBriefText);

    const keyMessages = extractKeyMessages(rawBriefText);

    const callToAction =
        extractAfterLabel(rawBriefText, 'cta', 'call to action', 'call-to-action', 'action') ??
        null;

    const deadline =
        extractAfterLabel(rawBriefText, 'deadline', 'due date', 'due by', 'needed by') ??
        null;

    const spec: ContentBriefSpec = {
        audience,
        tone,
        format,
        wordCount,
        keyMessages,
        callToAction,
        deadline,
    };

    const missingFields = REQUIRED_FIELDS.filter(
        (field) => spec[field] === null,
    ) as string[];

    const confidence: 'high' | 'low' = missingFields.length === 0 ? 'high' : 'low';

    return { spec, confidence, missingFields };
}

// ---------------------------------------------------------------------------
// Clarification question generator
// ---------------------------------------------------------------------------

const FIELD_QUESTIONS: Record<string, string> = {
    audience: 'Who is the target audience for this content? (e.g. "software developers", "HR managers at enterprise companies")',
    tone: 'What tone or writing style should this content use? (e.g. "professional", "casual", "technical", "friendly")',
    format: 'What format should this content take? (blog_post, email_campaign, social_post, or internal_announcement)',
    wordCount: 'What is the target word count or length? (e.g. "500 words", "short email under 200 words")',
    keyMessages: 'What are the 2-4 key messages or main points this content must communicate?',
    callToAction: 'What should the reader do after reading this content? (e.g. "sign up for a free trial", "contact us")',
    deadline: 'Is there a publication deadline or delivery date for this content?',
};

/**
 * Generate specific clarifying questions for a low-confidence parsed brief.
 *
 * Returns one question per missing required field, plus logical-contradiction
 * warnings (e.g. very high word count requested for a social post).
 */
export function buildClarificationQuestions(parsed: ParsedBrief): string[] {
    const questions: string[] = parsed.missingFields
        .map((field) => FIELD_QUESTIONS[field] ?? `Please clarify "${field}" in the content brief.`)
        .filter(Boolean);

    // Detect format-wordcount contradictions
    const { spec } = parsed;
    if (spec.format === 'social_post' && spec.wordCount !== null && spec.wordCount > 300) {
        questions.push(
            `Social posts are typically under 300 words, but the brief requests ${spec.wordCount} words. ` +
            'Should this be a blog post or longer-form content instead?',
        );
    }
    if (spec.format === 'email_campaign' && spec.wordCount !== null && spec.wordCount > 800) {
        questions.push(
            `Email campaigns are most effective under 800 words, but the brief requests ${spec.wordCount} words. ` +
            'Is this a newsletter or a short promotional email?',
        );
    }

    return questions;
}
