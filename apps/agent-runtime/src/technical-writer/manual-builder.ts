// ============================================================================
// MANUAL BUILDER
// Technical Writer Role
//
// Generates structured user manual documents (Markdown) from metadata,
// feature lists, and freeform section content.
//
// Covers three output modes:
//   buildManualFromSections — assemble a full manual from pre-written sections
//   buildManualTemplate     — generate a skeleton manual from a feature list
//   buildManualToc          — extract and format a table of contents
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManualAudience = 'end-user' | 'developer' | 'admin' | 'all';
export type ManualConfidentiality = 'public' | 'internal' | 'confidential';

export interface ManualMetadata {
    title: string;
    product: string;
    version: string;
    audience: ManualAudience;
    authors?: string[];
    /** ISO date string, e.g. "2026-05-23". Defaults to today. */
    date?: string;
    confidentiality?: ManualConfidentiality;
    /** One-paragraph description of the manual's scope. */
    description?: string;
}

export interface ManualSection {
    /** Unique slug used for anchor links, e.g. "getting-started". */
    id: string;
    title: string;
    /** Heading depth: 1 = H2 (H1 is reserved for the title), 2 = H3, 3 = H4. */
    level: 1 | 2 | 3;
    /** Freeform Markdown content for the section body. */
    content: string;
    subsections?: ManualSection[];
}

export interface ManualTocEntry {
    title: string;
    anchor: string;
    level: number;
}

export interface ManualToc {
    entries: ManualTocEntry[];
    markdownToc: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

function audienceLabel(audience: ManualAudience): string {
    const map: Record<ManualAudience, string> = {
        'end-user': 'End Users',
        developer: 'Developers',
        admin: 'Administrators',
        all: 'All Users',
    };
    return map[audience];
}

function confidentialityBadge(level: ManualConfidentiality): string {
    if (level === 'public') return '';
    const emoji = level === 'confidential' ? '🔒' : '🏢';
    return `\n> ${emoji} **${level.toUpperCase()}** — Do not distribute outside the organisation.\n`;
}

function renderSection(section: ManualSection, depthOffset = 0): string {
    const hashes = '#'.repeat(section.level + 1 + depthOffset);
    const anchor = slugify(section.id || section.title);
    const lines: string[] = [];

    lines.push(`${hashes} ${section.title} {#${anchor}}`);
    lines.push('');
    if (section.content.trim()) {
        lines.push(section.content.trim());
        lines.push('');
    }

    if (section.subsections && section.subsections.length > 0) {
        for (const sub of section.subsections) {
            lines.push(renderSection(sub, depthOffset));
        }
    }

    return lines.join('\n');
}

function collectTocEntries(sections: ManualSection[], baseLevel = 2): ManualTocEntry[] {
    const entries: ManualTocEntry[] = [];
    for (const s of sections) {
        entries.push({
            title: s.title,
            anchor: slugify(s.id || s.title),
            level: baseLevel,
        });
        if (s.subsections) {
            for (const sub of s.subsections) {
                entries.push({
                    title: sub.title,
                    anchor: slugify(sub.id || sub.title),
                    level: baseLevel + 1,
                });
            }
        }
    }
    return entries;
}

// ---------------------------------------------------------------------------
// TOC builder
// ---------------------------------------------------------------------------

/**
 * Build a Markdown table of contents from a list of ManualSection objects.
 */
export function buildManualToc(sections: ManualSection[]): ManualToc {
    const entries = collectTocEntries(sections);
    const lines: string[] = ['## Table of Contents', ''];
    for (const e of entries) {
        const indent = '  '.repeat(Math.max(0, e.level - 2));
        lines.push(`${indent}- [${e.title}](#${e.anchor})`);
    }
    return { entries, markdownToc: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Assemble manual from sections
// ---------------------------------------------------------------------------

/**
 * Assemble a complete user manual from pre-written ManualSection objects.
 * Renders: title page → confidentiality notice → ToC → sections → footer.
 */
export function buildManualFromSections(
    meta: ManualMetadata,
    sections: ManualSection[],
): string {
    const date = meta.date ?? new Date().toISOString().split('T')[0];
    const authors = meta.authors && meta.authors.length > 0
        ? meta.authors.join(', ')
        : '';
    const confNotice = meta.confidentiality && meta.confidentiality !== 'public'
        ? confidentialityBadge(meta.confidentiality)
        : '';

    const lines: string[] = [];

    // Title page
    lines.push(`# ${meta.title}`);
    lines.push('');
    lines.push(`**Product:** ${meta.product}  `);
    lines.push(`**Version:** ${meta.version}  `);
    lines.push(`**Audience:** ${audienceLabel(meta.audience)}  `);
    if (authors) lines.push(`**Authors:** ${authors}  `);
    lines.push(`**Date:** ${date}`);
    lines.push('');
    if (confNotice) lines.push(confNotice);
    if (meta.description) {
        lines.push(meta.description.trim());
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // Table of Contents
    const toc = buildManualToc(sections);
    lines.push(toc.markdownToc);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Sections
    for (const section of sections) {
        lines.push(renderSection(section));
        lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`_${meta.title} — ${meta.product} v${meta.version} — ${date}_`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skeleton manual template
// ---------------------------------------------------------------------------

/**
 * Generate a skeleton manual from metadata and a feature list.
 * Produces a fully structured document with placeholder content in each section.
 * The TW agent fills in the placeholders after SME interviews.
 */
export function buildManualTemplate(
    meta: ManualMetadata,
    features: string[],
): string {
    const audienceTerm = meta.audience === 'end-user' ? 'users' :
        meta.audience === 'developer' ? 'developers' :
            meta.audience === 'admin' ? 'administrators' : 'readers';

    const sections: ManualSection[] = [
        {
            id: 'overview',
            title: 'Overview',
            level: 1,
            content: `This manual covers **${meta.product}** (version ${meta.version}) for ${audienceTerm}.\n\n_[Add: what the product does, its primary value proposition, and what this manual covers.]_`,
        },
        {
            id: 'prerequisites',
            title: 'Prerequisites',
            level: 1,
            content: `Before using ${meta.product}, ensure you have:\n\n- _[Requirement 1]_\n- _[Requirement 2]_\n- _[Required account or access level]_`,
        },
        {
            id: 'getting-started',
            title: 'Getting Started',
            level: 1,
            content: `_[Describe the fastest path to a working setup — the single most common first task. Aim for under 5 minutes to completion.]_`,
            subsections: [
                {
                    id: 'installation',
                    title: 'Installation',
                    level: 2,
                    content: '_[Step-by-step installation instructions.]_',
                },
                {
                    id: 'initial-configuration',
                    title: 'Initial Configuration',
                    level: 2,
                    content: '_[Minimum required configuration to get a working instance.]_',
                },
                {
                    id: 'quick-start-example',
                    title: 'Quick Start Example',
                    level: 2,
                    content: '_[A complete working example — from zero to first successful operation.]_',
                },
            ],
        },
        // One section per feature
        ...features.map((feature, i) => ({
            id: slugify(feature),
            title: feature,
            level: 1 as const,
            content: `_[Describe what ${feature} does and why ${audienceTerm} use it.]_`,
            subsections: [
                {
                    id: `${slugify(feature)}-how-to`,
                    title: `How to Use ${feature}`,
                    level: 2 as const,
                    content: '_[Step-by-step instructions.]_',
                },
                {
                    id: `${slugify(feature)}-options`,
                    title: 'Options and Parameters',
                    level: 2 as const,
                    content: '| Option | Type | Default | Description |\n|--------|------|---------|-------------|\n| _[option]_ | _[type]_ | _[default]_ | _[description]_ |',
                },
                {
                    id: `${slugify(feature)}-examples`,
                    title: 'Examples',
                    level: 2 as const,
                    content: '_[Concrete examples with expected output.]_',
                },
            ],
        })),
        {
            id: 'troubleshooting',
            title: 'Troubleshooting',
            level: 1,
            content: '_[Introduction to the troubleshooting section.]_',
            subsections: [
                {
                    id: 'common-errors',
                    title: 'Common Errors',
                    level: 2,
                    content: '| Error | Cause | Solution |\n|-------|-------|----------|\n| _[Error message]_ | _[Root cause]_ | _[Step to fix]_ |',
                },
                {
                    id: 'getting-help',
                    title: 'Getting Help',
                    level: 2,
                    content: '_[Links to support channels, community forums, and escalation paths.]_',
                },
            ],
        },
        {
            id: 'glossary',
            title: 'Glossary',
            level: 1,
            content: '_[Define key terms and abbreviations used in this manual.]_\n\n| Term | Definition |\n|------|------------|\n| _[Term]_ | _[Definition]_ |',
        },
        {
            id: 'additional-resources',
            title: 'Additional Resources',
            level: 1,
            content: '- _[Link to API reference]_\n- _[Link to changelog]_\n- _[Link to community forum]_\n- _[Link to video tutorials]_',
        },
    ];

    return buildManualFromSections(meta, sections);
}
