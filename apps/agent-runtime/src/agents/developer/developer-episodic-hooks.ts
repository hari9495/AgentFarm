// ============================================================================
// DEVELOPER EPISODIC HOOKS
// Sprint 16 — Developer Role
//
// Provides developer-specific pattern keys and summaries for episodic memory
// writes. The generic runtime write captures result.decision.actionType as the
// pattern, which is too coarse for a developer agent — we want to remember
// things like "dev:bug_fix:success" or "dev:code_review:changes_requested".
//
// buildDeveloperEpisodicPattern  → derives a domain-specific key
// buildDeveloperEpisodicSummary  → richer developer-context summary
//
// Both are pure functions; no side-effects, easy to unit-test.
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
 * Derives a developer-specific episodic pattern key.
 *
 * Examples:
 *   "dev:bug_fix:success"
 *   "dev:feature_impl:fail"
 *   "dev:code_review:changes_requested"
 *   "dev:security_audit:findings"
 *   "dev:pr:opened"
 *   "dev:standup:success"
 */
export function buildDeveloperEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Developer domain actions
    if (at === 'workspace_dev_implement_feature')  return `dev:feature_impl:${oc}`;
    if (at === 'workspace_dev_fix_bug')            return `dev:bug_fix:${oc}`;

    if (at === 'workspace_dev_code_review') {
        const hasChanges =
            numericPayload(result, 'must_fix_count') > 0 ||
            numericPayload(result, 'suggestion_count') > 0;
        return hasChanges ? 'dev:code_review:changes_requested' : `dev:code_review:${oc}`;
    }

    if (at === 'workspace_dev_refactor')        return `dev:refactor:${oc}`;
    if (at === 'workspace_dev_write_tests')     return `dev:test_authoring:${oc}`;
    if (at === 'workspace_dev_debug_session')   return `dev:debug:${oc}`;
    if (at === 'workspace_dev_create_pr')       return `dev:pr:opened`;
    if (at === 'workspace_dev_handle_issue')    return `dev:issue_resolved:${oc}`;
    if (at === 'workspace_dev_branch_manage')   return `dev:branch:${oc}`;
    if (at === 'workspace_dev_commit')          return `dev:commit:${oc}`;

    if (at === 'workspace_dev_security_audit') {
        const findingCount = numericPayload(result, 'finding_count');
        return findingCount > 0 ? 'dev:security_audit:findings' : `dev:security_audit:${oc}`;
    }

    if (at === 'workspace_dev_dependency_audit') {
        const outdated = numericPayload(result, 'outdated_count');
        const vulnerable = numericPayload(result, 'vulnerable_count');
        if (vulnerable > 0) return 'dev:dependency_audit:vulnerable';
        if (outdated > 0)   return 'dev:dependency_audit:outdated';
        return `dev:dependency_audit:${oc}`;
    }

    if (at === 'workspace_dev_performance_audit') {
        const regressions = numericPayload(result, 'regression_count');
        return regressions > 0 ? 'dev:perf_audit:regression' : `dev:perf_audit:${oc}`;
    }

    if (at === 'workspace_dev_code_quality') {
        const violations = numericPayload(result, 'violation_count');
        return violations > 0 ? 'dev:code_quality:violations' : `dev:code_quality:${oc}`;
    }

    if (at === 'workspace_dev_api_design')      return `dev:api_design:${oc}`;
    if (at === 'workspace_dev_db_migration')    return `dev:db_migration:${oc}`;
    if (at === 'workspace_dev_onboard_codebase') return `dev:onboarding:${oc}`;
    if (at === 'workspace_dev_standup_report')  return `dev:standup:${oc}`;
    if (at === 'workspace_dev_incident_response') return `dev:incident:${oc}`;
    if (at === 'workspace_dev_tech_spec')       return `dev:tech_spec:${oc}`;

    // Generic workspace actions used by developer
    if (at === 'workspace_ai_code_review')      return `dev:code_review:${oc}`;
    if (at === 'workspace_github_issue_fix')    return `dev:issue_resolved:${oc}`;
    if (at === 'workspace_create_pr')           return 'dev:pr:opened';
    if (at === 'workspace_refactor_plan')       return `dev:refactor_plan:${oc}`;
    if (at === 'workspace_generate_test')       return `dev:test_authoring:${oc}`;
    if (at === 'workspace_fix_test_failures')   return `dev:test_fix:${oc}`;
    if (at === 'workspace_sast_scan' ||
        at === 'workspace_security_scan')       return `dev:security_scan:${oc}`;
    if (at === 'workspace_secret_scan')         return `dev:secret_scan:${oc}`;
    if (at === 'workspace_cve_check')           return `dev:cve_check:${oc}`;
    if (at === 'workspace_dependency_upgrade_plan') return `dev:dep_upgrade:${oc}`;
    if (at === 'workspace_autonomous_plan_execute') return `dev:autonomous_plan:${oc}`;

    // Fallback — still namespaced under "dev:" so it's easy to query
    return `dev:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the developer role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildDeveloperEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildDeveloperEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title       = typeof task.payload['title']       === 'string' ? task.payload['title']       : '';
    const description = typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel   = (title || description || at).slice(0, 120);

    // Feature implementation
    if (pattern === 'dev:feature_impl:success')
        return `Feature implemented successfully: ${taskLabel}`;
    if (pattern === 'dev:feature_impl:fail')
        return `Feature implementation failed: ${taskLabel}`;

    // Bug fix
    if (pattern === 'dev:bug_fix:success')
        return `Bug fixed: ${taskLabel}`;
    if (pattern === 'dev:bug_fix:fail')
        return `Bug fix failed: ${taskLabel}`;

    // Code review
    if (pattern === 'dev:code_review:changes_requested') {
        const must    = result.executionPayload['must_fix_count']   ?? '?';
        const suggest = result.executionPayload['suggestion_count'] ?? '?';
        return `Code review complete — ${must} must-fix, ${suggest} suggestion(s): ${taskLabel}`;
    }
    if (pattern.startsWith('dev:code_review'))
        return `Code review ${oc}: ${taskLabel}`;

    // PR
    if (pattern === 'dev:pr:opened') {
        const prUrl = typeof result.executionPayload['pr_url'] === 'string'
            ? ` → ${result.executionPayload['pr_url']}`
            : '';
        return `PR opened${prUrl}: ${taskLabel}`;
    }

    // Issue resolved
    if (pattern.startsWith('dev:issue_resolved')) {
        const issueNum = result.executionPayload['issue_number'];
        const numStr = issueNum ? ` #${issueNum}` : '';
        return `Issue${numStr} resolved (${oc}): ${taskLabel}`;
    }

    // Security audit
    if (pattern === 'dev:security_audit:findings') {
        const count = result.executionPayload['finding_count'] ?? '?';
        return `Security audit found ${count} issue(s): ${taskLabel}`;
    }
    if (pattern.startsWith('dev:security_audit'))
        return `Security audit ${oc}: ${taskLabel}`;

    // Dependency audit
    if (pattern === 'dev:dependency_audit:vulnerable') {
        const vuln = result.executionPayload['vulnerable_count'] ?? '?';
        return `Dependency audit: ${vuln} vulnerable package(s): ${taskLabel}`;
    }
    if (pattern === 'dev:dependency_audit:outdated') {
        const out = result.executionPayload['outdated_count'] ?? '?';
        return `Dependency audit: ${out} outdated package(s): ${taskLabel}`;
    }
    if (pattern.startsWith('dev:dependency_audit'))
        return `Dependency audit ${oc}: ${taskLabel}`;

    // Performance audit
    if (pattern === 'dev:perf_audit:regression') {
        const reg = result.executionPayload['regression_count'] ?? '?';
        return `Performance audit: ${reg} regression(s) detected: ${taskLabel}`;
    }
    if (pattern.startsWith('dev:perf_audit'))
        return `Performance audit ${oc}: ${taskLabel}`;

    // Code quality
    if (pattern === 'dev:code_quality:violations') {
        const v = result.executionPayload['violation_count'] ?? '?';
        return `Code quality: ${v} violation(s) found: ${taskLabel}`;
    }
    if (pattern.startsWith('dev:code_quality'))
        return `Code quality check ${oc}: ${taskLabel}`;

    // DB migration
    if (pattern.startsWith('dev:db_migration'))
        return `DB migration ${oc}: ${taskLabel}`;

    // API design
    if (pattern.startsWith('dev:api_design'))
        return `API design ${oc}: ${taskLabel}`;

    // Standup
    if (pattern.startsWith('dev:standup'))
        return `Developer standup generated (${oc}): ${taskLabel}`;

    // Incident
    if (pattern.startsWith('dev:incident'))
        return `Incident response ${oc}: ${taskLabel}`;

    // Tech spec
    if (pattern.startsWith('dev:tech_spec'))
        return `Tech spec generated: ${taskLabel}`;

    // Onboarding
    if (pattern.startsWith('dev:onboarding'))
        return `Codebase onboarding ${oc}: ${taskLabel}`;

    // Refactor
    if (pattern.startsWith('dev:refactor'))
        return `Refactor ${oc}: ${taskLabel}`;

    // Test authoring
    if (pattern.startsWith('dev:test_authoring'))
        return `Tests written ${oc}: ${taskLabel}`;

    // Debug
    if (pattern.startsWith('dev:debug'))
        return `Debug session ${oc}: ${taskLabel}`;

    // Commit
    if (pattern.startsWith('dev:commit'))
        return `Committed changes ${oc}: ${taskLabel}`;

    // Fallback
    return `Developer action "${at}" completed with status "${oc}": ${taskLabel}`;
}
