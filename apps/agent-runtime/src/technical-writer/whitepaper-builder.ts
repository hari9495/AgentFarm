// ============================================================================
// WHITEPAPER BUILDER
// Technical Writer Role
//
// Generates structured white paper documents in Markdown.
//
// buildWhitepaperFromSections — assemble from pre-written content blocks
// buildWhitepaperTemplate     — skeleton with all standard sections
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhitepaperCallout {
    type: 'key-finding' | 'quote' | 'note' | 'statistic';
    text: string;
    /** Attribution for quotes or statistics. */
    source?: string;
}

export interface WhitepaperFigure {
    caption: string;
    altText: string;
    /** Relative path to image file, if available. */
    imagePath?: string;
}

export interface WhitepaperSection {
    /** Unique slug for anchor, e.g. "problem-statement". */
    id: string;
    title: string;
    content: string;
    callouts?: WhitepaperCallout[];
    figures?: WhitepaperFigure[];
    subsections?: Array<{ title: string; content: string }>;
}

export interface WhitepaperMetadata {
    title: string;
    subtitle?: string;
    /** Full names of all authors. */
    authors: string[];
    /** Organisation or company publishing the white paper. */
    organization: string;
    /** Publication date ISO string, e.g. "2026-05-23". */
    date?: string;
    /**
     * 1-3 paragraph executive summary / abstract.
     * Shown on the cover page and before the table of contents.
     */
    abstract: string;
    /** SEO / taxonomy keywords, shown as tags. */
    keywords?: string[];
    /** Optional version or revision label, e.g. "v1.0", "Draft". */
    version?: string;
    confidentiality?: 'public' | 'internal' | 'confidential';
}

// ---------------------------------------------------------------------------
// Standard white paper section order
// ---------------------------------------------------------------------------

export const STANDARD_WHITEPAPER_SECTIONS: string[] = [
    'Executive Summary',
    'Introduction',
    'Problem Statement',
    'Background',
    'Solution Overview',
    'Technical Details',
    'Results & Benefits',
    'Implementation Guidance',
    'Conclusion',
    'References',
    'About the Authors',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

function renderCallout(callout: WhitepaperCallout): string {
    const prefix: Record<WhitepaperCallout['type'], string> = {
        'key-finding': '🔑 **Key Finding:**',
        quote: '💬',
        note: '📝 **Note:**',
        statistic: '📊 **Statistic:**',
    };
    const attribution = callout.source ? `\n>\n> — _${callout.source}_` : '';
    return `> ${prefix[callout.type]} ${callout.text}${attribution}`;
}

function renderFigure(figure: WhitepaperFigure): string {
    if (figure.imagePath) {
        return `![${figure.altText}](${figure.imagePath})\n_Figure: ${figure.caption}_`;
    }
    return `> **Figure:** ${figure.caption}\n> _[${figure.altText}]_`;
}

function renderWhitepaperSection(section: WhitepaperSection): string {
    const anchor = slugify(section.id || section.title);
    const lines: string[] = [];

    lines.push(`## ${section.title} {#${anchor}}`);
    lines.push('');
    lines.push(section.content.trim());
    lines.push('');

    if (section.callouts && section.callouts.length > 0) {
        for (const callout of section.callouts) {
            lines.push(renderCallout(callout));
            lines.push('');
        }
    }

    if (section.figures && section.figures.length > 0) {
        for (const figure of section.figures) {
            lines.push(renderFigure(figure));
            lines.push('');
        }
    }

    if (section.subsections && section.subsections.length > 0) {
        for (const sub of section.subsections) {
            lines.push(`### ${sub.title}`);
            lines.push('');
            lines.push(sub.content.trim());
            lines.push('');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildWhitepaperFromSections
// ---------------------------------------------------------------------------

/**
 * Assemble a complete white paper from pre-written WhitepaperSection objects.
 *
 * Renders: cover page → abstract → table of contents → sections → footer.
 */
export function buildWhitepaperFromSections(
    meta: WhitepaperMetadata,
    sections: WhitepaperSection[],
): string {
    const date = meta.date ?? new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    // Cover page
    lines.push(`# ${meta.title}`);
    if (meta.subtitle) {
        lines.push('');
        lines.push(`### ${meta.subtitle}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Cover metadata block
    const metaLines: string[] = [];
    metaLines.push(`**Authors:** ${meta.authors.join(', ')}  `);
    metaLines.push(`**Organisation:** ${meta.organization}  `);
    metaLines.push(`**Date:** ${date}  `);
    if (meta.version) metaLines.push(`**Version:** ${meta.version}  `);
    if (meta.confidentiality && meta.confidentiality !== 'public') {
        const badge = meta.confidentiality === 'confidential' ? '🔒 **CONFIDENTIAL**' : '🏢 **INTERNAL**';
        metaLines.push(`**Classification:** ${badge}  `);
    }
    if (meta.keywords && meta.keywords.length > 0) {
        metaLines.push(`**Keywords:** ${meta.keywords.join(', ')}  `);
    }
    lines.push(metaLines.join('\n'));
    lines.push('');
    lines.push('---');
    lines.push('');

    // Abstract
    lines.push('## Abstract');
    lines.push('');
    lines.push(meta.abstract.trim());
    lines.push('');
    lines.push('---');
    lines.push('');

    // Table of contents
    lines.push('## Table of Contents');
    lines.push('');
    sections.forEach((s) => {
        lines.push(`- [${s.title}](#${slugify(s.id || s.title)})`);
        if (s.subsections) {
            s.subsections.forEach((sub) => {
                lines.push(`  - ${sub.title}`);
            });
        }
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    // Sections
    for (const section of sections) {
        lines.push(renderWhitepaperSection(section));
        lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`_© ${new Date().getFullYear()} ${meta.organization}. ${meta.confidentiality === 'public' ? 'All rights reserved.' : 'For internal use only.'}_`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildWhitepaperTemplate
// ---------------------------------------------------------------------------

/**
 * Generate a skeleton white paper with all standard sections and placeholder content.
 * Authors fill in the placeholders — or the TW agent expands them from SME briefs.
 */
export function buildWhitepaperTemplate(meta: WhitepaperMetadata): string {
    const sections: WhitepaperSection[] = [
        {
            id: 'executive-summary',
            title: 'Executive Summary',
            content: `_[2-3 paragraph summary of the white paper's core argument, key findings, and recommended actions. Written for a decision-maker who will not read the rest of the document.]_`,
            callouts: [
                {
                    type: 'key-finding',
                    text: '_[The single most important finding or recommendation.]_',
                },
            ],
        },
        {
            id: 'introduction',
            title: 'Introduction',
            content: `_[Set the context. Why does this topic matter now? Who is the intended audience for this paper? What questions does it answer?]_`,
        },
        {
            id: 'problem-statement',
            title: 'Problem Statement',
            content: `_[Define the problem clearly. Use data, examples, or industry evidence to establish urgency. What is the cost of not solving this problem?]_`,
            callouts: [
                {
                    type: 'statistic',
                    text: '_[Key statistic that quantifies the problem.]_',
                    source: '_[Source, Year]_',
                },
            ],
        },
        {
            id: 'background',
            title: 'Background',
            content: `_[Provide context for readers who are not domain experts. Explain key concepts, industry trends, or prior work. Do not assume the reader has read previous materials.]_`,
            subsections: [
                {
                    title: 'Current Landscape',
                    content: '_[Describe the current state — tools, approaches, or gaps in the market.]_',
                },
                {
                    title: 'Existing Approaches and Their Limitations',
                    content: '_[Objectively describe alternatives and where they fall short.]_',
                },
            ],
        },
        {
            id: 'solution-overview',
            title: 'Solution Overview',
            content: `_[Describe the proposed solution at a conceptual level. Focus on "what" and "why" before "how". Use a diagram if one would help — add a figure placeholder below.]_`,
            figures: [
                {
                    caption: '_[Solution architecture or workflow diagram]_',
                    altText: '_[Description of the diagram for accessibility]_',
                },
            ],
        },
        {
            id: 'technical-details',
            title: 'Technical Details',
            content: `_[Deep-dive for technically sophisticated readers. Cover architecture, algorithms, data flows, or implementation specifics. Can be skipped by non-technical readers without loss of argument continuity.]_`,
            subsections: [
                {
                    title: 'Architecture',
                    content: '_[Describe the technical architecture — components, interfaces, data flows.]_',
                },
                {
                    title: 'Key Design Decisions',
                    content: '_[Explain the non-obvious choices and the trade-offs considered.]_',
                },
                {
                    title: 'Security and Compliance Considerations',
                    content: '_[How does the solution address security, privacy, and regulatory requirements?]_',
                },
            ],
        },
        {
            id: 'results-and-benefits',
            title: 'Results & Benefits',
            content: `_[Present evidence: benchmarks, case studies, user feedback, or analysis. Quantify wherever possible. Distinguish between validated results and projections.]_`,
            callouts: [
                {
                    type: 'quote',
                    text: '_[Customer or partner testimonial if available.]_',
                    source: '_[Name, Title, Company]_',
                },
            ],
        },
        {
            id: 'implementation-guidance',
            title: 'Implementation Guidance',
            content: `_[Practical advice for readers who want to adopt this solution. What are the prerequisites? What are the common pitfalls? How long does adoption typically take?]_`,
            subsections: [
                {
                    title: 'Prerequisites',
                    content: '_[What must be in place before starting implementation?]_',
                },
                {
                    title: 'Recommended Approach',
                    content: '_[Step-by-step or phase-by-phase implementation guide.]_',
                },
                {
                    title: 'Common Pitfalls',
                    content: '_[Top 3-5 mistakes teams make and how to avoid them.]_',
                },
            ],
        },
        {
            id: 'conclusion',
            title: 'Conclusion',
            content: `_[Restate the core argument in 1-2 paragraphs. End with a clear call to action — what should the reader do next?]_`,
        },
        {
            id: 'references',
            title: 'References',
            content: `_[List all sources cited in the document. Use a consistent citation format (APA, IEEE, or a house style).]_\n\n1. _[Author, Title, Publication, Year, URL]_\n2. _[Author, Title, Publication, Year, URL]_`,
        },
        {
            id: 'about-the-authors',
            title: 'About the Authors',
            content: meta.authors.map((author) =>
                `**${author}** — _[Title, ${meta.organization}. One-sentence bio.]_`,
            ).join('\n\n'),
        },
    ];

    return buildWhitepaperFromSections(meta, sections);
}
