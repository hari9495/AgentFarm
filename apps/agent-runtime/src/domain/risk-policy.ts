/**
 * risk-policy.ts — pure domain logic for action risk classification.
 *
 * This module is intentionally a pure-function / data module with zero I/O
 * dependencies. It can be imported by the execution engine, tests, and any
 * future policy-evaluation service without pulling in infrastructure.
 *
 * To add a new action or change its risk tier: edit the sets below.
 * No other file needs to change.
 */

import type { TaskEnvelope, ActionDecision, RiskLevel } from '../execution-engine.js';

// ---------------------------------------------------------------------------
// Risk tier sets
// ---------------------------------------------------------------------------

export const HIGH_RISK_ACTIONS = new Set([
    'merge_release',
    'merge_pr',
    'delete_resource',
    'change_permissions',
    'deploy_production',
    // Local workspace: pushing code to a remote branch is high-risk
    'git_push',
    // Local workspace: arbitrary shell commands require explicit approval
    'run_shell_command',
    // Tier 5: REPL can execute arbitrary code
    'workspace_repl_start',
    'workspace_repl_execute',
    // Tier 7: Dry-run with approval chain (prepares for external approval)
    'workspace_dry_run_with_approval_chain',
    // Tier 11: Local desktop and browser control
    'workspace_browser_open',
    'workspace_app_launch',
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    // Tier 12: Sub-agent delegation and GitHub issue auto-fix
    'workspace_subagent_spawn',
    'workspace_github_issue_fix',
    // Content Writer: human validation gate — always requires human expert review
    'workspace_cw_request_human_gate',
    // DevOps: infrastructure mutations that affect cost, uptime, or production traffic
    'workspace_devops_tf_apply',
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    'workspace_devops_pipeline_trigger',
    // Mobile: app store submissions reach millions of users — irreversible without store review
    'workspace_mob_store_upload',
    // Bootstrap: provisioning new cloud accounts / orgs has billing + security implications
    'workspace_bootstrap_aws_org',
    'workspace_bootstrap_github_org',
    'workspace_bootstrap_k8s_cluster',
    // Infra debug: IPMI power-off/reset can take down live servers
    'workspace_infra_ipmi_console',
    // Roadmap execution: autonomous multi-step plan execution
    'workspace_fsd_roadmap_tick',
    // Deep debug: GDB sessions on remote hosts via SSH can disrupt live processes
    'workspace_dev_gdb_session',
]);

export const MEDIUM_RISK_ACTIONS = new Set([
    'update_status',
    'create_comment',
    'create_pr_comment',
    'create_pr',
    'send_message',
    // Local workspace: executing code or committing changes is medium-risk
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'run_build',
    'run_tests',
    'git_commit',
    'autonomous_loop',
    // Generating PR content is medium-risk (no remote side-effects)
    'create_pr_from_workspace',
    // Persisting memory notes is medium-risk (mutates workspace state)
    'workspace_memory_write',
    // Tier 2 features — mutate workspace state
    'git_stash',
    'apply_patch',
    'file_move',
    'file_delete',
    'run_linter',
    'workspace_install_deps',
    'workspace_checkpoint',
    // Tier 3: IDE refactoring operations (modify code)
    'workspace_rename_symbol',
    'workspace_extract_function',
    'workspace_analyze_imports',
    'workspace_security_scan',
    // Tier 4: Multi-file coordination (modify multiple files)
    'workspace_bulk_refactor',
    'workspace_atomic_edit_set',
    'workspace_generate_from_template',
    'workspace_migration_helper',
    // Tier 5: Code review and profiling (might affect code state)
    'workspace_debug_breakpoint',
    'workspace_profiler_run',
    // Tier 7: Governance operations (modify state)
    'workspace_rollback_to_checkpoint',
    // Tier 8: Code generation and formatting (modify files)
    'workspace_generate_test',
    'workspace_format_code',
    'workspace_version_bump',
    'workspace_changelog_generate',
    // Tier 9: Pilot roadmap productivity actions
    'workspace_create_pr',
    'workspace_run_ci_checks',
    'workspace_fix_test_failures',
    'workspace_pr_review_poll',
    'workspace_release_notes_generate',
    'workspace_incident_patch_pack',
    'workspace_memory_profile',
    'workspace_autonomous_plan_execute',
    // Tier 10: Connector hardening, code intelligence, observability (mutating subset)
    'workspace_pr_auto_assign',
    'workspace_ci_watch',
    'workspace_add_docstring',
    'workspace_diff_preview',
    'workspace_audit_export',
    // Tier 12: GitHub intelligence (read, but sends external request) and Slack notify
    'workspace_github_pr_status',
    'workspace_github_issue_triage',
    'workspace_slack_notify',
    // MCP tool invocation — external side-effects possible, content unknown
    'mcp_tool_call',
]);

// ---------------------------------------------------------------------------
// Pure classification functions
// ---------------------------------------------------------------------------

/** Clamps a floating-point score to [0, 1] with 2 decimal places. */
export function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return Number(value.toFixed(2));
}

/** Extracts a normalised action type string from an arbitrary task payload. */
export function normalizeActionType(payload: Record<string, unknown>): string {
    const fromActionType = payload['action_type'];
    if (typeof fromActionType === 'string' && fromActionType.trim()) {
        return fromActionType.trim().toLowerCase();
    }
    const fromIntent = payload['intent'];
    if (typeof fromIntent === 'string' && fromIntent.trim()) {
        return fromIntent.trim().toLowerCase().replace(/\s+/g, '_');
    }
    return 'read_task';
}

/** Heuristic confidence score for a task payload. */
export function scoreConfidence(payload: Record<string, unknown>): number {
    let score = 0.92;
    if (typeof payload['summary'] !== 'string' || payload['summary'].trim().length < 8) score -= 0.18;
    if (typeof payload['target'] !== 'string' || !payload['target'].trim()) score -= 0.1;
    if (payload['complexity'] === 'high') score -= 0.16;
    else if (payload['complexity'] === 'medium') score -= 0.08;
    if (payload['ambiguous']) score -= 0.2;
    return clamp01(score);
}

/** Maps an action type + confidence to a risk level with a human-readable reason. */
export function classifyRisk(
    actionType: string,
    confidence: number,
    payload: Record<string, unknown>,
): { riskLevel: RiskLevel; reason: string } {
    if (HIGH_RISK_ACTIONS.has(actionType)) {
        return { riskLevel: 'high', reason: `Action '${actionType}' is high-risk by policy.` };
    }
    if (MEDIUM_RISK_ACTIONS.has(actionType)) {
        return { riskLevel: 'medium', reason: `Action '${actionType}' is medium-risk by policy.` };
    }
    if (payload['risk_hint'] === 'high') return { riskLevel: 'high', reason: 'Task payload includes risk_hint=high.' };
    if (payload['risk_hint'] === 'medium') return { riskLevel: 'medium', reason: 'Task payload includes risk_hint=medium.' };
    if (payload['risk_hint'] === 'low') return { riskLevel: 'low', reason: 'Task payload explicitly overrides risk to low.' };
    if (confidence < 0.6) return { riskLevel: 'medium', reason: 'Low confidence requires human review.' };
    return { riskLevel: 'low', reason: 'Read/update safe action with sufficient confidence.' };
}

/** Builds a full ActionDecision from a task envelope using heuristic rules only. */
export function buildDecision(task: TaskEnvelope): ActionDecision {
    const actionType = normalizeActionType(task.payload);
    const confidence = scoreConfidence(task.payload);
    const classification = classifyRisk(actionType, confidence, task.payload);
    return {
        actionType,
        confidence,
        riskLevel: classification.riskLevel,
        route: classification.riskLevel === 'low' ? 'execute' : 'approval',
        reason: classification.reason,
    };
}
