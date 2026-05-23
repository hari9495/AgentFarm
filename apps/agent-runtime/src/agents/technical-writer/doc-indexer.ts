// ============================================================================
// DOC INDEXER
// Technical Writer Role
//
// Pure functions for building a searchable, cross-linked index of an entire
// documentation set — the "mental model across the whole doc set" capability.
//
// extractDocEntry   — title, sections, topics, doc type from one file
// buildDocIndex     — aggregate entries into topic-mapped index
// findCoveringDocs  — which existing docs already cover a given topic
//
// All pure functions — no I/O, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocType =
    | 'tutorial'
    | 'reference'
    | 'api'
    | 'guide'
    | 'changelog'
    | 'readme'
    | 'adr'
    | 'faq'
    | 'onboarding'
    | 'unknown';

/** Metadata extracted from one documentation file. */
export interface DocIndexEntry {
    filePath: string;
    title: string;
    docType: DocType;
    /** H2 / H3 section headings, up to 30 */
    sections: string[];
    /** Key topics derived from headings (for cross-doc search) */
    topics: string[];
    wordCount: number;
    /** First non-heading paragraph, up to 300 chars */
    firstParagraph: string;
}

/** The complete documentation index for a repository. */
export interface DocIndex {
    totalDocs: number;
    entries: DocIndexEntry[];
    /**
     * topic slug → file paths that cover it.
     * Slugs are lowercased, hyphen-separated.
     */
    topicMap: Record<string, string[]>;
    markdownSummary: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SKIP_TOPICS = new Set([
    'introduction', 'overview', 'summary', 'prerequisites', 'next steps',
    'see also', 'references', 'table of contents', 'contents', 'notes',
    'example', 'examples', 'usage', 'note',
]);

function topicSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-{2,}/g, '-')
        .trim();
}

function guessDocType(filePath: string, title: string, content: string): DocType {
    const fp = filePath.toLowerCase();
    const t  = title.toLowerCase();
    if (/readme/i.test(fp))                       return 'readme';
    if (/changelog|release.not/i.test(fp + t))    return 'changelog';
    if (/\/adr\/|arch.*decision/i.test(fp + t))   return 'adr';
    if (/api\b|openapi|swagger|reference/i.test(fp + t)) return 'api';
    if (/tutorial|getting.start|quick.?start|how.?to/i.test(fp + t)) return 'tutorial';
    if (/faq|frequently/i.test(fp + t))           return 'faq';
    if (/onboard|setup|install/i.test(fp + t))    return 'onboarding';
    if (/guide|overview|concept|explainer/i.test(fp + t)) return 'guide';
    // Inspect content as fallback
    if (/^#+.*tutorial|step [0-9]+/im.test(content))  return 'tutorial';
    if (/^#+.*(api|endpoint|request|response)/im.test(content)) return 'api';
    return 'unknown';
}

function extractTopics(headings: string[]): string[] {
    return headings
        .map((h) => h.replace(/^#{1,6}\s*/, '').trim())
        .filter((h) => h.length > 3 && h.length < 80)
        .filter((h) => !SKIP_TOPICS.has(h.toLowerCase()))
        .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a structured index entry from one documentation file.
 * Does not perform I/O — accepts the already-read content string.
 */
export function extractDocEntry(filePath: string, content: string): DocIndexEntry {
    const lines = content.split('\n');

    // Title: first H1, else first non-empty line, else filename
    const h1 = lines.find((l) => /^#\s+/.test(l));
    const title = h1
        ? h1.replace(/^#+\s*/, '').trim()
        : lines.find((l) => l.trim().length > 0)?.trim()
            ?? filePath.split(/[/\\]/).pop()
            ?? filePath;

    // Section headings (H2 + H3)
    const sections = lines
        .filter((l) => /^#{2,3}\s+/.test(l))
        .map((l) => l.replace(/^#+\s*/, '').trim())
        .slice(0, 30);

    // Topics from all headings H1–H4
    const allHeadings = lines
        .filter((l) => /^#{1,4}\s+/.test(l))
        .map((l) => l.replace(/^#+\s*/, '').trim());
    const topics = extractTopics(allHeadings);

    // First paragraph
    let firstParagraph = '';
    let inParagraph = false;
    for (const l of lines) {
        if (/^#+/.test(l) || l.trim() === '') {
            if (inParagraph && firstParagraph.length > 0) break;
            continue;
        }
        if (l.startsWith('```') || l.startsWith('|') || /^\s*[-*+]\s/.test(l)) continue;
        firstParagraph += (firstParagraph ? ' ' : '') + l.trim();
        inParagraph = true;
        if (firstParagraph.length > 300) break;
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const docType   = guessDocType(filePath, title, content);

    return {
        filePath,
        title,
        docType,
        sections,
        topics,
        wordCount,
        firstParagraph: firstParagraph.slice(0, 300),
    };
}

/**
 * Aggregate a list of DocIndexEntry objects into a cross-linked DocIndex.
 * Builds a topicMap (slug → file paths) and a human-readable Markdown summary.
 */
export function buildDocIndex(entries: DocIndexEntry[]): DocIndex {
    const topicMap: Record<string, string[]> = {};

    for (const entry of entries) {
        for (const topic of entry.topics) {
            const slug = topicSlug(topic);
            if (!slug) continue;
            if (!topicMap[slug]) topicMap[slug] = [];
            topicMap[slug]!.push(entry.filePath);
        }
    }

    const now = new Date().toISOString().split('T')[0]!;
    const lines: string[] = [];
    lines.push('# Documentation Index');
    lines.push(`\n_Generated: ${now} — ${entries.length} file(s) indexed_\n`);

    // Group by doc type
    const byType = new Map<DocType, DocIndexEntry[]>();
    for (const e of entries) {
        if (!byType.has(e.docType)) byType.set(e.docType, []);
        byType.get(e.docType)!.push(e);
    }

    const typeOrder: DocType[] = [
        'tutorial', 'guide', 'api', 'reference', 'faq',
        'onboarding', 'changelog', 'readme', 'adr', 'unknown',
    ];
    for (const type of typeOrder) {
        const docs = byType.get(type);
        if (!docs || docs.length === 0) continue;
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        lines.push(`## ${label} (${docs.length})\n`);
        for (const d of docs) {
            const top3 = d.sections.slice(0, 3).join(' · ');
            lines.push(`- **[${d.title}](${d.filePath})** — ${d.wordCount.toLocaleString()} words${top3 ? `  \n  _${top3}_` : ''}`);
        }
        lines.push('');
    }

    // Topics covered in multiple docs (potential duplication or link opportunities)
    const multi = Object.entries(topicMap)
        .filter(([, files]) => files.length > 1)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 15);
    if (multi.length > 0) {
        lines.push('## Topics Covered in Multiple Docs\n');
        lines.push('_Consider cross-links or consolidation:_\n');
        for (const [slug, files] of multi) {
            lines.push(`- **${slug}** (${files.length} docs): ${files.map((f) => `\`${f}\``).join(', ')}`);
        }
    }

    return { totalDocs: entries.length, entries, topicMap, markdownSummary: lines.join('\n') };
}

/**
 * Find which existing docs already cover a given topic.
 * Checks exact slug match first, then partial substring matches.
 * Returns file paths sorted by match quality.
 */
export function findCoveringDocs(topic: string, index: DocIndex): string[] {
    const slug = topicSlug(topic);
    if (!slug) return [];

    // Exact match
    const exact = index.topicMap[slug];
    if (exact && exact.length > 0) return exact;

    // Partial: the query slug is a substring of a known topic slug or vice versa
    const partial = Object.entries(index.topicMap)
        .filter(([key]) => key.includes(slug) || slug.includes(key))
        .sort(([a], [b]) => {
            // Prefer the key that most closely matches slug length
            const da = Math.abs(a.length - slug.length);
            const db = Math.abs(b.length - slug.length);
            return da - db;
        })
        .flatMap(([, files]) => files);

    return [...new Set(partial)];
}
