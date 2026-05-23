// ============================================================================
// NAV AUDITOR
// Technical Writer Role
//
// Audits a documentation tree for structural and navigation health:
//   - Orphaned pages (no inbound links)
//   - Broken internal links (target file does not exist)
//   - Duplicate/similar titles
//   - Heading hierarchy violations
//   - Missing standard sections
//   - TOC generation from the doc tree
//   - Overall IA health score
//
// Caller passes pre-read file contents; no I/O in this module.
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocFile {
    /** Relative path within the doc tree, e.g. "guide/authentication.md". */
    path: string;
    content: string;
}

export interface ParsedDocFile {
    path: string;
    title: string;
    headings: HeadingEntry[];
    internalLinks: LinkEntry[];
    wordCount: number;
    hasCodeExample: boolean;
    /** Heading-level section names (lowercased) found in the file. */
    sectionNames: string[];
}

export interface HeadingEntry {
    level: number; // 1–6
    text: string;
    lineNumber: number;
}

export interface LinkEntry {
    text: string;
    target: string;
    lineNumber: number;
    /** true if the target resolves to an existing file in the doc set. */
    resolves?: boolean;
}

export interface NavAuditIssue {
    filePath: string;
    type:
        | 'orphaned'
        | 'broken_link'
        | 'duplicate_title'
        | 'heading_skip'
        | 'missing_section'
        | 'stub'
        | 'no_title';
    severity: 'error' | 'warning' | 'info';
    description: string;
    lineNumber?: number;
}

export interface TocNode {
    title: string;
    path: string;
    children: TocNode[];
}

export interface NavAuditResult {
    /** 0–100. Higher = healthier. */
    healthScore: number;
    healthLabel: string;
    totalFiles: number;
    issues: NavAuditIssue[];
    orphanedPages: string[];
    brokenLinks: Array<{ from: string; to: string; lineNumber: number }>;
    duplicateTitles: Array<{ title: string; files: string[] }>;
    tocTree: TocNode[];
    markdownToc: string;
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Standard sections every doc should ideally have
// ---------------------------------------------------------------------------

const RECOMMENDED_SECTIONS = [
    { name: 'overview',          aliases: ['overview', 'introduction', 'about', 'what is'] },
    { name: 'prerequisites',     aliases: ['prerequisites', 'before you begin', 'requirements', 'what you need'] },
    { name: 'getting started',   aliases: ['getting started', 'quick start', 'quickstart', 'installation'] },
    { name: 'examples',          aliases: ['example', 'examples', 'usage', 'sample'] },
    { name: 'troubleshooting',   aliases: ['troubleshooting', 'common errors', 'faqs', 'known issues'] },
];

// Minimum word count to not be considered a stub
const STUB_THRESHOLD_WORDS = 100;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseDoc(file: DocFile): ParsedDocFile {
    const lines = file.content.split('\n');
    const headings: HeadingEntry[] = [];
    const internalLinks: LinkEntry[] = [];
    let wordCount = 0;
    let hasCodeExample = false;
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lno = i + 1;

        // Code block tracking
        if (line.trimStart().startsWith('```')) {
            inCode = !inCode;
            if (!inCode && i > 0) hasCodeExample = true; // just closed a code block
            continue;
        }
        if (inCode) continue;

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s+\{#[\w-]+\})?$/);
        if (headingMatch) {
            headings.push({
                level: headingMatch[1]!.length,
                text: headingMatch[2]!.trim(),
                lineNumber: lno,
            });
        }

        // Word count (prose only)
        if (!line.startsWith('#') && line.trim() !== '' && !line.startsWith('|')) {
            wordCount += (line.match(/\b\w+\b/g) ?? []).length;
        }

        // Internal links: [text](./path) or [text](../path) or [text](path.md)
        const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(line)) !== null) {
            const target = m[2]!;
            // Exclude http(s), mailto, anchors-only, and image references
            if (/^https?:|^mailto:|^#/.test(target)) continue;
            internalLinks.push({ text: m[1]!, target, lineNumber: lno });
        }
    }

    const title = headings.find((h) => h.level === 1)?.text ?? '';
    const sectionNames = headings.map((h) => h.text.toLowerCase());

    return { path: file.path, title, headings, internalLinks, wordCount, hasCodeExample, sectionNames };
}

// ---------------------------------------------------------------------------
// Link resolution
// ---------------------------------------------------------------------------

function resolveLink(from: string, target: string, allPaths: Set<string>): boolean {
    // Strip anchor fragment
    const base = target.split('#')[0];
    if (!base) return true; // anchor-only link in same file — always valid

    // Resolve relative path from the source file's directory
    const fromDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
    let resolved = base.startsWith('./') ? fromDir + base.slice(2)
        : base.startsWith('../') ? resolveRelative(fromDir, base)
            : base.startsWith('/') ? base.slice(1)
                : fromDir + base;

    // Normalise slashes and handle .md extension
    resolved = resolved.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (!resolved.endsWith('.md') && !resolved.endsWith('/')) {
        resolved = resolved + '.md';
    }
    if (resolved.endsWith('/')) resolved = resolved + 'index.md';

    return allPaths.has(resolved) || allPaths.has(resolved.replace('.md', ''));
}

function resolveRelative(fromDir: string, target: string): string {
    const parts = fromDir.split('/').filter(Boolean);
    const targetParts = target.split('/');
    for (const part of targetParts) {
        if (part === '..') parts.pop();
        else if (part !== '.') parts.push(part);
    }
    return parts.join('/');
}

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

function findOrphans(parsed: ParsedDocFile[], allPaths: Set<string>): string[] {
    // A page is orphaned if no other page links to it (excluding index/readme)
    const linkedTo = new Set<string>();
    for (const doc of parsed) {
        for (const link of doc.internalLinks) {
            const base = link.target.split('#')[0] ?? '';
            if (base) linkedTo.add(base.replace(/^\.\//, '').replace(/\.md$/, ''));
        }
    }

    return parsed
        .filter((doc) => {
            const name = doc.path.replace(/\.md$/, '').replace(/^.*\//, '');
            const pathNoExt = doc.path.replace(/\.md$/, '');
            const isIndex = /^(index|readme|_index)$/i.test(name);
            if (isIndex) return false;
            return !linkedTo.has(pathNoExt) && !linkedTo.has(doc.path);
        })
        .map((doc) => doc.path);
}

// ---------------------------------------------------------------------------
// TOC builder
// ---------------------------------------------------------------------------

function buildTocTree(parsed: ParsedDocFile[]): TocNode[] {
    // Group by top-level path segment
    const roots: TocNode[] = [];
    const seen = new Map<string, TocNode>();

    const sorted = [...parsed].sort((a, b) => a.path.localeCompare(b.path));
    for (const doc of sorted) {
        const segments = doc.path.split('/');
        const title = doc.title || doc.path;
        const node: TocNode = { title, path: doc.path, children: [] };

        if (segments.length === 1) {
            roots.push(node);
            seen.set(doc.path, node);
        } else {
            const parentPath = segments.slice(0, -1).join('/');
            const parent = seen.get(parentPath) ?? seen.get(parentPath + '/index.md');
            if (parent) {
                parent.children.push(node);
            } else {
                roots.push(node);
            }
            seen.set(doc.path, node);
        }
    }
    return roots;
}

function renderTocMarkdown(nodes: TocNode[], depth = 0): string {
    const lines: string[] = [];
    for (const node of nodes) {
        const indent = '  '.repeat(depth);
        lines.push(`${indent}- [${node.title}](${node.path})`);
        if (node.children.length > 0) {
            lines.push(renderTocMarkdown(node.children, depth + 1));
        }
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Health scoring
// ---------------------------------------------------------------------------

function healthLabel(score: number): string {
    if (score >= 85) return 'Healthy';
    if (score >= 70) return 'Good — minor issues';
    if (score >= 50) return 'Needs attention';
    if (score >= 30) return 'Poor — significant gaps';
    return 'Critical — major restructure needed';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a documentation tree for structural and navigation health.
 *
 * @param files  Pre-read doc files (path + content).
 * @param requiredSections  Optional override for the recommended-section check.
 */
export function auditNavigation(
    files: DocFile[],
    requiredSections?: string[],
): NavAuditResult {
    const parsed = files.map(parseDoc);
    const allPaths = new Set(files.map((f) => f.path));
    const issues: NavAuditIssue[] = [];

    // Heading hierarchy violations
    for (const doc of parsed) {
        let lastLevel = 0;
        for (const h of doc.headings) {
            if (lastLevel > 0 && h.level > lastLevel + 1) {
                issues.push({
                    filePath: doc.path,
                    type: 'heading_skip',
                    severity: 'warning',
                    description: `Heading jumps from H${lastLevel} to H${h.level}: "${h.text}"`,
                    lineNumber: h.lineNumber,
                });
            }
            lastLevel = h.level;
        }

        // No title
        if (!doc.title) {
            issues.push({ filePath: doc.path, type: 'no_title', severity: 'error', description: 'Document has no H1 title.' });
        }

        // Stub check
        if (doc.wordCount < STUB_THRESHOLD_WORDS) {
            issues.push({
                filePath: doc.path,
                type: 'stub',
                severity: 'warning',
                description: `Document is very short (${doc.wordCount} words) — may be a stub.`,
            });
        }

        // Missing recommended sections
        const sectionsToCheck = requiredSections ?? RECOMMENDED_SECTIONS.map((s) => s.name);
        for (const sectionName of sectionsToCheck) {
            const rSec = RECOMMENDED_SECTIONS.find((s) => s.name === sectionName);
            const aliases = rSec?.aliases ?? [sectionName];
            const found = doc.sectionNames.some((s) => aliases.some((a) => s.includes(a)));
            if (!found) {
                issues.push({
                    filePath: doc.path,
                    type: 'missing_section',
                    severity: 'info',
                    description: `Missing recommended section: "${sectionName}"`,
                });
            }
        }
    }

    // Link resolution
    const brokenLinks: NavAuditResult['brokenLinks'] = [];
    for (const doc of parsed) {
        for (const link of doc.internalLinks) {
            const resolves = resolveLink(doc.path, link.target, allPaths);
            link.resolves = resolves;
            if (!resolves) {
                brokenLinks.push({ from: doc.path, to: link.target, lineNumber: link.lineNumber });
                issues.push({
                    filePath: doc.path,
                    type: 'broken_link',
                    severity: 'error',
                    description: `Broken internal link: "${link.target}"`,
                    lineNumber: link.lineNumber,
                });
            }
        }
    }

    // Orphan detection
    const orphans = findOrphans(parsed, allPaths);
    for (const o of orphans) {
        issues.push({ filePath: o, type: 'orphaned', severity: 'warning', description: 'Page is not linked from any other page.' });
    }

    // Duplicate titles
    const titleMap = new Map<string, string[]>();
    for (const doc of parsed) {
        if (!doc.title) continue;
        const key = doc.title.toLowerCase().trim();
        if (!titleMap.has(key)) titleMap.set(key, []);
        titleMap.get(key)!.push(doc.path);
    }
    const duplicateTitles: NavAuditResult['duplicateTitles'] = [];
    for (const [title, filePaths] of titleMap) {
        if (filePaths.length > 1) {
            duplicateTitles.push({ title, files: filePaths });
            for (const fp of filePaths) {
                issues.push({ filePath: fp, type: 'duplicate_title', severity: 'warning', description: `Title "${title}" is shared with ${filePaths.filter((p) => p !== fp).join(', ')}` });
            }
        }
    }

    // TOC
    const tocTree = buildTocTree(parsed);
    const markdownToc = renderTocMarkdown(tocTree);

    // Health score
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;
    let healthScore = 100;
    healthScore -= Math.min(40, errorCount * 8);
    healthScore -= Math.min(25, warnCount * 4);
    healthScore -= Math.min(15, infoCount * 1);
    healthScore = Math.max(0, healthScore);

    const markdownReport = buildNavReport(files.length, healthScore, issues, orphans, brokenLinks, duplicateTitles, markdownToc);

    return {
        healthScore: Math.round(healthScore),
        healthLabel: healthLabel(healthScore),
        totalFiles: files.length,
        issues,
        orphanedPages: orphans,
        brokenLinks,
        duplicateTitles,
        tocTree,
        markdownToc,
        markdownReport,
    };
}

function buildNavReport(
    totalFiles: number,
    score: number,
    issues: NavAuditIssue[],
    orphans: string[],
    brokenLinks: NavAuditResult['brokenLinks'],
    duplicateTitles: NavAuditResult['duplicateTitles'],
    toc: string,
): string {
    const now = new Date().toISOString().split('T')[0];
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const infos = issues.filter((i) => i.severity === 'info').length;
    const lines: string[] = [];

    lines.push('# Documentation Navigation Audit Report');
    lines.push(`\n_Generated: ${now} — ${totalFiles} files audited_\n`);
    lines.push(`**Health score:** ${score}/100 — _${healthLabel(score)}_  `);
    lines.push(`**Errors:** ${errors} | **Warnings:** ${warnings} | **Info:** ${infos}\n`);

    if (brokenLinks.length > 0) {
        lines.push('## ❌ Broken Internal Links\n');
        lines.push('| From | To | Line |');
        lines.push('|------|----|------|');
        brokenLinks.forEach((b) => lines.push(`| \`${b.from}\` | \`${b.to}\` | ${b.lineNumber} |`));
        lines.push('');
    }

    if (orphans.length > 0) {
        lines.push('## ⚠️ Orphaned Pages (Not Linked From Anywhere)\n');
        orphans.forEach((o) => lines.push(`- \`${o}\``));
        lines.push('');
    }

    if (duplicateTitles.length > 0) {
        lines.push('## ⚠️ Duplicate Titles\n');
        duplicateTitles.forEach((d) => lines.push(`- "${d.title}" — ${d.files.map((f) => `\`${f}\``).join(', ')}`));
        lines.push('');
    }

    const missingSection = issues.filter((i) => i.type === 'missing_section');
    if (missingSection.length > 0) {
        lines.push('## ℹ️ Missing Recommended Sections\n');
        lines.push('| File | Missing Section |');
        lines.push('|------|-----------------|');
        missingSection.forEach((i) => lines.push(`| \`${i.filePath}\` | ${i.description.replace('Missing recommended section: ', '')} |`));
        lines.push('');
    }

    lines.push('## 📚 Generated Table of Contents\n');
    lines.push(toc);
    lines.push('');

    return lines.join('\n');
}
