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
    /** Optional replacement suggestion shown alongside the violation. */
    suggestion?: string;
}

export interface StyleViolation {
    lineNumber: number;
    lineContent: string;
    ruleId: string;
    message: string;
    severity: StyleGuideSeverity;
    suggestion?: string;
}

export interface ReadabilityScore {
    /** Flesch Reading Ease score (0–100). Higher = easier to read. */
    fleschReadingEase: number;
    /** Approximate Flesch-Kincaid grade level (US school grade). */
    fleschKincaidGrade: number;
    /** Average words per sentence across the document. */
    avgWordsPerSentence: number;
    /** Average syllables per word. */
    avgSyllablesPerWord: number;
    /** Plain-English label: "Very Easy" | "Easy" | "Fairly Easy" | "Standard" | "Fairly Difficult" | "Difficult" | "Very Difficult" */
    label: string;
}

export interface StyleViolationReport {
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
    violations: StyleViolation[];
    /** Markdown-formatted table for use in PR comments or Slack messages. */
    markdownTable: string;
    /** Readability score for the document (computed separately from rule violations). */
    readability?: ReadabilityScore;
}

// ---------------------------------------------------------------------------
// Passive-voice rules
// ---------------------------------------------------------------------------

const PASSIVE_VOICE_RULES: StyleGuideRule[] = [
    {
        id: 'no-passive-voice',
        message: 'Avoid passive voice — prefer active constructions.',
        pattern: /\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/i,
        severity: 'warning',
        suggestion: 'Rewrite the sentence so the subject performs the action.',
    },
];

// ---------------------------------------------------------------------------
// Jargon rules — extended set
// ---------------------------------------------------------------------------

const JARGON_RULES: StyleGuideRule[] = [
    {
        id: 'no-jargon-synergy',
        message: 'Avoid overused business jargon: "synergy".',
        pattern: /\bsynerg(?:y|ies|ize|izing)\b/i,
        severity: 'warning',
        suggestion: 'Be specific about the benefit or combined effect.',
    },
    {
        id: 'no-jargon-leverage',
        message: 'Avoid jargon: "leverage" used as a verb.',
        pattern: /\bleverag(?:e|es|ing|ed)\b/i,
        severity: 'warning',
        suggestion: 'Use "use" or "take advantage of".',
    },
    {
        id: 'no-jargon-utilize',
        message: 'Avoid "utilize" — use "use" instead.',
        pattern: /\butiliz(?:e|es|ing|ed)\b/i,
        severity: 'info',
        suggestion: 'Replace with "use".',
    },
    {
        id: 'no-jargon-robust',
        message: 'Avoid vague claim "robust" — describe the specific reliability property.',
        pattern: /\brobust\b/i,
        severity: 'info',
        suggestion: 'Specify the reliability property (e.g., "handles up to 10,000 concurrent requests").',
    },
    {
        id: 'no-jargon-seamless',
        message: 'Avoid "seamless" — describe the actual user experience.',
        pattern: /\bseamless(?:ly)?\b/i,
        severity: 'info',
        suggestion: 'Describe what the user actually experiences (e.g., "without reloading the page").',
    },
    {
        id: 'no-jargon-paradigm-shift',
        message: 'Avoid "paradigm shift" — describe the specific change.',
        pattern: /\bparadigm\s+shift\b/i,
        severity: 'info',
        suggestion: 'Describe exactly what is changing and how.',
    },
    {
        id: 'no-jargon-holistic',
        message: 'Avoid "holistic" — be specific about scope.',
        pattern: /\bholist(?:ic|ically)\b/i,
        severity: 'info',
        suggestion: 'Specify what aspects are covered.',
    },
    {
        id: 'no-jargon-aforementioned',
        message: 'Avoid "aforementioned" — use "the above" or refer explicitly.',
        pattern: /\baforementioned\b/i,
        severity: 'info',
        suggestion: 'Replace with a direct reference, e.g., "the option described above".',
    },
    {
        id: 'no-jargon-best-in-class',
        message: 'Avoid unsubstantiated superlatives like "best-in-class".',
        pattern: /\bbest.in.class\b/i,
        severity: 'warning',
        suggestion: 'Use a measurable, verifiable claim instead.',
    },
    {
        id: 'no-jargon-world-class',
        message: 'Avoid unsubstantiated superlatives like "world-class".',
        pattern: /\bworld.class\b/i,
        severity: 'warning',
        suggestion: 'Use a measurable, verifiable claim instead.',
    },
    {
        id: 'no-jargon-cutting-edge',
        message: 'Avoid "cutting-edge" — describe the specific technology or advantage.',
        pattern: /\bcutting.edge\b/i,
        severity: 'info',
        suggestion: 'Describe the technology or capability specifically.',
    },
    {
        id: 'no-jargon-game-changer',
        message: 'Avoid "game-changer" — describe the specific impact.',
        pattern: /\bgame.changer?\b/i,
        severity: 'info',
        suggestion: 'Describe the specific impact or improvement.',
    },
    {
        id: 'no-weak-qualifier',
        message: 'Avoid weak qualifiers like "very" — use stronger, specific language.',
        pattern: /\bvery\s+\w/i,
        severity: 'info',
        suggestion: 'Replace "very X" with a more precise adjective (e.g., "very fast" → "sub-millisecond").',
    },
    {
        id: 'no-weak-qualifier-quite',
        message: 'Avoid weak qualifier "quite" — use precise language.',
        pattern: /\bquite\s+\w/i,
        severity: 'info',
        suggestion: 'Remove "quite" or replace with a precise descriptor.',
    },
    {
        id: 'no-weak-qualifier-rather',
        message: 'Avoid weak qualifier "rather" — use precise language.',
        pattern: /\brather\s+\w/i,
        severity: 'info',
        suggestion: 'Remove "rather" or replace with a precise descriptor.',
    },
];

// ---------------------------------------------------------------------------
// Inclusive language rules
// ---------------------------------------------------------------------------

export const INCLUSIVE_LANGUAGE_RULES: StyleGuideRule[] = [
    {
        id: 'inclusive-no-blacklist',
        message: 'Replace "blacklist" with "denylist" or "blocklist".',
        pattern: /\bblacklist(?:ed|ing|s)?\b/i,
        severity: 'error',
        suggestion: 'Use "denylist" or "blocklist".',
    },
    {
        id: 'inclusive-no-whitelist',
        message: 'Replace "whitelist" with "allowlist".',
        pattern: /\bwhitelist(?:ed|ing|s)?\b/i,
        severity: 'error',
        suggestion: 'Use "allowlist".',
    },
    {
        id: 'inclusive-no-master-slave',
        message: 'Replace "master/slave" architecture terms with "primary/replica" or "leader/follower".',
        pattern: /\b(?:master[\s/-]slave|slave[\s/-]master)\b/i,
        severity: 'error',
        suggestion: 'Use "primary/replica" or "leader/follower".',
    },
    {
        id: 'inclusive-no-master-branch',
        message: 'Replace "master branch" with "main branch".',
        pattern: /\bmaster\s+branch\b/i,
        severity: 'warning',
        suggestion: 'Use "main branch".',
    },
    {
        id: 'inclusive-no-sanity-check',
        message: 'Replace "sanity check" with "quick check" or "validity check".',
        pattern: /\bsanity[\s-]check\b/i,
        severity: 'info',
        suggestion: 'Use "quick check", "validity check", or "smoke test".',
    },
    {
        id: 'inclusive-no-dummy',
        message: 'Avoid "dummy" for placeholder data — use "placeholder", "sample", or "stub".',
        pattern: /\bdummy\s+(?:data|value|variable|record|entry)\b/i,
        severity: 'info',
        suggestion: 'Use "placeholder", "sample", or "stub".',
    },
    {
        id: 'inclusive-no-native',
        message: 'Avoid using "native" to mean built-in — use "built-in" or "built into the platform".',
        pattern: /\bnative\s+(?:support|feature|capability|integration)\b/i,
        severity: 'info',
        suggestion: 'Use "built-in" or "natively supported" with context.',
    },
];

// ---------------------------------------------------------------------------
// Number formatting rules
// ---------------------------------------------------------------------------

export const NUMBER_FORMATTING_RULES: StyleGuideRule[] = [
    {
        id: 'number-spell-out-small',
        message: 'Numbers one through nine should be spelled out in prose text.',
        // Match isolated digit 1-9 preceded by a word boundary, not inside code/URL patterns
        pattern: /(?<![`/\\#])\b[1-9]\b(?!\s*[.)\]},;:`]|\s*\w*\d)/,
        severity: 'info',
        suggestion: 'Spell out single-digit numbers in sentences (e.g., "three steps" not "3 steps").',
    },
    {
        id: 'number-consistent-percentage',
        message: 'Use the % symbol with numerals, not "percent" with digits.',
        pattern: /\b\d+\s+percent\b/i,
        severity: 'info',
        suggestion: 'Write "50%" not "50 percent".',
    },
];

// ---------------------------------------------------------------------------
// Structure and formatting rules
// ---------------------------------------------------------------------------

const STRUCTURE_RULES: StyleGuideRule[] = [
    {
        id: 'sentence-length',
        message: 'Sentence is very long (>40 words) — consider splitting.',
        pattern: /(?:\w+\s){40,}/,
        severity: 'info',
        suggestion: 'Break this into two or more shorter sentences.',
    },
    {
        id: 'double-space',
        message: 'Double space detected — use a single space between words.',
        pattern: /\w {2,}\w/,
        severity: 'warning',
        suggestion: 'Replace double (or more) spaces with a single space.',
    },
    {
        id: 'no-unclear-pronoun',
        message: 'Vague pronoun opener — specify the subject explicitly.',
        pattern: /^(?:It is|This is|That is|They are|These are|Those are)\b/i,
        severity: 'info',
        suggestion: 'Start with a specific noun rather than a pronoun.',
    },
    {
        id: 'trailing-whitespace',
        message: 'Line has trailing whitespace.',
        pattern: /[ \t]+$/,
        severity: 'info',
        suggestion: 'Remove trailing spaces or tabs.',
    },
];

// ---------------------------------------------------------------------------
// Acronym detection helpers (stateful across lines — handled in checkAgainstStyleGuide)
// ---------------------------------------------------------------------------

const ACRONYM_RE = /\b([A-Z]{2,})\b/g;

// ---------------------------------------------------------------------------
// Default style guide rules
// ---------------------------------------------------------------------------

/**
 * Default rules applied when tenants have not provided custom rules.
 * Exported so they can be referenced in technical-writer-agent-profile.ts.
 */
export const DEFAULT_STYLE_GUIDE_RULES: StyleGuideRule[] = [
    ...PASSIVE_VOICE_RULES,
    ...JARGON_RULES,
    ...STRUCTURE_RULES,
];

// ---------------------------------------------------------------------------
// Predefined style guide profiles
// ---------------------------------------------------------------------------

/**
 * Microsoft Writing Style Guide-aligned rules.
 * Adds inclusive language enforcement and number formatting on top of defaults.
 */
export const MICROSOFT_STYLE_RULES: StyleGuideRule[] = [
    ...DEFAULT_STYLE_GUIDE_RULES,
    ...INCLUSIVE_LANGUAGE_RULES,
    ...NUMBER_FORMATTING_RULES,
    {
        id: 'ms-contractions-ok',
        message: 'Microsoft style permits contractions — no action needed.',
        // Intentionally never matches — placeholder so the profile is distinguishable
        pattern: /\bnever-match-xyzzy\b/,
        severity: 'info',
    },
];

/**
 * Google Developer Documentation Style Guide-aligned rules.
 * Stricter on passive voice and jargon; enforces inclusive language.
 */
export const GOOGLE_STYLE_RULES: StyleGuideRule[] = [
    ...PASSIVE_VOICE_RULES.map((r) => ({ ...r, severity: 'error' as StyleGuideSeverity })),
    ...JARGON_RULES,
    ...INCLUSIVE_LANGUAGE_RULES,
    ...NUMBER_FORMATTING_RULES,
    {
        id: 'google-second-person',
        message: 'Prefer second-person ("you") over first-person plural ("we").',
        pattern: /\bwe\s+(?:recommend|suggest|advise|encourage|believe)\b/i,
        severity: 'warning',
        suggestion: 'Rewrite using "you" or imperative mood (e.g., "To X, do Y").',
    },
    {
        id: 'google-present-tense',
        message: 'Prefer present tense over future tense in procedure steps.',
        pattern: /\bwill\s+(?:be\s+)?(?:display|show|open|close|create|delete|update|return|appear|redirect|navigate)\b/i,
        severity: 'info',
        suggestion: 'Use present tense: "the page opens" not "the page will open".',
    },
];

// ---------------------------------------------------------------------------
// Readability score
// ---------------------------------------------------------------------------

/** Approximate syllable count for a word. */
function countSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length <= 3) return 1;
    // Remove silent trailing e, count vowel groups
    const withoutTrailingE = cleaned.replace(/e$/, '');
    const vowelGroups = withoutTrailingE.match(/[aeiouy]+/g);
    return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

/**
 * Compute a Flesch Reading Ease score and Flesch-Kincaid grade level.
 * Skips Markdown code blocks and heading lines.
 */
export function computeReadabilityScore(documentText: string): ReadabilityScore {
    const lines = documentText.split('\n');
    const proseLines: string[] = [];
    let inCode = false;

    for (const line of lines) {
        if (line.trimStart().startsWith('```')) { inCode = !inCode; continue; }
        if (inCode) continue;
        if (line.startsWith('#') || line.trimStart().startsWith('|') || line.trim() === '') continue;
        proseLines.push(line);
    }

    const prose = proseLines.join(' ');
    const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().split(/\s+/).length >= 3);
    const words = prose.match(/\b[a-zA-Z'-]+\b/g) ?? [];

    if (sentences.length === 0 || words.length === 0) {
        return { fleschReadingEase: 100, fleschKincaidGrade: 0, avgWordsPerSentence: 0, avgSyllablesPerWord: 1, label: 'Very Easy' };
    }

    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / words.length;

    // Flesch Reading Ease
    const fleschReadingEase = Math.max(0, Math.min(100,
        206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord),
    ));

    // Flesch-Kincaid Grade Level
    const fleschKincaidGrade = Math.max(0,
        (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59,
    );

    let label: string;
    if (fleschReadingEase >= 90) label = 'Very Easy';
    else if (fleschReadingEase >= 80) label = 'Easy';
    else if (fleschReadingEase >= 70) label = 'Fairly Easy';
    else if (fleschReadingEase >= 60) label = 'Standard';
    else if (fleschReadingEase >= 50) label = 'Fairly Difficult';
    else if (fleschReadingEase >= 30) label = 'Difficult';
    else label = 'Very Difficult';

    return {
        fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
        fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
        label,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a document against a set of style guide rules.
 *
 * @param documentText  Full document content as a string.
 * @param rules         Array of StyleGuideRule. Defaults to DEFAULT_STYLE_GUIDE_RULES.
 * @param includeReadability  Whether to compute and attach a readability score (default true).
 *
 * @returns A StyleViolationReport with per-line violations, summary counts, and readability score.
 */
export function checkAgainstStyleGuide(
    documentText: string,
    rules: StyleGuideRule[] = DEFAULT_STYLE_GUIDE_RULES,
    includeReadability = true,
): StyleViolationReport {
    const violations: StyleViolation[] = [];
    const lines = documentText.split('\n');

    // Tracks acronyms seen so far for undefined-acronym detection
    const definedAcronyms = new Set<string>();
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';

        // Track code fences
        if (line.trimStart().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
        if (inCodeBlock) continue;

        // Skip headings
        if (line.trimStart().startsWith('#')) {
            // Collect any acronyms defined in parentheses within headings
            const defMatch = line.match(/\(([A-Z]{2,})\)/g);
            if (defMatch) defMatch.forEach((m) => definedAcronyms.add(m.slice(1, -1)));
            continue;
        }

        // Collect acronym definitions: "Application Programming Interface (API)"
        const defMatches = line.matchAll(/\b[A-Za-z\s]{3,}\s+\(([A-Z]{2,})\)/g);
        for (const m of defMatches) definedAcronyms.add(m[1]!);

        for (const rule of rules) {
            // Reset lastIndex for global regexes
            rule.pattern.lastIndex = 0;
            if (rule.pattern.test(line)) {
                violations.push({
                    lineNumber: i + 1,
                    lineContent: line.trim().slice(0, 120),
                    ruleId: rule.id,
                    message: rule.message,
                    severity: rule.severity,
                    suggestion: rule.suggestion,
                });
            }
        }

        // Undefined acronym check (not configurable as a regex rule — needs state)
        ACRONYM_RE.lastIndex = 0;
        let acMatch: RegExpExecArray | null;
        while ((acMatch = ACRONYM_RE.exec(line)) !== null) {
            const acronym = acMatch[1]!;
            // Skip single-letter, very common, or already defined acronyms
            if (acronym.length < 2 || COMMON_ACRONYMS.has(acronym) || definedAcronyms.has(acronym)) continue;
            definedAcronyms.add(acronym); // flag once, then consider "defined"
            violations.push({
                lineNumber: i + 1,
                lineContent: line.trim().slice(0, 120),
                ruleId: 'undefined-acronym',
                message: `Acronym "${acronym}" used without a prior definition.`,
                severity: 'warning',
                suggestion: `Spell out "${acronym}" on first use: "Full Name (${acronym})", then use the abbreviation.`,
            });
        }
    }

    const errors = violations.filter((v) => v.severity === 'error').length;
    const warnings = violations.filter((v) => v.severity === 'warning').length;
    const infos = violations.filter((v) => v.severity === 'info').length;

    const report: StyleViolationReport = {
        totalViolations: violations.length,
        errors,
        warnings,
        infos,
        violations,
        markdownTable: buildStyleViolationReport(violations),
    };

    if (includeReadability) {
        report.readability = computeReadabilityScore(documentText);
    }

    return report;
}

/**
 * Well-known acronyms that do not require definition on first use.
 * Extend this set for domain-specific terms via tenant config.
 */
export const COMMON_ACRONYMS = new Set([
    'API', 'URL', 'URI', 'HTTP', 'HTTPS', 'HTML', 'CSS', 'JS', 'TS',
    'JSON', 'XML', 'YAML', 'CSV', 'SQL', 'UI', 'UX', 'CLI', 'GUI',
    'SDK', 'IDE', 'CI', 'CD', 'PR', 'FAQ', 'TBD', 'TBA', 'N/A',
    'UUID', 'REST', 'CRUD', 'JWT', 'OAuth', 'SSO', 'SAML', 'LDAP',
    'PDF', 'PNG', 'SVG', 'GIF', 'JPG', 'JPEG', 'AWS', 'GCP', 'SLA',
    'ISO', 'UTC', 'GMT', 'USA', 'EU', 'IP', 'DNS', 'SSL', 'TLS',
    'EOF', 'EOL', 'OS', 'RAM', 'CPU', 'GPU', 'I/O', 'KB', 'MB', 'GB',
]);

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
