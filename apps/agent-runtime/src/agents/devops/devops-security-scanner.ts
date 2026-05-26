// ============================================================================
// DEVOPS SECURITY SCANNER
//
// Container image vulnerability scanning via Trivy, Snyk, and Grype.
// Pure builders/parsers — no side effects.
//
// Scanner CLI notes:
//   Trivy: trivy image --format json IMAGE
//   Grype: grype IMAGE -o json
//   Snyk:  snyk container test IMAGE --json
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScannerTool = 'trivy' | 'grype' | 'snyk';

export type VulnSeverity = 'critical' | 'high' | 'medium' | 'low' | 'negligible' | 'unknown';

export interface VulnFinding {
    id:          string;   // CVE-YYYY-NNNNN
    pkgName:     string;
    version:     string;
    fixedIn?:    string;
    severity:    VulnSeverity;
    title:       string;
    description: string;
    score?:      number;   // CVSS v3 base score
    link?:       string;
}

export interface ImageScanResult {
    image:          string;
    scanner:        ScannerTool;
    total:          number;
    critical:       number;
    high:           number;
    medium:         number;
    low:            number;
    negligible:     number;
    findings:       VulnFinding[];
    riskLevel:      'critical' | 'high' | 'medium' | 'low' | 'clean';
    fixable:        number;    // findings with a fixed version available
    formattedReport: string;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

/** Build a `trivy image` scan command. Returns JSON output. */
export function buildTrivyScanArgs(image: string, params?: {
    severity?: VulnSeverity[];
    ignoreUnfixed?: boolean;
    timeout?: string;
}): string[] {
    const args = ['trivy', 'image', '--format', 'json', '--quiet'];
    if (params?.severity?.length) {
        args.push('--severity', params.severity.map((s) => s.toUpperCase()).join(','));
    }
    if (params?.ignoreUnfixed) args.push('--ignore-unfixed');
    if (params?.timeout)       args.push('--timeout', params.timeout);
    args.push(image);
    return args;
}

/** Build a `grype` scan command. Returns JSON output. */
export function buildGrypeScanArgs(image: string, params?: {
    onlyFixed?: boolean;
    failOn?: VulnSeverity;
}): string[] {
    const args = ['grype', image, '-o', 'json', '-q'];
    if (params?.onlyFixed) args.push('--only-fixed');
    if (params?.failOn)    args.push('--fail-on', params.failOn);
    return args;
}

/** Build a `snyk container test` command. Returns JSON output. */
export function buildSnykScanArgs(image: string, params?: {
    severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
    fileArg?: string;   // path to Dockerfile for base image advice
}): string[] {
    const args = ['snyk', 'container', 'test', image, '--json'];
    if (params?.severityThreshold) args.push(`--severity-threshold=${params.severityThreshold}`);
    if (params?.fileArg) args.push(`--file=${params.fileArg}`);
    return args;
}

// ---------------------------------------------------------------------------
// Trivy output parser
// ---------------------------------------------------------------------------

interface TrivyVuln {
    VulnerabilityID: string;
    PkgName:         string;
    InstalledVersion: string;
    FixedVersion?:   string;
    Severity:        string;
    Title?:          string;
    Description?:    string;
    CVSS?:           Record<string, { V3Score?: number }>;
    PrimaryURL?:     string;
}

interface TrivyResult {
    Vulnerabilities?: TrivyVuln[];
}

export function parseTrivyScanOutput(raw: string, image: string): ImageScanResult {
    let findings: VulnFinding[] = [];

    try {
        const json = JSON.parse(raw) as { Results?: TrivyResult[] };
        const results: TrivyResult[] = json.Results ?? [];

        for (const r of results) {
            for (const v of (r.Vulnerabilities ?? [])) {
                const severity = normaliseSeverity(v.Severity);
                const score = extractCvssScore(v.CVSS);
                findings.push({
                    id:          v.VulnerabilityID,
                    pkgName:     v.PkgName,
                    version:     v.InstalledVersion,
                    fixedIn:     v.FixedVersion || undefined,
                    severity,
                    title:       v.Title ?? v.VulnerabilityID,
                    description: (v.Description ?? '').slice(0, 300),
                    score,
                    link:        v.PrimaryURL,
                });
            }
        }
    } catch {
        // malformed JSON — return empty
    }

    return buildScanResult(image, 'trivy', findings);
}

// ---------------------------------------------------------------------------
// Grype output parser
// ---------------------------------------------------------------------------

interface GrypeMatch {
    vulnerability: {
        id:          string;
        severity:    string;
        description?: string;
        cvss?:       Array<{ metrics?: { baseScore?: number } }>;
        urls?:       string[];
    };
    artifact: {
        name:    string;
        version: string;
    };
    matchDetails?: Array<{ fix?: { versions?: string[] } }>;
}

export function parseGrypeScanOutput(raw: string, image: string): ImageScanResult {
    let findings: VulnFinding[] = [];

    try {
        const json = JSON.parse(raw) as { matches?: GrypeMatch[] };
        for (const m of (json.matches ?? [])) {
            const v    = m.vulnerability;
            const art  = m.artifact;
            const fix  = m.matchDetails?.[0]?.fix?.versions?.[0];
            const score = m.vulnerability.cvss?.[0]?.metrics?.baseScore;
            findings.push({
                id:          v.id,
                pkgName:     art.name,
                version:     art.version,
                fixedIn:     fix,
                severity:    normaliseSeverity(v.severity),
                title:       v.id,
                description: (v.description ?? '').slice(0, 300),
                score,
                link:        v.urls?.[0],
            });
        }
    } catch {
        // malformed JSON — return empty
    }

    return buildScanResult(image, 'grype', findings);
}

// ---------------------------------------------------------------------------
// Snyk output parser
// ---------------------------------------------------------------------------

interface SnykVuln {
    id:          string;
    title:       string;
    description?: string;
    severity:    string;
    packageName: string;
    version:     string;
    fixedIn?:    string[];
    cvssScore?:  number;
    url?:        string;
}

export function parseSnykScanOutput(raw: string, image: string): ImageScanResult {
    let findings: VulnFinding[] = [];

    try {
        const json = JSON.parse(raw) as { vulnerabilities?: SnykVuln[]; ok?: boolean };
        for (const v of (json.vulnerabilities ?? [])) {
            findings.push({
                id:          v.id,
                pkgName:     v.packageName,
                version:     v.version,
                fixedIn:     v.fixedIn?.[0],
                severity:    normaliseSeverity(v.severity),
                title:       v.title,
                description: (v.description ?? '').slice(0, 300),
                score:       v.cvssScore,
                link:        v.url,
            });
        }
    } catch {
        // malformed JSON
    }

    return buildScanResult(image, 'snyk', findings);
}

// ---------------------------------------------------------------------------
// Shared result builder
// ---------------------------------------------------------------------------

function buildScanResult(image: string, scanner: ScannerTool, findings: VulnFinding[]): ImageScanResult {
    const countBySeverity = (sev: VulnSeverity): number =>
        findings.filter((f) => f.severity === sev).length;

    const critical   = countBySeverity('critical');
    const high       = countBySeverity('high');
    const medium     = countBySeverity('medium');
    const low        = countBySeverity('low');
    const negligible = countBySeverity('negligible');
    const fixable    = findings.filter((f) => !!f.fixedIn).length;

    const riskLevel: ImageScanResult['riskLevel'] =
        critical > 0 ? 'critical' :
        high     > 0 ? 'high'     :
        medium   > 0 ? 'medium'   :
        low      > 0 ? 'low'      : 'clean';

    const result: ImageScanResult = {
        image, scanner,
        total: findings.length,
        critical, high, medium, low, negligible, fixable,
        findings: findings.slice(0, 100),  // cap at 100 for output size
        riskLevel,
        formattedReport: '',
    };

    result.formattedReport = formatScanReport(result);
    return result;
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

export function formatScanReport(result: ImageScanResult): string {
    const statusIcon = result.riskLevel === 'clean' ? '✅' : result.riskLevel === 'critical' ? '🔴' : result.riskLevel === 'high' ? '🟠' : '🟡';
    const lines: string[] = [
        `## Container Security Scan — ${statusIcon} ${result.riskLevel.toUpperCase()}`,
        ``,
        `**Image:** \`${result.image}\` | **Scanner:** ${result.scanner} | **Total findings:** ${result.total}`,
        ``,
        `| Severity | Count |`,
        `|----------|-------|`,
        `| 🔴 Critical | ${result.critical} |`,
        `| 🟠 High     | ${result.high} |`,
        `| 🟡 Medium   | ${result.medium} |`,
        `| 🟢 Low      | ${result.low} |`,
        ``,
    ];

    if (result.total === 0) {
        lines.push(`✅ No vulnerabilities found.`);
        return lines.join('\n');
    }

    lines.push(`**Fixable:** ${result.fixable}/${result.total} have a fix available`, ``);

    // Top critical/high findings
    const topFindings = result.findings
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .slice(0, 10);

    if (topFindings.length > 0) {
        lines.push(`### Top Critical / High Findings`);
        lines.push(`| CVE | Package | Version | Fixed In | CVSS |`);
        lines.push(`|-----|---------|---------|----------|------|`);
        for (const f of topFindings) {
            lines.push(`| [${f.id}](${f.link ?? '#'}) | ${f.pkgName} | ${f.version} | ${f.fixedIn ?? '—'} | ${f.score?.toFixed(1) ?? '—'} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompt — ask the LLM to summarise scan results and suggest remediations
// ---------------------------------------------------------------------------

export function buildScanRemediationPrompt(result: ImageScanResult): string {
    const topVulns = result.findings
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .slice(0, 15)
        .map((f) => `${f.id} (${f.severity}): ${f.pkgName}@${f.version}${f.fixedIn ? ` → fix: ${f.fixedIn}` : ''}`)
        .join('\n');

    return [
        `Container image \`${result.image}\` has been scanned with ${result.scanner}.`,
        ``,
        `Summary: ${result.critical} critical, ${result.high} high, ${result.medium} medium, ${result.low} low.`,
        `Fixable: ${result.fixable}/${result.total}.`,
        ``,
        topVulns ? `Top critical/high vulnerabilities:\n${topVulns}` : 'No critical/high findings.',
        ``,
        `Please:`,
        `1. Summarise the security posture (2-3 sentences)`,
        `2. Recommend the top 3 remediation steps in priority order`,
        `3. Suggest a base image upgrade if applicable`,
        `4. Note any false positives to consider accepting`,
        ``,
        `Return JSON: { "summary": string, "remediations": string[], "baseImageUpgrade": string|null, "acceptableFindings": string[] }`,
    ].join('\n');
}

export interface ScanRemediation {
    summary:            string;
    remediations:       string[];
    baseImageUpgrade:   string | null;
    acceptableFindings: string[];
}

export function parseScanRemediation(raw: string): ScanRemediation {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const json    = JSON.parse(cleaned) as Partial<ScanRemediation>;
        return {
            summary:            typeof json.summary === 'string' ? json.summary : '',
            remediations:       Array.isArray(json.remediations) ? json.remediations as string[] : [],
            baseImageUpgrade:   typeof json.baseImageUpgrade === 'string' ? json.baseImageUpgrade : null,
            acceptableFindings: Array.isArray(json.acceptableFindings) ? json.acceptableFindings as string[] : [],
        };
    } catch {
        return { summary: raw.slice(0, 300), remediations: [], baseImageUpgrade: null, acceptableFindings: [] };
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseSeverity(raw: string): VulnSeverity {
    switch (raw?.toLowerCase()) {
        case 'critical':   return 'critical';
        case 'high':       return 'high';
        case 'medium':     return 'medium';
        case 'moderate':   return 'medium';
        case 'low':        return 'low';
        case 'negligible': return 'negligible';
        default:           return 'unknown';
    }
}

function extractCvssScore(cvss?: Record<string, { V3Score?: number }>): number | undefined {
    if (!cvss) return undefined;
    for (const entry of Object.values(cvss)) {
        if (typeof entry?.V3Score === 'number') return entry.V3Score;
    }
    return undefined;
}
