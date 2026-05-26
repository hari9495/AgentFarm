// ============================================================================
// DEVOPS COST ESTIMATOR
//
// Terraform cost estimation via Infracost CLI.
// Also includes a Terraform drift detection helper (terraform plan --check).
//
// Infracost docs: https://www.infracost.io/docs/
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InfracostResource {
    name:           string;
    resourceType:   string;
    monthlyCost:    number;    // USD
    hourlyCost?:    number;
    metadata?:      Record<string, string>;
}

export interface InfracostProject {
    name:           string;
    currency:       string;
    totalMonthlyCost: number;
    pastMonthlyCost?: number;    // undefined on first run
    diffMonthlyCost?: number;    // totalMonthlyCost - pastMonthlyCost
    resources:      InfracostResource[];
}

export interface CostEstimateResult {
    projects:         InfracostProject[];
    totalMonthlyCost: number;
    pastMonthlyCost?: number;
    diffMonthlyCost?: number;
    currency:         string;
    formattedReport:  string;
}

export interface DriftCheckResult {
    hasDrift:     boolean;
    addCount:     number;
    changeCount:  number;
    destroyCount: number;
    summary:      string;
    rawPlanOutput: string;
}

// ---------------------------------------------------------------------------
// Infracost command builders
// ---------------------------------------------------------------------------

/**
 * Build `infracost breakdown` args — runs against a Terraform directory.
 * Returns JSON output suitable for parsing.
 */
export function buildInfracostBreakdownArgs(params: {
    tfDir:       string;
    tfVarsFile?: string;
    currency?:   string;     // e.g. 'USD', 'EUR', 'GBP' (default: USD)
    syncUsage?:  boolean;    // sync with Infracost Cloud usage file
}): string[] {
    const args = [
        'infracost', 'breakdown',
        '--path', params.tfDir,
        '--format', 'json',
        '--no-color',
    ];
    if (params.tfVarsFile) args.push('--terraform-var-file', params.tfVarsFile);
    if (params.currency)   args.push('--currency', params.currency);
    if (params.syncUsage)  args.push('--sync-usage-file');
    return args;
}

/**
 * Build `infracost diff` args — compares cost of current vs planned Terraform.
 * Requires a saved plan file: `terraform plan -out=tfplan.binary`.
 */
export function buildInfracostDiffArgs(params: {
    tfDir:       string;
    planFile?:   string;   // path to terraform binary plan file
    currency?:   string;
}): string[] {
    const args = [
        'infracost', 'diff',
        '--path', params.tfDir,
        '--format', 'json',
        '--no-color',
    ];
    if (params.planFile) args.push('--terraform-plan-flags', `-plan=${params.planFile}`);
    if (params.currency) args.push('--currency', params.currency);
    return args;
}

/**
 * Build `infracost output` args — converts a saved infracost.json to a
 * human-readable table or HTML report.
 */
export function buildInfracostOutputArgs(params: {
    jsonFile:    string;
    format?:     'table' | 'html' | 'github-comment' | 'gitlab-comment';
}): string[] {
    return [
        'infracost', 'output',
        '--path', params.jsonFile,
        '--format', params.format ?? 'table',
        '--no-color',
    ];
}

// ---------------------------------------------------------------------------
// Terraform drift detection command builders
// ---------------------------------------------------------------------------

/**
 * Build `terraform plan -detailed-exitcode` — exits 2 if there are changes.
 * Used for scheduled drift detection.
 */
export function buildTfDriftCheckArgs(params: {
    tfDir:       string;
    tfVarsFile?: string;
    planFile?:   string;   // where to write the plan binary
}): string[] {
    const args = [
        'terraform', 'plan',
        '-detailed-exitcode',
        '-no-color',
        '-input=false',
    ];
    if (params.tfVarsFile) args.push(`-var-file=${params.tfVarsFile}`);
    if (params.planFile)   args.push(`-out=${params.planFile}`);
    return args;
}

/**
 * Build `terraform show -json` to parse a binary plan file.
 */
export function buildTfShowArgs(planFile: string): string[] {
    return ['terraform', 'show', '-json', planFile];
}

// ---------------------------------------------------------------------------
// Infracost output parser
// ---------------------------------------------------------------------------

interface InfracostJsonResource {
    name:            string;
    resourceType?:   string;
    monthlyCost?:    string | null;
    hourlyCost?:     string | null;
    metadata?:       Record<string, string>;
}

interface InfracostJsonProject {
    name?:  string;
    metadata?: { currency?: string };
    breakdown?: {
        totalMonthlyCost?: string | null;
        pastTotalMonthlyCost?: string | null;
        diffTotalMonthlyCost?: string | null;
        resources?: InfracostJsonResource[];
    };
    diff?: {
        totalMonthlyCost?: string | null;
        pastTotalMonthlyCost?: string | null;
        diffTotalMonthlyCost?: string | null;
        resources?: InfracostJsonResource[];
    };
}

export function parseInfracostOutput(raw: string): CostEstimateResult | null {
    try {
        const json = JSON.parse(raw) as {
            currency?:            string;
            totalMonthlyCost?:    string | null;
            pastTotalMonthlyCost?: string | null;
            diffTotalMonthlyCost?: string | null;
            projects?: InfracostJsonProject[];
        };

        const currency  = json.currency ?? 'USD';
        const total     = parseFloat(json.totalMonthlyCost ?? '0') || 0;
        const past      = json.pastTotalMonthlyCost !== undefined ? (parseFloat(json.pastTotalMonthlyCost ?? '0') || 0) : undefined;
        const diff      = json.diffTotalMonthlyCost !== undefined ? (parseFloat(json.diffTotalMonthlyCost ?? '0') || 0) : undefined;

        const projects: InfracostProject[] = (json.projects ?? []).map((p) => {
            const section = p.diff ?? p.breakdown ?? {};
            const resources: InfracostResource[] = (section.resources ?? []).map((r) => ({
                name:         r.name,
                resourceType: r.resourceType ?? 'unknown',
                monthlyCost:  parseFloat(r.monthlyCost ?? '0') || 0,
                hourlyCost:   r.hourlyCost ? parseFloat(r.hourlyCost) || undefined : undefined,
                metadata:     r.metadata,
            }));
            return {
                name:             p.name ?? 'main',
                currency,
                totalMonthlyCost: parseFloat(section.totalMonthlyCost ?? '0') || 0,
                pastMonthlyCost:  section.pastTotalMonthlyCost !== undefined
                    ? (parseFloat(section.pastTotalMonthlyCost ?? '0') || 0) : undefined,
                diffMonthlyCost:  section.diffTotalMonthlyCost !== undefined
                    ? (parseFloat(section.diffTotalMonthlyCost ?? '0') || 0) : undefined,
                resources,
            };
        });

        const result: CostEstimateResult = {
            projects, currency, totalMonthlyCost: total, pastMonthlyCost: past, diffMonthlyCost: diff,
            formattedReport: '',
        };
        result.formattedReport = formatCostReport(result);
        return result;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Terraform drift parser
// ---------------------------------------------------------------------------

/**
 * Parses `terraform plan -no-color` output for drift detection.
 * exit code 0 = no changes, 2 = changes present (detected drift).
 */
export function parseTfDriftOutput(stdout: string, exitCode: number): DriftCheckResult {
    // Terraform plan outputs summary like:
    // "Plan: 2 to add, 1 to change, 0 to destroy."
    const planLine = stdout.match(/Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/i);
    const addCount     = planLine ? parseInt(planLine[1] ?? '0', 10) : 0;
    const changeCount  = planLine ? parseInt(planLine[2] ?? '0', 10) : 0;
    const destroyCount = planLine ? parseInt(planLine[3] ?? '0', 10) : 0;

    // Exit code 2 = diff, 0 = no diff, 1 = error
    const hasDrift = exitCode === 2 || addCount > 0 || changeCount > 0 || destroyCount > 0;

    const summary = hasDrift
        ? `Drift detected: ${addCount} resource(s) to add, ${changeCount} to change, ${destroyCount} to destroy.`
        : exitCode === 0
            ? 'No drift detected — infrastructure matches Terraform state.'
            : `Terraform plan failed (exit code ${exitCode}).`;

    return {
        hasDrift,
        addCount,
        changeCount,
        destroyCount,
        summary,
        rawPlanOutput: stdout.slice(0, 3000),
    };
}

// ---------------------------------------------------------------------------
// Cost report formatter
// ---------------------------------------------------------------------------

export function formatCostReport(result: CostEstimateResult): string {
    const sym = result.currency === 'USD' ? '$' : result.currency;
    const fmt = (n: number): string => `${sym}${n.toFixed(2)}`;

    const lines: string[] = [
        `## Terraform Cost Estimate`,
        ``,
        `**Total monthly cost:** ${fmt(result.totalMonthlyCost)}`,
    ];

    if (result.pastMonthlyCost !== undefined) {
        lines.push(`**Previous monthly cost:** ${fmt(result.pastMonthlyCost)}`);
    }
    if (result.diffMonthlyCost !== undefined) {
        const sign  = result.diffMonthlyCost >= 0 ? '+' : '';
        const emoji = result.diffMonthlyCost > 0 ? '📈' : result.diffMonthlyCost < 0 ? '📉' : '➡️';
        lines.push(`**Cost change:** ${emoji} ${sign}${fmt(result.diffMonthlyCost)}/month`);
    }
    lines.push('');

    for (const project of result.projects) {
        lines.push(`### Project: ${project.name}`);
        lines.push(`| Resource | Type | Monthly Cost |`);
        lines.push(`|----------|------|-------------|`);
        const topResources = [...project.resources]
            .sort((a, b) => b.monthlyCost - a.monthlyCost)
            .slice(0, 15);
        for (const r of topResources) {
            lines.push(`| ${r.name} | ${r.resourceType} | ${fmt(r.monthlyCost)} |`);
        }
        if (project.resources.length > 15) {
            lines.push(`| _...and ${project.resources.length - 15} more_ | | |`);
        }
        lines.push('');
    }

    lines.push(`_Estimate generated ${new Date().toISOString().slice(0, 10)}_`);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Drift report formatter
// ---------------------------------------------------------------------------

export function formatDriftReport(result: DriftCheckResult): string {
    const icon = result.hasDrift ? '⚠️' : '✅';
    return [
        `## Terraform Drift Check — ${icon} ${result.hasDrift ? 'DRIFT DETECTED' : 'NO DRIFT'}`,
        ``,
        result.summary,
        result.hasDrift ? [
            ``,
            `| Change Type | Count |`,
            `|-------------|-------|`,
            `| ➕ Add       | ${result.addCount} |`,
            `| 🔄 Change   | ${result.changeCount} |`,
            `| 🗑️ Destroy  | ${result.destroyCount} |`,
        ].join('\n') : '',
        ``,
        `_Drift checked ${new Date().toISOString().slice(0, 10)}_`,
    ].filter(Boolean).join('\n');
}
