// ============================================================================
// PROACTIVE TECH DEBT BUILDER
// Types, aggregation helpers, and LLM prompts for background health scanning.
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanCategory =
    | 'secret'
    | 'cve'
    | 'dependency'
    | 'quality'
    | 'security'
    | 'bundle_size'
    | 'coupling';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ScanFinding {
    category:    ScanCategory;
    severity:    FindingSeverity;
    title:       string;
    description: string;
    file?:       string;
    line?:       number;
    /** Concrete step to fix the issue. */
    remediation: string;
    /** True if a dependency bump or code patch can be generated automatically. */
    autoFixable: boolean;
    /** Dependency name + current version, if applicable. */
    dependency?: { name: string; current: string; fixed: string };
}

export interface ProactiveScanResult {
    scannedAt:          string;
    findings:           ScanFinding[];
    criticalCount:      number;
    highCount:          number;
    autoFixableCount:   number;
    summary:            string;
    recommendedActions: string[];
}

export interface TechDebtReport {
    generatedAt:      string;
    overallScore:     number;    // 0-100, 100 = clean
    riskLevel:        'critical' | 'high' | 'medium' | 'low';
    topFindings:      ScanFinding[];
    trendSummary:     string;
    prioritizedSteps: string[];
    estimatedEffort:  string;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
    critical: 4,
    high:     3,
    medium:   2,
    low:      1,
};

/**
 * Aggregates raw findings from multiple scan action outputs into one list.
 * Each action returns its own JSON; this normalises and deduplicates.
 * Pure function.
 */
export function aggregateScanFindings(
    scanOutputs: Array<{ category: ScanCategory; raw: string }>,
): ScanFinding[] {
    const all: ScanFinding[] = [];

    for (const { category, raw } of scanOutputs) {
        if (!raw.trim()) continue;
        try {
            const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();

            // Try JSON array first
            const arrStart = cleaned.indexOf('[');
            const arrEnd   = cleaned.lastIndexOf(']');
            if (arrStart !== -1 && arrEnd !== -1) {
                const items = JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as Array<Record<string, unknown>>;
                for (const item of items) {
                    const finding = normaliseFinding(item, category);
                    if (finding) all.push(finding);
                }
                continue;
            }

            // Try JSON object (single finding or wrapper)
            const objStart = cleaned.indexOf('{');
            const objEnd   = cleaned.lastIndexOf('}');
            if (objStart !== -1 && objEnd !== -1) {
                const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
                // If it has a "findings" key, unwrap it
                if (Array.isArray(obj['findings'])) {
                    for (const item of obj['findings'] as Array<Record<string, unknown>>) {
                        const finding = normaliseFinding(item, category);
                        if (finding) all.push(finding);
                    }
                } else {
                    const finding = normaliseFinding(obj, category);
                    if (finding) all.push(finding);
                }
            }
        } catch { /* skip malformed output */ }
    }

    // Deduplicate by title + file
    const seen = new Set<string>();
    return all.filter((f) => {
        const key = `${f.category}:${f.title}:${f.file ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
}

function normaliseFinding(
    obj: Record<string, unknown>,
    defaultCategory: ScanCategory,
): ScanFinding | null {
    const title       = str(obj['title'] ?? obj['name'] ?? obj['id']);
    const description = str(obj['description'] ?? obj['message'] ?? obj['detail'] ?? obj['summary']);
    const remediation = str(obj['remediation'] ?? obj['fix'] ?? obj['recommendation'] ?? 'Review and remediate manually.');
    if (!title) return null;

    const rawSeverity = str(obj['severity'] ?? obj['risk'] ?? obj['level'] ?? 'low').toLowerCase();
    const severity: FindingSeverity =
        rawSeverity.includes('critical') ? 'critical' :
        rawSeverity.includes('high')     ? 'high' :
        rawSeverity.includes('medium') || rawSeverity.includes('warn') ? 'medium' : 'low';

    const rawCategory = str(obj['category'] ?? obj['type'] ?? '');
    const category: ScanCategory =
        rawCategory.includes('secret')     ? 'secret' :
        rawCategory.includes('cve') || rawCategory.includes('vuln') ? 'cve' :
        rawCategory.includes('dep')        ? 'dependency' :
        rawCategory.includes('qual')       ? 'quality' :
        rawCategory.includes('security')   ? 'security' :
        rawCategory.includes('bundle')     ? 'bundle_size' :
        rawCategory.includes('coupling')   ? 'coupling' :
        defaultCategory;

    const depName    = str(obj['package'] ?? obj['dependency'] ?? obj['library']);
    const depCurrent = str(obj['version'] ?? obj['current_version'] ?? obj['installed']);
    const depFixed   = str(obj['fixed_version'] ?? obj['safe_version'] ?? obj['latest']);

    return {
        category,
        severity,
        title:       title.slice(0, 200),
        description: (description ?? '').slice(0, 500),
        file:        str(obj['file'] ?? obj['path'] ?? obj['location']) ?? undefined,
        line:        typeof obj['line'] === 'number' ? obj['line'] : undefined,
        remediation: remediation.slice(0, 300),
        autoFixable: Boolean(obj['auto_fixable'] ?? obj['fixable'] ?? (depFixed && depFixed !== depCurrent)),
        dependency:  (depName && depCurrent && depFixed) ? { name: depName, current: depCurrent, fixed: depFixed } : undefined,
    };
}

function str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Computes an overall codebase health score (0–100, 100 = clean). Pure function.
 */
export function computeHealthScore(findings: ScanFinding[]): number {
    if (findings.length === 0) return 100;
    const penalty = findings.reduce((acc, f) => {
        switch (f.severity) {
            case 'critical': return acc + 25;
            case 'high':     return acc + 10;
            case 'medium':   return acc + 4;
            case 'low':      return acc + 1;
        }
    }, 0);
    return Math.max(0, 100 - penalty);
}

/**
 * Derives the risk level from a score. Pure function.
 */
export function scoreToRisk(score: number): TechDebtReport['riskLevel'] {
    if (score < 40) return 'critical';
    if (score < 60) return 'high';
    if (score < 80) return 'medium';
    return 'low';
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

/**
 * Builds a one-paragraph human-readable summary from scan findings. Pure function.
 */
export function buildScanSummary(findings: ScanFinding[], projectName: string): string {
    if (findings.length === 0) return `${projectName}: No findings — codebase looks healthy.`;
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const high     = findings.filter((f) => f.severity === 'high').length;
    const medium   = findings.filter((f) => f.severity === 'medium').length;
    const low      = findings.filter((f) => f.severity === 'low').length;
    const fixable  = findings.filter((f) => f.autoFixable).length;
    return [
        `${projectName}: ${findings.length} finding(s) — `,
        [
            critical && `${critical} critical`,
            high     && `${high} high`,
            medium   && `${medium} medium`,
            low      && `${low} low`,
        ].filter(Boolean).join(', '),
        `. ${fixable} can be auto-fixed.`,
    ].join('');
}

// ---------------------------------------------------------------------------
// LLM prompt builders
// ---------------------------------------------------------------------------

/**
 * Prompt for the LLM to produce a prioritised tech debt report. Pure function.
 */
export function buildTechDebtReportPrompt(params: {
    projectName:     string;
    findings:        ScanFinding[];
    episodicHistory: string;  // last N episodic memory entries as text
    healthScore:     number;
    projectContext?: string;
}): string {
    const findingLines = params.findings.slice(0, 30).map((f) =>
        `  [${f.severity.toUpperCase()}] [${f.category}] ${f.title}: ${f.description.slice(0, 120)}`,
    ).join('\n');

    return [
        `You are a senior software architect reviewing the technical health of "${params.projectName}".`,
        `Current health score: ${params.healthScore}/100`,
        ...(params.projectContext ? [`\n${params.projectContext}`] : []),
        ``,
        `Recent task history:`,
        params.episodicHistory.slice(0, 2000),
        ``,
        `Current scan findings (${params.findings.length} total):`,
        findingLines || '  (none)',
        ``,
        `Produce a prioritised tech debt report. Return a JSON object with:`,
        `  overallScore     — integer 0-100 (same as health score or adjusted)`,
        `  riskLevel        — "critical" | "high" | "medium" | "low"`,
        `  trendSummary     — 1-2 sentences: is debt increasing, decreasing, or stable vs history?`,
        `  prioritizedSteps — string[] of up to 8 concrete fix steps, ordered by impact`,
        `  estimatedEffort  — rough estimate of total remediation effort (e.g. "3 engineering days")`,
        ``,
        `No markdown fences, no prose — only the JSON object.`,
    ].join('\n');
}

/**
 * Parses the LLM tech debt report output. Pure function.
 */
export function parseTechDebtReport(
    raw:         string,
    findings:    ScanFinding[],
    healthScore: number,
    projectName: string,
): TechDebtReport {
    const fallback: TechDebtReport = {
        generatedAt:      new Date().toISOString(),
        overallScore:     healthScore,
        riskLevel:        scoreToRisk(healthScore),
        topFindings:      findings.slice(0, 5),
        trendSummary:     'Unable to determine trend — insufficient history.',
        prioritizedSteps: findings.slice(0, 5).map((f) => f.remediation),
        estimatedEffort:  'Unknown',
    };

    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return fallback;

    try {
        const p = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
        return {
            generatedAt:      new Date().toISOString(),
            overallScore:     typeof p['overallScore'] === 'number' ? p['overallScore'] : healthScore,
            riskLevel:        (['critical','high','medium','low'] as const).includes(p['riskLevel'] as never)
                ? p['riskLevel'] as TechDebtReport['riskLevel'] : scoreToRisk(healthScore),
            topFindings:      findings.slice(0, 5),
            trendSummary:     typeof p['trendSummary']  === 'string' ? p['trendSummary']  : fallback.trendSummary,
            prioritizedSteps: Array.isArray(p['prioritizedSteps']) ? p['prioritizedSteps'] as string[] : fallback.prioritizedSteps,
            estimatedEffort:  typeof p['estimatedEffort'] === 'string' ? p['estimatedEffort'] : 'Unknown',
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Auto-fix PR helpers
// ---------------------------------------------------------------------------

/**
 * Builds a PR title + body for a dependency auto-fix. Pure function.
 */
export function buildAutoFixPrContent(finding: ScanFinding): { title: string; body: string } {
    const dep = finding.dependency;
    if (!dep) {
        return {
            title: `fix: remediate ${finding.severity} ${finding.category} finding`,
            body:  `## Auto-fix\n\n**Finding:** ${finding.title}\n\n**Remediation:** ${finding.remediation}\n\n🤖 Generated by AgentFarm proactive scanner`,
        };
    }
    return {
        title: `fix(deps): bump ${dep.name} from ${dep.current} to ${dep.fixed}`,
        body:  [
            `## Dependency security fix`,
            ``,
            `| Field | Value |`,
            `|-------|-------|`,
            `| Package | \`${dep.name}\` |`,
            `| Current | \`${dep.current}\` |`,
            `| Fixed   | \`${dep.fixed}\` |`,
            `| Severity | ${finding.severity.toUpperCase()} |`,
            ``,
            `**Finding:** ${finding.title}`,
            `**Description:** ${finding.description}`,
            ``,
            `🤖 Generated by AgentFarm proactive tech debt scanner`,
        ].join('\n'),
    };
}

/**
 * Formats findings as a GitHub issue body. Pure function.
 */
export function buildTechDebtIssueBody(
    report: TechDebtReport,
    projectName: string,
): string {
    const findingLines = report.topFindings.map((f) =>
        `- **[${f.severity.toUpperCase()}]** ${f.title} — ${f.remediation}`,
    ).join('\n');

    return [
        `## Tech debt report — ${projectName}`,
        ``,
        `**Health score:** ${report.overallScore}/100  |  **Risk:** ${report.riskLevel.toUpperCase()}`,
        `**Trend:** ${report.trendSummary}`,
        `**Estimated effort:** ${report.estimatedEffort}`,
        ``,
        `### Top findings`,
        findingLines || '_No critical findings._',
        ``,
        `### Prioritised remediation steps`,
        report.prioritizedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        ``,
        `_Generated ${report.generatedAt} by AgentFarm proactive scanner_`,
    ].join('\n');
}

/**
 * Formats findings as a Slack message (compact). Pure function.
 */
export function buildTechDebtSlackMessage(
    report: TechDebtReport,
    projectName: string,
): string {
    const emoji = report.riskLevel === 'critical' ? '🚨' :
                  report.riskLevel === 'high'     ? '⚠️' :
                  report.riskLevel === 'medium'   ? '🟡' : '✅';
    return [
        `${emoji} *Tech debt scan — ${projectName}*`,
        `Score: *${report.overallScore}/100* (${report.riskLevel}) | ${report.trendSummary}`,
        report.topFindings.length > 0
            ? `Top issues: ${report.topFindings.slice(0, 3).map((f) => `[${f.severity}] ${f.title}`).join(' · ')}`
            : 'No critical findings.',
        `Next steps: ${report.prioritizedSteps[0] ?? 'Nothing urgent.'}`,
    ].join('\n');
}
