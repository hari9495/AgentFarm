// ============================================================================
// LOCALIZATION TRACKER
// Technical Writer Role
//
// Tracks translation status per file per locale, detects stale translations,
// and generates translation-ready source exports with string IDs.
//
// Three modes:
//   buildLocalizationStatus  — compute per-file translation status from mtime data
//   generateStringExport     — extract translatable strings with stable IDs
//   buildLocalizationReport  — Markdown status dashboard
//
// Pure functions — no connector calls, no LLM calls.
// Caller provides file modification timestamps and content.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocaleCode = string; // BCP-47, e.g. 'en', 'fr-FR', 'zh-CN'
export type TranslationStatus = 'up-to-date' | 'stale' | 'missing' | 'needs-review';

export interface LocalizationManifest {
    /** Primary source language locale code. */
    sourceLocale: LocaleCode;
    /** All locales that should have translations. */
    targetLocales: LocaleCode[];
    /**
     * Map of locale → directory prefix, e.g. { 'fr': 'docs/fr/', 'de': 'docs/de/' }.
     * Source files are assumed to live at their bare paths (e.g. 'docs/guide.md').
     */
    localeDirs: Record<LocaleCode, string>;
}

export interface SourceFileInfo {
    path: string;
    /** ISO date string of last modification. */
    lastModified: string;
    /** Character count of the source content (proxy for translation volume). */
    charCount: number;
}

export interface TranslationFileInfo {
    path: string;
    locale: LocaleCode;
    /** ISO date string of last modification, or null if the file does not exist. */
    lastModified: string | null;
}

export interface TranslationFileStatus {
    sourceFile: string;
    locale: LocaleCode;
    /** Computed path of the translation file. */
    translationPath: string;
    status: TranslationStatus;
    sourceLastModified: string;
    translationLastModified: string | null;
    /** Days since the source was modified after the translation. 0 if up-to-date. */
    staleDays: number;
}

export interface TranslatableString {
    /** Stable string ID, e.g. "guide_authentication_s001". */
    id: string;
    sourceText: string;
    /** Section heading under which this string appears. */
    section: string;
    lineNumber: number;
}

export interface StringExport {
    sourceLocale: LocaleCode;
    sourceFile: string;
    strings: TranslatableString[];
    /** JSON representation ready to hand off to a translation service. */
    jsonExport: string;
    /** Markdown table of all strings for human review. */
    markdownTable: string;
}

export interface LocalizationReport {
    manifest: LocalizationManifest;
    statuses: TranslationFileStatus[];
    summary: {
        totalSourceFiles: number;
        perLocale: Record<LocaleCode, {
            upToDate: number;
            stale: number;
            missing: number;
            needsReview: number;
        }>;
    };
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function daysBetween(earlier: string, later: string): number {
    const a = new Date(earlier).getTime();
    const b = new Date(later).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

function computeTranslationPath(
    sourceFile: string,
    locale: LocaleCode,
    manifest: LocalizationManifest,
): string {
    const dir = manifest.localeDirs[locale] ?? `docs/${locale}/`;
    // Strip the source locale dir prefix if present
    const sourceDir = manifest.localeDirs[manifest.sourceLocale] ?? '';
    const relative = sourceFile.startsWith(sourceDir)
        ? sourceFile.slice(sourceDir.length)
        : sourceFile;
    return dir + relative;
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w]/g, '_').replace(/_+/g, '_').slice(0, 30);
}

// ---------------------------------------------------------------------------
// Public: status computation
// ---------------------------------------------------------------------------

/**
 * Compute translation status for every (sourceFile × locale) pair.
 *
 * @param manifest      Localization configuration.
 * @param sourceFiles   Info about each source file (path + lastModified date).
 * @param translations  Map of locale → list of existing translation file infos.
 */
export function buildLocalizationStatus(
    manifest: LocalizationManifest,
    sourceFiles: SourceFileInfo[],
    translations: Record<LocaleCode, TranslationFileInfo[]>,
): TranslationFileStatus[] {
    const statuses: TranslationFileStatus[] = [];

    for (const src of sourceFiles) {
        for (const locale of manifest.targetLocales) {
            const translationPath = computeTranslationPath(src.path, locale, manifest);
            const localeTrans = translations[locale] ?? [];
            const found = localeTrans.find(
                (t) => t.path === translationPath || t.path.endsWith('/' + src.path.split('/').pop()!),
            );

            let status: TranslationStatus;
            let staleDays = 0;

            if (!found || found.lastModified === null) {
                status = 'missing';
            } else {
                // If source was modified after translation → stale
                staleDays = daysBetween(found.lastModified, src.lastModified);
                if (staleDays > 0) {
                    status = staleDays > 30 ? 'stale' : 'needs-review';
                } else {
                    status = 'up-to-date';
                }
            }

            statuses.push({
                sourceFile: src.path,
                locale,
                translationPath,
                status,
                sourceLastModified: src.lastModified,
                translationLastModified: found?.lastModified ?? null,
                staleDays,
            });
        }
    }

    return statuses;
}

// ---------------------------------------------------------------------------
// Public: string extraction for translation
// ---------------------------------------------------------------------------

/**
 * Extract all translatable prose strings from a Markdown source file.
 * Assigns each string a stable ID derived from the file path and section.
 * Skips code blocks, heading markup, table separators, and HTML comments.
 */
export function generateStringExport(
    sourceFile: string,
    sourceContent: string,
    sourceLocale: LocaleCode,
): StringExport {
    const lines = sourceContent.split('\n');
    const strings: TranslatableString[] = [];
    let inCode = false;
    let currentSection = 'intro';
    let sectionCounter: Record<string, number> = {};
    const fileSlug = slugify(sourceFile.replace(/\.md$/, '').split('/').pop() ?? sourceFile);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lno = i + 1;

        // Track code blocks
        if (line.trimStart().startsWith('```')) { inCode = !inCode; continue; }
        if (inCode) continue;

        // Track current section from headings
        const hMatch = line.match(/^#{1,4}\s+(.+?)(?:\s+\{#[\w-]+\})?$/);
        if (hMatch) {
            currentSection = slugify(hMatch[1]!);
            continue; // headings themselves are structure, not translated strings
        }

        // Skip empty, table separators, HTML comments, image-only lines
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^[|\s-]+$/.test(trimmed)) continue; // table separator row
        if (trimmed.startsWith('<!--')) continue;
        if (/^!\[/.test(trimmed) && !trimmed.includes(' ')) continue; // bare image line

        // Skip pure front-matter (YAML between ---)
        if (trimmed === '---') continue;

        // Extract meaningful prose and table cell content
        // For table rows, split cells
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            const cells = trimmed.split('|').map((c) => c.trim()).filter((c) => c.length > 3 && !/^[-:]+$/.test(c));
            for (const cell of cells) {
                const sectionKey = `${fileSlug}_${currentSection}`;
                sectionCounter[sectionKey] = (sectionCounter[sectionKey] ?? 0) + 1;
                const id = `${sectionKey}_t${String(sectionCounter[sectionKey]).padStart(3, '0')}`;
                strings.push({ id, sourceText: cell, section: currentSection, lineNumber: lno });
            }
            continue;
        }

        // Regular prose line
        const sectionKey = `${fileSlug}_${currentSection}`;
        sectionCounter[sectionKey] = (sectionCounter[sectionKey] ?? 0) + 1;
        const id = `${sectionKey}_s${String(sectionCounter[sectionKey]).padStart(3, '0')}`;
        strings.push({ id, sourceText: trimmed, section: currentSection, lineNumber: lno });
    }

    const jsonObj: Record<string, string> = {};
    for (const s of strings) jsonObj[s.id] = s.sourceText;

    const tableLines = [
        '| ID | Section | Line | Source Text |',
        '|----|---------|------|-------------|',
        ...strings.map((s) => `| \`${s.id}\` | ${s.section} | ${s.lineNumber} | ${s.sourceText.slice(0, 80).replace(/\|/g, '\\|')} |`),
    ];

    return {
        sourceLocale,
        sourceFile,
        strings,
        jsonExport: JSON.stringify(jsonObj, null, 2),
        markdownTable: tableLines.join('\n'),
    };
}

// ---------------------------------------------------------------------------
// Public: status report
// ---------------------------------------------------------------------------

/**
 * Generate a Markdown localisation status dashboard from computed statuses.
 */
export function buildLocalizationReport(
    manifest: LocalizationManifest,
    statuses: TranslationFileStatus[],
): LocalizationReport {
    const sourceFiles = [...new Set(statuses.map((s) => s.sourceFile))];
    const perLocale: LocalizationReport['summary']['perLocale'] = {};

    for (const locale of manifest.targetLocales) {
        const ls = statuses.filter((s) => s.locale === locale);
        perLocale[locale] = {
            upToDate: ls.filter((s) => s.status === 'up-to-date').length,
            stale: ls.filter((s) => s.status === 'stale').length,
            missing: ls.filter((s) => s.status === 'missing').length,
            needsReview: ls.filter((s) => s.status === 'needs-review').length,
        };
    }

    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push('# Localisation Status Report');
    lines.push(`\n_Generated: ${now} — source locale: \`${manifest.sourceLocale}\`_\n`);

    // Per-locale summary table
    lines.push('## Locale Summary\n');
    lines.push(`| Locale | ✅ Up-to-date | ⏰ Needs Review | 🔴 Stale (>30d) | ❌ Missing |`);
    lines.push(`|--------|-------------|----------------|----------------|-----------|`);
    for (const locale of manifest.targetLocales) {
        const t = perLocale[locale]!;
        lines.push(`| \`${locale}\` | ${t.upToDate} | ${t.needsReview} | ${t.stale} | ${t.missing} |`);
    }
    lines.push('');

    // Stale and missing files
    const urgent = statuses.filter((s) => s.status === 'stale' || s.status === 'missing');
    if (urgent.length > 0) {
        lines.push('## Files Needing Attention\n');
        lines.push('| File | Locale | Status | Days Behind |');
        lines.push('|------|--------|--------|-------------|');
        urgent
            .sort((a, b) => b.staleDays - a.staleDays)
            .slice(0, 30)
            .forEach((s) => {
                const badge = s.status === 'missing' ? '❌ Missing' : `🔴 Stale`;
                lines.push(`| \`${s.sourceFile}\` | \`${s.locale}\` | ${badge} | ${s.staleDays} |`);
            });
        lines.push('');
    }

    // Needs review
    const review = statuses.filter((s) => s.status === 'needs-review');
    if (review.length > 0) {
        lines.push('## Files Needing Review (1–30 days behind)\n');
        review.forEach((s) => lines.push(`- \`${s.sourceFile}\` → \`${s.locale}\` (${s.staleDays}d behind)`));
        lines.push('');
    }

    return {
        manifest,
        statuses,
        summary: { totalSourceFiles: sourceFiles.length, perLocale },
        markdownReport: lines.join('\n'),
    };
}

// ---------------------------------------------------------------------------
// Helper: derive source file info from git log lines
// ---------------------------------------------------------------------------

/**
 * Parse `git log --format="%ai -- %s" -- <file>` output into a date string.
 * Returns the ISO date of the most recent commit touching the file.
 */
export function parseGitLastModified(gitLogOutput: string): string | null {
    const firstLine = gitLogOutput.trim().split('\n')[0] ?? '';
    // Format: "2026-05-23 10:00:00 +0000 -- commit message"
    const match = firstLine.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1]! : null;
}
