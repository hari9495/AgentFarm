// ============================================================================
// FAQ BUILDER
// Technical Writer Role
//
// Builds FAQ documents from structured Q&A pairs.
// Can also extract Q&A patterns from raw support-ticket or forum text.
//
// buildFaqMarkdown         — grouped Markdown FAQ with anchors and cross-links
// buildFaqTemplate         — skeleton FAQ for given categories
// extractFaqFromSupportText — mine Q&A candidates from unstructured text
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FaqEntry {
    /** Unique ID used for anchor links, e.g. "faq-001". */
    id: string;
    question: string;
    answer: string;
    /** Category name for grouping, e.g. "Getting Started". */
    category: string;
    tags?: string[];
    /** IDs of related FAQ entries, rendered as cross-links. */
    relatedQuestions?: string[];
}

export interface FaqDocument {
    title: string;
    /** Optional product/feature context shown in the intro. */
    product?: string;
    /** Ordered list of category names. Uncategorised entries go last. */
    categories: string[];
    entries: FaqEntry[];
    /** Optional intro paragraph shown before the category listing. */
    intro?: string;
}

export interface FaqExtractionResult {
    candidates: FaqEntry[];
    /** Entries that could not be cleanly parsed. */
    skipped: string[];
}

// ---------------------------------------------------------------------------
// Default FAQ categories (standard set for software products)
// ---------------------------------------------------------------------------

export const DEFAULT_FAQ_CATEGORIES: string[] = [
    'Getting Started',
    'Features & Usage',
    'Account & Access',
    'Troubleshooting',
    'Integrations',
    'Security & Privacy',
    'Billing & Pricing',
    'Other',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

function anchorFor(entry: FaqEntry): string {
    return `faq-${entry.id}-${slugify(entry.question.slice(0, 30))}`;
}

// ---------------------------------------------------------------------------
// buildFaqMarkdown
// ---------------------------------------------------------------------------

/**
 * Generate a complete FAQ document in Markdown.
 * Entries are grouped by category, each with an anchor link.
 * Related questions are rendered as inline cross-links.
 */
export function buildFaqMarkdown(doc: FaqDocument): string {
    const date = new Date().toISOString().split('T')[0];
    const lines: string[] = [];
    const entryMap = new Map(doc.entries.map((e) => [e.id, e]));

    lines.push(`# ${doc.title}`);
    lines.push('');
    if (doc.product) lines.push(`_Documentation for **${doc.product}**_\n`);
    lines.push(`_Last updated: ${date}_\n`);
    if (doc.intro) {
        lines.push(doc.intro.trim());
        lines.push('');
    }

    // Quick navigation
    const usedCategories = doc.categories.filter((cat) =>
        doc.entries.some((e) => e.category === cat),
    );
    const uncategorised = doc.entries.filter((e) => !doc.categories.includes(e.category));

    lines.push('## Quick Navigation\n');
    for (const cat of usedCategories) {
        lines.push(`- [${cat}](#${slugify(cat)})`);
    }
    if (uncategorised.length > 0) lines.push('- [Other](#other)');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Per-category sections
    for (const cat of usedCategories) {
        const catEntries = doc.entries.filter((e) => e.category === cat);
        if (catEntries.length === 0) continue;

        lines.push(`## ${cat} {#${slugify(cat)}}\n`);

        for (const entry of catEntries) {
            const anchor = anchorFor(entry);
            lines.push(`### ${entry.question} {#${anchor}}\n`);
            lines.push(entry.answer.trim());
            lines.push('');

            if (entry.tags && entry.tags.length > 0) {
                lines.push(`_Tags: ${entry.tags.join(', ')}_`);
                lines.push('');
            }

            if (entry.relatedQuestions && entry.relatedQuestions.length > 0) {
                const relLinks = entry.relatedQuestions
                    .map((rid) => {
                        const rel = entryMap.get(rid);
                        if (!rel) return null;
                        return `[${rel.question}](#${anchorFor(rel)})`;
                    })
                    .filter(Boolean);

                if (relLinks.length > 0) {
                    lines.push(`**Related:** ${relLinks.join(' · ')}`);
                    lines.push('');
                }
            }
        }
    }

    // Uncategorised
    if (uncategorised.length > 0) {
        lines.push('## Other {#other}\n');
        for (const entry of uncategorised) {
            const anchor = anchorFor(entry);
            lines.push(`### ${entry.question} {#${anchor}}\n`);
            lines.push(entry.answer.trim());
            lines.push('');
        }
    }

    lines.push('---');
    lines.push(`_${doc.title}${doc.product ? ` — ${doc.product}` : ''} — ${date}_`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildFaqTemplate
// ---------------------------------------------------------------------------

/**
 * Generate a skeleton FAQ document for the given categories.
 * Includes one placeholder entry per category.
 */
export function buildFaqTemplate(
    title: string,
    product: string,
    categories: string[] = DEFAULT_FAQ_CATEGORIES,
): string {
    let counter = 1;
    const entries: FaqEntry[] = categories.map((cat) => ({
        id: String(counter++).padStart(3, '0'),
        question: `_[Add a common ${cat.toLowerCase()} question here]_`,
        answer: '_[Add the answer here. Be concise and actionable. Use numbered steps for procedures.]_',
        category: cat,
    }));

    return buildFaqMarkdown({
        title,
        product,
        categories,
        entries,
        intro: `_[Add a one-paragraph intro explaining what this FAQ covers and who it is for.]_`,
    });
}

// ---------------------------------------------------------------------------
// extractFaqFromSupportText
// ---------------------------------------------------------------------------

/**
 * Mine Q&A candidates from unstructured support ticket text or forum posts.
 *
 * Recognises patterns like:
 *   "Q: ..." / "A: ..."
 *   "Question: ..." / "Answer: ..."
 *   Lines ending in "?" followed by a response paragraph
 *
 * Returns candidates for human review — answers are extracted verbatim
 * and should be edited before publication.
 */
export function extractFaqFromSupportText(
    rawText: string,
    defaultCategory = 'Troubleshooting',
): FaqExtractionResult {
    const candidates: FaqEntry[] = [];
    const skipped: string[] = [];
    let counter = 1;

    // Pattern 1: explicit "Q: ... A: ..." blocks
    const qaBlockRe = /(?:^|\n)(?:Q(?:uestion)?[:\s]+)(.+?)(?:\n)(?:A(?:nswer)?[:\s]+)([\s\S]+?)(?=\nQ(?:uestion)?[:\s]|$)/gi;
    let m: RegExpExecArray | null;
    const matched = new Set<number>();

    while ((m = qaBlockRe.exec(rawText)) !== null) {
        const question = m[1]?.trim() ?? '';
        const answer = m[2]?.trim() ?? '';
        if (question.length > 5 && answer.length > 5) {
            candidates.push({
                id: String(counter++).padStart(3, '0'),
                question: question.replace(/\?$/, '').trim() + '?',
                answer,
                category: defaultCategory,
            });
            matched.add(m.index);
        }
    }

    // Pattern 2: lines ending in "?" followed by a non-empty paragraph
    if (candidates.length === 0) {
        const lines = rawText.split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = (lines[i] ?? '').trim();
            if (line.endsWith('?') && line.length > 10) {
                // Collect the answer paragraph (next non-empty lines until blank line or next question)
                const answerLines: string[] = [];
                let j = i + 1;
                while (j < lines.length && !(lines[j] ?? '').trim().endsWith('?') && (lines[j] ?? '').trim() !== '') {
                    answerLines.push((lines[j] ?? '').trim());
                    j++;
                }
                const answer = answerLines.join(' ').trim();
                if (answer.length > 5) {
                    candidates.push({
                        id: String(counter++).padStart(3, '0'),
                        question: line,
                        answer,
                        category: defaultCategory,
                    });
                    i = j;
                    continue;
                } else {
                    skipped.push(line);
                }
            }
            i++;
        }
    }

    return { candidates, skipped };
}

// ---------------------------------------------------------------------------
// categorizeFaqEntries
// ---------------------------------------------------------------------------

/**
 * Auto-assign categories to FAQ entries based on keyword signals.
 * Useful after extractFaqFromSupportText to organise extracted candidates.
 */
export function categorizeFaqEntries(
    entries: FaqEntry[],
    categoryKeywords: Record<string, string[]> = DEFAULT_CATEGORY_KEYWORDS,
): FaqEntry[] {
    return entries.map((entry) => {
        const text = `${entry.question} ${entry.answer}`.toLowerCase();
        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some((kw) => text.includes(kw))) {
                return { ...entry, category: cat };
            }
        }
        return entry;
    });
}

export const DEFAULT_CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Getting Started': ['install', 'setup', 'sign up', 'create account', 'get started', 'first time', 'onboard'],
    'Features & Usage': ['how to', 'how do i', 'can i', 'feature', 'option', 'setting', 'configure', 'enable'],
    'Account & Access': ['login', 'log in', 'password', 'email', 'account', 'permission', 'role', 'access'],
    'Troubleshooting': ['error', 'fail', 'not working', 'broken', 'issue', 'problem', 'bug', 'crash', 'fix'],
    'Integrations': ['integrate', 'connect', 'webhook', 'api', 'plugin', 'extension', 'third-party'],
    'Security & Privacy': ['security', 'privacy', 'data', 'gdpr', 'encrypt', 'compliance', 'audit'],
    'Billing & Pricing': ['billing', 'price', 'cost', 'plan', 'subscription', 'invoice', 'payment', 'refund'],
};
