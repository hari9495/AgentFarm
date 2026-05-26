// ============================================================================
// DEVOPS ACTION HANDLER
// Handles all workspace_devops_* action types.
// ============================================================================

import {
    parseTerraformPlan,
    buildTfGeneratePrompt,
    parseTfGenerateOutput,
    buildIacSecurityPrompt,
    parseIacSecurityFindings,
    summariseTfPlan,
} from './devops-tf-builder.js';

import {
    buildK8sGeneratePrompt,
    parseK8sManifests,
    parseK8sRolloutStatus,
    buildK8sLogAnalysisPrompt,
    parseLogAnalysis,
    buildDockerCommands,
    buildDockerfilePrompt,
} from './devops-k8s-builder.js';

import {
    buildHelmInstallArgs,
    buildHelmRollbackArgs,
    buildHelmDiffArgs,
    buildHelmChartPrompt,
    parseHelmChartOutput,
    parseHelmDiff,
    buildEnvValuesContent,
} from './devops-helm-builder.js';

import {
    computeDoraMetrics,
} from './devops-dora-metrics.js';

import {
    pollK8sReadiness,
    runHttpHealthChecks,
    triggerRollback,
    triggerHelmRollback,
    formatVerificationReport,
} from './devops-deploy-verifier.js';

import {
    parseGitLog,
    buildGitLogCommand,
    buildReleaseNotes,
    buildGitHubReleasePayload,
} from './devops-release-builder.js';

import {
    buildTrivyScanArgs,
    buildGrypeScanArgs,
    buildSnykScanArgs,
    parseTrivyScanOutput,
    parseGrypeScanOutput,
    parseSnykScanOutput,
    buildScanRemediationPrompt,
    parseScanRemediation,
} from './devops-security-scanner.js';

import {
    buildPipelinePrompt,
    parsePipelineOutput,
    defaultCiJobs,
} from './devops-pipeline-generator.js';

import type { PipelineProvider, PipelineJobSpec, PipelineTriggerConfig } from './devops-pipeline-generator.js';

import {
    buildInfracostBreakdownArgs,
    parseInfracostOutput,
    buildTfDriftCheckArgs,
    parseTfDriftOutput,
    formatCostReport,
    formatDriftReport,
} from './devops-cost-estimator.js';

import {
    buildK8sSecretApplyArgs,
    buildK8sGetSecretArgs,
    buildK8sAnnotateSecretArgs,
    buildVaultKvPutArgs,
    buildVaultKvGetArgs,
    buildAwsRotateSecretArgs,
    buildAwsPutSecretValueArgs,
    buildCertGetArgs,
    buildCertRenewArgs,
    parseCertInfo,
    parseK8sSecretInfo,
    formatRotationReport,
    formatCertReport,
} from './devops-secret-manager.js';

import type { SecretRotationResult, CertRenewalResult } from './devops-secret-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevopsActionType =
    // ── Terraform ─────────────────────────────────────────────────────────────
    | 'workspace_devops_tf_plan'
    | 'workspace_devops_tf_apply'
    | 'workspace_devops_tf_validate'
    | 'workspace_devops_tf_generate'
    // ── Kubernetes ────────────────────────────────────────────────────────────
    | 'workspace_devops_k8s_deploy'
    | 'workspace_devops_k8s_rollback'
    | 'workspace_devops_k8s_status'
    | 'workspace_devops_k8s_logs'
    | 'workspace_devops_k8s_generate'
    // ── Docker ────────────────────────────────────────────────────────────────
    | 'workspace_devops_docker_build'
    | 'workspace_devops_docker_push'
    // ── CI/CD ─────────────────────────────────────────────────────────────────
    | 'workspace_devops_pipeline_trigger'
    | 'workspace_devops_pipeline_status'
    // ── Incident & reporting ──────────────────────────────────────────────────
    | 'workspace_devops_incident_triage'
    | 'workspace_devops_standup_report'
    // ── Helm (Gap 1) ──────────────────────────────────────────────────────────
    | 'workspace_devops_helm_install'
    | 'workspace_devops_helm_rollback'
    | 'workspace_devops_helm_diff'
    | 'workspace_devops_helm_generate'
    // ── DORA Metrics (Gap 2) ──────────────────────────────────────────────────
    | 'workspace_devops_dora_metrics'
    // ── Post-Deploy Verification (Gap 3) ──────────────────────────────────────
    | 'workspace_devops_deploy_verify'
    // ── Environment Promotion (Gap 4) ─────────────────────────────────────────
    | 'workspace_devops_env_promote'
    // ── Release Notes (Gap 5) ─────────────────────────────────────────────────
    | 'workspace_devops_release_notes'
    // ── Container Security Scan (Gap 6) ───────────────────────────────────────
    | 'workspace_devops_image_scan'
    // ── Pipeline Config Generation (Gap 7) ────────────────────────────────────
    | 'workspace_devops_pipeline_generate'
    // ── Cost Estimation (Gap 8) ───────────────────────────────────────────────
    | 'workspace_devops_cost_estimate'
    // ── Drift Detection (Gap 9) ───────────────────────────────────────────────
    | 'workspace_devops_drift_check'
    // ── Secret Rotation & Cert Renewal (Gap 10) ───────────────────────────────
    | 'workspace_devops_secret_rotate'
    | 'workspace_devops_cert_renew';

export const DEVOPS_ACTION_TYPES = new Set<DevopsActionType>([
    'workspace_devops_tf_plan',
    'workspace_devops_tf_apply',
    'workspace_devops_tf_validate',
    'workspace_devops_tf_generate',
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    'workspace_devops_k8s_status',
    'workspace_devops_k8s_logs',
    'workspace_devops_k8s_generate',
    'workspace_devops_docker_build',
    'workspace_devops_docker_push',
    'workspace_devops_pipeline_trigger',
    'workspace_devops_pipeline_status',
    'workspace_devops_incident_triage',
    'workspace_devops_standup_report',
    'workspace_devops_helm_install',
    'workspace_devops_helm_rollback',
    'workspace_devops_helm_diff',
    'workspace_devops_helm_generate',
    'workspace_devops_dora_metrics',
    'workspace_devops_deploy_verify',
    'workspace_devops_env_promote',
    'workspace_devops_release_notes',
    'workspace_devops_image_scan',
    'workspace_devops_pipeline_generate',
    'workspace_devops_cost_estimate',
    'workspace_devops_drift_check',
    'workspace_devops_secret_rotate',
    'workspace_devops_cert_renew',
]);

export function isDevopsActionType(at: string): at is DevopsActionType {
    return DEVOPS_ACTION_TYPES.has(at as DevopsActionType);
}

export type DevopsActionResult = { ok: boolean; output: string; errorOutput?: string; [key: string]: unknown };

type SubResult      = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;
type RunCommandFn   = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type LlmCallFn      = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface DevopsActionParams {
    actionType:    DevopsActionType;
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

function safeJson(obj: Record<string, unknown>): DevopsActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function num(v: unknown, fallback = 0):  number { return typeof v === 'number' ? v : fallback; }
async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleDevopsAction(params: DevopsActionParams): Promise<DevopsActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_devops_tf_plan
        // payload: working_dir? (default: workspaceDir), var_file?
        // ====================================================================
        case 'workspace_devops_tf_plan': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir  = str(payload['working_dir'], workspaceDir);
            const varFile = str(payload['var_file']);
            const args   = ['terraform', 'plan', '-no-color', ...(varFile ? [`-var-file=${varFile}`] : [])];
            const result = await runCommand(args, tfDir, 120_000);
            const plan   = parseTerraformPlan(result.stdout + result.stderr);
            const { score, riskLevel } = summariseTfPlan(plan);
            return safeJson({
                to_create: plan.toCreate, to_update: plan.toUpdate,
                to_destroy: plan.toDestroy, to_replace: plan.toReplace,
                has_destroy: plan.hasDestroy, risk_level: riskLevel,
                score, changes: plan.changes, summary: plan.summary,
                exit_code: result.exitCode,
            });
        }

        // ====================================================================
        // workspace_devops_tf_apply  [HIGH RISK — ApprovalEnforcer intercepts]
        // payload: working_dir?, var_file?, auto_approve? (default: false)
        // ====================================================================
        case 'workspace_devops_tf_apply': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir    = str(payload['working_dir'], workspaceDir);
            const varFile  = str(payload['var_file']);
            const autoApprove = payload['auto_approve'] === true;
            const args = [
                'terraform', 'apply', '-no-color',
                ...(autoApprove ? ['-auto-approve'] : []),
                ...(varFile ? [`-var-file=${varFile}`] : []),
            ];
            const result = await runCommand(args, tfDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, exit_code: result.exitCode,
                output_tail: result.stdout.slice(-2000),
                summary: ok ? 'Terraform apply completed successfully.' : `Terraform apply failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_tf_validate
        // payload: working_dir?, scan_security? (default: true)
        // ====================================================================
        case 'workspace_devops_tf_validate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir    = str(payload['working_dir'], workspaceDir);
            const doScan   = payload['scan_security'] !== false;
            const result   = await runCommand(['terraform', 'validate', '-no-color'], tfDir, 60_000);
            const valid    = result.exitCode === 0;
            let findings: ReturnType<typeof parseIacSecurityFindings> = [];
            if (doScan && callLlm) {
                const tfRead = await executeAction('workspace_read_file', { file_path: `${tfDir}/main.tf` });
                if (tfRead.ok) {
                    const provider = str(payload['provider'], 'aws');
                    const raw      = await callLlmSafe(callLlm, buildIacSecurityPrompt(tfRead.output, provider), 'You are a cloud security engineer.');
                    findings = parseIacSecurityFindings(raw);
                }
            }
            const criticalCount = findings.filter((f) => f.severity === 'critical').length;
            return safeJson({
                valid, exit_code: result.exitCode,
                security_findings: findings, critical_count: criticalCount,
                finding_count: findings.length,
                summary: `Terraform ${valid ? 'valid' : 'invalid'}. Security: ${criticalCount} critical, ${findings.length} total finding(s).`,
            });
        }

        // ====================================================================
        // workspace_devops_tf_generate
        // payload: description (required), provider?, region?, environment?, output_dir?
        // ====================================================================
        case 'workspace_devops_tf_generate': {
            const description = str(payload['description']);
            if (!description) return { ok: false, output: '', errorOutput: 'description is required' };
            const provider    = str(payload['provider'], 'aws');
            const region      = str(payload['region']);
            const environment = str(payload['environment']);
            const outputDir   = str(payload['output_dir'], 'infra');
            const prompt      = buildTfGeneratePrompt({ description, provider, region, environment });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior DevOps engineer. Return valid HCL only.');
            const files       = parseTfGenerateOutput(llmRaw);
            const written: string[] = [];
            for (const f of files) {
                const fp = `${outputDir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                provider, region, environment,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} Terraform file(s) in ${outputDir}/ for ${provider}.`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_deploy  [HIGH RISK]
        // payload: manifest_path? | manifest_dir?, namespace?, dry_run?
        // ====================================================================
        case 'workspace_devops_k8s_deploy': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const manifestPath = str(payload['manifest_path']);
            const manifestDir  = str(payload['manifest_dir'], workspaceDir);
            const namespace    = str(payload['namespace'], 'default');
            const dryRun       = payload['dry_run'] === true;
            const target       = manifestPath || manifestDir;
            const args         = [
                'kubectl', 'apply', '-f', target, '-n', namespace,
                ...(dryRun ? ['--dry-run=client'] : []),
            ];
            const result = await runCommand(args, workspaceDir, 120_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, namespace, dry_run: dryRun, exit_code: result.exitCode,
                output: result.stdout.slice(0, 2000),
                summary: ok
                    ? `Deployed to namespace "${namespace}"${dryRun ? ' (dry run)' : ''}.`
                    : `kubectl apply failed: ${result.stderr.slice(0, 200)}`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_rollback  [HIGH RISK]
        // payload: deployment (required), namespace?
        // ====================================================================
        case 'workspace_devops_k8s_rollback': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const deployment = str(payload['deployment']);
            if (!deployment) return { ok: false, output: '', errorOutput: 'deployment is required' };
            const namespace  = str(payload['namespace'], 'default');
            const result     = await runCommand(
                ['kubectl', 'rollout', 'undo', `deployment/${deployment}`, '-n', namespace],
                workspaceDir, 60_000,
            );
            const ok = result.exitCode === 0;
            return safeJson({
                ok, deployment, namespace,
                output: result.stdout,
                summary: ok ? `Rolled back deployment/${deployment} in ${namespace}.` : result.stderr.slice(0, 200),
            });
        }

        // ====================================================================
        // workspace_devops_k8s_status
        // payload: namespace?, deployment?
        // ====================================================================
        case 'workspace_devops_k8s_status': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const namespace  = str(payload['namespace'], 'default');
            const deployment = str(payload['deployment']);
            const args = deployment
                ? ['kubectl', 'rollout', 'status', `deployment/${deployment}`, '-n', namespace]
                : ['kubectl', 'get', 'pods', '-n', namespace, '--no-headers'];
            const result = await runCommand(args, workspaceDir, 30_000);
            const status = deployment
                ? parseK8sRolloutStatus(result.stdout, deployment, namespace)
                : null;
            return safeJson({
                ok: result.exitCode === 0,
                namespace, deployment: deployment || null,
                status, raw: result.stdout.slice(0, 2000),
                summary: status
                    ? `${deployment}: ${status.ready ? 'ready' : 'not ready'} (${status.available}/${status.desired})`
                    : result.stdout.slice(0, 200),
            });
        }

        // ====================================================================
        // workspace_devops_k8s_logs
        // payload: pod? | deployment? (required one), namespace?, tail_lines?
        // ====================================================================
        case 'workspace_devops_k8s_logs': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const pod        = str(payload['pod']);
            const deployment = str(payload['deployment']);
            const namespace  = str(payload['namespace'], 'default');
            const tail       = num(payload['tail_lines'], 200);
            const target     = pod ? pod : `deployment/${deployment}`;
            if (!pod && !deployment) return { ok: false, output: '', errorOutput: 'pod or deployment is required' };
            const result  = await runCommand(
                ['kubectl', 'logs', target, '-n', namespace, `--tail=${tail}`, '--timestamps'],
                workspaceDir, 30_000,
            );
            const logs    = result.stdout;
            let analysis  = null;
            if (callLlm && logs.length > 100) {
                const appName = pod || deployment;
                const raw     = await callLlmSafe(callLlm, buildK8sLogAnalysisPrompt(logs, appName), 'You are a senior SRE.');
                analysis      = parseLogAnalysis(raw);
            }
            return safeJson({
                ok: result.exitCode === 0,
                target, namespace, lines_fetched: logs.split('\n').length,
                logs: logs.slice(-3000),
                analysis,
                summary: analysis
                    ? `Logs analysed: ${analysis.errorCount} error(s), severity ${analysis.severity}. Root cause: ${analysis.rootCause}`
                    : `Fetched ${logs.split('\n').length} log lines from ${target}.`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_generate
        // payload: description (required), app_name, image, namespace?, port?,
        //          replicas?, ingress?, environment?, output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_generate': {
            const description = str(payload['description']);
            const appName     = str(payload['app_name'], 'my-app');
            const image       = str(payload['image'], `${appName}:latest`);
            const namespace   = str(payload['namespace'], 'default');
            const port        = typeof payload['port']     === 'number' ? payload['port']     : 8080;
            const replicas    = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const ingress     = payload['ingress'] === true;
            const environment = str(payload['environment'], 'production');
            const outputDir   = str(payload['output_dir'], 'k8s');
            const prompt      = buildK8sGeneratePrompt({ description, appName, image, namespace, port, replicas, ingress, environment });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior Kubernetes engineer. Return valid YAML only.');
            const manifests   = parseK8sManifests(llmRaw);
            const written: string[] = [];
            for (const m of manifests) {
                const fp = `${outputDir}/${m.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: m.content });
                written.push(fp);
            }
            return safeJson({
                app_name: appName, image, namespace, replicas, port,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} K8s manifest(s) for ${appName} in ${outputDir}/.`,
            });
        }

        // ====================================================================
        // workspace_devops_docker_build
        // payload: image_name (required), tag?, registry?, dockerfile?, build_args?
        // ====================================================================
        case 'workspace_devops_docker_build': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const imageName  = str(payload['image_name']);
            if (!imageName) return { ok: false, output: '', errorOutput: 'image_name is required' };
            const tag        = str(payload['tag'], 'latest');
            const registry   = str(payload['registry']);
            const dockerfile = str(payload['dockerfile'], 'Dockerfile');
            const buildArgs  = typeof payload['build_args'] === 'object' && payload['build_args'] !== null
                ? payload['build_args'] as Record<string, string>
                : {};
            const { buildCmd, fullImage } = buildDockerCommands({ imageName, tag, registry, dockerfile, buildArgs });
            const result = await runCommand(buildCmd, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, image: fullImage, exit_code: result.exitCode,
                output: (result.stdout + result.stderr).slice(-2000),
                summary: ok ? `Docker image built: ${fullImage}` : `Docker build failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_docker_push
        // payload: image_name (required), tag?, registry?
        // ====================================================================
        case 'workspace_devops_docker_push': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const imageName = str(payload['image_name']);
            if (!imageName) return { ok: false, output: '', errorOutput: 'image_name is required' };
            const tag       = str(payload['tag'], 'latest');
            const registry  = str(payload['registry']);
            const { tagCmd, pushCmd, fullImage } = buildDockerCommands({ imageName, tag, registry });
            if (tagCmd) await runCommand(tagCmd, workspaceDir, 30_000);
            const result = await runCommand(pushCmd, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, image: fullImage, exit_code: result.exitCode,
                summary: ok ? `Pushed ${fullImage} to registry.` : `Docker push failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_trigger  [HIGH RISK]
        // payload: pipeline (required), ref?, provider? (github_actions|gitlab_ci)
        // ====================================================================
        case 'workspace_devops_pipeline_trigger': {
            const pipeline = str(payload['pipeline']);
            const ref      = str(payload['ref'], 'main');
            const provider = str(payload['provider'], 'github_actions');
            if (!pipeline) return { ok: false, output: '', errorOutput: 'pipeline is required' };
            // Trigger via connector
            const connResult = await executeAction('workspace_connector_test', {
                connector: provider, action: 'trigger_pipeline',
                pipeline, ref,
            });
            return safeJson({
                ok: connResult.ok, pipeline, ref, provider,
                summary: connResult.ok
                    ? `Pipeline "${pipeline}" triggered on ${provider} (ref: ${ref}).`
                    : `Pipeline trigger failed: ${connResult.errorOutput ?? 'unknown error'}`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_status
        // payload: pipeline (required), run_id?, provider?
        // ====================================================================
        case 'workspace_devops_pipeline_status': {
            const pipeline = str(payload['pipeline']);
            const runId    = str(payload['run_id']);
            const provider = str(payload['provider'], 'github_actions');
            if (!pipeline) return { ok: false, output: '', errorOutput: 'pipeline is required' };
            const connResult = await executeAction('workspace_ci_status_poll', {
                connector: provider, pipeline, run_id: runId || undefined,
            });
            return safeJson({
                ok: connResult.ok, pipeline, run_id: runId, provider,
                raw: connResult.output,
                summary: connResult.ok ? connResult.output.slice(0, 200) : 'Status check failed.',
            });
        }

        // ====================================================================
        // workspace_devops_incident_triage
        // payload: log_source? (file_path | raw_logs), service_name, alert_description?
        // ====================================================================
        case 'workspace_devops_incident_triage': {
            const serviceName      = str(payload['service_name'], 'unknown-service');
            const alertDescription = str(payload['alert_description']);
            const logFilePath      = str(payload['log_path']);
            let   rawLogs          = str(payload['raw_logs']);
            if (!rawLogs && logFilePath) {
                const fileResult = await executeAction('workspace_read_file', { file_path: logFilePath });
                rawLogs = fileResult.ok ? fileResult.output : '';
            }
            if (!rawLogs && !alertDescription)
                return { ok: false, output: '', errorOutput: 'raw_logs or log_path or alert_description is required' };
            const prompt = rawLogs
                ? buildK8sLogAnalysisPrompt(rawLogs, serviceName)
                : `Triage this incident alert for ${serviceName}: ${alertDescription}. Return JSON with rootCause, remediations, severity, affectedDeps, errorCount.`;
            const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a senior SRE conducting incident triage.');
            const analysis = rawLogs ? parseLogAnalysis(llmRaw) : { rootCause: llmRaw.slice(0, 200), remediations: [], severity: 'medium' as const, affectedDeps: [], errorCount: 0 };
            return safeJson({
                service_name: serviceName,
                severity: analysis.severity,
                root_cause: analysis.rootCause,
                affected_deps: analysis.affectedDeps,
                remediations: analysis.remediations,
                error_count: analysis.errorCount,
                summary: `Incident triage for ${serviceName}: ${analysis.severity} severity. Root cause: ${analysis.rootCause}`,
            });
        }

        // ====================================================================
        // workspace_devops_standup_report
        // payload: bot_name?, team_name?, recent_deployments?, incidents?,
        //          pipeline_pass_rate?, infra_changes?
        // ====================================================================
        case 'workspace_devops_standup_report': {
            const botName      = str(payload['bot_name'],  'DevOps Agent');
            const teamName     = str(payload['team_name'], 'Engineering');
            const deployments  = Array.isArray(payload['recent_deployments']) ? (payload['recent_deployments'] as string[]) : [];
            const incidents    = Array.isArray(payload['incidents'])           ? (payload['incidents']           as string[]) : [];
            const passRate     = typeof payload['pipeline_pass_rate'] === 'number' ? payload['pipeline_pass_rate'] : null;
            const infraChanges = str(payload['infra_changes']);
            const prompt = [
                `Generate a professional DevOps standup for ${botName} presenting to ${teamName}.`,
                deployments.length > 0 ? `Recent deployments: ${deployments.join(', ')}` : '',
                incidents.length > 0   ? `Active incidents: ${incidents.join(', ')}`     : 'No active incidents.',
                passRate !== null       ? `Pipeline pass rate: ${passRate}%`              : '',
                infraChanges           ? `Infrastructure changes: ${infraChanges}`        : '',
                ``,
                `Format: Yesterday | Today | Blockers | Infrastructure health`,
            ].filter(Boolean).join('\n');
            const spokenText = await callLlmSafe(callLlm, prompt, 'You are a DevOps agent reporting status. Be concise and data-driven.');
            return safeJson({
                bot_name: botName, team_name: teamName,
                deployments, incidents, pipeline_pass_rate: passRate,
                spoken_text: spokenText || `${botName} standup: ${deployments.length} deployment(s), ${incidents.length} incident(s).`,
                summary: `DevOps standup generated for ${teamName}.`,
            });
        }

        // ====================================================================
        // workspace_devops_helm_install  [HIGH RISK]
        // payload: release_name (required), chart (required), namespace?,
        //          version?, values_files?, set_values?, atomic?, timeout?
        // ====================================================================
        case 'workspace_devops_helm_install': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            const chart       = str(payload['chart']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!chart)       return { ok: false, output: '', errorOutput: 'chart is required' };
            const namespace   = str(payload['namespace'], 'default');
            const version     = str(payload['version']);
            const valuesFiles = Array.isArray(payload['values_files'])
                ? (payload['values_files'] as string[]) : [];
            const setValues   = typeof payload['set_values'] === 'object' && payload['set_values'] !== null
                ? (payload['set_values'] as Record<string, string>) : {};
            const atomic      = payload['atomic'] !== false;
            const timeout     = str(payload['timeout'], '5m0s');
            const dryRun      = payload['dry_run'] === true;
            const args        = buildHelmInstallArgs({
                releaseName, chart, namespace,
                version:     version || undefined,
                valuesFiles: valuesFiles.length > 0 ? valuesFiles : undefined,
                setValues:   Object.keys(setValues).length > 0 ? setValues : undefined,
                atomic, wait: true, timeout,
                createNamespace: payload['create_namespace'] === true,
                dryRun,
            });
            const result = await runCommand(args, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, release_name: releaseName, chart, namespace, dry_run: dryRun,
                exit_code: result.exitCode,
                output: result.stdout.slice(0, 2000),
                summary: ok
                    ? `Helm release "${releaseName}" deployed to namespace "${namespace}"${dryRun ? ' (dry-run)' : ''}.`
                    : `Helm install failed: ${result.stderr.slice(0, 300)}`,
            });
        }

        // ====================================================================
        // workspace_devops_helm_rollback  [HIGH RISK]
        // payload: release_name (required), namespace?, revision?
        // ====================================================================
        case 'workspace_devops_helm_rollback': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            const namespace   = str(payload['namespace'], 'default');
            const revision    = typeof payload['revision'] === 'number' ? payload['revision'] : undefined;
            const args        = buildHelmRollbackArgs({
                releaseName, namespace, revision, wait: true,
            });
            const result = await runCommand(args, workspaceDir, 180_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, release_name: releaseName, namespace, revision: revision ?? 'previous',
                output: result.stdout,
                summary: ok
                    ? `Helm release "${releaseName}" rolled back to ${revision !== undefined ? `revision ${revision}` : 'previous version'}.`
                    : `Helm rollback failed: ${result.stderr.slice(0, 300)}`,
            });
        }

        // ====================================================================
        // workspace_devops_helm_diff
        // payload: release_name (required), chart (required), namespace?,
        //          version?, values_files?, set_values?
        // ====================================================================
        case 'workspace_devops_helm_diff': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            const chart       = str(payload['chart']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!chart)       return { ok: false, output: '', errorOutput: 'chart is required' };
            const namespace   = str(payload['namespace'], 'default');
            const version     = str(payload['version']);
            const valuesFiles = Array.isArray(payload['values_files'])
                ? (payload['values_files'] as string[]) : [];
            const setValues   = typeof payload['set_values'] === 'object' && payload['set_values'] !== null
                ? (payload['set_values'] as Record<string, string>) : {};
            const args        = buildHelmDiffArgs({
                releaseName, chart, namespace,
                version:     version || undefined,
                valuesFiles: valuesFiles.length > 0 ? valuesFiles : undefined,
                setValues:   Object.keys(setValues).length > 0 ? setValues : undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const diff   = parseHelmDiff(result.stdout + result.stderr);
            return safeJson({
                ok: result.exitCode === 0,
                release_name: releaseName, chart, namespace,
                has_changes:    diff.hasChanges,
                added_count:    diff.addedCount,
                removed_count:  diff.removedCount,
                modified_count: diff.modifiedCount,
                summary:        diff.summary,
                diff:           diff.rawDiff.slice(0, 3000),
            });
        }

        // ====================================================================
        // workspace_devops_helm_generate
        // payload: app_name (required), description (required), image (required),
        //          port?, replicas?, namespace?, environment?, ingress?,
        //          hpa?, pdb?, output_dir?
        // ====================================================================
        case 'workspace_devops_helm_generate': {
            const appName     = str(payload['app_name']);
            const description = str(payload['description']);
            const image       = str(payload['image']);
            if (!appName)     return { ok: false, output: '', errorOutput: 'app_name is required' };
            if (!description) return { ok: false, output: '', errorOutput: 'description is required' };
            if (!image)       return { ok: false, output: '', errorOutput: 'image is required' };
            const port        = typeof payload['port']     === 'number' ? payload['port']     : 8080;
            const replicas    = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const namespace   = str(payload['namespace'],   'default');
            const environment = str(payload['environment'], 'production');
            const ingress     = payload['ingress'] === true;
            const hpa         = payload['hpa']     === true;
            const pdb         = payload['pdb']     === true;
            const outputDir   = str(payload['output_dir'], `helm/${appName}`);
            const prompt      = buildHelmChartPrompt({ appName, description, image, port, replicas, namespace, environment, ingress, hpa, pdb });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior Kubernetes/Helm engineer. Return valid JSON only.');
            const files       = parseHelmChartOutput(llmRaw);
            const written: string[] = [];
            for (const f of files) {
                const fp = `${outputDir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                app_name: appName, image, namespace, replicas, port,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} Helm chart file(s) for "${appName}" in ${outputDir}/.`,
            });
        }

        // ====================================================================
        // workspace_devops_dora_metrics
        // payload: deployments (required — array of DeploymentRecord),
        //          period_days? (default: 30)
        // ====================================================================
        case 'workspace_devops_dora_metrics': {
            const rawDeploys = payload['deployments'];
            if (!Array.isArray(rawDeploys)) return { ok: false, output: '', errorOutput: 'deployments array is required' };
            const periodDays  = typeof payload['period_days'] === 'number' ? payload['period_days'] : 30;
            const metrics     = computeDoraMetrics(rawDeploys as Parameters<typeof computeDoraMetrics>[0], periodDays);
            return safeJson({
                overall_level:       metrics.overallLevel,
                deploy_freq_level:   metrics.deploymentFrequency.level,
                lead_time_level:     metrics.leadTimeForChanges.level,
                cfr_level:           metrics.changeFailureRate.level,
                mttr_level:          metrics.mttr.level,
                deploys_per_day:     metrics.deploymentFrequency.deploysPerDay,
                lead_time_median_min: metrics.leadTimeForChanges.medianMinutes,
                cfr_pct:             metrics.changeFailureRate.percentage,
                mttr_median_min:     metrics.mttr.medianMinutes,
                sample_size:         metrics.sampleSize,
                period_days:         metrics.periodDays,
                formatted_report:    metrics.formattedReport,
                summary: `DORA: ${metrics.overallLevel.toUpperCase()} — DF ${metrics.deploymentFrequency.level}, LT ${metrics.leadTimeForChanges.level}, CFR ${metrics.changeFailureRate.level}, MTTR ${metrics.mttr.level}`,
            });
        }

        // ====================================================================
        // workspace_devops_deploy_verify
        // payload: deployment (required), namespace?, health_checks? (array),
        //          max_wait_seconds?, auto_rollback? (default: false)
        //          use_helm? (default: false), release_name?
        // ====================================================================
        case 'workspace_devops_deploy_verify': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const deployment = str(payload['deployment']);
            if (!deployment) return { ok: false, output: '', errorOutput: 'deployment is required' };
            const namespace      = str(payload['namespace'], 'default');
            const maxWait        = typeof payload['max_wait_seconds'] === 'number' ? payload['max_wait_seconds'] : 180;
            const autoRollback   = payload['auto_rollback'] === true;
            const useHelm        = payload['use_helm'] === true;
            const releaseName    = str(payload['release_name'], deployment);
            const started        = Date.now();

            // 1. Poll K8s readiness
            const k8sReady = await pollK8sReadiness({
                deployment, namespace, workspaceDir, runCommand, maxWaitSeconds: maxWait,
            });

            // 2. Run HTTP health checks
            const rawHealthChecks = Array.isArray(payload['health_checks'])
                ? (payload['health_checks'] as Array<{ endpoint: string; expected_status?: number; body_contains?: string; timeout_ms?: number }>)
                : [];
            const hcConfigs = rawHealthChecks.map((hc) => ({
                endpoint:             hc.endpoint,
                expectedStatusCode:   hc.expected_status,
                expectedBodyContains: hc.body_contains,
                timeoutMs:            hc.timeout_ms,
            }));
            const healthChecks = hcConfigs.length > 0
                ? await runHttpHealthChecks(hcConfigs, fetch)
                : [];

            // 3. Determine overall health
            const allHealthy   = k8sReady.ready && healthChecks.every((h) => h.healthy);
            let rolledBack     = false;
            let rollbackReason = '';
            let rollbackOutput = '';

            if (!allHealthy && autoRollback) {
                rollbackReason = k8sReady.ready ? 'HTTP health checks failed' : 'K8s readiness timeout';
                const rb = useHelm
                    ? await triggerHelmRollback({ releaseName, namespace, workspaceDir, runCommand, reason: rollbackReason })
                    : await triggerRollback({ deployment, namespace, workspaceDir, runCommand, reason: rollbackReason });
                rolledBack     = rb.ok;
                rollbackOutput = rb.output;
            }

            const durationSeconds = Math.round((Date.now() - started) / 1000);
            const verifyResult = {
                healthy: allHealthy, healthChecks, k8sReadiness: k8sReady,
                rolledBack, rollbackReason: rollbackReason || undefined,
                rollbackOutput: rollbackOutput || undefined,
                durationSeconds, report: '',
            };
            verifyResult.report = formatVerificationReport(verifyResult);

            return safeJson({
                healthy:          allHealthy,
                k8s_ready:        k8sReady.ready,
                http_checks_ok:   healthChecks.every((h) => h.healthy),
                rolled_back:      rolledBack,
                rollback_reason:  rollbackReason || null,
                duration_seconds: durationSeconds,
                report:           verifyResult.report,
                summary: allHealthy
                    ? `Deployment "${deployment}" is healthy after ${durationSeconds}s.`
                    : `Deployment "${deployment}" is UNHEALTHY after ${durationSeconds}s.${rolledBack ? ' Auto-rollback triggered.' : ''}`,
            });
        }

        // ====================================================================
        // workspace_devops_env_promote
        // payload: release_name (required), from_environment (required),
        //          to_environment (required), chart?, image_tag?,
        //          values_base_dir? (default: 'helm/envs'), namespace?
        // ====================================================================
        case 'workspace_devops_env_promote': {
            const releaseName   = str(payload['release_name']);
            const fromEnv       = str(payload['from_environment']);
            const toEnv         = str(payload['to_environment']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!fromEnv)     return { ok: false, output: '', errorOutput: 'from_environment is required' };
            if (!toEnv)       return { ok: false, output: '', errorOutput: 'to_environment is required' };
            const imageTag      = str(payload['image_tag'], 'latest');
            const valuesBaseDir = str(payload['values_base_dir'], 'helm/envs');
            const namespace     = str(payload['namespace'], toEnv);
            const replicas      = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const ingressHost   = str(payload['ingress_host']);
            const resourceCpu   = str(payload['resource_cpu']);
            const resourceMem   = str(payload['resource_memory']);

            // Generate values override file for target environment
            const valuesContent = buildEnvValuesContent({
                environment: toEnv,
                replicas,
                imageTag,
                ingressHost: ingressHost || undefined,
                resources: (resourceCpu && resourceMem)
                    ? { cpu: resourceCpu, memory: resourceMem }
                    : undefined,
            });
            const valuesFilePath = `${valuesBaseDir}/${toEnv}/values.yaml`;
            await executeAction('workspace_write_file', { file_path: valuesFilePath, content: valuesContent });

            return safeJson({
                release_name:     releaseName,
                from_environment: fromEnv,
                to_environment:   toEnv,
                image_tag:        imageTag,
                namespace,
                values_file:      valuesFilePath,
                summary: `Promotion from "${fromEnv}" → "${toEnv}" prepared. Values written to ${valuesFilePath}. Run helm_install with values_files: ["${valuesFilePath}"] to complete.`,
            });
        }

        // ====================================================================
        // workspace_devops_release_notes
        // payload: version (required), previous_version (required),
        //          git_log_output? | (from_ref + to_ref for auto-fetch),
        //          draft?, prerelease?, target_branch?
        // ====================================================================
        case 'workspace_devops_release_notes': {
            const version         = str(payload['version']);
            const previousVersion = str(payload['previous_version']);
            if (!version)         return { ok: false, output: '', errorOutput: 'version is required' };
            if (!previousVersion) return { ok: false, output: '', errorOutput: 'previous_version is required' };

            // Fetch git log if not provided
            let gitLogRaw = str(payload['git_log_output']);
            if (!gitLogRaw && runCommand) {
                const fromRef = str(payload['from_ref'], previousVersion);
                const toRef   = str(payload['to_ref'], 'HEAD');
                const logArgs = buildGitLogCommand(fromRef, toRef);
                const result  = await runCommand(logArgs, workspaceDir, 30_000);
                gitLogRaw     = result.stdout;
            }
            const commits  = parseGitLog(gitLogRaw);
            const notes    = buildReleaseNotes({ version, previousVersion, commits });
            const ghPayload = buildGitHubReleasePayload({
                version, notes,
                draft:        payload['draft']      === true,
                prerelease:   payload['prerelease']  === true,
                targetBranch: str(payload['target_branch']) || undefined,
            });
            return safeJson({
                version,         previous_version: previousVersion,
                total_commits:   notes.totalCommits,
                breaking_count:  notes.breaking.length,
                feature_count:   notes.features.length,
                fix_count:       notes.bugFixes.length,
                formatted_markdown: notes.formattedMarkdown,
                github_payload:  ghPayload,
                summary: `Release notes for ${version}: ${notes.totalCommits} commit(s), ${notes.breaking.length} breaking, ${notes.features.length} feature(s), ${notes.bugFixes.length} fix(es).`,
            });
        }

        // ====================================================================
        // workspace_devops_image_scan
        // payload: image (required), scanner? (trivy|grype|snyk, default: trivy),
        //          severity_filter? (array), ignore_unfixed?
        // ====================================================================
        case 'workspace_devops_image_scan': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const image    = str(payload['image']);
            if (!image)    return { ok: false, output: '', errorOutput: 'image is required' };
            const scanner  = (str(payload['scanner'], 'trivy')) as 'trivy' | 'grype' | 'snyk';
            const ignoreUnfixed = payload['ignore_unfixed'] === true;

            let scanArgs: string[];
            if (scanner === 'trivy') {
                scanArgs = buildTrivyScanArgs(image, { ignoreUnfixed });
            } else if (scanner === 'grype') {
                scanArgs = buildGrypeScanArgs(image, { onlyFixed: ignoreUnfixed });
            } else {
                scanArgs = buildSnykScanArgs(image);
            }

            const result = await runCommand(scanArgs, workspaceDir, 300_000);
            let scanResult;
            if (scanner === 'trivy') {
                scanResult = parseTrivyScanOutput(result.stdout, image);
            } else if (scanner === 'grype') {
                scanResult = parseGrypeScanOutput(result.stdout, image);
            } else {
                scanResult = parseSnykScanOutput(result.stdout, image);
            }

            // LLM remediation advice for critical/high findings
            let remediation = null;
            if (callLlm && (scanResult.critical > 0 || scanResult.high > 0)) {
                const prompt = buildScanRemediationPrompt(scanResult);
                const raw    = await callLlmSafe(callLlm, prompt, 'You are a container security engineer. Return JSON only.');
                remediation  = parseScanRemediation(raw);
            }

            return safeJson({
                image, scanner,
                total:       scanResult.total,
                critical:    scanResult.critical,
                high:        scanResult.high,
                medium:      scanResult.medium,
                low:         scanResult.low,
                fixable:     scanResult.fixable,
                risk_level:  scanResult.riskLevel,
                report:      scanResult.formattedReport,
                remediation,
                summary: `Image scan (${scanner}): ${scanResult.total} finding(s) — ${scanResult.critical} critical, ${scanResult.high} high, ${scanResult.medium} medium. Risk: ${scanResult.riskLevel}.`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_generate
        // payload: provider (required), repo_name (required), language (required),
        //          description?, jobs?, triggers?, output_dir?
        // ====================================================================
        case 'workspace_devops_pipeline_generate': {
            const provider  = (str(payload['provider'], 'github_actions')) as PipelineProvider;
            const repoName  = str(payload['repo_name']);
            const language  = str(payload['language'], 'Node.js');
            if (!repoName) return { ok: false, output: '', errorOutput: 'repo_name is required' };
            const description = str(payload['description'], `CI/CD pipeline for ${repoName}`);
            const rawJobs     = Array.isArray(payload['jobs']) ? payload['jobs'] : null;
            const jobs        = rawJobs ? (rawJobs as PipelineJobSpec[]) : defaultCiJobs(language);
            const rawTriggers = typeof payload['triggers'] === 'object' && payload['triggers'] !== null
                ? (payload['triggers'] as PipelineTriggerConfig)
                : { onPush: true, onPr: true, branches: ['main'] } satisfies PipelineTriggerConfig;
            const outputDir   = str(payload['output_dir'], '.');

            const prompt   = buildPipelinePrompt({ provider, repoName, description, language, jobs, triggers: rawTriggers });
            const llmRaw   = await callLlmSafe(callLlm, prompt, 'You are a senior DevOps engineer. Return valid JSON only.');
            const parsed   = parsePipelineOutput(llmRaw, provider);
            const written: string[] = [];
            for (const f of parsed.files) {
                const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                provider, repo_name: repoName, language,
                files_written: written, file_count: written.length,
                summary: written.length > 0
                    ? `Generated ${written.length} pipeline config(s) for ${provider}: ${written.join(', ')}`
                    : `No pipeline files generated for ${provider}.`,
            });
        }

        // ====================================================================
        // workspace_devops_cost_estimate
        // payload: working_dir? (default: workspaceDir), tf_vars_file?,
        //          currency? (default: USD), plan_file?
        // ====================================================================
        case 'workspace_devops_cost_estimate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir      = str(payload['working_dir'], workspaceDir);
            const tfVarsFile = str(payload['tf_vars_file']);
            const currency   = str(payload['currency'], 'USD');
            const args       = buildInfracostBreakdownArgs({
                tfDir,
                tfVarsFile: tfVarsFile || undefined,
                currency:   currency || undefined,
            });
            const result  = await runCommand(args, tfDir, 180_000);
            if (result.exitCode !== 0) {
                return safeJson({
                    ok: false, exit_code: result.exitCode,
                    error: result.stderr.slice(0, 500),
                    summary: `Infracost failed (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
                });
            }
            const estimate = parseInfracostOutput(result.stdout);
            if (!estimate) {
                return safeJson({
                    ok: false, raw: result.stdout.slice(0, 500),
                    summary: 'Failed to parse Infracost output.',
                });
            }
            return safeJson({
                ok: true,
                total_monthly_cost: estimate.totalMonthlyCost,
                past_monthly_cost:  estimate.pastMonthlyCost,
                diff_monthly_cost:  estimate.diffMonthlyCost,
                currency:           estimate.currency,
                project_count:      estimate.projects.length,
                report:             estimate.formattedReport,
                summary: `Estimated cost: ${estimate.currency} ${estimate.totalMonthlyCost.toFixed(2)}/month${
                    estimate.diffMonthlyCost !== undefined
                        ? ` (${estimate.diffMonthlyCost >= 0 ? '+' : ''}${estimate.diffMonthlyCost.toFixed(2)} change)`
                        : ''
                }.`,
            });
        }

        // ====================================================================
        // workspace_devops_drift_check
        // payload: working_dir? (default: workspaceDir), tf_vars_file?, plan_file?
        // ====================================================================
        case 'workspace_devops_drift_check': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir      = str(payload['working_dir'], workspaceDir);
            const tfVarsFile = str(payload['tf_vars_file']);
            const planFile   = str(payload['plan_file']);
            const args       = buildTfDriftCheckArgs({
                tfDir,
                tfVarsFile: tfVarsFile || undefined,
                planFile:   planFile   || undefined,
            });
            const result = await runCommand(args, tfDir, 180_000);
            const drift  = parseTfDriftOutput(result.stdout + result.stderr, result.exitCode);
            const report = formatDriftReport(drift);
            return safeJson({
                has_drift:     drift.hasDrift,
                add_count:     drift.addCount,
                change_count:  drift.changeCount,
                destroy_count: drift.destroyCount,
                exit_code:     result.exitCode,
                report,
                summary: drift.summary,
            });
        }

        // ====================================================================
        // workspace_devops_secret_rotate
        // payload: secret_name (required), backend (required: kubernetes|vault|aws),
        //          namespace? (k8s), new_value?, key_values? (object),
        //          aws_region?, vault_mount?
        // ====================================================================
        case 'workspace_devops_secret_rotate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const secretName = str(payload['secret_name']);
            const backend    = (str(payload['backend'], 'kubernetes')) as 'kubernetes' | 'vault' | 'aws_secrets_manager';
            if (!secretName) return { ok: false, output: '', errorOutput: 'secret_name is required' };
            const results: SecretRotationResult[] = [];

            if (backend === 'kubernetes') {
                const namespace  = str(payload['namespace'], 'default');
                const keyValues  = typeof payload['key_values'] === 'object' && payload['key_values'] !== null
                    ? (payload['key_values'] as Record<string, string>) : {};
                const newValue   = str(payload['new_value']);

                if (Object.keys(keyValues).length === 0 && newValue) {
                    keyValues['value'] = newValue;
                }
                if (Object.keys(keyValues).length === 0) {
                    return { ok: false, output: '', errorOutput: 'key_values or new_value is required for kubernetes backend' };
                }

                // kubectl create secret --dry-run | kubectl apply
                const dryRunArgs = buildK8sSecretApplyArgs({ name: secretName, namespace, data: keyValues });
                const dryRunRes  = await runCommand(dryRunArgs, workspaceDir, 15_000);
                let ok = dryRunRes.exitCode === 0;
                if (ok) {
                    const applyRes = await runCommand(['kubectl', 'apply', '-f', '-'], workspaceDir, 15_000);
                    ok = applyRes.exitCode === 0;
                }

                // Annotate with rotation timestamp
                await runCommand(
                    buildK8sAnnotateSecretArgs({ name: secretName, namespace, annotations: { 'agentfarm.dev/last-rotated': new Date().toISOString() } }),
                    workspaceDir, 10_000,
                ).catch(() => null);

                results.push({ backend: 'kubernetes', secretName, namespace, ok, output: dryRunRes.stdout, summary: ok ? `K8s secret "${secretName}" rotated in namespace "${namespace}".` : `K8s secret rotation failed: ${dryRunRes.stderr.slice(0, 200)}` });

            } else if (backend === 'vault') {
                const vaultPath  = str(payload['vault_path'], secretName);
                const vaultMount = str(payload['vault_mount'], 'secret');
                const keyValues  = typeof payload['key_values'] === 'object' && payload['key_values'] !== null
                    ? (payload['key_values'] as Record<string, string>) : {};
                if (Object.keys(keyValues).length === 0) {
                    return { ok: false, output: '', errorOutput: 'key_values is required for vault backend' };
                }
                const putArgs  = buildVaultKvPutArgs({ path: vaultPath, data: keyValues, mount: vaultMount });
                const putResult = await runCommand(putArgs, workspaceDir, 30_000);
                const ok = putResult.exitCode === 0;
                // Fetch new version
                const getResult  = await runCommand(buildVaultKvGetArgs(vaultPath, vaultMount), workspaceDir, 10_000);
                const metaMatch  = getResult.stdout.match(/"version"\s*:\s*(\d+)/);
                const newVersion = metaMatch ? metaMatch[1] : undefined;
                results.push({ backend: 'vault', secretName, ok, newVersion, output: putResult.stdout, summary: ok ? `Vault secret "${vaultPath}" rotated (v${newVersion ?? '?'}).` : `Vault rotation failed: ${putResult.stderr.slice(0, 200)}` });

            } else {
                // aws_secrets_manager
                const region    = str(payload['aws_region']);
                const newValue  = str(payload['new_value']);
                if (!newValue)  return { ok: false, output: '', errorOutput: 'new_value is required for aws_secrets_manager backend' };
                const putArgs   = buildAwsPutSecretValueArgs({ secretId: secretName, secretValue: newValue, region: region || undefined });
                const putResult = await runCommand(putArgs, workspaceDir, 30_000);
                const ok        = putResult.exitCode === 0;
                results.push({ backend: 'aws_secrets_manager', secretName, ok, output: putResult.stdout, summary: ok ? `AWS secret "${secretName}" rotated.` : `AWS rotation failed: ${putResult.stderr.slice(0, 200)}` });
            }

            const report = formatRotationReport(results);
            const allOk  = results.every((r) => r.ok);
            return safeJson({
                ok: allOk, backend, secret_name: secretName,
                results, report,
                summary: allOk ? `Secret "${secretName}" rotated successfully.` : `Secret rotation failed for "${secretName}".`,
            });
        }

        // ====================================================================
        // workspace_devops_cert_renew
        // payload: cert_name (required), namespace? (default: default),
        //          check_only? (default: false)
        // ====================================================================
        case 'workspace_devops_cert_renew': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const certName  = str(payload['cert_name']);
            if (!certName)  return { ok: false, output: '', errorOutput: 'cert_name is required' };
            const namespace = str(payload['namespace'], 'default');
            const checkOnly = payload['check_only'] === true;

            // 1. Get current cert status
            const getResult  = await runCommand(buildCertGetArgs(certName, namespace), workspaceDir, 15_000);
            const certInfo   = parseCertInfo(getResult.stdout);
            const results: CertRenewalResult[] = [certInfo];

            // 2. If check_only or cert is about to expire (<30 days), trigger renewal
            const needsRenewal = certInfo.daysRemaining !== undefined && certInfo.daysRemaining < 30;

            if (!checkOnly && needsRenewal) {
                const renewResult = await runCommand(buildCertRenewArgs(certName, namespace), workspaceDir, 30_000);
                results.push({
                    ...certInfo,
                    ok:      renewResult.exitCode === 0,
                    output:  renewResult.stdout,
                    summary: renewResult.exitCode === 0
                        ? `Certificate "${certName}" renewal triggered.`
                        : `Certificate renewal failed: ${renewResult.stderr.slice(0, 200)}`,
                });
            }

            const report     = formatCertReport(results);
            const latestInfo = results[results.length - 1] ?? certInfo;

            return safeJson({
                cert_name:     certName,
                namespace,
                ok:            latestInfo.ok,
                not_after:     certInfo.notAfter ?? null,
                days_remaining: certInfo.daysRemaining ?? null,
                renewal_triggered: !checkOnly && needsRenewal,
                report,
                summary: latestInfo.summary,
            });
        }
    }
}
