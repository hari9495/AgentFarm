// ============================================================================
// DEVOPS EPISODIC HOOKS
// Provides devops-specific pattern keys and summaries for episodic memory.
//
// buildDevopsEpisodicPattern  → derives a domain-specific key, e.g.:
//   "devops:tf_plan:destroy_risk"
//   "devops:k8s_deploy:success"
//   "devops:incident_triage:critical"
//   "devops:docker_build:fail"
//
// buildDevopsEpisodicSummary  → richer context summary for the memory record.
//
// Both are pure functions; no side-effects.
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

function numericPayload(result: ProcessedTaskResult, key: string): number {
    const v = result.executionPayload[key];
    return typeof v === 'number' ? v : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a devops-specific episodic pattern key.
 *
 * Examples:
 *   "devops:tf_plan:destroy_risk"
 *   "devops:tf_apply:success"
 *   "devops:k8s_deploy:success"
 *   "devops:k8s_rollback:success"
 *   "devops:incident_triage:critical"
 *   "devops:docker_build:fail"
 */
export function buildDevopsEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // ── Terraform ────────────────────────────────────────────────────────────
    if (at === 'workspace_devops_tf_plan') {
        const riskLevel = result.executionPayload['risk_level'];
        if (riskLevel === 'high')   return 'devops:tf_plan:destroy_risk';
        if (riskLevel === 'medium') return 'devops:tf_plan:medium_risk';
        return `devops:tf_plan:${oc}`;
    }

    if (at === 'workspace_devops_tf_apply') {
        const destroyCount = numericPayload(result, 'destroy_count');
        if (oc === 'fail')          return 'devops:tf_apply:fail';
        if (destroyCount > 0)       return 'devops:tf_apply:destructive';
        return 'devops:tf_apply:success';
    }

    if (at === 'workspace_devops_tf_validate') {
        const findingCount = numericPayload(result, 'finding_count');
        if (oc === 'fail')          return 'devops:tf_validate:fail';
        if (findingCount > 0)       return 'devops:tf_validate:security_findings';
        return 'devops:tf_validate:clean';
    }

    if (at === 'workspace_devops_tf_generate') return `devops:tf_generate:${oc}`;

    // ── Kubernetes ───────────────────────────────────────────────────────────
    if (at === 'workspace_devops_k8s_deploy') {
        const isDryRun = result.executionPayload['dry_run'];
        if (isDryRun === true) return 'devops:k8s_deploy:dry_run';
        return `devops:k8s_deploy:${oc}`;
    }

    if (at === 'workspace_devops_k8s_rollback') return `devops:k8s_rollback:${oc}`;
    if (at === 'workspace_devops_k8s_status')   return `devops:k8s_status:${oc}`;

    if (at === 'workspace_devops_k8s_logs') {
        const severity = result.executionPayload['severity'];
        if (severity === 'critical') return 'devops:k8s_logs:critical';
        if (severity === 'high')     return 'devops:k8s_logs:high_severity';
        return `devops:k8s_logs:${oc}`;
    }

    if (at === 'workspace_devops_k8s_generate') return `devops:k8s_generate:${oc}`;

    // ── Docker ───────────────────────────────────────────────────────────────
    if (at === 'workspace_devops_docker_build') return `devops:docker_build:${oc}`;
    if (at === 'workspace_devops_docker_push')  return `devops:docker_push:${oc}`;

    // ── CI/CD ────────────────────────────────────────────────────────────────
    if (at === 'workspace_devops_pipeline_trigger') return `devops:pipeline_trigger:${oc}`;
    if (at === 'workspace_devops_pipeline_status') {
        const status = result.executionPayload['pipeline_status'];
        if (status === 'failed')  return 'devops:pipeline_status:failed';
        if (status === 'running') return 'devops:pipeline_status:running';
        return `devops:pipeline_status:${oc}`;
    }

    // ── Incident & reporting ─────────────────────────────────────────────────
    if (at === 'workspace_devops_incident_triage') {
        const severity = result.executionPayload['severity'];
        if (severity === 'critical') return 'devops:incident_triage:critical';
        if (severity === 'high')     return 'devops:incident_triage:high';
        return `devops:incident_triage:${oc}`;
    }

    if (at === 'workspace_devops_standup_report') return `devops:standup:${oc}`;

    // Fallback — namespaced under "devops:"
    return `devops:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the DevOps role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildDevopsEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildDevopsEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title       = typeof task.payload['title']       === 'string' ? task.payload['title']       : '';
    const description = typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel   = (title || description || at).slice(0, 120);

    // ── Terraform ────────────────────────────────────────────────────────────

    if (pattern === 'devops:tf_plan:destroy_risk') {
        const dc = numericPayload(result, 'destroy_count');
        const sc = numericPayload(result, 'score');
        return `Terraform plan: ${dc} destroy(s) — HIGH RISK (score ${sc}/100): ${taskLabel}`;
    }
    if (pattern === 'devops:tf_plan:medium_risk') {
        const uc = numericPayload(result, 'update_count');
        return `Terraform plan: ${uc} update(s) — medium risk: ${taskLabel}`;
    }
    if (pattern.startsWith('devops:tf_plan')) {
        const ac = numericPayload(result, 'add_count');
        return `Terraform plan ${oc} (${ac} add(s)): ${taskLabel}`;
    }

    if (pattern === 'devops:tf_apply:destructive') {
        const dc = numericPayload(result, 'destroy_count');
        return `Terraform apply: ${dc} resource(s) destroyed: ${taskLabel}`;
    }
    if (pattern.startsWith('devops:tf_apply'))
        return `Terraform apply ${oc}: ${taskLabel}`;

    if (pattern === 'devops:tf_validate:security_findings') {
        const fc = numericPayload(result, 'finding_count');
        return `Terraform validate: ${fc} IaC security finding(s): ${taskLabel}`;
    }
    if (pattern === 'devops:tf_validate:clean')
        return `Terraform validate: clean — no issues: ${taskLabel}`;
    if (pattern.startsWith('devops:tf_validate'))
        return `Terraform validate ${oc}: ${taskLabel}`;

    if (pattern.startsWith('devops:tf_generate')) {
        const fc = numericPayload(result, 'file_count');
        return `Terraform HCL generated (${fc} file(s)) ${oc}: ${taskLabel}`;
    }

    // ── Kubernetes ───────────────────────────────────────────────────────────

    if (pattern === 'devops:k8s_deploy:dry_run')
        return `K8s deploy (dry-run): ${taskLabel}`;
    if (pattern.startsWith('devops:k8s_deploy')) {
        const ns = typeof result.executionPayload['namespace'] === 'string'
            ? result.executionPayload['namespace']
            : 'default';
        return `K8s deploy ${oc} → namespace "${ns as string}": ${taskLabel}`;
    }

    if (pattern.startsWith('devops:k8s_rollback')) {
        const dep = typeof result.executionPayload['deployment'] === 'string'
            ? result.executionPayload['deployment']
            : '';
        return dep
            ? `K8s rollback ${oc} for "${dep}": ${taskLabel}`
            : `K8s rollback ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('devops:k8s_status')) {
        const ready = result.executionPayload['ready'];
        return `K8s rollout status: ${ready === true ? 'ready' : 'not ready'}: ${taskLabel}`;
    }

    if (pattern === 'devops:k8s_logs:critical') {
        const rc = typeof result.executionPayload['root_cause'] === 'string'
            ? result.executionPayload['root_cause']
            : '';
        return rc
            ? `K8s logs: CRITICAL — "${rc}": ${taskLabel}`
            : `K8s logs: CRITICAL severity detected: ${taskLabel}`;
    }
    if (pattern === 'devops:k8s_logs:high_severity') {
        const ec = numericPayload(result, 'error_count');
        return `K8s logs: ${ec} error(s), high severity: ${taskLabel}`;
    }
    if (pattern.startsWith('devops:k8s_logs')) {
        const ec = numericPayload(result, 'error_count');
        return `K8s log analysis ${oc} (${ec} error(s)): ${taskLabel}`;
    }

    if (pattern.startsWith('devops:k8s_generate')) {
        const mc = numericPayload(result, 'manifest_count');
        return `K8s manifests generated (${mc} file(s)) ${oc}: ${taskLabel}`;
    }

    // ── Docker ───────────────────────────────────────────────────────────────

    if (pattern.startsWith('devops:docker_build')) {
        const img = typeof result.executionPayload['image'] === 'string'
            ? result.executionPayload['image']
            : '';
        return img
            ? `Docker build ${oc}: ${img}: ${taskLabel}`
            : `Docker build ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('devops:docker_push')) {
        const img = typeof result.executionPayload['full_image'] === 'string'
            ? result.executionPayload['full_image']
            : '';
        return img
            ? `Docker push ${oc}: ${img}: ${taskLabel}`
            : `Docker push ${oc}: ${taskLabel}`;
    }

    // ── CI/CD ────────────────────────────────────────────────────────────────

    if (pattern.startsWith('devops:pipeline_trigger'))
        return `Pipeline triggered ${oc}: ${taskLabel}`;

    if (pattern === 'devops:pipeline_status:failed')
        return `Pipeline FAILED: ${taskLabel}`;
    if (pattern === 'devops:pipeline_status:running')
        return `Pipeline still running: ${taskLabel}`;
    if (pattern.startsWith('devops:pipeline_status'))
        return `Pipeline status checked (${oc}): ${taskLabel}`;

    // ── Incident & reporting ─────────────────────────────────────────────────

    if (pattern === 'devops:incident_triage:critical') {
        const rc = typeof result.executionPayload['root_cause'] === 'string'
            ? result.executionPayload['root_cause']
            : '';
        return rc
            ? `Incident triage: CRITICAL — "${rc}": ${taskLabel}`
            : `Incident triage: CRITICAL severity: ${taskLabel}`;
    }
    if (pattern === 'devops:incident_triage:high') {
        const ec = numericPayload(result, 'error_count');
        return `Incident triage: HIGH severity, ${ec} error(s): ${taskLabel}`;
    }
    if (pattern.startsWith('devops:incident_triage'))
        return `Incident triage ${oc}: ${taskLabel}`;

    if (pattern.startsWith('devops:standup'))
        return `DevOps standup generated (${oc}): ${taskLabel}`;

    // Fallback
    return `DevOps action "${at}" completed with status "${oc}": ${taskLabel}`;
}
