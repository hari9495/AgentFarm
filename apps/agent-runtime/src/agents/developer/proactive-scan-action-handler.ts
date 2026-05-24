// ============================================================================
// PROACTIVE TECH DEBT ACTION HANDLER
// Orchestrates health scans, generates prioritised reports, auto-fixes deps.
// Tier 34 — workspace_dev_proactive_scan, _tech_debt_report, _autofix_deps.
// ============================================================================

import {
    aggregateScanFindings,
    computeHealthScore,
    scoreToRisk,
    buildScanSummary,
    buildTechDebtReportPrompt,
    parseTechDebtReport,
    buildAutoFixPrContent,
    buildTechDebtIssueBody,
    buildTechDebtSlackMessage,
    type ScanCategory,
    type ScanFinding,
} from './proactive-scan-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProactiveScanActionType =
    | 'workspace_dev_proactive_scan'
    | 'workspace_dev_tech_debt_report'
    | 'workspace_dev_autofix_deps';

export const PROACTIVE_SCAN_ACTION_TYPES = new Set<ProactiveScanActionType>([
    'workspace_dev_proactive_scan',
    'workspace_dev_tech_debt_report',
    'workspace_dev_autofix_deps',
]);

export function isProactiveScanActionType(at: string): at is ProactiveScanActionType {
    return PROACTIVE_SCAN_ACTION_TYPES.has(at as ProactiveScanActionType);
}

type SubResult       = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;
type RunCommandFn    = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type LlmCallFn       = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface ProactiveScanParams {
    actionType:    ProactiveScanActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(data: Record<string, unknown>): { ok: boolean; output: string } {
    return { ok: true, output: JSON.stringify(data) };
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

async function callLlmSafe(fn: LlmCallFn, prompt: string, sys?: string): Promise<string> {
    try { return await fn(prompt, sys); } catch { return ''; }
}

/**
 * Runs a scan action and returns { category, raw } for aggregation.
 * Never throws — scan failures are non-fatal.
 */
async function runScan(
    executeAction: ExecuteActionFn,
    actionType:    string,
    payload:       Record<string, unknown>,
    category:      ScanCategory,
): Promise<{ category: ScanCategory; raw: string }> {
    try {
        const result = await executeAction(actionType, payload);
        return { category, raw: result.ok ? result.output : '' };
    } catch {
        return { category, raw: '' };
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleProactiveScanAction(
    params: ProactiveScanParams,
): Promise<{ ok: boolean; output: string; errorOutput?: string }> {
    const { actionType, payload, workspaceDir, executeAction, runCommand, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_dev_proactive_scan
        // Runs the full suite of health checks in parallel and aggregates findings.
        // Optionally files a GitHub issue and/or sends a Slack notification.
        //
        // payload:
        //   project_name?    — display name (default: last segment of workspaceDir)
        //   scans?           — array of scan categories to run (default: all)
        //                      options: "secret"|"cve"|"dependency"|"quality"|"security"|"bundle_size"
        //   create_issue?    — bool: file a GitHub issue if findings exist (default: false)
        //   notify_slack?    — bool: send Slack summary (default: false)
        //   slack_channel?   — Slack channel (default: payload from workspace_slack_notify)
        //   severity_threshold? — only report findings at or above this level (default: "low")
        // ====================================================================
        case 'workspace_dev_proactive_scan': {
            const projectName = str(payload['project_name'], workspaceDir.split('/').pop() ?? 'project');
            const threshold   = str(payload['severity_threshold'], 'low') as ScanFinding['severity'];
            const createIssue = payload['create_issue'] === true;
            const notifySlack = payload['notify_slack']  === true;

            const requestedScans = Array.isArray(payload['scans'])
                ? payload['scans'] as string[]
                : ['secret', 'cve', 'dependency', 'quality', 'security', 'bundle_size'];

            // Run all requested scans in parallel (best-effort)
            const scanJobs: Array<Promise<{ category: ScanCategory; raw: string }>> = [];

            if (requestedScans.includes('secret')) {
                scanJobs.push(runScan(executeAction, 'workspace_secret_scan', { workspace_dir: workspaceDir }, 'secret'));
            }
            if (requestedScans.includes('cve')) {
                scanJobs.push(runScan(executeAction, 'workspace_cve_check', { workspace_dir: workspaceDir }, 'cve'));
            }
            if (requestedScans.includes('dependency')) {
                scanJobs.push(runScan(executeAction, 'workspace_dev_dependency_audit', { workspace_dir: workspaceDir }, 'dependency'));
            }
            if (requestedScans.includes('quality')) {
                scanJobs.push(runScan(executeAction, 'workspace_dev_code_quality', { workspace_dir: workspaceDir }, 'quality'));
            }
            if (requestedScans.includes('security')) {
                scanJobs.push(runScan(executeAction, 'workspace_sast_scan', { workspace_dir: workspaceDir }, 'security'));
            }
            if (requestedScans.includes('bundle_size')) {
                scanJobs.push(runScan(executeAction, 'workspace_bundle_size_analyze', { workspace_dir: workspaceDir }, 'bundle_size'));
            }

            const scanOutputs   = await Promise.all(scanJobs);
            const allFindings   = aggregateScanFindings(scanOutputs);

            // Filter by severity threshold
            const LEVELS: Record<ScanFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1 };
            const thresholdLevel = LEVELS[threshold] ?? 1;
            const findings = allFindings.filter((f) => LEVELS[f.severity] >= thresholdLevel);

            const healthScore = computeHealthScore(findings);
            const riskLevel   = scoreToRisk(healthScore);
            const summary     = buildScanSummary(findings, projectName);

            const autoFixable = findings.filter((f) => f.autoFixable);
            const recommended: string[] = [
                ...findings.filter((f) => f.severity === 'critical').map((f) => f.remediation),
                ...findings.filter((f) => f.severity === 'high').map((f) => f.remediation),
            ].slice(0, 5);

            // Optional: file GitHub issue
            if (createIssue && findings.length > 0) {
                const issueTitle = `[Tech Debt] ${projectName}: ${findings.filter(f=>f.severity==='critical').length} critical, ${findings.filter(f=>f.severity==='high').length} high findings`;
                const issueBody  = buildTechDebtIssueBody(
                    {
                        generatedAt:      new Date().toISOString(),
                        overallScore:     healthScore,
                        riskLevel,
                        topFindings:      findings.slice(0, 5),
                        trendSummary:     'See prioritised steps below.',
                        prioritizedSteps: recommended,
                        estimatedEffort:  'Review findings to estimate.',
                    },
                    projectName,
                );
                await executeAction('workspace_github_issue_triage', {
                    title:  issueTitle,
                    body:   issueBody,
                    labels: ['tech-debt', 'automated-scan', riskLevel],
                }).catch(() => { /* non-fatal */ });
            }

            // Optional: Slack notification
            if (notifySlack) {
                const slackMsg = buildTechDebtSlackMessage(
                    {
                        generatedAt:      new Date().toISOString(),
                        overallScore:     healthScore,
                        riskLevel,
                        topFindings:      findings.slice(0, 3),
                        trendSummary:     `Health score: ${healthScore}/100`,
                        prioritizedSteps: recommended,
                        estimatedEffort:  'Unknown',
                    },
                    projectName,
                );
                const channel = str(payload['slack_channel'], '#engineering');
                await executeAction('workspace_slack_notify', {
                    channel,
                    message: slackMsg,
                }).catch(() => { /* non-fatal */ });
            }

            return safeJson({
                project_name:       projectName,
                health_score:       healthScore,
                risk_level:         riskLevel,
                finding_count:      findings.length,
                critical_count:     findings.filter((f) => f.severity === 'critical').length,
                high_count:         findings.filter((f) => f.severity === 'high').length,
                auto_fixable_count: autoFixable.length,
                findings:           findings.slice(0, 50),
                recommended_actions: recommended,
                summary,
            });
        }

        // ====================================================================
        // workspace_dev_tech_debt_report
        // Generates a prioritised tech debt report with trend analysis.
        //
        // payload:
        //   project_name?    — display name
        //   include_history? — bool: include episodic memory in trend analysis (default: true)
        //   output_format?   — "json" | "slack" | "github_issue" (default: "json")
        //   create_issue?    — bool: auto-file GitHub issue (default: false)
        // ====================================================================
        case 'workspace_dev_tech_debt_report': {
            if (!callLlm) return { ok: false, output: '', errorOutput: 'callLlm is required for tech_debt_report' };

            const projectName   = str(payload['project_name'], workspaceDir.split('/').pop() ?? 'project');
            const includeHistory = payload['include_history'] !== false;
            const outputFormat  = str(payload['output_format'], 'json') as 'json' | 'slack' | 'github_issue';
            const createIssue   = payload['create_issue'] === true;

            // 1. Run a quick scan to get current findings
            const scanOutputs = await Promise.all([
                runScan(executeAction, 'workspace_secret_scan',        { workspace_dir: workspaceDir }, 'secret'),
                runScan(executeAction, 'workspace_cve_check',          { workspace_dir: workspaceDir }, 'cve'),
                runScan(executeAction, 'workspace_dev_dependency_audit', { workspace_dir: workspaceDir }, 'dependency'),
                runScan(executeAction, 'workspace_dev_code_quality',   { workspace_dir: workspaceDir }, 'quality'),
                runScan(executeAction, 'workspace_sast_scan',          { workspace_dir: workspaceDir }, 'security'),
            ]);
            const findings    = aggregateScanFindings(scanOutputs);
            const healthScore = computeHealthScore(findings);

            // 2. Load episodic history if requested
            let episodicHistory = '';
            if (includeHistory) {
                const memResult = await executeAction('workspace_memory_search', {
                    query: 'tech debt scan quality security',
                    limit: 20,
                }).catch(() => ({ ok: false, output: '' }));
                episodicHistory = memResult.output.slice(0, 2000);
            }

            // 3. LLM-driven report synthesis
            const prompt = buildTechDebtReportPrompt({
                projectName,
                findings,
                episodicHistory,
                healthScore,
            });
            const raw    = await callLlmSafe(callLlm, prompt, 'You are a senior software architect producing a tech debt analysis.');
            const report = parseTechDebtReport(raw, findings, healthScore, projectName);

            // 4. Optional GitHub issue
            if (createIssue) {
                const issueBody = buildTechDebtIssueBody(report, projectName);
                await executeAction('workspace_github_issue_triage', {
                    title:  `[Tech Debt Report] ${projectName} — score ${report.overallScore}/100 (${report.riskLevel})`,
                    body:   issueBody,
                    labels: ['tech-debt', 'automated-report'],
                }).catch(() => { /* non-fatal */ });
            }

            // 5. Output format
            if (outputFormat === 'slack') {
                return safeJson({ format: 'slack', message: buildTechDebtSlackMessage(report, projectName), report });
            }
            if (outputFormat === 'github_issue') {
                return safeJson({ format: 'github_issue', body: buildTechDebtIssueBody(report, projectName), report });
            }

            return safeJson({
                project_name:      projectName,
                overall_score:     report.overallScore,
                risk_level:        report.riskLevel,
                trend_summary:     report.trendSummary,
                prioritized_steps: report.prioritizedSteps,
                estimated_effort:  report.estimatedEffort,
                top_findings:      report.topFindings,
                summary: `Tech debt report: ${projectName} — score ${report.overallScore}/100 (${report.riskLevel}). ${report.trendSummary}`,
            });
        }

        // ====================================================================
        // workspace_dev_autofix_deps
        // For each auto-fixable dependency finding, creates a fix branch and PR.
        //
        // payload:
        //   project_name?    — display name
        //   severity_min?    — minimum severity to fix (default: "high")
        //   max_prs?         — cap on PRs created (default: 5)
        //   dry_run?         — if true, return what would be fixed without doing it
        // ====================================================================
        case 'workspace_dev_autofix_deps': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available for autofix_deps' };

            const projectName = str(payload['project_name'], workspaceDir.split('/').pop() ?? 'project');
            const severityMin = str(payload['severity_min'], 'high') as ScanFinding['severity'];
            const maxPrs      = typeof payload['max_prs'] === 'number' ? payload['max_prs'] : 5;
            const dryRun      = payload['dry_run'] === true;

            // 1. Run dependency and CVE scans
            const scanOutputs = await Promise.all([
                runScan(executeAction, 'workspace_cve_check',            { workspace_dir: workspaceDir }, 'cve'),
                runScan(executeAction, 'workspace_dev_dependency_audit',  { workspace_dir: workspaceDir }, 'dependency'),
            ]);
            const allFindings = aggregateScanFindings(scanOutputs);

            // 2. Filter: auto-fixable + above severity threshold + have dependency info
            const LEVELS: Record<ScanFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1 };
            const minLevel = LEVELS[severityMin] ?? 3;
            const fixable  = allFindings
                .filter((f) => f.autoFixable && f.dependency && LEVELS[f.severity] >= minLevel)
                .slice(0, maxPrs);

            if (fixable.length === 0) {
                return safeJson({
                    pr_count: 0,
                    summary:  `No auto-fixable dependency findings at or above "${severityMin}" severity.`,
                });
            }

            if (dryRun) {
                return safeJson({
                    dry_run:  true,
                    would_fix: fixable.map((f) => ({
                        package:  f.dependency?.name,
                        from:     f.dependency?.current,
                        to:       f.dependency?.fixed,
                        severity: f.severity,
                        title:    f.title,
                    })),
                    summary: `Dry-run: would create ${fixable.length} fix PR(s).`,
                });
            }

            // 3. Detect package manager from workspace root
            const lsResult = await runCommand(['ls'], workspaceDir, 8_000);
            const files    = lsResult.stdout.toLowerCase();
            const pkgMgr   = files.includes('yarn.lock')   ? 'yarn' :
                             files.includes('pnpm-lock')   ? 'pnpm' :
                             files.includes('package.json') ? 'npm' :
                             files.includes('pom.xml')      ? 'mvn' :
                             files.includes('go.mod')       ? 'go'  :
                             files.includes('requirements') ? 'pip' :
                             files.includes('cargo.toml')   ? 'cargo' : 'npm';

            const prResults: Array<{ package: string; ok: boolean; pr_url?: string; message: string }> = [];

            for (const finding of fixable) {
                const dep     = finding.dependency!;
                const branch  = `fix/bump-${dep.name.replace(/[^a-zA-Z0-9-]/g, '-')}-${dep.fixed}`.slice(0, 60);
                const { title, body } = buildAutoFixPrContent(finding);

                // Create fix branch
                const branchResult = await runCommand(['git', 'checkout', '-b', branch], workspaceDir, 10_000);
                if (branchResult.exitCode !== 0) {
                    prResults.push({ package: dep.name, ok: false, message: 'Failed to create branch' });
                    continue;
                }

                // Apply the dependency bump via package manager
                let bumpResult: { exitCode: number; stderr: string } = { exitCode: 1, stderr: 'Unknown package manager' };
                if (pkgMgr === 'npm') {
                    bumpResult = await runCommand(['npm', 'install', `${dep.name}@${dep.fixed}`], workspaceDir, 120_000);
                } else if (pkgMgr === 'yarn') {
                    bumpResult = await runCommand(['yarn', 'add', `${dep.name}@${dep.fixed}`], workspaceDir, 120_000);
                } else if (pkgMgr === 'pnpm') {
                    bumpResult = await runCommand(['pnpm', 'add', `${dep.name}@${dep.fixed}`], workspaceDir, 120_000);
                } else if (pkgMgr === 'pip') {
                    bumpResult = await runCommand(['pip', 'install', `${dep.name}==${dep.fixed}`], workspaceDir, 120_000);
                } else if (pkgMgr === 'go') {
                    bumpResult = await runCommand(['go', 'get', `${dep.name}@${dep.fixed}`], workspaceDir, 120_000);
                } else if (pkgMgr === 'mvn') {
                    // Maven: update property in pom.xml via versions plugin
                    bumpResult = await runCommand(
                        ['mvn', 'versions:set-property', `-Dproperty=${dep.name}.version`, `-DnewVersion=${dep.fixed}`, '-DgenerateBackupPoms=false'],
                        workspaceDir, 120_000,
                    );
                } else if (pkgMgr === 'cargo') {
                    bumpResult = await runCommand(['cargo', 'update', '-p', dep.name], workspaceDir, 120_000);
                }

                if (bumpResult.exitCode !== 0) {
                    // Restore main branch
                    await runCommand(['git', 'checkout', '-'], workspaceDir, 10_000);
                    prResults.push({ package: dep.name, ok: false, message: bumpResult.stderr.slice(0, 200) });
                    continue;
                }

                // Commit + push + PR
                await runCommand(['git', 'add', '-A'], workspaceDir, 10_000);
                await runCommand(['git', 'commit', '-m', `fix(deps): bump ${dep.name} from ${dep.current} to ${dep.fixed}`], workspaceDir, 15_000);
                await runCommand(['git', 'push', '-u', 'origin', branch], workspaceDir, 60_000);

                const prResult = await runCommand(
                    ['gh', 'pr', 'create', '--title', title, '--body', body, '--base', 'main'],
                    workspaceDir, 60_000,
                );

                const prUrl = prResult.stdout.trim().split('\n').find((l) => l.startsWith('https://'));
                prResults.push({
                    package: dep.name,
                    ok:      prResult.exitCode === 0,
                    pr_url:  prUrl,
                    message: prResult.exitCode === 0 ? 'PR created' : prResult.stderr.slice(0, 200),
                });

                // Return to main branch for next iteration
                await runCommand(['git', 'checkout', '-'], workspaceDir, 10_000);
            }

            const created  = prResults.filter((r) => r.ok).length;
            const pkgNames = prResults.filter((r) => r.ok).map((r) => r.package).join(', ');

            return safeJson({
                pr_count:     created,
                failed_count: prResults.length - created,
                package_manager: pkgMgr,
                results:      prResults,
                summary: `Auto-fix: ${created}/${prResults.length} dependency fix PR(s) created for ${projectName}.${pkgNames ? ` Packages: ${pkgNames}.` : ''}`,
            });
        }
    }
}
