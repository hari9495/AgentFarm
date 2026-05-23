// ============================================================================
// PRODUCT EXPLORER
// Technical Writer Role
//
// Pure functions for processing browser-extracted page data into structured
// documentation source material. Works alongside the browsePage callback
// injected into handleTechnicalWriterAction.
//
// buildProductDiscoveryReport  — turns crawled pages into a TW-ready report
// buildScreenshotDocPage       — markdown doc page from screenshot + page data
// extractFeaturesFromCode      — finds documentable symbols/routes in source
// findDocGaps                  — compares feature list against existing docs
//
// All pure functions — no I/O, no browser calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawledPage {
    url: string;
    title: string;
    text: string;
    headings: string[];
    tables?: unknown[];
    screenshotPath?: string;
    extractedAt: string;
}

export interface ProductDiscoveryReport {
    totalPagesRead: number;
    pages: CrawledPage[];
    /** Unique feature/section names extracted from headings across all pages. */
    allFeatures: string[];
    markdownReport: string;
}

export interface DocGapItem {
    feature: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

export interface DocGapReport {
    totalFeatures: number;
    documentedFeatures: string[];
    undocumentedFeatures: string[];
    /** Mentioned in docs but coverage is thin (< 50 words per mention). */
    partialFeatures: string[];
    coveragePercent: number;
    prioritizedGaps: DocGapItem[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*?([^*]+)\*\*?/g, '$1')
        .replace(/`[^`]+`/g, '')
        .toLowerCase();
}

function featureSlug(name: string): string {
    return name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts meaningful feature/section names from page headings.
 * Filters out generic navigation labels (Home, About, Contact, etc.).
 */
function extractFeaturesFromHeadings(headings: string[]): string[] {
    const skipWords = new Set([
        'home', 'about', 'contact', 'login', 'sign in', 'sign up', 'register',
        'privacy policy', 'terms', 'terms of service', 'cookies', 'help', 'support',
        'faq', 'blog', 'news', 'back', 'next', 'previous', 'more', 'loading',
    ]);
    return headings
        .map((h) => h.replace(/^#{1,6}\s*/, '').trim())
        .filter((h) => h.length > 2 && h.length < 80)
        .filter((h) => !skipWords.has(h.toLowerCase()))
        .filter((h) => !/^\d+$/.test(h));
}

// ---------------------------------------------------------------------------
// Public: product discovery report
// ---------------------------------------------------------------------------

/**
 * Build a structured discovery report from a list of crawled pages.
 * The report is the raw material the TW agent hands to the LLM for writing.
 */
export function buildProductDiscoveryReport(pages: CrawledPage[]): ProductDiscoveryReport {
    const now = new Date().toISOString().split('T')[0];
    const featureSet = new Set<string>();

    for (const page of pages) {
        for (const f of extractFeaturesFromHeadings(page.headings)) {
            featureSet.add(f);
        }
    }

    const allFeatures = [...featureSet].slice(0, 100);

    const lines: string[] = [];
    lines.push('# Product Discovery Report');
    lines.push(`\n_Generated: ${now} — ${pages.length} page(s) crawled_\n`);

    if (allFeatures.length > 0) {
        lines.push('## Features & Sections Found\n');
        allFeatures.slice(0, 30).forEach((f) => lines.push(`- ${f}`));
        if (allFeatures.length > 30) lines.push(`\n_…and ${allFeatures.length - 30} more_`);
        lines.push('');
    }

    for (const page of pages) {
        lines.push(`## ${page.title || page.url}`);
        lines.push(`\n**URL:** ${page.url}`);
        if (page.screenshotPath) {
            lines.push(`**Screenshot:** \`${page.screenshotPath}\``);
        }
        if (page.headings.length > 0) {
            lines.push('\n**Page Sections:**');
            page.headings.slice(0, 10).forEach((h) => lines.push(`- ${h}`));
        }
        if (page.text.trim()) {
            lines.push('\n**Extracted Text (preview):**');
            lines.push(`\n> ${page.text.slice(0, 500).replace(/\n/g, '\n> ')}`);
        }
        lines.push('');
    }

    return {
        totalPagesRead: pages.length,
        pages,
        allFeatures,
        markdownReport: lines.join('\n'),
    };
}

// ---------------------------------------------------------------------------
// Public: screenshot doc page
// ---------------------------------------------------------------------------

/**
 * Build a Markdown documentation page from a screenshot + page structure.
 * Produces a ready-to-edit page with embedded screenshot reference,
 * heading outline, and extracted content.
 */
export function buildScreenshotDocPage(page: CrawledPage, label?: string): string {
    const now = new Date().toISOString().split('T')[0];
    const pageTitle = label || page.title || new URL(page.url).pathname.split('/').filter(Boolean).pop() || 'Page';

    const lines: string[] = [];
    lines.push(`# ${pageTitle}`);
    lines.push(`\n_Source URL: ${page.url}_`);
    lines.push(`_Captured: ${page.extractedAt.slice(0, 10) || now}_\n`);

    if (page.screenshotPath) {
        lines.push(`## Screenshot\n`);
        lines.push(`![${pageTitle} screenshot](${page.screenshotPath})\n`);
    }

    lines.push('## Overview\n');
    lines.push('_[Add: Write a 2–3 sentence description of this page and its purpose]_\n');

    if (page.headings.length > 0) {
        lines.push('## Page Structure\n');
        lines.push('The page contains the following sections:\n');
        page.headings.slice(0, 15).forEach((h) => {
            const clean = h.replace(/^#{1,6}\s*/, '').trim();
            lines.push(`### ${clean}\n`);
            lines.push('_[Add: Describe what this section does and how to use it]_\n');
        });
    }

    if (page.tables && Array.isArray(page.tables) && page.tables.length > 0) {
        lines.push('## Reference Data\n');
        lines.push('_The following data was extracted from the page:_\n');
        try {
            lines.push('```json');
            lines.push(JSON.stringify(page.tables[0], null, 2).slice(0, 1000));
            lines.push('```\n');
        } catch { /* skip malformed tables */ }
    }

    if (page.text.trim().length > 50) {
        lines.push('## Key Content\n');
        lines.push(`> ${page.text.slice(0, 800).replace(/\n+/g, '\n> ')}\n`);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public: code feature extraction
// ---------------------------------------------------------------------------

/**
 * Extract documentable feature names from source code.
 * Finds exported symbols, API route definitions, and named exports.
 * Returns simple string names suitable for gap analysis.
 */
export function extractFeaturesFromCode(
    sourceFiles: Array<{ path: string; content: string }>,
): string[] {
    const features = new Set<string>();

    const patterns: Array<RegExp> = [
        // Exported functions and classes
        /^export\s+(?:async\s+)?function\s+(\w+)/gm,
        /^export\s+(?:abstract\s+)?class\s+(\w+)/gm,
        /^export\s+interface\s+(\w+)/gm,
        /^export\s+type\s+(\w+)\s*=/gm,
        /^export\s+const\s+(\w+)\s*(?::|=)/gm,
        // Express/Next.js routes
        /router\.[a-z]+\(['"]([/\w:*-]+)['"]/gm,
        /app\.[a-z]+\(['"]([/\w:*-]+)['"]/gm,
        /\.([a-z]+)\(['"]\/api\/([^'"]+)['"]/gm,
        // Next.js app router filenames
        /page\.tsx?$/,
        /route\.tsx?$/,
    ];

    for (const file of sourceFiles) {
        // For route files: use path segments as feature names
        const pathSegments = file.path.split('/').filter(Boolean);
        const apiIdx = pathSegments.indexOf('api');
        if (apiIdx >= 0) {
            const apiRoute = '/' + pathSegments.slice(apiIdx).join('/').replace(/\.(ts|tsx|js|jsx)$/, '');
            if (apiRoute.length > 4) features.add(apiRoute);
        }

        // Apply regex patterns
        for (const pattern of patterns.slice(0, 8)) {
            const re = new RegExp(pattern.source, pattern.flags);
            let m: RegExpExecArray | null;
            while ((m = re.exec(file.content)) !== null) {
                const name = m[1] ?? m[2];
                if (name && name.length > 2 && name.length < 60) {
                    // Filter out obviously internal/generic names
                    if (!/^(test|spec|mock|stub|_|T|K|V|R)/.test(name)) {
                        features.add(name);
                    }
                }
            }
        }
    }

    return [...features].slice(0, 200);
}

// ---------------------------------------------------------------------------
// Public: doc gap analysis
// ---------------------------------------------------------------------------

/**
 * Compare a list of product features against existing documentation content.
 * Returns a prioritized list of documentation gaps.
 */
export function findDocGaps(
    features: string[],
    docFiles: Array<{ path: string; content: string }>,
): DocGapReport {
    const documented: string[] = [];
    const partial: string[] = [];
    const undocumented: string[] = [];

    // Build a combined lowercased doc corpus
    const docCorpus = docFiles.map((f) => ({
        path: f.path,
        lower: stripMarkdown(f.content),
        wordCount: f.content.split(/\s+/).length,
    }));

    for (const feature of features) {
        const slug = featureSlug(feature);
        if (!slug) continue;

        const matchingFiles = docCorpus.filter(
            (d) => d.lower.includes(slug) || d.lower.includes(slug.replace(/\s/g, '')),
        );

        if (matchingFiles.length === 0) {
            undocumented.push(feature);
        } else {
            // Count how many words surround mentions of this feature in docs
            const totalWords = matchingFiles.reduce((sum, f) => {
                const idx = f.lower.indexOf(slug);
                if (idx < 0) return sum;
                // Words in a ±200-char window around the mention
                const window = f.lower.slice(Math.max(0, idx - 200), idx + 200);
                return sum + (window.match(/\b\w+\b/g) ?? []).length;
            }, 0);

            if (totalWords < 50) {
                partial.push(feature);
            } else {
                documented.push(feature);
            }
        }
    }

    const coveragePercent = features.length === 0
        ? 100
        : Math.round((documented.length / features.length) * 100);

    // Prioritize gaps
    const prioritizedGaps: DocGapItem[] = [
        // API routes always high priority
        ...undocumented
            .filter((f) => f.startsWith('/') || f.toLowerCase().includes('api'))
            .map((f): DocGapItem => ({
                feature: f,
                reason: 'API route with no documentation',
                priority: 'high',
            })),
        // Exported classes/services high priority
        ...undocumented
            .filter((f) => /Service|Manager|Controller|Handler|Client|Provider/.test(f))
            .map((f): DocGapItem => ({
                feature: f,
                reason: 'Service/component class with no documentation',
                priority: 'high',
            })),
        // Remaining undocumented — medium
        ...undocumented
            .filter(
                (f) =>
                    !f.startsWith('/') &&
                    !f.toLowerCase().includes('api') &&
                    !/Service|Manager|Controller|Handler|Client|Provider/.test(f),
            )
            .slice(0, 20)
            .map((f): DocGapItem => ({
                feature: f,
                reason: 'Feature exported in code but not covered in docs',
                priority: 'medium',
            })),
        // Partial — low priority
        ...partial.slice(0, 10).map((f): DocGapItem => ({
            feature: f,
            reason: 'Feature mentioned but documentation is very thin',
            priority: 'low',
        })),
    ].slice(0, 50);

    // Build markdown report
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];
    lines.push('# Documentation Gap Report');
    lines.push(`\n_Generated: ${now}_\n`);
    lines.push(`**Coverage:** ${coveragePercent}% (${documented.length}/${features.length} features documented)\n`);
    lines.push('| Status | Count |');
    lines.push('|--------|-------|');
    lines.push(`| ✅ Documented | ${documented.length} |`);
    lines.push(`| ⚠️ Partial coverage | ${partial.length} |`);
    lines.push(`| ❌ Not documented | ${undocumented.length} |`);
    lines.push('');

    if (undocumented.length > 0) {
        lines.push('## ❌ Undocumented Features\n');
        undocumented.slice(0, 30).forEach((f) => lines.push(`- \`${f}\``));
        if (undocumented.length > 30) lines.push(`\n_…and ${undocumented.length - 30} more_`);
        lines.push('');
    }

    if (partial.length > 0) {
        lines.push('## ⚠️ Partial Coverage (thin docs)\n');
        partial.slice(0, 15).forEach((f) => lines.push(`- \`${f}\``));
        lines.push('');
    }

    if (prioritizedGaps.length > 0) {
        lines.push('## Prioritized Action List\n');
        lines.push('| Priority | Feature | Reason |');
        lines.push('|----------|---------|--------|');
        prioritizedGaps.slice(0, 20).forEach((g) => {
            const badge = g.priority === 'high' ? '🔴 High' : g.priority === 'medium' ? '🟡 Medium' : '🟢 Low';
            lines.push(`| ${badge} | \`${g.feature}\` | ${g.reason} |`);
        });
    }

    return {
        totalFeatures: features.length,
        documentedFeatures: documented,
        undocumentedFeatures: undocumented,
        partialFeatures: partial,
        coveragePercent,
        prioritizedGaps,
        markdownReport: lines.join('\n'),
    };
}
