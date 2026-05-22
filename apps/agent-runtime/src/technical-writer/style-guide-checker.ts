// ============================================================================
// STYLE GUIDE CHECKER
// Sprint 16 — Technical Writer Role
//
// Validates document text against configurable style guide rules.
// Rules are regex-based so any pattern can be enforced without hardcoding.
// Tenants override default rules via connector config.
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StyleGuideSeverity = 'error' | 'warning' | 'info';

export interface StyleGuideRule {
    /** Unique rule identifier (e.g. "no-passive-voice"). */
    id: string;
    /** Human-readable message shown in violation reports. */
    message: string;
    /**
     * Regex pattern to match against each line of the document.
     * Match = violation found on that line.
     */
    pattern: RegExp;
    severity: StyleGuideSeverity;
}

export interface StyleViolation {
    lineNumber: number;
    lineContent: string;
    ruleId: string;
    message: string;
    severity: StyleGuideSeverity;
}

export interface StyleViolationReport {
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
    violations: StyleViolation[];
    /** Markdown-formatted table for use in PR comments or Slack messages. */
    markdownTable: string;
}

// ---------------------------------------------------------------------------
// Default style guide rules
// ---------------------------------------------------------------------------

/**
 * Default rules applied when tenants have not provided custom rules.
 * Exported so they can be referenced in technical-writer-agent-profile.ts.
 */
export const DEFAULT_STYLE_GUIDE_RULES: StyleGuideRule[] = [
    {
        id: 'no-passive-voice',
        message: 'Avoid passive voice — prefer active constructions.',
        pattern: /\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/i,
        severity: 'warning',
    },
    {
        id: 'no-unclear-pronoun',
        message: 'Avoid unclear pronouns — specify the subject explicitly.',
        pattern: /\b(?:it is|this is|that is|they are|these are|those are)\b/i,
        severity: 'info',
    },
    {
        id: 'no-jargon-synergy',
        message: 'Avoid overused business jargon: "synergy".',
        pattern: /\bsynergy\b/i,
        severity: 'warning',
    },
    {
        id: 'no-jargon-leverage',
        message: 'Avoid overused business jargon: "leverage" (as a verb).',
        pattern: /\bleverag(?:e|ing|ed)\b/i,
        severity: 'info',
    },
    {
        id: 'no-very',
        message: 'Avoid weak qualifiers like "very" — use stronger, specific language.',
        pattern: /\bvery\s+\w/i,
        severity: 'info',
    },
    {
        id: 'sentence-length',
        message: 'Sentence is very long (>40 words) — consider splitting.',
        pattern: /(?:\w+\s){40,}/,
        severity: 'info',
    },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a document against a set of style guide rules.
 *
 * @param documentText  Full document content as a string.
 * @param rules         Array of StyleGuideRule. Defaults to DEFAULT_STYLE_GUIDE_RULES.
 *
 * @returns A StyleViolationReport with per-line violations and summary counts.
 */
export function checkAgainstStyleGuide(
    documentText: string,
    rules: StyleGuideRule[] = DEFAULT_STYLE_GUIDE_RULES,
): StyleViolationReport {
    const violations: StyleViolation[] = [];
    const lines = documentText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip Markdown code blocks and headings (pragmatic heuristic)
        if (line.trimStart().startsWith('```') || line.trimStart().startsWith('#')) continue;

        for (const rule of rules) {
            if (rule.pattern.test(line)) {
                violations.push({
                    lineNumber: i + 1,
                    lineContent: line.trim().slice(0, 120),
                    ruleId: rule.id,
                    message: rule.message,
                    severity: rule.severity,
                });
            }
        }
    }

    const errors = violations.filter((v) => v.severity === 'error').length;
    const warnings = violations.filter((v) => v.severity === 'warning').length;
    const infos = violations.filter((v) => v.severity === 'info').length;

    return {
        totalViolations: violations.length,
        errors,
        warnings,
        infos,
        violations,
        markdownTable: buildStyleViolationReport(violations),
    };
}

/**
 * Format a list of StyleViolation objects as a Markdown table.
 * Returns an empty string when the violations array is empty.
 */
export function buildStyleViolationReport(violations: StyleViolation[]): string {
    if (violations.length === 0) return '';

    const header = [
        '| Line | Severity | Rule | Message | Content |',
        '|------|----------|------|---------|---------|',
    ];

    const rows = violations.map(
        (v) =>
            `| ${v.lineNumber} | ${v.severity} | \`${v.ruleId}\` | ${v.message} | \`${v.lineContent.replace(/`/g, "'")}\` |`,
    );

    return [...header, ...rows].join('\n');
}
