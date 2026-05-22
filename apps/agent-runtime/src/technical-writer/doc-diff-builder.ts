// ============================================================================
// DOC DIFF BUILDER
// Sprint 16 — Technical Writer Role
//
// Parses a unified diff string and maps changed code symbols / function
// signatures to their corresponding documentation sections.
//
// Pure function — no connector calls, no LLM calls.
// The output DocSectionUpdate[] is passed to the agent's LLM planning loop
// as context input so it can decide which sections to update.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocSectionUpdate {
    /** The documentation section title that is affected. */
    sectionTitle: string;
    /** The documentation content that was accurate before the diff. */
    oldContent: string;
    /** Suggested replacement (placeholder — LLM fills this in). */
    suggestedNewContent: string;
    /** Human-readable reason for the update flag. */
    changeReason: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract symbol names from a diff hunk header or changed lines.
 * Recognises TypeScript / JavaScript / Python / Java / Go / C# patterns.
 */
function extractSymbolsFromDiffLine(line: string): string[] {
    const symbols: string[] = [];

    // TypeScript / JavaScript: export function foo, export const foo, export class Foo
    const tsExportMatch = line.match(/export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (tsExportMatch?.[1]) symbols.push(tsExportMatch[1]);

    // TypeScript / JavaScript: function foo(
    const tsFnMatch = line.match(/(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
    if (tsFnMatch?.[1]) symbols.push(tsFnMatch[1]);

    // Python: def foo(
    const pyFnMatch = line.match(/^\+?\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (pyFnMatch?.[1]) symbols.push(pyFnMatch[1]);

    // Java / C# / Go: visibility returnType methodName(
    const javaMatch = line.match(/(?:public|private|protected|internal|func)\s+\S+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (javaMatch?.[1]) symbols.push(javaMatch[1]);

    return [...new Set(symbols)];
}

/**
 * Find the documentation section title that most closely matches a symbol name.
 * Returns null when no section is a plausible match.
 */
function findMatchingSection(
    symbol: string,
    sectionTitles: string[],
): string | null {
    const lower = symbol.toLowerCase();
    // Exact match (case-insensitive)
    for (const title of sectionTitles) {
        if (title.toLowerCase().includes(lower)) return title;
    }
    // Partial match: camelCase decomposition
    const words = symbol.replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(/\s+/);
    for (const title of sectionTitles) {
        const titleLower = title.toLowerCase();
        if (words.some((w) => w.length > 3 && titleLower.includes(w))) {
            return title;
        }
    }
    return null;
}

/**
 * Parse a unified diff string into individual changed lines.
 * Returns only '+' or '-' lines (not context lines or headers).
 */
function parseChangedLines(diff: string): { added: string[]; removed: string[] } {
    const added: string[] = [];
    const removed: string[] = [];
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) added.push(line.slice(1));
        else if (line.startsWith('-')) removed.push(line.slice(1));
    }
    return { added, removed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff and identify documentation sections that need updating.
 *
 * @param diff                 A unified diff string (output of `git diff`).
 * @param existingDocSections  An array of existing documentation section titles.
 *                             These are used as the matching target.
 *
 * @returns An array of DocSectionUpdate records. Empty when the diff introduces
 *          no changes that map to known documentation sections.
 */
export function buildDocUpdateFromDiff(
    diff: string,
    existingDocSections: string[],
): DocSectionUpdate[] {
    if (!diff.trim()) return [];

    const { added, removed } = parseChangedLines(diff);
    const updates = new Map<string, DocSectionUpdate>();

    // Process added lines first
    for (const line of added) {
        const symbols = extractSymbolsFromDiffLine(line);
        for (const symbol of symbols) {
            const matchedSection = findMatchingSection(symbol, existingDocSections);
            if (!matchedSection) {
                const newSectionTitle = `${symbol} (new)`;
                if (!updates.has(newSectionTitle)) {
                    updates.set(newSectionTitle, {
                        sectionTitle: newSectionTitle,
                        oldContent: '',
                        suggestedNewContent: `<!-- TODO: Document ${symbol} -->`,
                        changeReason: `New export "${symbol}" added in diff — no existing documentation section found.`,
                    });
                }
                continue;
            }
            if (!updates.has(matchedSection)) {
                updates.set(matchedSection, {
                    sectionTitle: matchedSection,
                    oldContent: `<!-- Existing content for ${matchedSection} — fetched at write time -->`,
                    suggestedNewContent: `<!-- TODO: Update ${matchedSection} to reflect changes to ${symbol} -->`,
                    changeReason: `Symbol "${symbol}" changed in diff and is referenced in section "${matchedSection}".`,
                });
            }
        }
    }

    // Process removed lines — always update with removal-specific reason
    for (const line of removed) {
        const symbols = extractSymbolsFromDiffLine(line);
        for (const symbol of symbols) {
            const matchedSection = findMatchingSection(symbol, existingDocSections);
            if (matchedSection) {
                updates.set(matchedSection, {
                    sectionTitle: matchedSection,
                    oldContent: `<!-- Existing content for ${matchedSection} -->`,
                    suggestedNewContent: `<!-- TODO: Review or remove documentation for deleted symbol "${symbol}" -->`,
                    changeReason: `Symbol "${symbol}" was removed in diff — documentation section "${matchedSection}" may be stale.`,
                });
            }
        }
    }

    return [...updates.values()];
}
