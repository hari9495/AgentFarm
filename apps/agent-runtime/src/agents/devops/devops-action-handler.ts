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
    | 'workspace_devops_standup_report';

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
    }
}
