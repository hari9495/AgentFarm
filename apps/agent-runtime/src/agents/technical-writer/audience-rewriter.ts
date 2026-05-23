// ============================================================================
// AUDIENCE REWRITER
// Technical Writer Role
//
// Analyses and adapts documentation for a target audience persona.
// Two modes:
//   'analyze'  — score how well a doc matches a persona; flag mismatches
//   'adapt'    — apply vocabulary substitutions + section filtering; flag
//                what still needs human rewriting
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudiencePersona = 'end-user' | 'developer' | 'admin';

export interface AudienceMismatch {
    lineNumber: number;
    lineContent: string;
    issue: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
}

export interface AudienceAnalysis {
    persona: AudiencePersona;
    /** 0–100. Higher = better audience match. */
    matchScore: number;
    matchLabel: string;
    mismatches: AudienceMismatch[];
    /** Sections that are inappropriate for the target persona. */
    inappropriateSections: string[];
    /** Sections that should be added for the target persona. */
    missingSections: string[];
    stats: {
        totalLines: number;
        proseLines: number;
        codeBlockLines: number;
        avgSyllablesPerWord: number;
        technicalTermCount: number;
        assumedKnowledgeCount: number;
    };
    markdownReport: string;
}

export interface AudienceAdaptation {
    persona: AudiencePersona;
    original: string;
    adapted: string;
    /** Lines that were changed by vocabulary substitution. */
    substitutionCount: number;
    /** Lines/sections flagged as needing manual rewriting (beyond what rules can fix). */
    manualRewriteNeeded: AudienceMismatch[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Vocabulary substitution maps
// ---------------------------------------------------------------------------

/** Terms to simplify when targeting end-users. */
export const END_USER_VOCABULARY_MAP: Record<string, string> = {
    'instantiate': 'create',
    'invoke': 'run',
    'invoke the': 'run the',
    'invokes': 'runs',
    'invoked': 'ran',
    'parameter': 'option',
    'parameters': 'options',
    'return value': 'result',
    'returns a': 'gives you a',
    'boolean': 'true/false value',
    'integer': 'number',
    'string value': 'text value',
    'null value': 'empty value',
    'undefined': 'not set',
    'deprecated': 'no longer supported',
    'legacy': 'older',
    'endpoint': 'URL',
    'payload': 'data',
    'asynchronous': 'runs in the background',
    'synchronous': 'runs immediately',
    'authenticate': 'log in',
    'authentication': 'login',
    'authorize': 'grant access',
    'authorization': 'access permission',
    'serialize': 'convert to text',
    'deserialize': 'read from text',
    'parse': 'read',
    'schema': 'format',
    'instantiation': 'creation',
    'propagate': 'pass through',
    'iterate': 'go through each',
    'iteration': 'loop',
    'repository': 'project folder',
    'commit': 'save your changes',
    'merge': 'combine changes',
    'middleware': 'background process',
    'runtime': 'while the app is running',
    'compile': 'build',
    'compiled': 'built',
    'exception': 'error',
    'throw an exception': 'show an error',
    'stack trace': 'error details',
    'verbose': 'detailed',
    'stdout': 'terminal output',
    'stderr': 'error output',
    'stdin': 'typed input',
    'CLI': 'command line',
    'daemon': 'background service',
    'flag': 'option',
    'toggle': 'turn on or off',
};

/** Terms to expand when targeting admin users (add context, not simplify). */
export const ADMIN_VOCABULARY_MAP: Record<string, string> = {
    'run the command': 'run the following command as an administrator',
    'set the value': 'set the configuration value',
    'the config': 'the configuration file',
};

// ---------------------------------------------------------------------------
// Technical term lists
// ---------------------------------------------------------------------------

const DEVELOPER_TERMS = new Set([
    'async', 'await', 'promise', 'callback', 'closure', 'prototype',
    'heap', 'stack', 'garbage collection', 'thread', 'mutex', 'semaphore',
    'recursion', 'memoize', 'debounce', 'throttle', 'polyfill', 'transpile',
    'webpack', 'babel', 'npm', 'yarn', 'pnpm', 'monorepo', 'linter',
    'interface', 'generic', 'enum', 'tuple', 'union type', 'intersection',
    'rest operator', 'spread operator', 'destructuring', 'currying',
    'idempotent', 'immutable', 'side effect', 'pure function',
]);

const ASSUMED_KNOWLEDGE_PHRASES = [
    'as you know', 'obviously', 'of course', 'it goes without saying',
    'trivially', 'simply', 'just run', 'just add', 'just set',
    'you should already', 'you already know', 'familiar with',
    'as discussed', 'as mentioned', 'as noted earlier',
];

// ---------------------------------------------------------------------------
// Expected sections per persona
// ---------------------------------------------------------------------------

const EXPECTED_SECTIONS: Record<AudiencePersona, string[]> = {
    'end-user': ['overview', 'getting started', 'how to', 'troubleshooting', 'faq'],
    'developer': ['overview', 'installation', 'api reference', 'examples', 'authentication', 'error codes'],
    'admin': ['overview', 'prerequisites', 'installation', 'configuration', 'security', 'monitoring', 'troubleshooting'],
};

const INAPPROPRIATE_SECTION_SIGNALS: Record<AudiencePersona, string[]> = {
    'end-user': ['api reference', 'sdk', 'source code', 'build from source', 'compile', 'cli reference'],
    'developer': [], // developers can read everything
    'admin': ['billing', 'pricing', 'sales'],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function countSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length <= 3) return 1;
    const vowelGroups = cleaned.replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

function avgSyllablesForLine(line: string): number {
    const words = line.match(/\b[a-zA-Z'-]+\b/g) ?? [];
    if (words.length === 0) return 1;
    return words.reduce((s, w) => s + countSyllables(w), 0) / words.length;
}

function extractHeadings(text: string): string[] {
    return text.split('\n')
        .filter((l) => /^#{1,4}\s/.test(l))
        .map((l) => l.replace(/^#{1,4}\s+/, '').toLowerCase().trim());
}

function scoreMatchLabel(score: number): string {
    if (score >= 85) return 'Excellent match';
    if (score >= 70) return 'Good match';
    if (score >= 50) return 'Partial match — review flagged items';
    if (score >= 30) return 'Poor match — significant rewriting needed';
    return 'Wrong audience — major restructure required';
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

function analyzeDoc(text: string, persona: AudiencePersona): AudienceAnalysis {
    const lines = text.split('\n');
    const mismatches: AudienceMismatch[] = [];
    let inCode = false;
    let codeLines = 0;
    let proseLines = 0;
    let totalSyllables = 0;
    let totalWords = 0;
    let technicalTermCount = 0;
    let assumedKnowledgeCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lno = i + 1;

        if (line.trimStart().startsWith('```')) { inCode = !inCode; continue; }
        if (inCode) { codeLines++; continue; }
        if (line.startsWith('#') || line.trim() === '') continue;

        proseLines++;
        const lower = line.toLowerCase();
        const words = line.match(/\b[a-zA-Z'-]+\b/g) ?? [];
        totalWords += words.length;
        totalSyllables += words.reduce((s, w) => s + countSyllables(w), 0);

        // Check for assumed-knowledge phrases (bad for end-users, OK for developers)
        if (persona !== 'developer') {
            for (const phrase of ASSUMED_KNOWLEDGE_PHRASES) {
                if (lower.includes(phrase)) {
                    assumedKnowledgeCount++;
                    mismatches.push({
                        lineNumber: lno,
                        lineContent: line.trim().slice(0, 100),
                        issue: `Assumes prior knowledge: "${phrase}"`,
                        suggestion: 'Remove the assumption or add a link to the prerequisite concept.',
                        severity: 'warning',
                    });
                }
            }
        }

        // Technical term density — bad for end-users
        if (persona === 'end-user') {
            for (const term of DEVELOPER_TERMS) {
                if (lower.includes(term)) {
                    technicalTermCount++;
                    mismatches.push({
                        lineNumber: lno,
                        lineContent: line.trim().slice(0, 100),
                        issue: `Technical term "${term}" may confuse end-users.`,
                        suggestion: `Replace or explain "${term}" in plain language.`,
                        severity: 'info',
                    });
                    break; // one flag per line
                }
            }

            // Long average syllables = complex prose
            if (avgSyllablesForLine(line) > 2.2 && words.length > 6) {
                mismatches.push({
                    lineNumber: lno,
                    lineContent: line.trim().slice(0, 100),
                    issue: 'Prose is complex for an end-user audience.',
                    suggestion: 'Simplify vocabulary; aim for ≤2 syllables per word on average.',
                    severity: 'info',
                });
            }
        }

        // Vocabulary map violations
        const vocabMap = persona === 'end-user' ? END_USER_VOCABULARY_MAP : {};
        for (const [term] of Object.entries(vocabMap)) {
            if (lower.includes(term)) {
                mismatches.push({
                    lineNumber: lno,
                    lineContent: line.trim().slice(0, 100),
                    issue: `Term "${term}" has a simpler equivalent for this audience.`,
                    suggestion: `Consider replacing "${term}" with "${vocabMap[term]}"`,
                    severity: 'info',
                });
            }
        }
    }

    const headings = extractHeadings(text);
    const expectedSects = EXPECTED_SECTIONS[persona];
    const inappropriateSignals = INAPPROPRIATE_SECTION_SIGNALS[persona];

    const missingSections = expectedSects.filter(
        (s) => !headings.some((h) => h.includes(s)),
    );
    const inappropriateSections = headings.filter(
        (h) => inappropriateSignals.some((sig) => h.includes(sig)),
    );

    const avgSyl = totalWords > 0 ? totalSyllables / totalWords : 1;

    // Score: start at 100, subtract for each problem
    let score = 100;
    score -= Math.min(30, mismatches.filter((m) => m.severity === 'error').length * 10);
    score -= Math.min(20, mismatches.filter((m) => m.severity === 'warning').length * 3);
    score -= Math.min(15, mismatches.filter((m) => m.severity === 'info').length * 1);
    score -= missingSections.length * 5;
    score -= inappropriateSections.length * 8;
    if (persona === 'end-user' && avgSyl > 2.2) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const report = buildAnalysisReport(persona, score, mismatches, missingSections, inappropriateSections, { totalLines: lines.length, proseLines, codeBlockLines: codeLines, avgSyllablesPerWord: avgSyl, technicalTermCount, assumedKnowledgeCount });

    return {
        persona,
        matchScore: Math.round(score),
        matchLabel: scoreMatchLabel(score),
        mismatches,
        inappropriateSections,
        missingSections,
        stats: { totalLines: lines.length, proseLines, codeBlockLines: codeLines, avgSyllablesPerWord: Math.round(avgSyl * 100) / 100, technicalTermCount, assumedKnowledgeCount },
        markdownReport: report,
    };
}

function buildAnalysisReport(
    persona: AudiencePersona,
    score: number,
    mismatches: AudienceMismatch[],
    missingSections: string[],
    inappropriateSections: string[],
    stats: AudienceAnalysis['stats'],
): string {
    const lines: string[] = [];
    lines.push(`# Audience Analysis Report — Target: ${persona}`);
    lines.push('');
    lines.push(`**Match score:** ${score}/100 — _${scoreMatchLabel(score)}_\n`);
    lines.push('## Stats\n');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Prose lines | ${stats.proseLines} |`);
    lines.push(`| Code block lines | ${stats.codeBlockLines} |`);
    lines.push(`| Avg syllables/word | ${stats.avgSyllablesPerWord} |`);
    lines.push(`| Technical terms found | ${stats.technicalTermCount} |`);
    lines.push(`| Assumed-knowledge phrases | ${stats.assumedKnowledgeCount} |`);
    lines.push('');

    if (missingSections.length > 0) {
        lines.push('## Missing Sections\n');
        missingSections.forEach((s) => lines.push(`- ❌ \`${s}\` section not found`));
        lines.push('');
    }
    if (inappropriateSections.length > 0) {
        lines.push('## Sections Inappropriate for This Audience\n');
        inappropriateSections.forEach((s) => lines.push(`- ⚠️ \`${s}\``));
        lines.push('');
    }
    if (mismatches.length > 0) {
        lines.push(`## Flagged Lines (${mismatches.length})\n`);
        lines.push('| Line | Severity | Issue | Suggestion |');
        lines.push('|------|----------|-------|------------|');
        for (const m of mismatches.slice(0, 50)) {
            lines.push(`| ${m.lineNumber} | ${m.severity} | ${m.issue} | ${m.suggestion} |`);
        }
        if (mismatches.length > 50) lines.push(`\n_... and ${mismatches.length - 50} more._`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Adaptation (apply substitutions)
// ---------------------------------------------------------------------------

function applyVocabularySubstitutions(
    text: string,
    vocabMap: Record<string, string>,
): { adapted: string; count: number } {
    let adapted = text;
    let count = 0;
    // Sort by length desc so longer phrases are replaced before substrings
    const entries = Object.entries(vocabMap).sort((a, b) => b[0].length - a[0].length);
    for (const [term, replacement] of entries) {
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const before = adapted;
        adapted = adapted.replace(re, replacement);
        if (adapted !== before) count++;
    }
    return { adapted, count };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse how well a document matches a target audience persona.
 * Returns a detailed report with mismatch flags and a 0–100 match score.
 */
export function analyzeAudienceMatch(
    documentText: string,
    targetPersona: AudiencePersona,
): AudienceAnalysis {
    return analyzeDoc(documentText, targetPersona);
}

/**
 * Apply vocabulary substitutions and flag sections that need manual rewriting.
 * Returns both the adapted text and a rewrite report.
 */
export function adaptForAudience(
    documentText: string,
    targetPersona: AudiencePersona,
    customVocabMap: Record<string, string> = {},
): AudienceAdaptation {
    const vocabMap: Record<string, string> = targetPersona === 'end-user'
        ? { ...END_USER_VOCABULARY_MAP, ...customVocabMap }
        : targetPersona === 'admin'
            ? { ...ADMIN_VOCABULARY_MAP, ...customVocabMap }
            : { ...customVocabMap };

    const { adapted, count } = applyVocabularySubstitutions(documentText, vocabMap);
    const analysis = analyzeDoc(adapted, targetPersona);

    const reportLines = [
        `# Audience Adaptation Report — Target: ${targetPersona}`,
        '',
        `**Vocabulary substitutions applied:** ${count}`,
        `**Post-adaptation match score:** ${analysis.matchScore}/100 — _${analysis.matchLabel}_`,
        '',
        '## What Was Changed Automatically\n',
        count > 0
            ? `${count} term(s) were substituted using the ${targetPersona} vocabulary map.`
            : '_No automatic substitutions were applicable._',
        '',
        '## What Still Needs Manual Rewriting\n',
        analysis.mismatches.length > 0
            ? analysis.markdownReport
            : '_No further changes flagged — review the adapted content for tone and flow._',
    ];

    return {
        persona: targetPersona,
        original: documentText,
        adapted,
        substitutionCount: count,
        manualRewriteNeeded: analysis.mismatches,
        markdownReport: reportLines.join('\n'),
    };
}

/**
 * Compare a document against all three personas at once.
 * Useful for deciding which audience a doc is best suited to.
 */
export function compareAudiences(documentText: string): Record<AudiencePersona, AudienceAnalysis> {
    return {
        'end-user': analyzeDoc(documentText, 'end-user'),
        developer: analyzeDoc(documentText, 'developer'),
        admin: analyzeDoc(documentText, 'admin'),
    };
}
