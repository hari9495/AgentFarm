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

import {
    buildAwsCliArgs,
    buildAzCliArgs,
    buildGcloudArgs,
    parseCloudCliOutput,
    summariseCloudResult,
    isDestructiveAws,
    isDestructiveAz,
    isDestructiveGcloud,
} from './devops-cloud-cli-builder.js';

import {
    buildTfStateMvArgs,
    buildTfStateRmArgs,
    buildTfImportArgs,
    buildTfStatePullArgs,
    buildTfStatePushArgs,
    buildTfStateUnlockArgs,
    buildTfStateListArgs,
    buildTfStateShowArgs,
    parseTfStateList,
    parseTfStatePull,
    extractLockId,
    buildTfStateOpPrompt,
    parseTfStateOpPlan,
} from './devops-tf-state-builder.js';

import {
    buildRoleYaml,
    buildClusterRoleYaml,
    buildRoleBindingYaml,
    buildClusterRoleBindingYaml,
    buildServiceAccountYaml,
    buildKubectlApplyArgs,
    buildKubectlCanIArgs,
    buildRbacGeneratePrompt,
    parseRbacManifests,
    buildRbacAuditChecks,
} from './devops-k8s-rbac-builder.js';

import {
    buildGrafanaDashboardPrompt,
    parseGrafanaDashboard,
    buildGrafanaDashboardApiPayload,
    buildAlertRulePrompt,
    parseAlertRuleOutput,
    buildPrometheusRuleCrd,
    buildDatadogMonitorPayload,
    buildPagerDutyServicePayload,
} from './devops-observability-builder.js';

import type { GrafanaPanel, PrometheusAlertRule } from './devops-observability-builder.js';

import {
    buildBlueGreenManifests,
    buildBlueGreenSwitchArgs,
    buildScaleDownArgs,
    buildArgoRolloutsManifest,
    buildArgoRolloutsPromoteArgs,
    buildArgoRolloutsAbortArgs,
    buildArgoRolloutsStatusArgs,
    buildIstioTrafficSplitManifests,
    buildDeploymentStrategyPrompt,
    parseDeploymentStrategyOutput,
} from './devops-deployment-strategy-builder.js';

import type { CanaryStep } from './devops-deployment-strategy-builder.js';

import {
    buildArgoCdSyncArgs,
    buildArgoCdRollbackArgs,
    buildArgoCdHistoryArgs,
    buildArgoCdGetArgs,
    buildArgoCdListArgs,
    buildArgoCdDiffArgs,
    buildArgoCdSetArgs,
    buildArgoCdWaitArgs,
    buildArgoCdApplicationYaml,
    parseArgoCdAppStatus,
    parseArgoCdAppList,
    summariseArgoCdApps,
    buildArgoCdAppPrompt,
} from './devops-argocd-builder.js';

import {
    buildHpaYaml,
    buildVpaYaml,
    buildResourceQuotaYaml,
    buildKubectlGetHpaArgs,
    buildKubectlScaleArgs,
    buildKubectlPatchHpaArgs,
    buildKubectlGetVpaArgs,
    buildCaStatusArgs,
    parseHpaStatus,
    buildAutoscalerPrompt,
    parseAutoscalerOutput,
} from './devops-k8s-autoscaler-builder.js';

import type { HpaSpec, VpaSpec, ResourceQuotaSpec } from './devops-k8s-autoscaler-builder.js';

import {
    buildKubectlExecArgs,
    buildGetPodNameArgs,
    buildDbMigrationExecArgs,
    buildPgDumpExecArgs,
    buildPsqlExecArgs,
    buildRedisExecArgs,
    buildMongoExecArgs,
    buildK8sJobYaml,
    buildKubectlCreateJobArgs,
    buildKubectlWaitJobArgs,
    buildKubectlLogsJobArgs,
    buildKubectlDeleteJobArgs,
    parseJobStatus,
    buildMigrationJobPrompt,
} from './devops-k8s-exec-builder.js';

import type { K8sJobSpec } from './devops-k8s-exec-builder.js';

import {
    buildRoute53ChangeBatch,
    buildRoute53ChangeArgs,
    buildRoute53ListRecordsArgs,
    buildRoute53ListZonesArgs,
    buildCloudFlareDnsArgs,
    buildAzDnsArgs,
    buildGcloudDnsArgs,
    buildAlbListenerRuleArgs,
    buildAlbDescribeListenersArgs,
    buildAlbDescribeTargetGroupHealthArgs,
    buildKubectlPatchIngressArgs,
    buildIngressYaml,
    buildAcmRequestCertArgs,
    buildAcmDescribeCertArgs,
    parseRoute53Records,
    parseCloudFlareDnsRecords,
    parseAcmCertStatus,
} from './devops-dns-lb-builder.js';

import type { DnsProvider, DnsRecordType } from './devops-dns-lb-builder.js';

import {
    buildIstioVirtualServiceYaml,
    buildIstioDestinationRuleYaml,
    buildIstioPeerAuthYaml,
    buildIstioAuthzPolicyYaml,
    buildIstioGatewayYaml,
    buildLinkerdServiceProfileYaml,
    buildIstioCtlAnalyzeArgs,
    buildIstioCtlProxyStatusArgs,
    buildIstioCtlProxyConfigArgs,
    buildLinkerdCheckArgs,
    buildLinkerdInjectArgs,
    buildLinkerdStatArgs,
    buildServiceMeshPrompt,
    parseServiceMeshOutput,
} from './devops-service-mesh-builder.js';

import type { MeshProvider, IstioRetryPolicy, IstioCircuitBreaker } from './devops-service-mesh-builder.js';

import {
    calculateErrorBudget,
    buildBurnRateAlerts,
    buildSlothSloYaml,
    buildPyrraObjectiveYaml,
    buildSloAlertRulesCrd,
    formatErrorBudgetReport,
    buildSloPrompt,
    parseSloOutput,
} from './devops-slo-builder.js';

import type { SloSpec } from './devops-slo-builder.js';

import {
    buildKubeBenchArgs,
    buildKubeBenchJobYaml,
    buildKubeBenchLogsArgs,
    buildFalcoRulesYaml,
    buildFalcoRulesConfigMapYaml,
    FALCO_HARDENED_RULES,
    buildFalcoStatusArgs,
    buildFalcoLogsArgs,
    buildFalcoRestartArgs,
    parseKubeBenchOutput,
    parseFalcoAlerts,
    formatComplianceReport,
    buildComplianceScanPrompt,
    buildFalcoRulePrompt,
} from './devops-compliance-scanner.js';

import type { FalcoRule, ComplianceTarget } from './devops-compliance-scanner.js';

import {
    buildEcrListImagesArgs,
    buildEcrDeleteImagesArgs,
    buildEcrPutLifecyclePolicyArgs,
    buildEcrLifecyclePolicyJson,
    buildGhcrListVersionsArgs,
    buildGhcrDeleteVersionArgs,
    buildGcloudImagesListArgs,
    buildGcloudImagesDeleteArgs,
    buildAcrShowTagsArgs,
    buildAcrPurgePolicyArgs,
    buildDockerMirrorCommands,
    buildCraneCopyArgs,
    buildSkopeoCopyArgs,
    applyRetentionPolicy,
    parseEcrImages,
    formatRegistryCleanupReport,
    buildEcrDescribeReposArgs,
} from './devops-registry-builder.js';

import type { RegistryProvider, RetentionPolicy } from './devops-registry-builder.js';

import {
    buildK6Script,
    buildK6RunArgs,
    buildGatlingArgs,
    buildJMeterArgs,
    parseK6Output,
    compareBenchmarks,
    formatLoadTestReport,
    buildK6ScriptPrompt,
    buildGatlingScriptPrompt,
    parseLoadTestScriptOutput,
} from './devops-load-test-builder.js';

import type { LoadTestScenario } from './devops-load-test-builder.js';

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
    | 'workspace_devops_cert_renew'
    // ── P1 Gap 1 — Cloud CLI ─────────────────────────────────────────────────
    | 'workspace_devops_aws_cli'
    | 'workspace_devops_az_cli'
    | 'workspace_devops_gcloud_cli'
    // ── P1 Gap 2 — Terraform State Management ────────────────────────────────
    | 'workspace_devops_tf_state'
    // ── P1 Gap 3 — Kubernetes RBAC ───────────────────────────────────────────
    | 'workspace_devops_k8s_rbac'
    // ── P1 Gap 4 — Observability Management ──────────────────────────────────
    | 'workspace_devops_grafana_dashboard'
    | 'workspace_devops_alert_rule'
    // ── P1 Gap 5 — Deployment Strategy Builder ───────────────────────────────
    | 'workspace_devops_blue_green'
    | 'workspace_devops_canary'
    // ── P2 Gap 6 — ArgoCD / GitOps ───────────────────────────────────────────
    | 'workspace_devops_argocd'
    // ── P2 Gap 7 — HPA / VPA / Autoscaler ────────────────────────────────────
    | 'workspace_devops_k8s_autoscale'
    // ── P2 Gap 8 — Database / exec-into-pod ──────────────────────────────────
    | 'workspace_devops_k8s_exec'
    // ── P2 Gap 9 — DNS & Load Balancer ───────────────────────────────────────
    | 'workspace_devops_dns'
    | 'workspace_devops_lb'
    // ── P2 Gap 10 — Service Mesh (Istio / Linkerd) ───────────────────────────
    | 'workspace_devops_service_mesh'
    // ── P3 Gap 11 — SLO / Error Budgets ──────────────────────────────────────
    | 'workspace_devops_slo'
    // ── P3 Gap 12 — CIS Compliance Scanning ──────────────────────────────────
    | 'workspace_devops_compliance_scan'
    // ── P3 Gap 13 — Container Registry Hygiene ───────────────────────────────
    | 'workspace_devops_registry'
    // ── P3 Gap 14 — Load / Performance Testing ───────────────────────────────
    | 'workspace_devops_load_test';

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
    'workspace_devops_aws_cli',
    'workspace_devops_az_cli',
    'workspace_devops_gcloud_cli',
    'workspace_devops_tf_state',
    'workspace_devops_k8s_rbac',
    'workspace_devops_grafana_dashboard',
    'workspace_devops_alert_rule',
    'workspace_devops_blue_green',
    'workspace_devops_canary',
    'workspace_devops_argocd',
    'workspace_devops_k8s_autoscale',
    'workspace_devops_k8s_exec',
    'workspace_devops_dns',
    'workspace_devops_lb',
    'workspace_devops_service_mesh',
    'workspace_devops_slo',
    'workspace_devops_compliance_scan',
    'workspace_devops_registry',
    'workspace_devops_load_test',
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

        // ====================================================================
        // workspace_devops_aws_cli
        // payload: service (required), operation (required), flags?, region?,
        //          profile?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_aws_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const service   = str(payload['service']);
            const operation = str(payload['operation']);
            if (!service)   return { ok: false, output: '', errorOutput: 'service is required' };
            if (!operation) return { ok: false, output: '', errorOutput: 'operation is required' };

            if (isDestructiveAws(operation) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Operation "${operation}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags  = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args   = buildAwsCliArgs({
                service, operation,
                flags,
                region:  str(payload['region']) || undefined,
                profile: str(payload['profile']) || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'aws', service, operation);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'aws', service, operation,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_az_cli
        // payload: group (required), subcommand (required), flags?,
        //          subscription?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_az_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const group      = str(payload['group']);
            const subcommand = str(payload['subcommand']);
            if (!group)      return { ok: false, output: '', errorOutput: 'group is required' };
            if (!subcommand) return { ok: false, output: '', errorOutput: 'subcommand is required' };

            if (isDestructiveAz(subcommand) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Subcommand "${subcommand}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args  = buildAzCliArgs({
                group, subcommand, flags,
                subscription: str(payload['subscription']) || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'azure', group, subcommand);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'azure', group, subcommand,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_gcloud_cli
        // payload: component (required), subcommand (required), flags?,
        //          project?, zone?, region?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_gcloud_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const component  = str(payload['component']);
            const subcommand = str(payload['subcommand']);
            if (!component)  return { ok: false, output: '', errorOutput: 'component is required' };
            if (!subcommand) return { ok: false, output: '', errorOutput: 'subcommand is required' };

            // subcommand may be "instances list" — check first word
            const firstWord = subcommand.split(' ')[0] ?? subcommand;
            if (isDestructiveGcloud(firstWord) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Subcommand "${subcommand}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args  = buildGcloudArgs({
                component, subcommand, flags,
                project: str(payload['project']) || undefined,
                zone:    str(payload['zone'])    || undefined,
                region:  str(payload['region'])  || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'gcp', component, subcommand);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'gcp', component, subcommand,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_tf_state
        // payload: operation (required: mv|rm|import|pull|list|show|unlock|push),
        //          source?, destination?, address?, id?, lock_id?,
        //          local_state_path?, working_dir?, dry_run?
        // ====================================================================
        case 'workspace_devops_tf_state': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const operation = str(payload['operation']);
            const tfDir     = str(payload['working_dir'], workspaceDir);
            if (!operation) return { ok: false, output: '', errorOutput: 'operation is required (mv|rm|import|pull|list|show|unlock|push)' };

            switch (operation) {
                case 'mv': {
                    const source = str(payload['source']);
                    const dest   = str(payload['destination']);
                    if (!source || !dest) return { ok: false, output: '', errorOutput: 'source and destination required for mv' };
                    const args   = buildTfStateMvArgs({ source, destination: dest });
                    const result = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'mv', source, destination: dest, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Moved "${source}" → "${dest}"` : result.stderr.slice(0, 200) });
                }
                case 'rm': {
                    const address = str(payload['address']);
                    if (!address) return { ok: false, output: '', errorOutput: 'address required for rm' };
                    const dryRun  = payload['dry_run'] === true;
                    const args    = buildTfStateRmArgs({ address, dryRun });
                    const result  = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'rm', address, dry_run: dryRun, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Removed "${address}" from state${dryRun ? ' (dry-run)' : ''}.` : result.stderr.slice(0, 200) });
                }
                case 'import': {
                    const address = str(payload['address']);
                    const id      = str(payload['id']);
                    if (!address || !id) return { ok: false, output: '', errorOutput: 'address and id required for import' };
                    const args    = buildTfImportArgs({ address, id });
                    const result  = await runCommand(args, tfDir, 120_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'import', address, id, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Imported "${id}" as "${address}".` : result.stderr.slice(0, 200) });
                }
                case 'pull': {
                    const args   = buildTfStatePullArgs();
                    const result = await runCommand(args, tfDir, 30_000);
                    const parsed = parseTfStatePull(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, operation: 'pull', resource_count: parsed?.resources.length ?? 0, state: parsed, summary: parsed ? `State pulled: ${parsed.resources.length} resource(s).` : 'Failed to parse state.' });
                }
                case 'list': {
                    const address = str(payload['address']) || undefined;
                    const args    = buildTfStateListArgs(address);
                    const result  = await runCommand(args, tfDir, 30_000);
                    const items   = parseTfStateList(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, operation: 'list', resources: items, count: items.length, summary: `${items.length} resource(s) in state.` });
                }
                case 'show': {
                    const address = str(payload['address']);
                    if (!address) return { ok: false, output: '', errorOutput: 'address required for show' };
                    const args    = buildTfStateShowArgs(address);
                    const result  = await runCommand(args, tfDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'show', address, output: result.stdout, summary: result.exitCode === 0 ? `Shown state for "${address}".` : result.stderr.slice(0, 200) });
                }
                case 'unlock': {
                    const lockId = str(payload['lock_id']);
                    if (!lockId) return { ok: false, output: '', errorOutput: 'lock_id required for unlock' };
                    const args   = buildTfStateUnlockArgs(lockId);
                    const result = await runCommand(args, tfDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'unlock', lock_id: lockId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Lock ${lockId} released.` : result.stderr.slice(0, 200) });
                }
                case 'push': {
                    const localPath = str(payload['local_state_path']);
                    if (!localPath) return { ok: false, output: '', errorOutput: 'local_state_path required for push' };
                    const force  = payload['force'] === true;
                    const args   = buildTfStatePushArgs(localPath, force);
                    const result = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'push', local_state_path: localPath, force, exit_code: result.exitCode, summary: result.exitCode === 0 ? 'State pushed successfully.' : result.stderr.slice(0, 200) });
                }
                case 'llm_plan': {
                    // Use LLM to determine the right state operations from natural language
                    const userIntent = str(payload['intent']);
                    if (!userIntent) return { ok: false, output: '', errorOutput: 'intent required for llm_plan' };
                    const listResult = await runCommand(buildTfStateListArgs(), tfDir, 30_000);
                    const stateList  = parseTfStateList(listResult.stdout);
                    const prompt     = buildTfStateOpPrompt({ userIntent, stateList, operation: (str(payload['op_type'], 'mv')) as 'mv' | 'rm' | 'import' });
                    const llmRaw     = await callLlmSafe(callLlm, prompt, 'You are a Terraform state expert. Return JSON only.');
                    const plan       = parseTfStateOpPlan(llmRaw);
                    return safeJson({ ok: true, operation: 'llm_plan', operations: plan.operations, explanation: plan.explanation, summary: plan.explanation });
                }
                default:
                    return { ok: false, output: '', errorOutput: `Unknown tf_state operation: ${operation}` };
            }
        }

        // ====================================================================
        // workspace_devops_k8s_rbac
        // payload: action (generate|apply|audit), service_name (required for generate),
        //          namespace (required), description? (for LLM generate),
        //          aws_role_arn? (IRSA), cluster_wide?, output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_rbac': {
            const rbacAction  = str(payload['action'], 'generate');
            const namespace   = str(payload['namespace'], 'default');
            const serviceName = str(payload['service_name']);
            const outputDir   = str(payload['output_dir'], '.');

            if (rbacAction === 'generate') {
                if (!serviceName) return { ok: false, output: '', errorOutput: 'service_name required for generate' };

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    // LLM-driven generation from description
                    const prompt  = buildRbacGeneratePrompt({
                        serviceName,
                        namespace,
                        description:  str(payload['description']),
                        awsRoleArn:   str(payload['aws_role_arn']) || undefined,
                        clusterWide:  payload['cluster_wide'] === true,
                    });
                    const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes security engineer. Return JSON only.');
                    files = parseRbacManifests(llmRaw);
                } else {
                    // Direct YAML generation without LLM
                    const awsRoleArn = str(payload['aws_role_arn']) || undefined;
                    const sa   = buildServiceAccountYaml({ name: serviceName, namespace, awsRoleArn });
                    const role = payload['cluster_wide'] === true
                        ? buildClusterRoleYaml({ name: `${serviceName}-role`, rules: [{ apiGroups: [''], resources: ['pods', 'configmaps'], verbs: ['get', 'list', 'watch'] }] })
                        : buildRoleYaml({ name: `${serviceName}-role`, namespace, rules: [{ apiGroups: [''], resources: ['pods', 'configmaps'], verbs: ['get', 'list', 'watch'] }] });
                    const binding = payload['cluster_wide'] === true
                        ? buildClusterRoleBindingYaml({ name: `${serviceName}-rolebinding`, clusterRole: `${serviceName}-role`, subjects: [{ kind: 'ServiceAccount', name: serviceName, namespace }] })
                        : buildRoleBindingYaml({ name: `${serviceName}-rolebinding`, namespace, roleName: `${serviceName}-role`, subjects: [{ kind: 'ServiceAccount', name: serviceName }] });
                    files = [
                        { filename: `${serviceName}-serviceaccount.yaml`, content: sa },
                        { filename: `${serviceName}-role.yaml`,           content: role },
                        { filename: `${serviceName}-rolebinding.yaml`,    content: binding },
                    ];
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', service_name: serviceName, namespace, files_written: written, file_count: written.length, summary: `Generated ${written.length} RBAC manifest(s) for "${serviceName}".` });
            }

            if (rbacAction === 'apply') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const manifestPath = str(payload['manifest_path']);
                if (!manifestPath) return { ok: false, output: '', errorOutput: 'manifest_path required for apply' };
                const args   = buildKubectlApplyArgs(manifestPath, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'apply', namespace, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `RBAC manifests applied.` : result.stderr.slice(0, 200) });
            }

            if (rbacAction === 'audit') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const checks  = buildRbacAuditChecks(serviceName, namespace);
                const results: Array<{ verb: string; resource: string; allowed: boolean }> = [];
                for (const c of checks) {
                    const r = await runCommand(c.args, workspaceDir, 10_000);
                    results.push({ verb: c.verb, resource: c.resource, allowed: r.stdout.trim() === 'yes' });
                }
                const allowed = results.filter((r) => r.allowed).length;
                return safeJson({ ok: true, action: 'audit', service_account: serviceName, namespace, checks: results, allowed_count: allowed, total_count: results.length, summary: `${serviceName}: ${allowed}/${results.length} permission checks passed.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown rbac action: ${rbacAction}` };
        }

        // ====================================================================
        // workspace_devops_grafana_dashboard
        // payload: action (generate|push), service_or_app (required),
        //          description?, metrics? (array), namespace?, datasource?,
        //          grafana_url?, grafana_api_key?, folder_id?, output_file?
        // ====================================================================
        case 'workspace_devops_grafana_dashboard': {
            const dashAction   = str(payload['action'], 'generate');
            const serviceOrApp = str(payload['service_or_app']);
            if (!serviceOrApp) return { ok: false, output: '', errorOutput: 'service_or_app is required' };

            const metrics = Array.isArray(payload['metrics'])
                ? (payload['metrics'] as string[]) : [`${serviceOrApp}_requests_total`, `${serviceOrApp}_request_duration_seconds`];

            const panels = Array.isArray(payload['panels'])
                ? (payload['panels'] as GrafanaPanel[]) : undefined;

            const prompt = buildGrafanaDashboardPrompt({
                serviceOrApp,
                description:  str(payload['description'], `Dashboard for ${serviceOrApp}`),
                metrics,
                namespace:    str(payload['namespace']) || undefined,
                datasource:   str(payload['datasource']) || undefined,
                panels,
            });

            const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Grafana dashboard expert. Return valid Grafana dashboard JSON only.');
            const dashboard = parseGrafanaDashboard(llmRaw);

            if (!dashboard) {
                return safeJson({ ok: false, action: dashAction, service_or_app: serviceOrApp, summary: 'Failed to generate Grafana dashboard JSON from LLM output.' });
            }

            const outFile = str(payload['output_file'], `${serviceOrApp}-dashboard.json`);
            await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(dashboard, null, 2) });

            // Optionally push to Grafana API
            if (dashAction === 'push') {
                const grafanaUrl    = str(payload['grafana_url']);
                const grafanaApiKey = str(payload['grafana_api_key']);
                const folderId      = num(payload['folder_id'], 0);
                if (!grafanaUrl || !grafanaApiKey) {
                    return safeJson({ ok: false, action: 'push', service_or_app: serviceOrApp, summary: 'grafana_url and grafana_api_key required for push.' });
                }
                const apiPayload = buildGrafanaDashboardApiPayload(dashboard, folderId);
                if (runCommand) {
                    const curlArgs = ['curl', '-s', '-X', 'POST', `${grafanaUrl}/api/dashboards/db`,
                        '-H', 'Content-Type: application/json',
                        '-H', `Authorization: Bearer ${grafanaApiKey}`,
                        '-d', JSON.stringify(apiPayload)];
                    const result = await runCommand(curlArgs, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'push', service_or_app: serviceOrApp, response: result.stdout.slice(0, 500), file_written: outFile, summary: result.exitCode === 0 ? `Dashboard pushed to Grafana for "${serviceOrApp}".` : result.stderr.slice(0, 200) });
                }
            }

            return safeJson({ ok: true, action: 'generate', service_or_app: serviceOrApp, file_written: outFile, panel_count: Array.isArray(dashboard['panels']) ? (dashboard['panels'] as unknown[]).length : 0, summary: `Grafana dashboard generated for "${serviceOrApp}" → ${outFile}` });
        }

        // ====================================================================
        // workspace_devops_alert_rule
        // payload: backend (prometheus|datadog|pagerduty, default: prometheus),
        //          service_or_app (required), description?, namespace?,
        //          slos? (array), output_dir?, name?
        //          [datadog] critical_threshold?, warning_threshold?, notify_channels?
        //          [pagerduty] escalation_policy_id?, urgency?
        // ====================================================================
        case 'workspace_devops_alert_rule': {
            const backend      = str(payload['backend'], 'prometheus') as 'prometheus' | 'datadog' | 'pagerduty';
            const serviceOrApp = str(payload['service_or_app']);
            if (!serviceOrApp) return { ok: false, output: '', errorOutput: 'service_or_app is required' };
            const outputDir    = str(payload['output_dir'], '.');

            if (backend === 'prometheus') {
                // Check if direct rules were provided, otherwise use LLM
                const directGroups = Array.isArray(payload['groups']) ? (payload['groups'] as Array<{ name: string; rules: PrometheusAlertRule[] }>) : null;

                let files: Array<{ filename: string; content: string }>;
                if (directGroups) {
                    const ruleName = str(payload['name'], `${serviceOrApp}-alert-rules`);
                    const namespace = str(payload['namespace'], 'default');
                    const crd = buildPrometheusRuleCrd({ name: ruleName, namespace, groups: directGroups });
                    files = [{ filename: `${ruleName}.yaml`, content: crd }];
                } else {
                    const slos = Array.isArray(payload['slos']) ? (payload['slos'] as Array<{ metric: string; threshold: number; window: string }>) : undefined;
                    const prompt  = buildAlertRulePrompt({ serviceOrApp, description: str(payload['description'], `Alerting rules for ${serviceOrApp}`), namespace: str(payload['namespace']) || undefined, slos });
                    const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Prometheus alerting expert. Return JSON only.');
                    files = parseAlertRuleOutput(llmRaw);
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, backend, service: serviceOrApp, files_written: written, file_count: written.length, summary: `Generated ${written.length} Prometheus alert rule file(s) for "${serviceOrApp}".` });
            }

            if (backend === 'datadog') {
                const notifyChannels = Array.isArray(payload['notify_channels']) ? (payload['notify_channels'] as string[]) : undefined;
                const monitor = buildDatadogMonitorPayload({
                    name:               str(payload['name'], `${serviceOrApp} error rate`),
                    service:            serviceOrApp,
                    description:        str(payload['description'], `Monitor for ${serviceOrApp}`),
                    criticalThreshold:  typeof payload['critical_threshold'] === 'number' ? payload['critical_threshold'] as number : undefined,
                    warningThreshold:   typeof payload['warning_threshold']  === 'number' ? payload['warning_threshold']  as number : undefined,
                    notifyChannels,
                });
                const outFile = str(payload['output_file'], `${serviceOrApp}-datadog-monitor.json`);
                await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(monitor, null, 2) });
                return safeJson({ ok: true, backend, service: serviceOrApp, monitor, file_written: outFile, summary: `Datadog monitor payload generated for "${serviceOrApp}".` });
            }

            if (backend === 'pagerduty') {
                const escalationPolicyId = str(payload['escalation_policy_id']);
                if (!escalationPolicyId) return { ok: false, output: '', errorOutput: 'escalation_policy_id required for pagerduty backend' };
                const service = buildPagerDutyServicePayload({
                    name:               str(payload['name'], serviceOrApp),
                    description:        str(payload['description'], `PagerDuty service for ${serviceOrApp}`),
                    escalationPolicyId,
                    urgency:            (str(payload['urgency'], 'high')) as 'high' | 'low',
                });
                const outFile = str(payload['output_file'], `${serviceOrApp}-pagerduty-service.json`);
                await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(service, null, 2) });
                return safeJson({ ok: true, backend, service: serviceOrApp, pd_service: service, file_written: outFile, summary: `PagerDuty service payload generated for "${serviceOrApp}".` });
            }

            return { ok: false, output: '', errorOutput: `Unknown alert_rule backend: ${backend}` };
        }

        // ====================================================================
        // workspace_devops_blue_green
        // payload: action (generate|switch|scale_down),
        //          app_name (required), namespace, blue_image, green_image,
        //          port, replicas?, to_color? (for switch), output_dir?
        // ====================================================================
        case 'workspace_devops_blue_green': {
            const bgAction  = str(payload['action'], 'generate');
            const appName   = str(payload['app_name']);
            const namespace = str(payload['namespace'], 'default');
            if (!appName)   return { ok: false, output: '', errorOutput: 'app_name is required' };

            if (bgAction === 'generate') {
                const blueImage  = str(payload['blue_image']);
                const greenImage = str(payload['green_image']);
                const port       = num(payload['port'], 8080);
                const outputDir  = str(payload['output_dir'], '.');
                if (!blueImage || !greenImage) {
                    // Fall back to LLM-based generation
                    const prompt = buildDeploymentStrategyPrompt({
                        appName,
                        description:  str(payload['description'], `Blue/green deployment for ${appName}`),
                        strategy:     'blue_green',
                        image:        greenImage || blueImage || `${appName}:latest`,
                        port:         port || 8080,
                        namespace,
                        currentImage: blueImage || undefined,
                        replicas:     num(payload['replicas'], 2),
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes deployment expert. Return JSON only.');
                    const parsed = parseDeploymentStrategyOutput(llmRaw);
                    const written: string[] = [];
                    for (const f of parsed) {
                        const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                    return safeJson({ ok: true, action: 'generate', strategy: 'blue_green', app_name: appName, files_written: written, summary: `Generated ${written.length} blue/green manifest(s) for "${appName}" via LLM.` });
                }

                const manifests = buildBlueGreenManifests({
                    appName, namespace, blueImage, greenImage, port,
                    replicas: num(payload['replicas'], 2),
                    resources: payload['resources'] ? (payload['resources'] as { cpu: string; memory: string }) : undefined,
                });
                const written: string[] = [];
                for (const f of manifests) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', strategy: 'blue_green', app_name: appName, files_written: written, file_count: written.length, summary: `Generated ${written.length} blue/green manifests for "${appName}".` });
            }

            if (bgAction === 'switch') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const toColor = (str(payload['to_color'], 'green')) as 'blue' | 'green';
                const args    = buildBlueGreenSwitchArgs({ appName, namespace, toColor });
                const result  = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'switch', app_name: appName, to_color: toColor, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Active service for "${appName}" switched to ${toColor}.` : result.stderr.slice(0, 200) });
            }

            if (bgAction === 'scale_down') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const color  = (str(payload['color'], 'blue')) as 'blue' | 'green';
                const args   = buildScaleDownArgs(appName, color, namespace);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'scale_down', app_name: appName, color, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Scaled down "${appName}-${color}" to 0 replicas.` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown blue_green action: ${bgAction}` };
        }

        // ====================================================================
        // workspace_devops_canary
        // payload: action (generate|promote|abort|status),
        //          app_name (required), namespace, image, port, replicas?,
        //          use_argo_rollouts? (default: true), use_istio?,
        //          steps? (CanaryStep array), stable_weight?, canary_weight?,
        //          output_dir?, watch? (for status)
        // ====================================================================
        case 'workspace_devops_canary': {
            const canaryAction = str(payload['action'], 'generate');
            const appName      = str(payload['app_name']);
            const namespace    = str(payload['namespace'], 'default');
            if (!appName)      return { ok: false, output: '', errorOutput: 'app_name is required' };

            if (canaryAction === 'generate') {
                const image    = str(payload['image'], `${appName}:latest`);
                const port     = num(payload['port'], 8080);
                const outputDir = str(payload['output_dir'], '.');
                const useArgo  = payload['use_argo_rollouts'] !== false;
                const useIstio = payload['use_istio'] === true;
                const steps    = Array.isArray(payload['steps']) ? (payload['steps'] as CanaryStep[]) : undefined;

                if (useIstio) {
                    const stableWeight = num(payload['stable_weight'], 90);
                    const canaryWeight = num(payload['canary_weight'], 10);
                    const manifests = buildIstioTrafficSplitManifests({ appName, namespace, stableWeight, canaryWeight, port });
                    const written: string[] = [];
                    for (const f of manifests) {
                        const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                    return safeJson({ ok: true, action: 'generate', strategy: 'canary_istio', app_name: appName, stable_weight: stableWeight, canary_weight: canaryWeight, files_written: written, summary: `Generated Istio canary traffic split for "${appName}" (${stableWeight}/${canaryWeight}).` });
                }

                if (useArgo) {
                    const manifest = buildArgoRolloutsManifest({ appName, namespace, image, port, replicas: num(payload['replicas'], 3), steps });
                    const fileName = `${appName}-rollout.yaml`;
                    const fp       = outputDir !== '.' ? `${outputDir}/${fileName}` : fileName;
                    await executeAction('workspace_write_file', { file_path: fp, content: manifest });
                    return safeJson({ ok: true, action: 'generate', strategy: 'canary_argo', app_name: appName, file_written: fp, step_count: steps?.length ?? 9, summary: `Generated Argo Rollouts canary manifest for "${appName}" → ${fp}` });
                }

                // LLM-driven fallback
                const prompt = buildDeploymentStrategyPrompt({ appName, description: str(payload['description'], `Canary deployment for ${appName}`), strategy: 'canary', image, port, namespace, replicas: num(payload['replicas'], 3), useArgoRollouts: useArgo, useIstio });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes deployment expert. Return JSON only.');
                const parsed = parseDeploymentStrategyOutput(llmRaw);
                const written: string[] = [];
                for (const f of parsed) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', strategy: 'canary', app_name: appName, files_written: written, summary: `Generated ${written.length} canary manifest(s) for "${appName}" via LLM.` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (canaryAction === 'promote') {
                const fullPromote = payload['full_promote'] === true;
                const args        = buildArgoRolloutsPromoteArgs(appName, namespace, fullPromote);
                const result      = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'promote', app_name: appName, full_promote: fullPromote, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Canary rollout "${appName}" promoted${fullPromote ? ' (full)' : ''}.` : result.stderr.slice(0, 200) });
            }

            if (canaryAction === 'abort') {
                const args   = buildArgoRolloutsAbortArgs(appName, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'abort', app_name: appName, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Canary rollout "${appName}" aborted and rolled back.` : result.stderr.slice(0, 200) });
            }

            if (canaryAction === 'status') {
                const watch  = payload['watch'] === true;
                const args   = buildArgoRolloutsStatusArgs(appName, namespace, watch);
                const result = await runCommand(args, workspaceDir, watch ? 120_000 : 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'status', app_name: appName, output: result.stdout, summary: result.exitCode === 0 ? `Rollout status for "${appName}" retrieved.` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown canary action: ${canaryAction}` };
        }

        // ====================================================================
        // workspace_devops_argocd
        // payload: action (sync|rollback|get|list|diff|set|wait|generate_app),
        //          app_name (required for most), namespace?, prune?, force?,
        //          async?, dry_run?, revision?, history_id?, output_dir?
        //          [set] image?, helm_values?, target_revision?
        //          [generate_app] repo_url, target_revision, path, dest_namespace
        // ====================================================================
        case 'workspace_devops_argocd': {
            if (!runCommand && str(payload['action'], 'sync') !== 'generate_app') {
                return { ok: false, output: '', errorOutput: 'runCommand not available' };
            }
            const argoAction = str(payload['action'], 'sync');
            const appName    = str(payload['app_name']);
            const namespace  = str(payload['namespace']) || undefined;

            if (argoAction === 'sync') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for sync' };
                const args   = buildArgoCdSyncArgs({
                    appName, namespace,
                    prune:    payload['prune']    === true,
                    force:    payload['force']    === true,
                    async:    payload['async']    === true,
                    dryRun:   payload['dry_run']  === true,
                    revision: str(payload['revision']) || undefined,
                });
                const result = await runCommand!(args, workspaceDir, 180_000);
                const ok     = result.exitCode === 0;
                // Optionally wait for healthy after sync
                if (ok && !payload['async'] && !payload['dry_run']) {
                    const waitArgs   = buildArgoCdWaitArgs({ appName, namespace, health: true, timeout: 120 });
                    await runCommand!(waitArgs, workspaceDir, 130_000).catch(() => null);
                }
                return safeJson({ ok, action: 'sync', app_name: appName, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: ok ? `ArgoCD app "${appName}" synced successfully.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'rollback') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for rollback' };
                const historyId = num(payload['history_id'], 0);
                if (!historyId) {
                    // List history first so the caller knows available IDs
                    const histArgs = buildArgoCdHistoryArgs(appName, namespace);
                    const histRes  = await runCommand!(histArgs, workspaceDir, 30_000);
                    return safeJson({ ok: histRes.exitCode === 0, action: 'history', app_name: appName, history: histRes.stdout, summary: `Provide history_id from the above history to rollback "${appName}".` });
                }
                const args   = buildArgoCdRollbackArgs({ appName, historyId, prune: payload['prune'] === true, namespace });
                const result = await runCommand!(args, workspaceDir, 120_000);
                return safeJson({ ok: result.exitCode === 0, action: 'rollback', app_name: appName, history_id: historyId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `ArgoCD app "${appName}" rolled back to revision ${historyId}.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'get') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for get' };
                const args   = buildArgoCdGetArgs(appName, namespace, 'json');
                const result = await runCommand!(args, workspaceDir, 30_000);
                const appStatus = parseArgoCdAppStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'get', app: appStatus, raw: result.stdout.slice(0, 2000), summary: appStatus ? `App "${appName}": health=${appStatus.health}, sync=${appStatus.sync}` : 'Could not parse app status.' });
            }

            if (argoAction === 'list') {
                const args   = buildArgoCdListArgs({ namespace, project: str(payload['project']) || undefined });
                const result = await runCommand!(args, workspaceDir, 30_000);
                const apps   = parseArgoCdAppList(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'list', apps, app_count: apps.length, summary: summariseArgoCdApps(apps) });
            }

            if (argoAction === 'diff') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for diff' };
                const args   = buildArgoCdDiffArgs(appName, { revision: str(payload['revision']) || undefined, namespace });
                const result = await runCommand!(args, workspaceDir, 60_000);
                const hasDiff = result.stdout.trim().length > 0;
                return safeJson({ ok: result.exitCode === 0, action: 'diff', app_name: appName, has_diff: hasDiff, diff: result.stdout.slice(0, 3000), summary: hasDiff ? `App "${appName}" has pending changes.` : `App "${appName}" is in sync.` });
            }

            if (argoAction === 'set') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for set' };
                const helmValues = Array.isArray(payload['helm_values']) ? (payload['helm_values'] as Array<{ name: string; value: string }>) : [];
                const args   = buildArgoCdSetArgs({
                    appName, namespace,
                    image:            str(payload['image'])             || undefined,
                    targetRevision:   str(payload['target_revision'])   || undefined,
                    kustomizeImage:   str(payload['kustomize_image'])   || undefined,
                    helmValues:       helmValues.length ? helmValues : undefined,
                });
                const result = await runCommand!(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'set', app_name: appName, exit_code: result.exitCode, summary: result.exitCode === 0 ? `App "${appName}" parameters updated.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'generate_app') {
                const repoUrl        = str(payload['repo_url']);
                const targetRevision = str(payload['target_revision'], 'main');
                const path           = str(payload['path'], '.');
                const destNamespace  = str(payload['dest_namespace'], 'default');
                const outputDir      = str(payload['output_dir'], '.');
                if (!repoUrl) return { ok: false, output: '', errorOutput: 'repo_url required for generate_app' };

                const useArgoLlm = callLlm && str(payload['description']);
                let files: Array<{ filename: string; content: string }> = [];

                if (useArgoLlm) {
                    const prompt = buildArgoCdAppPrompt({ appName: appName || 'my-app', description: str(payload['description']), repoUrl, targetRevision, destNamespace, syncPolicy: 'auto', helmChart: payload['helm_chart'] === true, kustomize: payload['kustomize'] === true });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a GitOps expert. Return JSON only.');
                    try {
                        const cleaned = llmRaw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
                        files = JSON.parse(cleaned) as Array<{ filename: string; content: string }>;
                    } catch { /* fall through */ }
                }

                if (!files.length) {
                    const yaml = buildArgoCdApplicationYaml({ appName: appName || 'my-app', repoUrl, targetRevision, path, destNamespace, syncPolicy: 'auto', prune: true, selfHeal: true, namespace: str(payload['argocd_namespace'], 'argocd') });
                    files = [{ filename: `${appName || 'my-app'}-argocd-app.yaml`, content: yaml }];
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate_app', app_name: appName, files_written: written, summary: `Generated ArgoCD Application manifest(s): ${written.join(', ')}` });
            }

            return { ok: false, output: '', errorOutput: `Unknown argocd action: ${argoAction}` };
        }

        // ====================================================================
        // workspace_devops_k8s_autoscale
        // payload: action (generate|patch_hpa|scale|get_hpa|get_vpa|ca_status),
        //          app_name (required for generate/scale), namespace,
        //          [generate] description?, environment?, current_cpu?, current_memory?,
        //          [patch_hpa] hpa_name, min_replicas?, max_replicas?,
        //          [scale] kind?, replicas,
        //          output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_autoscale': {
            const scaleAction = str(payload['action'], 'generate');
            const appName     = str(payload['app_name']);
            const namespace   = str(payload['namespace'], 'default');
            const outputDir   = str(payload['output_dir'], '.');

            if (scaleAction === 'generate') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate' };

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    const prompt = buildAutoscalerPrompt({
                        appName, namespace,
                        description:    str(payload['description']),
                        currentCpu:     str(payload['current_cpu'])    || undefined,
                        currentMemory:  str(payload['current_memory']) || undefined,
                        p99Latency:     str(payload['p99_latency'])    || undefined,
                        errorRate:      str(payload['error_rate'])     || undefined,
                        peakRps:        typeof payload['peak_rps'] === 'number' ? payload['peak_rps'] as number : undefined,
                        environment:    (str(payload['environment'], 'production')) as 'production' | 'staging' | 'development',
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes capacity engineer. Return JSON only.');
                    files = parseAutoscalerOutput(llmRaw);
                }

                if (!files.length) {
                    // Direct YAML generation
                    const hpaSpec: HpaSpec = {
                        name: `${appName}-hpa`, namespace,
                        targetKind: 'Deployment', targetName: appName,
                        minReplicas: num(payload['min_replicas'], 2),
                        maxReplicas: num(payload['max_replicas'], 10),
                        metrics: [{ type: 'Resource', resourceName: 'cpu', averageUtilization: num(payload['cpu_target'], 70) }],
                        scaleDownStabilizationWindowSeconds: 300,
                    };
                    const hpaYaml = buildHpaYaml(hpaSpec);
                    files = [{ filename: `${appName}-hpa.yaml`, content: hpaYaml }];

                    if (payload['vpa'] !== false) {
                        const vpaSpec: VpaSpec = { name: `${appName}-vpa`, namespace, targetKind: 'Deployment', targetName: appName, updateMode: 'Off' };
                        files.push({ filename: `${appName}-vpa.yaml`, content: buildVpaYaml(vpaSpec) });
                    }
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', app_name: appName, namespace, files_written: written, summary: `Generated ${written.length} autoscaling manifest(s) for "${appName}".` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (scaleAction === 'patch_hpa') {
                const hpaName = str(payload['hpa_name'], `${appName}-hpa`);
                const args    = buildKubectlPatchHpaArgs({ name: hpaName, namespace, minReplicas: typeof payload['min_replicas'] === 'number' ? payload['min_replicas'] as number : undefined, maxReplicas: typeof payload['max_replicas'] === 'number' ? payload['max_replicas'] as number : undefined });
                const result  = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'patch_hpa', hpa_name: hpaName, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? `HPA "${hpaName}" patched.` : result.stderr.slice(0, 200) });
            }

            if (scaleAction === 'scale') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for scale' };
                const replicas = num(payload['replicas'], 1);
                const kind     = (str(payload['kind'], 'deployment')) as 'deployment' | 'statefulset' | 'replicaset';
                const args     = buildKubectlScaleArgs({ kind, name: appName, namespace, replicas });
                const result   = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'scale', app_name: appName, namespace, replicas, exit_code: result.exitCode, summary: result.exitCode === 0 ? `${kind} "${appName}" scaled to ${replicas} replica(s).` : result.stderr.slice(0, 200) });
            }

            if (scaleAction === 'get_hpa') {
                const args   = buildKubectlGetHpaArgs(namespace, str(payload['hpa_name']) || undefined);
                const result = await runCommand(args, workspaceDir, 15_000);
                const hpas   = parseHpaStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'get_hpa', namespace, hpas, count: hpas.length, summary: `${hpas.length} HPA(s) found in namespace "${namespace}".` });
            }

            if (scaleAction === 'get_vpa') {
                const args   = buildKubectlGetVpaArgs(namespace, str(payload['vpa_name']) || undefined);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'get_vpa', namespace, raw: result.stdout.slice(0, 2000), summary: `VPA status retrieved for namespace "${namespace}".` });
            }

            if (scaleAction === 'ca_status') {
                const nsArg  = str(payload['ca_namespace'], 'kube-system');
                const args   = buildCaStatusArgs(nsArg);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'ca_status', output: result.stdout, summary: 'Cluster Autoscaler status retrieved.' });
            }

            if (scaleAction === 'generate_quota') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate_quota' };
                const quotaSpec: ResourceQuotaSpec = {
                    name: `${appName}-quota`, namespace,
                    requests: { cpu: str(payload['requests_cpu'], '4'), memory: str(payload['requests_memory'], '8Gi') },
                    limits:   { cpu: str(payload['limits_cpu'],   '8'), memory: str(payload['limits_memory'],   '16Gi') },
                    pods: num(payload['max_pods'], 20),
                };
                const yaml = buildResourceQuotaYaml(quotaSpec);
                const fp   = outputDir !== '.' ? `${outputDir}/${appName}-quota.yaml` : `${appName}-quota.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'generate_quota', namespace, file_written: fp, summary: `ResourceQuota for "${namespace}" written to ${fp}.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown k8s_autoscale action: ${scaleAction}` };
        }

        // ====================================================================
        // workspace_devops_k8s_exec
        // payload: action (exec|migrate|pg_dump|psql|redis|mongo|job_create|job_run),
        //          pod (required for exec actions, OR label_selector),
        //          namespace, command? (array), container?,
        //          [migrate] framework?, custom_command?,
        //          [pg_dump] database, user?, format?,
        //          [psql] database, sql,
        //          [redis] operation, pattern?,
        //          [mongo] database, js_script,
        //          [job_create/job_run] job_name, image, job_command (array)
        // ====================================================================
        case 'workspace_devops_k8s_exec': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const execAction     = str(payload['action'], 'exec');
            const namespace      = str(payload['namespace'], 'default');
            const labelSelector  = str(payload['label_selector']);
            let   pod            = str(payload['pod']);

            // Resolve pod name from label selector if not given directly
            if (!pod && labelSelector) {
                const podNameResult = await runCommand(buildGetPodNameArgs(labelSelector, namespace), workspaceDir, 10_000);
                pod = podNameResult.stdout.trim();
                if (!pod) return { ok: false, output: '', errorOutput: `No pod found for selector "${labelSelector}" in namespace "${namespace}"` };
            }

            if (execAction === 'exec') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for exec' };
                const command = Array.isArray(payload['command']) ? (payload['command'] as string[]) : ['sh', '-c', str(payload['shell_command'], 'echo hello')];
                const args    = buildKubectlExecArgs({ pod, namespace, command, container: str(payload['container']) || undefined });
                const result  = await runCommand(args, workspaceDir, num(payload['timeout_seconds'], 60) * 1000);
                return safeJson({ ok: result.exitCode === 0, action: 'exec', pod, namespace, exit_code: result.exitCode, stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 1000), summary: result.exitCode === 0 ? `Command executed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'migrate') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for migrate' };
                const framework  = (str(payload['framework'], 'custom')) as 'prisma' | 'flyway' | 'alembic' | 'liquibase' | 'custom';
                const customCmd  = Array.isArray(payload['custom_command']) ? (payload['custom_command'] as string[]) : undefined;
                const args       = buildDbMigrationExecArgs({ pod, namespace, framework, customCommand: customCmd, container: str(payload['container']) || undefined });
                const result     = await runCommand(args, workspaceDir, 300_000);
                return safeJson({ ok: result.exitCode === 0, action: 'migrate', pod, namespace, framework, exit_code: result.exitCode, output: result.stdout.slice(0, 4000), summary: result.exitCode === 0 ? `Migration (${framework}) completed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'pg_dump') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for pg_dump' };
                const database = str(payload['database']);
                if (!database) return { ok: false, output: '', errorOutput: 'database required for pg_dump' };
                const args   = buildPgDumpExecArgs({ pod, namespace, database, user: str(payload['user']) || undefined, format: (str(payload['format'], 'plain')) as 'plain' | 'custom', outputPath: str(payload['output_path']) || undefined, container: str(payload['container']) || undefined, noOwner: payload['no_owner'] !== false, noAcl: payload['no_acl'] !== false });
                const result = await runCommand(args, workspaceDir, 600_000);
                return safeJson({ ok: result.exitCode === 0, action: 'pg_dump', pod, namespace, database, exit_code: result.exitCode, output_size: result.stdout.length, summary: result.exitCode === 0 ? `pg_dump of "${database}" completed (${result.stdout.length} bytes).` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'psql') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for psql' };
                const database = str(payload['database']);
                const sql      = str(payload['sql']);
                if (!database || !sql) return { ok: false, output: '', errorOutput: 'database and sql required for psql' };
                const args   = buildPsqlExecArgs({ pod, namespace, database, sql, user: str(payload['user']) || undefined, container: str(payload['container']) || undefined });
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'psql', pod, namespace, database, exit_code: result.exitCode, output: result.stdout.slice(0, 4000), summary: result.exitCode === 0 ? 'SQL executed successfully.' : result.stderr.slice(0, 200) });
            }

            if (execAction === 'redis') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for redis' };
                const operation = (str(payload['redis_operation'], 'info')) as 'flushdb' | 'flushall' | 'del_pattern' | 'info' | 'custom';
                const args      = buildRedisExecArgs({ pod, namespace, operation, pattern: str(payload['pattern']) || undefined, customCommand: Array.isArray(payload['custom_command']) ? (payload['custom_command'] as string[]) : undefined, container: str(payload['container']) || undefined });
                const result    = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'redis', pod, namespace, operation, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? `Redis "${operation}" completed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'mongo') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for mongo' };
                const database  = str(payload['database']);
                const jsScript  = str(payload['js_script']);
                if (!database || !jsScript) return { ok: false, output: '', errorOutput: 'database and js_script required for mongo' };
                const args   = buildMongoExecArgs({ pod, namespace, database, jsScript, container: str(payload['container']) || undefined });
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'mongo', pod, namespace, database, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? 'MongoDB script executed successfully.' : result.stderr.slice(0, 200) });
            }

            if (execAction === 'job_run') {
                // Full lifecycle: generate YAML → apply → wait → logs → (optionally delete)
                const jobName   = str(payload['job_name']);
                const image     = str(payload['image']);
                const jobCmd    = Array.isArray(payload['job_command']) ? (payload['job_command'] as string[]) : [];
                if (!jobName || !image || !jobCmd.length) return { ok: false, output: '', errorOutput: 'job_name, image, and job_command required for job_run' };

                const jobSpec: K8sJobSpec = {
                    jobName, namespace, image,
                    command: jobCmd,
                    ttlSeconds:    num(payload['ttl_seconds'], 300),
                    backoffLimit:  num(payload['backoff_limit'], 0),
                    serviceAccount: str(payload['service_account']) || undefined,
                    envVars:       typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null ? (payload['env_vars'] as Record<string, string>) : undefined,
                };
                const jobYaml = buildK8sJobYaml(jobSpec);
                const jobFile = `/tmp/${jobName}-job.yaml`;
                await executeAction('workspace_write_file', { file_path: jobFile, content: jobYaml });

                // Apply
                const applyResult = await runCommand(buildKubectlCreateJobArgs(jobFile, namespace), workspaceDir, 15_000);
                if (applyResult.exitCode !== 0) return safeJson({ ok: false, action: 'job_run', job_name: jobName, phase: 'apply', exit_code: applyResult.exitCode, summary: applyResult.stderr.slice(0, 200) });

                // Wait for completion
                const timeout    = num(payload['timeout_seconds'], 300);
                const waitResult = await runCommand(buildKubectlWaitJobArgs(jobName, namespace, timeout), workspaceDir, (timeout + 10) * 1000);
                const succeeded  = waitResult.exitCode === 0;

                // Get logs
                const logsResult = await runCommand(buildKubectlLogsJobArgs(jobName, namespace), workspaceDir, 15_000);

                // Optionally delete job after run
                if (payload['delete_after'] !== false) {
                    await runCommand(buildKubectlDeleteJobArgs(jobName, namespace), workspaceDir, 10_000).catch(() => null);
                }

                return safeJson({ ok: succeeded, action: 'job_run', job_name: jobName, namespace, succeeded, logs: logsResult.stdout.slice(0, 4000), summary: succeeded ? `Job "${jobName}" completed successfully.` : `Job "${jobName}" failed or timed out.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown k8s_exec action: ${execAction}` };
        }

        // ====================================================================
        // workspace_devops_dns
        // payload: action (list|create|update|delete|list_zones|request_cert|describe_cert),
        //          provider (route53|cloudflare|azure|gcp, required),
        //          [route53] hosted_zone_id, name, type, value, ttl?
        //          [cloudflare] zone_id, api_token, name, type, content, record_id?
        //          [azure] zone, resource_group, type, name?, value?, subscription?
        //          [gcp] zone (managed zone name), name, type, data, project?
        //          [request_cert] domain, alternate_names?, region?
        //          allow_destructive? (required for delete)
        // ====================================================================
        case 'workspace_devops_dns': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const dnsAction  = str(payload['action'], 'list');
            const provider   = (str(payload['provider'], 'route53')) as DnsProvider;

            if (dnsAction === 'delete' && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: 'DNS record deletion requires allow_destructive: true' };
            }

            if (provider === 'route53') {
                const hostedZoneId = str(payload['hosted_zone_id']);
                if (!hostedZoneId) return { ok: false, output: '', errorOutput: 'hosted_zone_id required for route53' };

                if (dnsAction === 'list_zones') {
                    const result = await runCommand(buildRoute53ListZonesArgs(), workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, provider, action: 'list_zones', raw: result.stdout.slice(0, 4000), summary: 'Route53 hosted zones listed.' });
                }
                if (dnsAction === 'list') {
                    const result  = await runCommand(buildRoute53ListRecordsArgs(hostedZoneId), workspaceDir, 30_000);
                    const records = parseRoute53Records(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, provider, action: 'list', records, count: records.length, summary: `${records.length} record(s) in zone "${hostedZoneId}".` });
                }

                const name  = str(payload['name']);
                const type  = (str(payload['type'], 'A')) as DnsRecordType;
                const value = str(payload['value']);
                const ttl   = num(payload['ttl'], 300);
                const action53 = dnsAction === 'delete' ? 'DELETE' : 'UPSERT';
                const batch  = buildRoute53ChangeBatch({ action: action53, name, type, value, ttl });
                const batchJson = JSON.stringify(batch);
                const args   = buildRoute53ChangeArgs(hostedZoneId, batchJson);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, name, type, value, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Route53 record ${name} (${type}) ${dnsAction}d.` : result.stderr.slice(0, 200) });
            }

            if (provider === 'cloudflare') {
                const zoneId    = str(payload['zone_id']);
                const apiToken  = str(payload['api_token']);
                if (!zoneId || !apiToken) return { ok: false, output: '', errorOutput: 'zone_id and api_token required for cloudflare' };
                const args   = buildCloudFlareDnsArgs({ operation: dnsAction as 'create' | 'update' | 'delete' | 'list', zoneId, apiToken, name: str(payload['name']) || undefined, type: str(payload['type']) as DnsRecordType || undefined, content: str(payload['content']) || undefined, ttl: num(payload['ttl'], 1), proxied: payload['proxied'] === true, recordId: str(payload['record_id']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                const records = dnsAction === 'list' ? parseCloudFlareDnsRecords(result.stdout) : undefined;
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, records, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `Cloudflare DNS ${dnsAction} completed.` });
            }

            if (provider === 'azure') {
                const zone          = str(payload['zone']);
                const resourceGroup = str(payload['resource_group']);
                if (!zone || !resourceGroup) return { ok: false, output: '', errorOutput: 'zone and resource_group required for azure' };
                const args   = buildAzDnsArgs({ operation: dnsAction as 'create' | 'update' | 'delete' | 'list', zone, resourceGroup, type: (str(payload['type'], 'A')) as DnsRecordType, name: str(payload['name']) || undefined, ipv4Address: str(payload['ipv4_address']) || undefined, cname: str(payload['cname']) || undefined, txtValue: str(payload['txt_value']) || undefined, ttl: num(payload['ttl'], 300), subscription: str(payload['subscription']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `Azure DNS ${dnsAction} completed.` });
            }

            if (provider === 'gcp') {
                const zone    = str(payload['zone']);
                if (!zone) return { ok: false, output: '', errorOutput: 'zone (managed zone name) required for gcp' };
                const args   = buildGcloudDnsArgs({ operation: dnsAction as 'add-record-set' | 'delete' | 'list', zone, name: str(payload['name']) || undefined, type: (str(payload['type'], 'A')) as DnsRecordType, ttl: num(payload['ttl'], 300), data: str(payload['data']) || undefined, project: str(payload['project']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `GCP Cloud DNS ${dnsAction} completed.` });
            }

            // ACM cert actions (provider-agnostic under dns action set)
            if (dnsAction === 'request_cert') {
                const domain = str(payload['domain']);
                if (!domain) return { ok: false, output: '', errorOutput: 'domain required for request_cert' };
                const alternateNames = Array.isArray(payload['alternate_names']) ? (payload['alternate_names'] as string[]) : undefined;
                const args   = buildAcmRequestCertArgs({ domain, alternateNames, validationMethod: 'DNS', region: str(payload['region']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'request_cert', domain, exit_code: result.exitCode, raw: result.stdout.slice(0, 1000), summary: result.exitCode === 0 ? `ACM cert requested for "${domain}".` : result.stderr.slice(0, 200) });
            }
            if (dnsAction === 'describe_cert') {
                const certArn = str(payload['cert_arn']);
                if (!certArn) return { ok: false, output: '', errorOutput: 'cert_arn required for describe_cert' };
                const args   = buildAcmDescribeCertArgs(certArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                const certStatus = parseAcmCertStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_cert', cert: certStatus, summary: certStatus ? `ACM cert "${certStatus.domainName}": ${certStatus.status}` : 'Could not parse cert status.' });
            }

            return { ok: false, output: '', errorOutput: `Unknown dns action: ${dnsAction}` };
        }

        // ====================================================================
        // workspace_devops_lb
        // payload: action (describe_listeners|describe_target_health|create_rule|
        //                   modify_rule|delete_rule|patch_ingress|generate_ingress),
        //          [alb] listener_arn, region?
        //          [create_rule] priority, condition_field, condition_values, target_group_arn
        //          [delete_rule] rule_arn — requires allow_destructive: true
        //          [patch_ingress] name, namespace, annotations (object)
        //          [generate_ingress] name, namespace, host, service_name, service_port,
        //                              tls_secret_name?, annotations?, ingress_class?, output_dir?
        // ====================================================================
        case 'workspace_devops_lb': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const lbAction = str(payload['action'], 'describe_listeners');

            if (lbAction === 'delete_rule' && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: 'Listener rule deletion requires allow_destructive: true' };
            }

            if (lbAction === 'describe_listeners') {
                const lbArn = str(payload['load_balancer_arn']);
                if (!lbArn) return { ok: false, output: '', errorOutput: 'load_balancer_arn required for describe_listeners' };
                const args   = buildAlbDescribeListenersArgs(lbArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_listeners', raw: result.stdout.slice(0, 4000), summary: 'ALB/NLB listeners described.' });
            }

            if (lbAction === 'describe_target_health') {
                const tgArn = str(payload['target_group_arn']);
                if (!tgArn) return { ok: false, output: '', errorOutput: 'target_group_arn required' };
                const args   = buildAlbDescribeTargetGroupHealthArgs(tgArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_target_health', raw: result.stdout.slice(0, 2000), summary: 'Target group health described.' });
            }

            if (lbAction === 'create_rule' || lbAction === 'modify_rule') {
                const listenerArn      = str(payload['listener_arn']);
                if (!listenerArn) return { ok: false, output: '', errorOutput: 'listener_arn required' };
                const conditionValues  = Array.isArray(payload['condition_values']) ? (payload['condition_values'] as string[]) : [];
                const args   = buildAlbListenerRuleArgs({
                    operation:       lbAction === 'create_rule' ? 'create' : 'modify',
                    listenerArn,
                    priority:        num(payload['priority'], 100),
                    conditionField:  (str(payload['condition_field'], 'path-pattern')) as 'host-header' | 'path-pattern',
                    conditionValues,
                    targetGroupArn:  str(payload['target_group_arn']) || undefined,
                    ruleArn:         str(payload['rule_arn']) || undefined,
                    region:          str(payload['region']) || undefined,
                });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: lbAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 1000), summary: result.exitCode === 0 ? `Listener rule ${lbAction}d.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'delete_rule') {
                const ruleArn = str(payload['rule_arn']);
                if (!ruleArn) return { ok: false, output: '', errorOutput: 'rule_arn required for delete_rule' };
                const args   = buildAlbListenerRuleArgs({ operation: 'delete', listenerArn: '', ruleArn, region: str(payload['region']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'delete_rule', rule_arn: ruleArn, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Listener rule deleted.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'patch_ingress') {
                const ingressName   = str(payload['name']);
                const namespace     = str(payload['namespace'], 'default');
                const annotations   = typeof payload['annotations'] === 'object' && payload['annotations'] !== null
                    ? (payload['annotations'] as Record<string, string>) : {};
                if (!ingressName) return { ok: false, output: '', errorOutput: 'name required for patch_ingress' };
                const args   = buildKubectlPatchIngressArgs({ name: ingressName, namespace, annotations });
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'patch_ingress', ingress: ingressName, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Ingress "${ingressName}" annotations updated.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'generate_ingress') {
                const name        = str(payload['name']);
                const namespace   = str(payload['namespace'], 'default');
                const host        = str(payload['host']);
                const serviceName = str(payload['service_name']);
                const servicePort = num(payload['service_port'], 80);
                if (!name || !host || !serviceName) return { ok: false, output: '', errorOutput: 'name, host, and service_name required for generate_ingress' };
                const annotations = typeof payload['annotations'] === 'object' && payload['annotations'] !== null ? (payload['annotations'] as Record<string, string>) : {};
                const yaml = buildIngressYaml({ name, namespace, host, serviceName, servicePort, tlsSecretName: str(payload['tls_secret_name']) || undefined, annotations, ingressClass: str(payload['ingress_class']) || undefined, pathPrefix: str(payload['path_prefix']) || undefined });
                const outputDir = str(payload['output_dir'], '.');
                const fp = outputDir !== '.' ? `${outputDir}/${name}-ingress.yaml` : `${name}-ingress.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'generate_ingress', name, namespace, file_written: fp, summary: `Ingress manifest for "${host}" written to ${fp}.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown lb action: ${lbAction}` };
        }

        // ====================================================================
        // workspace_devops_service_mesh
        // payload: action (generate|apply|analyze|proxy_status|proxy_config|
        //                   linkerd_check|linkerd_stat),
        //          provider (istio|linkerd, default: istio),
        //          app_name, namespace,
        //          [generate] services (array), features (object), description?, output_dir?
        //          [apply] manifest_path
        //          [analyze] files? (array)
        //          [proxy_status/proxy_config] pod, config_type?
        //          [linkerd_stat] resource_type?, resource_name?
        // ====================================================================
        case 'workspace_devops_service_mesh': {
            const meshAction = str(payload['action'], 'generate');
            const provider   = (str(payload['provider'], 'istio')) as MeshProvider;
            const appName    = str(payload['app_name']);
            const namespace  = str(payload['namespace'], 'default');
            const outputDir  = str(payload['output_dir'], '.');

            if (meshAction === 'generate') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate' };

                const services   = Array.isArray(payload['services'])
                    ? (payload['services'] as Array<{ name: string; port: number; version?: string }>)
                    : [{ name: appName, port: num(payload['port'], 8080) }];

                const featuresRaw = typeof payload['features'] === 'object' && payload['features'] !== null
                    ? (payload['features'] as Record<string, unknown>) : {};

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    const prompt = buildServiceMeshPrompt({
                        provider, appName, namespace,
                        description: str(payload['description']),
                        services,
                        features: {
                            retries:       featuresRaw['retries']        !== false,
                            circuitBreaker: featuresRaw['circuit_breaker'] === true,
                            mtls:          featuresRaw['mtls']           === true,
                            rateLimiting:  featuresRaw['rate_limiting']  === true,
                            faultInjection: featuresRaw['fault_injection'] === true,
                            canaryTraffic: typeof featuresRaw['canary_traffic'] === 'object' && featuresRaw['canary_traffic'] !== null
                                ? (featuresRaw['canary_traffic'] as { stablePercent: number; canaryPercent: number }) : undefined,
                        },
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a service mesh expert. Return JSON only.');
                    files = parseServiceMeshOutput(llmRaw);
                }

                if (!files.length && provider === 'istio') {
                    // Direct YAML generation for common Istio patterns
                    const retryPolicy: IstioRetryPolicy | undefined = featuresRaw['retries'] !== false
                        ? { attempts: 3, perTryTimeout: '2s', retryOn: '5xx,gateway-error,reset' } : undefined;

                    const cbSpec: IstioCircuitBreaker | undefined = featuresRaw['circuit_breaker'] === true
                        ? { consecutiveGatewayErrors: 5, interval: '10s', baseEjectionTime: '30s', maxEjectionPercent: 10 } : undefined;

                    for (const svc of services) {
                        const vs = buildIstioVirtualServiceYaml({
                            name: `${svc.name}-vs`, namespace,
                            hosts: [svc.name],
                            timeout: str(payload['timeout'], '30s') || undefined,
                            retries: retryPolicy,
                            routes: [{ destinations: [{ host: svc.name, port: svc.port }] }],
                        });
                        files.push({ filename: `${svc.name}-virtual-service.yaml`, content: vs });

                        const dr = buildIstioDestinationRuleYaml({
                            name: `${svc.name}-dr`, namespace, host: svc.name,
                            loadBalancer: 'LEAST_CONN',
                            circuitBreaker: cbSpec,
                            mtls: featuresRaw['mtls'] === true ? 'STRICT' : undefined,
                        });
                        files.push({ filename: `${svc.name}-destination-rule.yaml`, content: dr });
                    }

                    if (featuresRaw['mtls'] === true) {
                        const pa = buildIstioPeerAuthYaml({ name: `${namespace}-mtls`, namespace, mode: 'STRICT' });
                        files.push({ filename: `${namespace}-peer-auth.yaml`, content: pa });
                    }
                }

                if (!files.length && provider === 'linkerd') {
                    for (const svc of services) {
                        const sp = buildLinkerdServiceProfileYaml({
                            name: `${svc.name}.${namespace}.svc.cluster.local`, namespace,
                            routes: [{ name: 'all-routes', condition: { pathRegex: '.*' }, timeout: str(payload['timeout'], '10s'), isRetryable: featuresRaw['retries'] !== false }],
                        });
                        files.push({ filename: `${svc.name}-service-profile.yaml`, content: sp });
                    }
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', provider, app_name: appName, namespace, files_written: written, file_count: written.length, summary: `Generated ${written.length} ${provider} service mesh manifest(s) for "${appName}".` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (meshAction === 'apply') {
                const manifestPath = str(payload['manifest_path']);
                if (!manifestPath) return { ok: false, output: '', errorOutput: 'manifest_path required for apply' };
                const args   = ['kubectl', 'apply', '-f', manifestPath, '-n', namespace];
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'apply', provider, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? 'Service mesh manifests applied.' : result.stderr.slice(0, 200) });
            }

            if (meshAction === 'analyze' && provider === 'istio') {
                const files  = Array.isArray(payload['files']) ? (payload['files'] as string[]) : undefined;
                const args   = buildIstioCtlAnalyzeArgs(namespace, files);
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'analyze', provider, output: result.stdout.slice(0, 3000), summary: result.exitCode === 0 ? `Istio analysis: no issues found.` : `Istio analysis found issues.` });
            }

            if (meshAction === 'proxy_status' && provider === 'istio') {
                const pod    = str(payload['pod']) || undefined;
                const args   = buildIstioCtlProxyStatusArgs(pod, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'proxy_status', provider, output: result.stdout.slice(0, 3000), summary: 'Istio proxy status retrieved.' });
            }

            if (meshAction === 'proxy_config' && provider === 'istio') {
                const pod        = str(payload['pod']);
                if (!pod) return { ok: false, output: '', errorOutput: 'pod required for proxy_config' };
                const configType = (str(payload['config_type'], 'all')) as 'listener' | 'route' | 'cluster' | 'endpoint' | 'all';
                const args       = buildIstioCtlProxyConfigArgs(pod, namespace, configType);
                const result     = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'proxy_config', provider, pod, config_type: configType, output: result.stdout.slice(0, 4000), summary: `Proxy config (${configType}) for "${pod}" retrieved.` });
            }

            if (meshAction === 'linkerd_check' && provider === 'linkerd') {
                const args   = buildLinkerdCheckArgs(payload['pre_install'] === true);
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'linkerd_check', provider, output: result.stdout.slice(0, 3000), summary: result.exitCode === 0 ? 'Linkerd check passed.' : 'Linkerd check found issues.' });
            }

            if (meshAction === 'linkerd_stat' && provider === 'linkerd') {
                const resourceType = (str(payload['resource_type'], 'deployment')) as 'deployment' | 'pod' | 'namespace' | 'daemonset';
                const args         = buildLinkerdStatArgs(resourceType, namespace, str(payload['resource_name']) || undefined);
                const result       = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'linkerd_stat', provider, resource_type: resourceType, output: result.stdout.slice(0, 3000), summary: `Linkerd stat for ${resourceType} in "${namespace}" retrieved.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown service_mesh action: ${meshAction}` };
        }

        // ====================================================================
        // workspace_devops_slo
        // payload: action (calculate|generate_sloth|generate_pyrra|generate_alerts|
        //                   generate_all|burn_rate_alerts),
        //          [calculate] objective (number), window_days, current_error_rate, elapsed_days?
        //          [generate_*] name, namespace, service, description, objective,
        //                       objective_type?, window?, good_metric, total_metric, output_dir?
        //          [generate_all] also calls LLM if description provided
        // ====================================================================
        case 'workspace_devops_slo': {
            const sloAction = str(payload['action'], 'calculate');

            if (sloAction === 'calculate') {
                const objective        = num(payload['objective'], 99.9);
                const windowDays       = num(payload['window_days'], 30);
                const currentErrorRate = typeof payload['current_error_rate'] === 'number'
                    ? (payload['current_error_rate'] as number) : 0;
                const elapsedDays = typeof payload['elapsed_days'] === 'number'
                    ? (payload['elapsed_days'] as number) : undefined;
                const status = calculateErrorBudget(objective, windowDays, currentErrorRate, elapsedDays);
                return safeJson({ ok: true, action: 'calculate', status, report: formatErrorBudgetReport(status), summary: `SLO ${objective}% (${windowDays}d): ${status.status.toUpperCase()}, burn rate ${status.burnRate.toFixed(2)}x` });
            }

            if (sloAction === 'burn_rate_alerts') {
                const sloName    = str(payload['slo_name'], 'my-slo');
                const objective  = num(payload['objective'], 99.9);
                const window     = str(payload['window'], '30d');
                const alerts     = buildBurnRateAlerts(sloName, objective, window);
                return safeJson({ ok: true, action: 'burn_rate_alerts', slo_name: sloName, alert_count: alerts.length, alerts, summary: `${alerts.length} multi-window burn-rate alert(s) generated for "${sloName}".` });
            }

            // All generate_* actions need a SloSpec
            const name       = str(payload['name'], 'my-slo');
            const namespace  = str(payload['namespace'], 'default');
            const service    = str(payload['service'], name);
            const description = str(payload['description'], `SLO for ${service}`);
            const objective   = num(payload['objective'], 99.9);
            const window      = str(payload['window'], '30d');
            const goodMetric  = str(payload['good_metric']);
            const totalMetric = str(payload['total_metric']);
            const outputDir   = str(payload['output_dir'], '.');

            if ((sloAction.startsWith('generate') || sloAction === 'generate_all') && callLlm && str(payload['description']) && !goodMetric) {
                const metrics = Array.isArray(payload['metrics']) ? (payload['metrics'] as string[]) : [];
                const prompt  = buildSloPrompt({
                    service, namespace, description: str(payload['description']),
                    metrics,
                    currentP99:       str(payload['current_p99'])        || undefined,
                    currentErrorRate: str(payload['current_error_rate']) || undefined,
                    environment:      (str(payload['environment'], 'production')) as 'production' | 'staging',
                });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are an SRE expert. Return JSON only.');
                const files  = parseSloOutput(llmRaw);
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: sloAction, service, files_written: written, summary: `Generated ${written.length} SLO file(s) for "${service}" via LLM.` });
            }

            if (!goodMetric || !totalMetric) {
                return { ok: false, output: '', errorOutput: 'good_metric and total_metric required for SLO generation (or provide description + metrics for LLM generation)' };
            }

            const spec: SloSpec = {
                name, namespace, service, description, objective, window,
                objectiveType: (str(payload['objective_type'], 'availability')) as SloSpec['objectiveType'],
                sli: { name: `${name}-sli`, description, sloName: name, goodMetric, totalMetric },
                labels: typeof payload['labels'] === 'object' && payload['labels'] !== null ? (payload['labels'] as Record<string, string>) : undefined,
            };

            const files: Array<{ filename: string; content: string }> = [];

            if (sloAction === 'generate_sloth' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-sloth.yaml`, content: buildSlothSloYaml(spec) });
            }
            if (sloAction === 'generate_pyrra' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-pyrra.yaml`, content: buildPyrraObjectiveYaml(spec) });
            }
            if (sloAction === 'generate_alerts' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-prometheus-rule.yaml`, content: buildSloAlertRulesCrd(spec) });
            }
            if (!files.length) {
                return { ok: false, output: '', errorOutput: `Unknown slo action: ${sloAction}` };
            }

            const written: string[] = [];
            for (const f of files) {
                const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({ ok: true, action: sloAction, slo_name: name, service, objective, window, files_written: written, summary: `Generated ${written.length} SLO manifest(s) for "${service}" (${objective}% over ${window}).` });
        }

        // ====================================================================
        // workspace_devops_compliance_scan
        // payload: action (run_kube_bench|run_kube_bench_job|get_job_logs|
        //                   falco_status|falco_logs|falco_generate_rules|
        //                   falco_apply_rules|falco_hardened_rules),
        //          namespace?, targets? (array), output_format?, image_tag?
        //          [falco_generate_rules] description, threat, service
        //          [falco_apply_rules] rules_file | rules (FalcoRule[])
        //          [run_kube_bench] analyze_failures? (calls LLM), service, environment?
        // ====================================================================
        case 'workspace_devops_compliance_scan': {
            const compAction = str(payload['action'], 'run_kube_bench');
            const namespace  = str(payload['namespace'], 'kube-system');

            if (compAction === 'run_kube_bench') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const targets = Array.isArray(payload['targets']) ? (payload['targets'] as ComplianceTarget[]) : undefined;
                const args    = buildKubeBenchArgs({ targets, outputFormat: 'json' });
                const result  = await runCommand(args, workspaceDir, 300_000);
                const parsed  = parseKubeBenchOutput(result.stdout);
                const report  = formatComplianceReport(parsed);
                let remediation = null;
                if (callLlm && payload['analyze_failures'] !== false && parsed.totals.fail > 0) {
                    const service  = str(payload['service'], 'cluster');
                    const env      = (str(payload['environment'], 'production')) as 'production' | 'staging';
                    const failedChecks = parsed.controls.flatMap((c) => c.tests.filter((t) => t.result === 'FAIL'));
                    const prompt   = buildComplianceScanPrompt({ service, failedChecks, environment: env });
                    remediation    = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes security expert. Return JSON only.');
                }
                return safeJson({ ok: result.exitCode === 0, action: 'run_kube_bench', totals: parsed.totals, controls: parsed.controls.length, report, remediation, summary: `kube-bench: ${parsed.totals.pass} PASS, ${parsed.totals.fail} FAIL, ${parsed.totals.warn} WARN` });
            }

            if (compAction === 'run_kube_bench_job') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const targets   = Array.isArray(payload['targets']) ? (payload['targets'] as ComplianceTarget[]) : undefined;
                const jobYaml   = buildKubeBenchJobYaml({ namespace, imageTag: str(payload['image_tag']) || undefined, targets });
                const jobFile   = `/tmp/kube-bench-job.yaml`;
                await executeAction('workspace_write_file', { file_path: jobFile, content: jobYaml });
                const applyRes  = await runCommand(['kubectl', 'apply', '-f', jobFile], workspaceDir, 15_000);
                return safeJson({ ok: applyRes.exitCode === 0, action: 'run_kube_bench_job', namespace, job_file: jobFile, exit_code: applyRes.exitCode, summary: applyRes.exitCode === 0 ? `kube-bench Job created in "${namespace}". Use get_job_logs to retrieve results.` : applyRes.stderr.slice(0, 200) });
            }

            if (compAction === 'get_job_logs') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const args   = buildKubeBenchLogsArgs(namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                const parsed = parseKubeBenchOutput(result.stdout);
                const report = formatComplianceReport(parsed);
                return safeJson({ ok: result.exitCode === 0, action: 'get_job_logs', totals: parsed.totals, report, raw: result.stdout.slice(0, 4000), summary: `kube-bench logs: ${parsed.totals.pass} PASS, ${parsed.totals.fail} FAIL` });
            }

            if (compAction === 'falco_status') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns     = str(payload['falco_namespace'], 'falco');
                const args   = buildFalcoStatusArgs(ns);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'falco_status', namespace: ns, raw: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? 'Falco DaemonSet status retrieved.' : result.stderr.slice(0, 200) });
            }

            if (compAction === 'falco_logs') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns     = str(payload['falco_namespace'], 'falco');
                const tail   = num(payload['tail_lines'], 200);
                const args   = buildFalcoLogsArgs(ns, tail);
                const result = await runCommand(args, workspaceDir, 30_000);
                const alerts = parseFalcoAlerts(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'falco_logs', namespace: ns, alerts, alert_count: alerts.length, raw: result.stdout.slice(0, 4000), summary: `Falco: ${alerts.length} alert(s) found.` });
            }

            if (compAction === 'falco_hardened_rules') {
                const ns     = str(payload['falco_namespace'], 'falco');
                const cmName = str(payload['configmap_name'], 'falco-hardened-rules');
                const yaml   = buildFalcoRulesConfigMapYaml(FALCO_HARDENED_RULES, { name: cmName, namespace: ns });
                const outputDir = str(payload['output_dir'], '.');
                const fp     = outputDir !== '.' ? `${outputDir}/${cmName}.yaml` : `${cmName}.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'falco_hardened_rules', file_written: fp, rule_count: FALCO_HARDENED_RULES.length, summary: `${FALCO_HARDENED_RULES.length} hardened Falco rules written to ${fp}.` });
            }

            if (compAction === 'falco_generate_rules') {
                if (!callLlm) return { ok: false, output: '', errorOutput: 'LLM not available for rule generation' };
                const service     = str(payload['service'], 'my-service');
                const description = str(payload['description']);
                const threat      = str(payload['threat']);
                if (!description || !threat) return { ok: false, output: '', errorOutput: 'description and threat required for falco_generate_rules' };
                const ns       = str(payload['falco_namespace'], 'falco');
                const prompt   = buildFalcoRulePrompt({ service, description, threat, namespace: ns });
                const llmRaw   = await callLlmSafe(callLlm, prompt, 'You are a Falco security expert. Return JSON only.');
                const files    = parseLoadTestScriptOutput(llmRaw); // same JSON array shape { filename, content }
                const outputDir = str(payload['output_dir'], '.');
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'falco_generate_rules', service, files_written: written, summary: `Generated ${written.length} Falco rule file(s) for "${service}".` });
            }

            if (compAction === 'falco_apply_rules') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns = str(payload['falco_namespace'], 'falco');
                // Apply rules from file path
                const rulesFile = str(payload['rules_file']);
                if (rulesFile) {
                    const applyArgs    = ['kubectl', 'apply', '-f', rulesFile, '-n', ns];
                    const applyResult  = await runCommand(applyArgs, workspaceDir, 15_000);
                    if (!applyResult.exitCode) {
                        await runCommand(buildFalcoRestartArgs(ns), workspaceDir, 30_000).catch(() => null);
                    }
                    return safeJson({ ok: applyResult.exitCode === 0, action: 'falco_apply_rules', namespace: ns, rules_file: rulesFile, exit_code: applyResult.exitCode, summary: applyResult.exitCode === 0 ? `Falco rules applied from "${rulesFile}". DaemonSet restarted.` : applyResult.stderr.slice(0, 200) });
                }
                // Apply inline rules
                const rulesRaw = payload['rules'];
                if (!Array.isArray(rulesRaw)) return { ok: false, output: '', errorOutput: 'rules_file or rules array required' };
                const rules   = rulesRaw as FalcoRule[];
                const cmName  = str(payload['configmap_name'], 'falco-custom-rules');
                const yaml    = buildFalcoRulesConfigMapYaml(rules, { name: cmName, namespace: ns });
                const tmpFile = `/tmp/${cmName}.yaml`;
                await executeAction('workspace_write_file', { file_path: tmpFile, content: yaml });
                const applyResult = await runCommand(['kubectl', 'apply', '-f', tmpFile, '-n', ns], workspaceDir, 15_000);
                if (applyResult.exitCode === 0) {
                    await runCommand(buildFalcoRestartArgs(ns), workspaceDir, 30_000).catch(() => null);
                }
                return safeJson({ ok: applyResult.exitCode === 0, action: 'falco_apply_rules', namespace: ns, rule_count: rules.length, exit_code: applyResult.exitCode, summary: applyResult.exitCode === 0 ? `${rules.length} Falco rule(s) applied. DaemonSet restarted.` : applyResult.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown compliance_scan action: ${compAction}` };
        }

        // ====================================================================
        // workspace_devops_registry
        // payload: action (list_images|list_repos|delete_images|put_lifecycle_policy|
        //                   list_versions|delete_version|list_gcr|delete_gcr|
        //                   show_acr_tags|purge_acr|mirror_image|crane_copy|
        //                   apply_retention),
        //          provider (ecr|ghcr|gcr|gar|acr), repository,
        //          [ecr] region?, registry_id?
        //          [delete_images] image_digests (array) — requires allow_destructive: true
        //          [put_lifecycle_policy] keep_latest?, max_age_days?, keep_tag_prefixes?
        //          [ghcr] owner, package_name, token, version_id?
        //          [acr] registry, filter?, ago?, keep_latest?, dry_run?
        //          [mirror] source_image, dest_registry, dest_repo, dest_tag?, tool?
        //          [apply_retention] tags (ImageTag[]), retention_policy (RetentionPolicy)
        // ====================================================================
        case 'workspace_devops_registry': {
            const regAction  = str(payload['action'], 'list_images');
            const provider   = (str(payload['provider'], 'ecr')) as RegistryProvider;
            const repository = str(payload['repository']);

            const isDestructive = ['delete_images', 'delete_version', 'delete_gcr', 'purge_acr'].includes(regAction);
            if (isDestructive && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Registry delete operations require allow_destructive: true` };
            }

            if (provider === 'ecr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const region = str(payload['region']) || undefined;

                if (regAction === 'list_repos') {
                    const args   = buildEcrDescribeReposArgs(region, str(payload['registry_id']) || undefined);
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_repos', provider, raw: result.stdout.slice(0, 4000), summary: 'ECR repositories listed.' });
                }

                if (!repository) return { ok: false, output: '', errorOutput: 'repository required for ECR operations' };

                if (regAction === 'list_images') {
                    const args   = buildEcrListImagesArgs({ repository, region, filter: (str(payload['filter']) as 'TAGGED' | 'UNTAGGED') || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    const images = parseEcrImages(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_images', provider, repository, image_count: images.length, images: images.slice(0, 50), summary: `${images.length} image(s) in ECR repo "${repository}".` });
                }

                if (regAction === 'delete_images') {
                    const digests = Array.isArray(payload['image_digests']) ? (payload['image_digests'] as string[]) : [];
                    if (!digests.length) return { ok: false, output: '', errorOutput: 'image_digests array required for delete_images' };
                    const args   = buildEcrDeleteImagesArgs({ repository, imageDigests: digests, region });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_images', provider, repository, deleted_count: digests.length, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Deleted ${digests.length} image(s) from "${repository}".` : result.stderr.slice(0, 200) });
                }

                if (regAction === 'put_lifecycle_policy') {
                    const policyJson = buildEcrLifecyclePolicyJson({
                        keepLatestCount:  num(payload['keep_latest'], 10),
                        maxTaggedAgeDays: typeof payload['max_age_days'] === 'number' ? (payload['max_age_days'] as number) : undefined,
                        keepTagPrefixes:  Array.isArray(payload['keep_tag_prefixes']) ? (payload['keep_tag_prefixes'] as string[]) : undefined,
                    });
                    const args   = buildEcrPutLifecyclePolicyArgs({ repository, policyJson, region });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'put_lifecycle_policy', provider, repository, exit_code: result.exitCode, policy: JSON.parse(policyJson), summary: result.exitCode === 0 ? `ECR lifecycle policy applied to "${repository}".` : result.stderr.slice(0, 200) });
                }

                if (regAction === 'apply_retention') {
                    // List images, apply retention, delete what's unwanted
                    const listArgs   = buildEcrListImagesArgs({ repository, region });
                    const listResult = await runCommand(listArgs, workspaceDir, 30_000);
                    const images     = parseEcrImages(listResult.stdout);
                    const policy: RetentionPolicy = {
                        keepLatest:      typeof payload['keep_latest']       === 'number' ? (payload['keep_latest'] as number)       : undefined,
                        keepTagPattern:  str(payload['keep_tag_pattern'])    || undefined,
                        maxAgeDays:      typeof payload['max_age_days']      === 'number' ? (payload['max_age_days'] as number)      : undefined,
                        keepTags:        Array.isArray(payload['keep_tags']) ? (payload['keep_tags'] as string[]) : undefined,
                    };
                    const { keep, delete: toDelete } = applyRetentionPolicy(images, policy);
                    const report = formatRegistryCleanupReport(toDelete, keep);
                    if (!toDelete.length || payload['dry_run'] === true) {
                        return safeJson({ ok: true, action: 'apply_retention', dry_run: payload['dry_run'] === true, provider, repository, kept: keep.length, to_delete: toDelete.length, report, summary: payload['dry_run'] ? `Dry run: ${toDelete.length} image(s) would be deleted.` : 'Nothing to delete.' });
                    }
                    const digests = toDelete.filter((t) => t.digest).map((t) => t.digest as string);
                    if (digests.length) {
                        const delArgs   = buildEcrDeleteImagesArgs({ repository, imageDigests: digests, region });
                        await runCommand(delArgs, workspaceDir, 60_000);
                    }
                    return safeJson({ ok: true, action: 'apply_retention', provider, repository, kept: keep.length, deleted: toDelete.length, report, summary: report });
                }
            }

            if (provider === 'ghcr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const owner       = str(payload['owner']);
                const packageName = str(payload['package_name'], repository);
                const token       = str(payload['token']);
                if (!owner || !token) return { ok: false, output: '', errorOutput: 'owner and token required for ghcr' };

                if (regAction === 'list_versions') {
                    const args   = buildGhcrListVersionsArgs({ owner, packageName, token, perPage: num(payload['per_page'], 100) });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_versions', provider, package: packageName, raw: result.stdout.slice(0, 4000), summary: `GHCR versions listed for "${packageName}".` });
                }

                if (regAction === 'delete_version') {
                    const versionId = num(payload['version_id'], 0);
                    if (!versionId) return { ok: false, output: '', errorOutput: 'version_id required for delete_version' };
                    const args   = buildGhcrDeleteVersionArgs({ owner, packageName, versionId, token });
                    const result = await runCommand(args, workspaceDir, 15_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_version', provider, package: packageName, version_id: versionId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `GHCR version ${versionId} of "${packageName}" deleted.` : result.stderr.slice(0, 200) });
                }
            }

            if (provider === 'gcr' || provider === 'gar') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

                if (regAction === 'list_gcr') {
                    if (!repository) return { ok: false, output: '', errorOutput: 'repository required' };
                    const args   = buildGcloudImagesListArgs({ repository, project: str(payload['project']) || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_gcr', provider, repository, raw: result.stdout.slice(0, 4000), summary: `GCR images listed for "${repository}".` });
                }

                if (regAction === 'delete_gcr') {
                    const imageWithDigest = str(payload['image_with_digest']);
                    if (!imageWithDigest) return { ok: false, output: '', errorOutput: 'image_with_digest required' };
                    const args   = buildGcloudImagesDeleteArgs({ imageWithDigest, project: str(payload['project']) || undefined, force: payload['force'] === true });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_gcr', provider, image: imageWithDigest, exit_code: result.exitCode, summary: result.exitCode === 0 ? `GCR image deleted: ${imageWithDigest}` : result.stderr.slice(0, 200) });
                }
            }

            if (provider === 'acr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const registry = str(payload['registry']);
                if (!registry) return { ok: false, output: '', errorOutput: 'registry required for ACR' };

                if (regAction === 'show_acr_tags') {
                    const args   = buildAcrShowTagsArgs({ registry, repository: repository || str(payload['repo']), orderby: 'time_desc', top: num(payload['top'], 50) || undefined, subscription: str(payload['subscription']) || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'show_acr_tags', provider, registry, repository, raw: result.stdout.slice(0, 4000), summary: `ACR tags listed for "${registry}/${repository}".` });
                }

                if (regAction === 'purge_acr') {
                    const filter = str(payload['filter'], `${repository}:.*`);
                    const ago    = str(payload['ago'], '30d');
                    const args   = buildAcrPurgePolicyArgs({ registry, filter, ago, keepLatest: typeof payload['keep_latest'] === 'number' ? (payload['keep_latest'] as number) : undefined, dryRun: payload['dry_run'] === true, subscription: str(payload['subscription']) || undefined });
                    const result = await runCommand(args, workspaceDir, 120_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'purge_acr', provider, registry, filter, ago, dry_run: payload['dry_run'] === true, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? `ACR purge completed for "${registry}" (filter: ${filter}, ago: ${ago}).` : result.stderr.slice(0, 200) });
                }
            }

            // Mirror / copy actions (provider-agnostic)
            if (regAction === 'mirror_image') {
                const sourceImage  = str(payload['source_image']);
                const destRegistry = str(payload['dest_registry']);
                const destRepo     = str(payload['dest_repo'], repository);
                const tool         = str(payload['tool'], 'docker');
                if (!sourceImage || !destRegistry || !destRepo) return { ok: false, output: '', errorOutput: 'source_image, dest_registry, and dest_repo required for mirror_image' };

                if (tool === 'crane') {
                    if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                    const destTag   = str(payload['dest_tag']) || undefined;
                    const destImage = `${destRegistry}/${destRepo}${destTag ? ':' + destTag : ''}`;
                    const args      = buildCraneCopyArgs(sourceImage, destImage, str(payload['platform']) || undefined);
                    const result    = await runCommand(args, workspaceDir, 300_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'mirror_image', tool: 'crane', source: sourceImage, dest: destImage, exit_code: result.exitCode, summary: result.exitCode === 0 ? `crane copy ${sourceImage} → ${destImage}` : result.stderr.slice(0, 200) });
                }

                if (tool === 'skopeo') {
                    if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                    const destTag   = str(payload['dest_tag']) || undefined;
                    const destImage = `${destRegistry}/${destRepo}${destTag ? ':' + destTag : ''}`;
                    const args      = buildSkopeoCopyArgs({ source: sourceImage, dest: destImage, srcCreds: str(payload['src_creds']) || undefined, destCreds: str(payload['dest_creds']) || undefined, all: payload['all'] === true });
                    const result    = await runCommand(args, workspaceDir, 300_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'mirror_image', tool: 'skopeo', source: sourceImage, dest: destImage, exit_code: result.exitCode, summary: result.exitCode === 0 ? `skopeo copy ${sourceImage} → ${destImage}` : result.stderr.slice(0, 200) });
                }

                // Default: docker pull / tag / push
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const { pull, tag, push } = buildDockerMirrorCommands({ sourceImage, destRegistry, destRepo, destTag: str(payload['dest_tag']) || undefined });
                await runCommand(pull, workspaceDir, 300_000);
                await runCommand(tag,  workspaceDir, 10_000);
                const pushResult = await runCommand(push, workspaceDir, 300_000);
                const destImage  = push[push.length - 1];
                return safeJson({ ok: pushResult.exitCode === 0, action: 'mirror_image', tool: 'docker', source: sourceImage, dest: destImage, exit_code: pushResult.exitCode, summary: pushResult.exitCode === 0 ? `Docker mirror ${sourceImage} → ${destImage}` : pushResult.stderr.slice(0, 200) });
            }

            if (regAction === 'crane_copy') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const source = str(payload['source']);
                const dest   = str(payload['dest']);
                if (!source || !dest) return { ok: false, output: '', errorOutput: 'source and dest required for crane_copy' };
                const args   = buildCraneCopyArgs(source, dest, str(payload['platform']) || undefined);
                const result = await runCommand(args, workspaceDir, 300_000);
                return safeJson({ ok: result.exitCode === 0, action: 'crane_copy', source, dest, exit_code: result.exitCode, summary: result.exitCode === 0 ? `crane copy ${source} → ${dest}` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown registry action: ${regAction} for provider: ${provider}` };
        }

        // ====================================================================
        // workspace_devops_load_test
        // payload: action (generate_k6|generate_gatling_script|run_k6|run_gatling|
        //                   run_jmeter|compare),
        //          [generate_k6] base_url (required), scenario_name?, vus?, duration?,
        //                        endpoints? (array of {method,path,body?,headers?,expectedStatus?,name?}),
        //                        thresholds? (array of {metric,condition}), description?
        //          [run_k6] script_path (required), output_json?, env_vars?
        //          [run_gatling] simulation_class (required), results_dir?, jvm_opts?, gatling_home?
        //          [run_jmeter] jmx_path (required), results_path?, report_dir?,
        //                        properties?, threads?, duration_seconds?
        //          [compare] baseline (LoadTestResult), current (LoadTestResult),
        //                    regression_threshold?
        // ====================================================================
        case 'workspace_devops_load_test': {
            const ltAction = str(payload['action'], 'generate_k6');

            if (ltAction === 'generate_k6') {
                const baseUrl   = str(payload['base_url']) || str(payload['target_url'], 'http://localhost:8080');
                const outputDir = str(payload['output_dir'], '.');

                const scenarioName = str(payload['scenario_name'], 'load-test');
                const vus          = typeof payload['vus']      === 'number' ? (payload['vus'] as number) : 10;
                const duration     = str(payload['duration'], '5m');
                const rampUpTime   = str(payload['ramp_up_time']) || undefined;

                const rawEndpoints = Array.isArray(payload['endpoints'])
                    ? (payload['endpoints'] as Array<{method?:string;path:string;body?:string;headers?:Record<string,string>;expectedStatus?:number;name?:string}>)
                    : [{ method: str(payload['http_method'], 'GET'), path: str(payload['path'], '/'), body: str(payload['body']) || undefined, expectedStatus: typeof payload['expected_status'] === 'number' ? (payload['expected_status'] as number) : 200 }];

                const endpoints = rawEndpoints.map((e) => ({
                    method:         (e.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path:           e.path,
                    body:           e.body,
                    headers:        e.headers,
                    expectedStatus: e.expectedStatus ?? 200,
                    name:           e.name,
                }));

                const rawThresholds = Array.isArray(payload['thresholds'])
                    ? (payload['thresholds'] as Array<{metric:string;condition:string}>)
                    : undefined;

                const scenario: LoadTestScenario = { name: scenarioName, baseUrl, endpoints, vus, duration, rampUpTime, thresholds: rawThresholds };

                if (callLlm && str(payload['description'])) {
                    const prompt = buildK6ScriptPrompt({ scenario, description: str(payload['description']), advanced: payload['advanced'] === true });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a performance testing expert. Return JSON only.');
                    const files  = parseLoadTestScriptOutput(llmRaw);
                    if (files.length) {
                        const written: string[] = [];
                        for (const f of files) {
                            const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                            await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                            written.push(fp);
                        }
                        return safeJson({ ok: true, action: 'generate_k6', files_written: written, summary: `Generated ${written.length} k6 script file(s) via LLM.` });
                    }
                }

                // Direct script generation
                const script     = buildK6Script(scenario);
                const scriptName = `${scenarioName}.js`;
                const fp         = outputDir !== '.' ? `${outputDir}/${scriptName}` : scriptName;
                await executeAction('workspace_write_file', { file_path: fp, content: script });
                return safeJson({ ok: true, action: 'generate_k6', file_written: fp, summary: `k6 script written to ${fp}.` });
            }

            if (ltAction === 'generate_gatling_script') {
                if (!callLlm) return { ok: false, output: '', errorOutput: 'LLM not available' };
                const baseUrl   = str(payload['base_url']) || str(payload['target_url']);
                const outputDir = str(payload['output_dir'], '.');
                if (!baseUrl) return { ok: false, output: '', errorOutput: 'base_url required' };

                const scenarioName = str(payload['scenario_name'], 'gatling-test');
                const rawEndpoints = Array.isArray(payload['endpoints'])
                    ? (payload['endpoints'] as Array<{method?:string;path:string;body?:string;headers?:Record<string,string>;expectedStatus?:number;name?:string}>)
                    : [{ method: 'GET', path: '/' }];
                const endpoints = rawEndpoints.map((e) => ({
                    method: (e.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path: e.path, body: e.body, headers: e.headers, expectedStatus: e.expectedStatus ?? 200, name: e.name,
                }));
                const scenario: LoadTestScenario = {
                    name: scenarioName, baseUrl, endpoints,
                    vus:         typeof payload['vus'] === 'number' ? (payload['vus'] as number) : undefined,
                    duration:    str(payload['duration']) || undefined,
                    rampUpTime:  str(payload['ramp_up_time']) || undefined,
                };
                const prompt = buildGatlingScriptPrompt({ scenario, description: str(payload['description']) || 'Load test', packageName: str(payload['package_name']) || undefined });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Gatling expert. Return JSON only.');
                const files  = parseLoadTestScriptOutput(llmRaw);
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate_gatling_script', files_written: written, summary: `Generated ${written.length} Gatling script file(s).` });
            }

            if (ltAction === 'run_k6') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const scriptPath = str(payload['script_path']);
                if (!scriptPath) return { ok: false, output: '', errorOutput: 'script_path required for run_k6' };
                const outputJson = str(payload['output_json']) || undefined;
                const envVars    = typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null
                    ? (payload['env_vars'] as Record<string, string>) : undefined;
                const args   = buildK6RunArgs({ scriptPath, outputJson, envVars });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 30) * 60_000);
                const scenarioName = str(payload['scenario_name'], 'k6-run');
                const ltr    = parseK6Output(outputJson ? '' : result.stdout, scenarioName);
                const report = formatLoadTestReport(ltr);
                return safeJson({ ok: result.exitCode === 0, action: 'run_k6', script: scriptPath, exit_code: result.exitCode, result: ltr, report, summary: `k6 run: ${result.exitCode === 0 ? 'passed' : 'failed'} — p95=${(ltr.p95Ms ?? 0).toFixed(0)}ms errors=${((ltr.errorRate ?? 0) * 100).toFixed(2)}%` });
            }

            if (ltAction === 'run_gatling') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const simulationClass = str(payload['simulation_class']);
                if (!simulationClass) return { ok: false, output: '', errorOutput: 'simulation_class required for run_gatling' };
                const args   = buildGatlingArgs({
                    simulationClass,
                    resultsDir:  str(payload['results_dir'])  || undefined,
                    jvmOpts:     str(payload['jvm_opts'])     || undefined,
                    gatlingHome: str(payload['gatling_home']) || undefined,
                    envVars:     typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null ? (payload['env_vars'] as Record<string, string>) : undefined,
                });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 30) * 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'run_gatling', simulation: simulationClass, exit_code: result.exitCode, output_tail: result.stdout.slice(-2000), summary: result.exitCode === 0 ? `Gatling simulation "${simulationClass}" completed.` : result.stderr.slice(0, 200) });
            }

            if (ltAction === 'run_jmeter') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const jmxPath = str(payload['jmx_path']) || str(payload['plan_path']);
                if (!jmxPath) return { ok: false, output: '', errorOutput: 'jmx_path required for run_jmeter' };
                const properties = typeof payload['properties'] === 'object' && payload['properties'] !== null
                    ? (payload['properties'] as Record<string, string>) : undefined;
                const args   = buildJMeterArgs({
                    jmxPath,
                    resultsPath: str(payload['results_path']) || undefined,
                    reportDir:   str(payload['report_dir'])   || undefined,
                    properties,
                    threads:     typeof payload['threads']           === 'number' ? (payload['threads'] as number)           : undefined,
                    duration:    typeof payload['duration_seconds']  === 'number' ? (payload['duration_seconds'] as number)  : undefined,
                    jmeterHome:  str(payload['jmeter_home'])         || undefined,
                });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 60) * 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'run_jmeter', jmx: jmxPath, exit_code: result.exitCode, output_tail: result.stdout.slice(-2000), summary: result.exitCode === 0 ? `JMeter plan "${jmxPath}" completed.` : result.stderr.slice(0, 200) });
            }

            if (ltAction === 'compare') {
                const baseline = payload['baseline'] as Parameters<typeof compareBenchmarks>[0] | undefined;
                const current  = payload['current']  as Parameters<typeof compareBenchmarks>[1] | undefined;
                if (!baseline || !current) return { ok: false, output: '', errorOutput: 'baseline and current LoadTestResult objects required for compare' };
                const threshold  = typeof payload['regression_threshold'] === 'number' ? (payload['regression_threshold'] as number) : undefined;
                const comparison = compareBenchmarks(baseline, current, threshold);
                return safeJson({ ok: true, action: 'compare', comparison, regression: comparison.regression, summary: `Load test comparison: ${comparison.regression ? 'REGRESSION DETECTED' : 'no regression'}. p99 change: ${comparison.deltaPercent.toFixed(1)}%` });
            }

            return { ok: false, output: '', errorOutput: `Unknown load_test action: ${ltAction}` };
        }
    }
}
