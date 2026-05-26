// ============================================================================
// DEVOPS DORA METRICS
//
// Computes the four DORA (DevOps Research and Assessment) metrics from
// deployment records and git history:
//   1. Deployment Frequency
//   2. Lead Time for Changes (PR merge → production deploy)
//   3. Change Failure Rate
//   4. Mean Time to Recovery (MTTR)
//
// DORA performance levels (2023 State of DevOps report):
//   Elite: Deploy on-demand (multiple/day), LT <1h, CFR <5%, MTTR <1h
//   High:  Deploy 1/week–1/day, LT 1day–1week, CFR 5–10%, MTTR <1day
//   Medium: Deploy 1/month–1/week, LT 1week–1month, CFR 11–15%, MTTR <1week
//   Low:  Deploy <1/month, LT >1month, CFR >15%, MTTR >1week
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DoraLevel = 'elite' | 'high' | 'medium' | 'low';

export interface DeploymentRecord {
    deployedAt:       string;   // ISO timestamp
    environment:      string;   // 'production' | 'staging' | 'dev'
    service:          string;
    commitSha:        string;
    success:          boolean;
    /** Minutes from PR merge → this deploy (for lead time calculation) */
    leadTimeMinutes?: number;
    /** For failed deploys that were recovered: minutes until recovery */
    mttrMinutes?:     number;
}

export interface DoraMetricDetail {
    value:       number;
    unit:        string;
    level:       DoraLevel;
    description: string;
}

export interface DoraMetrics {
    deploymentFrequency: DoraMetricDetail & { deploysPerDay: number };
    leadTimeForChanges:  DoraMetricDetail & { medianMinutes: number };
    changeFailureRate:   DoraMetricDetail & { percentage: number };
    mttr:                DoraMetricDetail & { medianMinutes: number };
    overallLevel:        DoraLevel;
    sampleSize:          number;
    periodDays:          number;
    formattedReport:     string;
}

export interface GitCommitEntry {
    sha:       string;
    mergedAt:  string; // ISO timestamp of PR merge
    subject:   string;
}

// ---------------------------------------------------------------------------
// DORA classification thresholds
// ---------------------------------------------------------------------------

function classifyDeployFreq(deploysPerDay: number): DoraLevel {
    if (deploysPerDay >= 1)    return 'elite';
    if (deploysPerDay >= 1/7)  return 'high';
    if (deploysPerDay >= 1/30) return 'medium';
    return 'low';
}

function classifyLeadTime(medianMinutes: number): DoraLevel {
    if (medianMinutes < 60)         return 'elite';   // < 1 hour
    if (medianMinutes < 60 * 24)    return 'high';    // < 1 day
    if (medianMinutes < 60 * 24 * 7) return 'medium'; // < 1 week
    return 'low';
}

function classifyCfr(pct: number): DoraLevel {
    if (pct < 5)  return 'elite';
    if (pct < 10) return 'high';
    if (pct < 15) return 'medium';
    return 'low';
}

function classifyMttr(medianMinutes: number): DoraLevel {
    if (medianMinutes < 60)          return 'elite';  // < 1 hour
    if (medianMinutes < 60 * 24)     return 'high';   // < 1 day
    if (medianMinutes < 60 * 24 * 7) return 'medium'; // < 1 week
    return 'low';
}

const LEVEL_ORDER: Record<DoraLevel, number> = { elite: 3, high: 2, medium: 1, low: 0 };

function worstLevel(levels: DoraLevel[]): DoraLevel {
    return levels.reduce((worst, l) =>
        LEVEL_ORDER[l] < LEVEL_ORDER[worst] ? l : worst, 'elite' as DoraLevel);
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid    = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? (sorted[mid] ?? 0)
        : (((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

export function computeDoraMetrics(
    deployments: DeploymentRecord[],
    periodDays = 30,
): DoraMetrics {
    const prodDeploys = deployments.filter((d) => d.environment === 'production');
    const totalDeploys = prodDeploys.length;

    // ── 1. Deployment Frequency ────────────────────────────────────────────
    const deploysPerDay = totalDeploys / periodDays;
    const dfLevel       = classifyDeployFreq(deploysPerDay);
    const dfUnit        = deploysPerDay >= 1
        ? `per day`
        : deploysPerDay >= 1/7
            ? `per week`
            : `per month`;
    const dfValue = deploysPerDay >= 1
        ? Math.round(deploysPerDay * 10) / 10
        : deploysPerDay >= 1/7
            ? Math.round(deploysPerDay * 7 * 10) / 10
            : Math.round(deploysPerDay * 30 * 10) / 10;

    // ── 2. Lead Time for Changes ───────────────────────────────────────────
    const leadTimes   = prodDeploys.filter((d) => d.leadTimeMinutes !== undefined).map((d) => d.leadTimeMinutes as number);
    const ltMedian    = median(leadTimes);
    const ltLevel     = classifyLeadTime(ltMedian);
    const ltFormatted = formatMinutes(ltMedian);

    // ── 3. Change Failure Rate ─────────────────────────────────────────────
    const failedDeploys = prodDeploys.filter((d) => !d.success).length;
    const cfrPct        = totalDeploys > 0 ? (failedDeploys / totalDeploys) * 100 : 0;
    const cfrLevel      = classifyCfr(cfrPct);

    // ── 4. MTTR ────────────────────────────────────────────────────────────
    const mttrTimes   = deployments.filter((d) => d.mttrMinutes !== undefined).map((d) => d.mttrMinutes as number);
    const mttrMedian  = median(mttrTimes);
    const mttrLevel   = classifyMttr(mttrMedian);
    const mttrFormatted = formatMinutes(mttrMedian);

    const overallLevel = worstLevel([dfLevel, ltLevel, cfrLevel, mttrLevel]);

    const metrics: DoraMetrics = {
        deploymentFrequency: {
            deploysPerDay,
            value:       dfValue,
            unit:        dfUnit,
            level:       dfLevel,
            description: `${dfValue} deployment(s) ${dfUnit} over ${periodDays} days`,
        },
        leadTimeForChanges: {
            medianMinutes: ltMedian,
            value:         ltMedian,
            unit:          'minutes',
            level:         ltLevel,
            description:   leadTimes.length > 0
                ? `Median ${ltFormatted} from PR merge to production (n=${leadTimes.length})`
                : 'No lead time data available (pass leadTimeMinutes in deployment records)',
        },
        changeFailureRate: {
            percentage: cfrPct,
            value:      Math.round(cfrPct * 10) / 10,
            unit:       '%',
            level:      cfrLevel,
            description: `${failedDeploys}/${totalDeploys} production deploys failed (${Math.round(cfrPct)}%)`,
        },
        mttr: {
            medianMinutes: mttrMedian,
            value:         mttrMedian,
            unit:          'minutes',
            level:         mttrLevel,
            description:   mttrTimes.length > 0
                ? `Median recovery time: ${mttrFormatted} (n=${mttrTimes.length})`
                : 'No MTTR data available (pass mttrMinutes in failed deployment records)',
        },
        overallLevel,
        sampleSize:      totalDeploys,
        periodDays,
        formattedReport: '',
    };

    metrics.formattedReport = formatDoraReport(metrics);
    return metrics;
}

// ---------------------------------------------------------------------------
// Git log parser — extracts commit SHA + merge timestamp from git log output
// ---------------------------------------------------------------------------

/**
 * Parse `git log --format="%H|%aI|%s" --merges` output into commit entries.
 * Used to calculate lead time when deployment records reference commit SHAs.
 */
export function parseGitLogForLeadTime(gitLogOutput: string): GitCommitEntry[] {
    return gitLogOutput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|');
            return {
                sha:      (parts[0] ?? '').trim(),
                mergedAt: (parts[1] ?? '').trim(),
                subject:  (parts[2] ?? '').trim(),
            };
        })
        .filter((e) => e.sha.length === 40);
}

/** Build the git log command to get merge commits with timestamps. */
export function buildGitLogLeadTimeCommand(fromDate?: string): string[] {
    const args = ['git', 'log', '--merges', '--format=%H|%aI|%s'];
    if (fromDate) args.push(`--after=${fromDate}`);
    return args;
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

export function formatDoraReport(metrics: DoraMetrics): string {
    const icon = (level: DoraLevel): string =>
        ({ elite: '🟢', high: '🔵', medium: '🟡', low: '🔴' })[level];

    const lines = [
        `## DORA Metrics Report`,
        ``,
        `**Period:** Last ${metrics.periodDays} days | **Production deployments analysed:** ${metrics.sampleSize}`,
        `**Overall performance:** ${icon(metrics.overallLevel)} ${metrics.overallLevel.toUpperCase()}`,
        ``,
        `| Metric | Value | Level |`,
        `|--------|-------|-------|`,
        `| Deployment Frequency | ${metrics.deploymentFrequency.value} ${metrics.deploymentFrequency.unit} | ${icon(metrics.deploymentFrequency.level)} ${metrics.deploymentFrequency.level} |`,
        `| Lead Time for Changes | ${formatMinutes(metrics.leadTimeForChanges.medianMinutes)} (median) | ${icon(metrics.leadTimeForChanges.level)} ${metrics.leadTimeForChanges.level} |`,
        `| Change Failure Rate | ${metrics.changeFailureRate.percentage.toFixed(1)}% | ${icon(metrics.changeFailureRate.level)} ${metrics.changeFailureRate.level} |`,
        `| MTTR | ${formatMinutes(metrics.mttr.medianMinutes)} (median) | ${icon(metrics.mttr.level)} ${metrics.mttr.level} |`,
        ``,
        `### Details`,
        `- **Deployment Frequency:** ${metrics.deploymentFrequency.description}`,
        `- **Lead Time:** ${metrics.leadTimeForChanges.description}`,
        `- **Change Failure Rate:** ${metrics.changeFailureRate.description}`,
        `- **MTTR:** ${metrics.mttr.description}`,
        ``,
        `### DORA Benchmarks`,
        `\`Elite\` ≥1/day · LT <1h · CFR <5% · MTTR <1h`,
        `\`High\`  1/week–1/day · LT <1day · CFR <10% · MTTR <1day`,
        `\`Medium\` 1/month–1/week · LT <1week · CFR <15% · MTTR <1week`,
        `\`Low\`   <1/month · LT >1month · CFR >15% · MTTR >1week`,
        ``,
        `_Generated ${new Date().toISOString().slice(0, 10)}_`,
    ];

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number): string {
    if (minutes === 0)    return 'N/A';
    if (minutes < 60)     return `${Math.round(minutes)}m`;
    if (minutes < 1440)   return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
}
