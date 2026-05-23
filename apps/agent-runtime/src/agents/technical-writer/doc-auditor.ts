// ============================================================================
// DOC AUDITOR
// Technical Writer Role
//
// Full documentation lifecycle audit:
//   - Staleness detection (doc last-modified vs. related code changes)
//   - Feature coverage gaps (features without docs)
//   - Structure completeness (required sections present?)
//   - Broken internal links
//   - Quality signals (stubs, placeholder text, no code examples)
//   - Per-file health score + overall score
//   - Prioritised action list
//
// Caller passes pre-read doc content and optional git log / feature data.
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditDocFile {
    /** Relative path within the doc tree. */
    path: string;
    content: string;
    /** ISO date string of last modification (from git log or filesystem mtime). */
    lastModified?: string;
}

export interface CodeChangeRecord {
    /** Path of the changed source file. */
    filePath: string;
    /** ISO date string of the most recent change. */
    lastChanged: string;
}

export interface DocAuditOptions {
    /**
     * Features that should have corresponding documentation.
     * Each entry is a feature name string (matched loosely against doc titles and headings).
     */
    featureList?: string[];
    /**
     * Section names every doc must contain.
     * Defaults to REQUIRED_SECTIONS below.
     */
    requiredSections?: string[];
    /**
     * If a doc has not been modified in this many days, flag as stale.
     * Default: 180 days.
     */
    stalenessThresholdDays?: number;
    /**
     * If code related to a doc was changed more recently than the doc, flag as potentially outdated.
     * Pass code change records keyed by source file path.
     */
    codeChanges?: CodeChangeRecord[];
}

export interface DocFileAuditResult {
    path: string;
    /** 0–100 health score for this individual file. */
    healthScore: number;
    issues: DocAuditIssue[];
    staleDays: number;
    wordCount: number;
    hasCodeExample: boolean;
    hasPlaceholderText: boolean;
    missingSections: string[];
    brokenLinks: string[];
    /** Feature names this doc covers (matched from headings). */
    coversFeatures: string[];
}

export interface DocAuditIssue {
    type:
        | 'stale'
        | 'code-changed'
        | 'stub'
        | 'missing-section'
        | 'broken-link'
        | 'placeholder-text'
        | 'no-code-example'
        | 'no-title'
        | 'coverage-gap';
    severity: 'error' | 'warning' | 'info';
    description: string;
    lineNumber?: number;
}

export interface FeatureCoverageRecord {
    feature: string;
    /** null = no doc found. */
    coveredBy: string | null;
    status: 'covered' | 'missing' | 'stub';
}

export interface DocAuditReport {
    /** 0–100 overall health score across all files. */
    overallHealthScore: number;
    healthLabel: string;
    totalFiles: number;
    fileResults: DocFileAuditResult[];
    featureCoverage: FeatureCoverageRecord[];
    /** Prioritised list of the most impactful actions to take. */
    prioritisedActions: PrioritisedAction[];
    markdownReport: string;
}

export interface PrioritisedAction {
    priority: number; // 1 = highest
    file: string;
    action: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS = [
    { name: 'overview',         aliases: ['overview', 'introduction', 'about', 'what is'] },
    { name: 'prerequisites',    aliases: ['prerequisites', 'before you begin', 'requirements'] },
    { name: 'examples',         aliases: ['example', 'examples', 'usage', 'sample', 'quick start', 'getting started'] },
    { name: 'troubleshooting',  aliases: ['troubleshoot', 'common error', 'faq', 'known issue'] },
];

const PLACEHOLDER_PATTERNS = [
    /\[Add /i,
    /\[TODO/i,
    /\[TBD/i,
    /\[PLACEHOLDER/i,
    /_\[.*\]_/,
    /TODO:/i,
    /FIXME:/i,
    /\[describe/i,
    /\[explain/i,
    /\[insert/i,
    /Coming soon/i,
];

const STUB_THRESHOLD_WORDS = 120;
const DEFAULT_STALENESS_DAYS = 180;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function daysSince(isoDate: string): number {
    const then = new Date(isoDate).getTime();
    const now = Date.now();
    if (isNaN(then)) return 0;
    return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function daysBetween(older: string, newer: string): number {
    const a = new Date(older).getTime();
    const b = new Date(newer).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

function extractDocMetadata(content: string): {
    title: string;
    headings: string[];
    wordCount: number;
    hasCodeExample: boolean;
    hasPlaceholderText: boolean;
    internalLinks: Array<{ target: string; lineNumber: number }>;
} {
    const lines = content.split('\n');
    const headings: string[] = [];
    let wordCount = 0;
    let inCode = false;
    let hasCodeExample = false;
    let hasPlaceholderText = false;
    const internalLinks: Array<{ target: string; lineNumber: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lno = i + 1;

        if (line.trimStart().startsWith('```')) {
            if (inCode) hasCodeExample = true;
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;

        // Headings
        const hm = line.match(/^#{1,6}\s+(.+?)(?:\s+\{#[\w-]+\})?$/);
        if (hm) { headings.push(hm[1]!.toLowerCase().trim()); continue; }

        // Word count
        if (line.trim() && !line.startsWith('|')) {
            wordCount += (line.match(/\b\w+\b/g) ?? []).length;
        }

        // Placeholder text
        if (!hasPlaceholderText && PLACEHOLDER_PATTERNS.some((p) => p.test(line))) {
            hasPlaceholderText = true;
        }

        // Internal links
        const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(line)) !== null) {
            const target = m[2]!;
            if (!/^https?:|^mailto:|^#/.test(target)) {
                internalLinks.push({ target, lineNumber: lno });
            }
        }
    }

    const title = headings[0] ?? '';
    return { title, headings, wordCount, hasCodeExample, hasPlaceholderText, internalLinks };
}

function checkBrokenLinks(
    filePath: string,
    links: Array<{ target: string; lineNumber: number }>,
    allPaths: Set<string>,
): string[] {
    const broken: string[] = [];
    for (const { target } of links) {
        const base = target.split('#')[0];
        if (!base) continue;
        const fromDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
        let resolved = base.startsWith('./') ? fromDir + base.slice(2)
            : base.startsWith('../') ? base // simplified
                : base.startsWith('/') ? base.slice(1)
                    : fromDir + base;
        resolved = resolved.replace(/\\/g, '/').replace(/\/+/g, '/');
        if (!resolved.endsWith('.md')) resolved += '.md';
        if (!allPaths.has(resolved) && !allPaths.has(resolved.replace('.md', ''))) {
            broken.push(target);
        }
    }
    return broken;
}

function scoreFile(
    wordCount: number,
    hasCodeExample: boolean,
    hasPlaceholderText: boolean,
    missingSections: string[],
    brokenLinks: string[],
    staleDays: number,
    hasTitle: boolean,
    stalenessThreshold: number,
): number {
    let score = 100;
    if (!hasTitle) score -= 15;
    if (wordCount < STUB_THRESHOLD_WORDS) score -= 20;
    if (hasPlaceholderText) score -= 15;
    if (!hasCodeExample) score -= 5;
    score -= Math.min(20, missingSections.length * 5);
    score -= Math.min(15, brokenLinks.length * 8);
    if (staleDays > stalenessThreshold) score -= 20;
    else if (staleDays > stalenessThreshold / 2) score -= 5;
    return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Feature coverage matching
// ---------------------------------------------------------------------------

function matchFeatureToDoc(
    feature: string,
    fileResults: DocFileAuditResult[],
    allContent: Map<string, string>,
): FeatureCoverageRecord {
    const featureLower = feature.toLowerCase();
    const words = featureLower.split(/\s+/).filter((w) => w.length > 3);

    let bestMatch: { path: string; score: number } | null = null;
    for (const result of fileResults) {
        const content = (allContent.get(result.path) ?? '').toLowerCase();
        const hits = words.filter((w) => content.includes(w)).length;
        if (hits > 0 && (!bestMatch || hits > bestMatch.score)) {
            bestMatch = { path: result.path, score: hits };
        }
    }

    if (!bestMatch) return { feature, coveredBy: null, status: 'missing' };

    const matchedResult = fileResults.find((r) => r.path === bestMatch!.path)!;
    const status = matchedResult.wordCount < STUB_THRESHOLD_WORDS ? 'stub' : 'covered';
    return { feature, coveredBy: bestMatch.path, status };
}

// ---------------------------------------------------------------------------
// Action generation
// ---------------------------------------------------------------------------

function buildActions(
    fileResults: DocFileAuditResult[],
    featureCoverage: FeatureCoverageRecord[],
): PrioritisedAction[] {
    const actions: PrioritisedAction[] = [];
    let priority = 1;

    // Coverage gaps first (most impactful)
    for (const fc of featureCoverage.filter((f) => f.status === 'missing')) {
        actions.push({
            priority: priority++,
            file: '(new file needed)',
            action: `Create documentation for "${fc.feature}"`,
            reason: 'Feature has no documentation.',
            effort: 'high',
        });
    }

    // Stale docs
    for (const r of fileResults.filter((f) => f.staleDays > DEFAULT_STALENESS_DAYS).sort((a, b) => b.staleDays - a.staleDays).slice(0, 5)) {
        actions.push({
            priority: priority++,
            file: r.path,
            action: 'Review and update for accuracy',
            reason: `Not updated in ${r.staleDays} days.`,
            effort: 'medium',
        });
    }

    // Broken links
    for (const r of fileResults.filter((f) => f.brokenLinks.length > 0)) {
        actions.push({
            priority: priority++,
            file: r.path,
            action: `Fix ${r.brokenLinks.length} broken link(s)`,
            reason: `Broken links: ${r.brokenLinks.slice(0, 2).join(', ')}`,
            effort: 'low',
        });
    }

    // Stubs
    for (const r of fileResults.filter((f) => f.wordCount < STUB_THRESHOLD_WORDS)) {
        actions.push({
            priority: priority++,
            file: r.path,
            action: 'Expand stub content',
            reason: `Only ${r.wordCount} words — below minimum.`,
            effort: 'medium',
        });
    }

    // Placeholder text
    for (const r of fileResults.filter((f) => f.hasPlaceholderText)) {
        actions.push({
            priority: priority++,
            file: r.path,
            action: 'Fill in placeholder text',
            reason: 'Document contains unfilled template placeholders.',
            effort: 'medium',
        });
    }

    // Missing sections
    for (const r of fileResults.filter((f) => f.missingSections.length > 0)) {
        actions.push({
            priority: priority++,
            file: r.path,
            action: `Add missing sections: ${r.missingSections.join(', ')}`,
            reason: 'Required sections are absent.',
            effort: 'medium',
        });
    }

    return actions.slice(0, 30); // cap report
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full documentation lifecycle audit.
 *
 * @param files    Pre-read doc files (path + content + optional lastModified).
 * @param options  Audit configuration.
 */
export function auditDocLifecycle(
    files: AuditDocFile[],
    options: DocAuditOptions = {},
): DocAuditReport {
    const {
        featureList = [],
        requiredSections: customRequired,
        stalenessThresholdDays = DEFAULT_STALENESS_DAYS,
        codeChanges = [],
    } = options;

    const allPaths = new Set(files.map((f) => f.path));
    const allContent = new Map(files.map((f) => [f.path, f.content]));
    const codeChangeMap = new Map(codeChanges.map((c) => [c.filePath, c.lastChanged]));

    const requiredSectionDefs = customRequired
        ? customRequired.map((s) => ({ name: s, aliases: [s.toLowerCase()] }))
        : REQUIRED_SECTIONS;

    const fileResults: DocFileAuditResult[] = [];

    for (const file of files) {
        const { title, headings, wordCount, hasCodeExample, hasPlaceholderText, internalLinks } =
            extractDocMetadata(file.content);

        const brokenLinks = checkBrokenLinks(file.path, internalLinks, allPaths);

        // Staleness
        const staleDays = file.lastModified ? daysSince(file.lastModified) : 0;

        // Code-changed check: find a code file whose name overlaps with the doc name
        const docBase = file.path.replace(/\.md$/, '').split('/').pop()!;
        let codeChangedIssue: DocAuditIssue | null = null;
        for (const [codePath, codeDate] of codeChangeMap) {
            const codeBase = codePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
            if (codeBase && docBase.includes(codeBase) || codeBase.includes(docBase)) {
                const behindDays = file.lastModified ? daysBetween(file.lastModified, codeDate) : 0;
                if (behindDays > 0) {
                    codeChangedIssue = {
                        type: 'code-changed',
                        severity: 'warning',
                        description: `Related code file \`${codePath}\` changed ${behindDays}d after this doc was last updated.`,
                    };
                }
                break;
            }
        }

        // Missing sections
        const missingSections: string[] = [];
        for (const secDef of requiredSectionDefs) {
            const found = headings.some((h) => secDef.aliases.some((a) => h.includes(a)));
            if (!found) missingSections.push(secDef.name);
        }

        // Build issue list
        const issues: DocAuditIssue[] = [];
        if (!title) issues.push({ type: 'no-title', severity: 'error', description: 'Document has no H1 title.' });
        if (wordCount < STUB_THRESHOLD_WORDS) issues.push({ type: 'stub', severity: 'warning', description: `Only ${wordCount} words — likely a stub.` });
        if (hasPlaceholderText) issues.push({ type: 'placeholder-text', severity: 'warning', description: 'Contains unfilled placeholder text.' });
        if (!hasCodeExample) issues.push({ type: 'no-code-example', severity: 'info', description: 'No code example found.' });
        if (staleDays > stalenessThresholdDays) issues.push({ type: 'stale', severity: 'warning', description: `Not updated in ${staleDays} days (threshold: ${stalenessThresholdDays}).` });
        if (codeChangedIssue) issues.push(codeChangedIssue);
        for (const s of missingSections) issues.push({ type: 'missing-section', severity: 'info', description: `Missing section: ${s}` });
        for (const l of brokenLinks) issues.push({ type: 'broken-link', severity: 'error', description: `Broken link: ${l}` });

        const healthScore = scoreFile(wordCount, hasCodeExample, hasPlaceholderText, missingSections, brokenLinks, staleDays, !!title, stalenessThresholdDays);

        fileResults.push({
            path: file.path,
            healthScore,
            issues,
            staleDays,
            wordCount,
            hasCodeExample,
            hasPlaceholderText,
            missingSections,
            brokenLinks,
            coversFeatures: featureList.filter((f) => headings.some((h) => h.includes(f.toLowerCase()))),
        });
    }

    // Feature coverage
    const featureCoverage = featureList.map((f) => matchFeatureToDoc(f, fileResults, allContent));

    // Overall score
    const avgScore = fileResults.length > 0
        ? Math.round(fileResults.reduce((s, r) => s + r.healthScore, 0) / fileResults.length)
        : 100;

    const prioritisedActions = buildActions(fileResults, featureCoverage);
    const markdownReport = buildAuditReport(avgScore, fileResults, featureCoverage, prioritisedActions);

    return {
        overallHealthScore: avgScore,
        healthLabel: auditHealthLabel(avgScore),
        totalFiles: files.length,
        fileResults,
        featureCoverage,
        prioritisedActions,
        markdownReport,
    };
}

function auditHealthLabel(score: number): string {
    if (score >= 85) return 'Healthy';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Needs attention';
    if (score >= 30) return 'Poor';
    return 'Critical';
}

function buildAuditReport(
    overallScore: number,
    fileResults: DocFileAuditResult[],
    featureCoverage: FeatureCoverageRecord[],
    actions: PrioritisedAction[],
): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push('# Documentation Lifecycle Audit Report');
    lines.push(`\n_Generated: ${now} — ${fileResults.length} files audited_\n`);
    lines.push(`**Overall health score:** ${overallScore}/100 — _${auditHealthLabel(overallScore)}_\n`);

    // Score distribution
    const healthy = fileResults.filter((r) => r.healthScore >= 70).length;
    const needsWork = fileResults.filter((r) => r.healthScore >= 40 && r.healthScore < 70).length;
    const critical = fileResults.filter((r) => r.healthScore < 40).length;
    lines.push(`| Status | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| ✅ Healthy (≥70) | ${healthy} |`);
    lines.push(`| ⚠️ Needs work (40–69) | ${needsWork} |`);
    lines.push(`| ❌ Critical (<40) | ${critical} |`);
    lines.push('');

    // Feature coverage
    if (featureCoverage.length > 0) {
        const missing = featureCoverage.filter((f) => f.status === 'missing');
        const stubs = featureCoverage.filter((f) => f.status === 'stub');
        lines.push('## Feature Coverage\n');
        lines.push('| Feature | Status | Covered By |');
        lines.push('|---------|--------|------------|');
        for (const fc of featureCoverage) {
            const badge = fc.status === 'covered' ? '✅' : fc.status === 'stub' ? '⚠️ Stub' : '❌ Missing';
            lines.push(`| ${fc.feature} | ${badge} | ${fc.coveredBy ?? '—'} |`);
        }
        lines.push('');
        if (missing.length > 0) lines.push(`> ❌ ${missing.length} feature(s) have no documentation.\n`);
        if (stubs.length > 0) lines.push(`> ⚠️ ${stubs.length} feature(s) are documented only as stubs.\n`);
    }

    // Prioritised actions
    if (actions.length > 0) {
        lines.push('## Prioritised Actions\n');
        lines.push('| # | File | Action | Reason | Effort |');
        lines.push('|---|------|--------|--------|--------|');
        actions.slice(0, 20).forEach((a) => {
            lines.push(`| ${a.priority} | \`${a.file}\` | ${a.action} | ${a.reason} | ${a.effort} |`);
        });
        lines.push('');
    }

    // Per-file scores
    lines.push('## Per-File Health Scores\n');
    lines.push('| File | Score | Stale Days | Word Count | Issues |');
    lines.push('|------|-------|------------|------------|--------|');
    for (const r of [...fileResults].sort((a, b) => a.healthScore - b.healthScore)) {
        lines.push(`| \`${r.path}\` | ${r.healthScore} | ${r.staleDays} | ${r.wordCount} | ${r.issues.length} |`);
    }
    lines.push('');

    return lines.join('\n');
}
