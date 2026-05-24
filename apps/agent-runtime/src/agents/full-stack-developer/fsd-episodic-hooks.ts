// ============================================================================
// FULL-STACK DEVELOPER EPISODIC HOOKS
// Sprint 16 — Full-Stack Developer Role
//
// Provides fsd-specific pattern keys and summaries for episodic memory writes.
// The generic runtime write captures result.decision.actionType as the pattern,
// which is too coarse — we want keys like:
//   "fsd:ui_component:success"
//   "fsd:design_handoff:figma_error"
//   "fsd:fullstack_feature:success"
//   "fsd:accessibility_audit:violations"
//
// buildFsdEpisodicPattern  → derives a domain-specific key
// buildFsdEpisodicSummary  → richer fsd-context summary
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
 * Derives a full-stack-developer-specific episodic pattern key.
 *
 * Examples:
 *   "fsd:ui_component:success"
 *   "fsd:design_handoff:figma_error"
 *   "fsd:accessibility_audit:violations"
 *   "fsd:fullstack_feature:success"
 *   "fsd:standup:success"
 */
export function buildFsdEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // ── UI / Design ──────────────────────────────────────────────────────────
    if (at === 'workspace_fsd_ui_component')     return `fsd:ui_component:${oc}`;

    if (at === 'workspace_fsd_design_handoff') {
        const figmaError = result.executionPayload['figma_error'];
        return figmaError ? 'fsd:design_handoff:figma_error' : `fsd:design_handoff:${oc}`;
    }

    if (at === 'workspace_fsd_responsive_check') {
        const issueCount = numericPayload(result, 'issue_count');
        return issueCount > 0 ? 'fsd:responsive_check:issues' : `fsd:responsive_check:${oc}`;
    }

    if (at === 'workspace_fsd_accessibility_audit') {
        const violations = numericPayload(result, 'violation_count');
        return violations > 0 ? 'fsd:accessibility_audit:violations' : `fsd:accessibility_audit:${oc}`;
    }

    if (at === 'workspace_fsd_seo_audit') {
        const issues = numericPayload(result, 'issue_count');
        return issues > 0 ? 'fsd:seo_audit:issues' : `fsd:seo_audit:${oc}`;
    }

    if (at === 'workspace_fsd_perf_audit') {
        const regressions = numericPayload(result, 'regression_count');
        return regressions > 0 ? 'fsd:perf_audit:regression' : `fsd:perf_audit:${oc}`;
    }

    // ── Integration ──────────────────────────────────────────────────────────
    if (at === 'workspace_fsd_state_manage')     return `fsd:state_manage:${oc}`;
    if (at === 'workspace_fsd_api_integrate')    return `fsd:api_integrate:${oc}`;
    if (at === 'workspace_fsd_auth_implement')   return `fsd:auth_implement:${oc}`;
    if (at === 'workspace_fsd_realtime_setup')   return `fsd:realtime_setup:${oc}`;
    if (at === 'workspace_fsd_env_setup')        return `fsd:env_setup:${oc}`;

    // ── Full-stack flagship ──────────────────────────────────────────────────
    if (at === 'workspace_fsd_fullstack_feature') return `fsd:fullstack_feature:${oc}`;
    if (at === 'workspace_fsd_scaffold_project')  return `fsd:scaffold_project:${oc}`;

    if (at === 'workspace_fsd_deploy_preview') {
        const previewUrl = result.executionPayload['preview_url'];
        return previewUrl ? 'fsd:deploy_preview:success' : `fsd:deploy_preview:${oc}`;
    }

    if (at === 'workspace_fsd_standup_report')   return `fsd:standup:${oc}`;

    // ── Advanced capabilities (Sprint 16 Phase 4) ─────────────────────────────
    if (at === 'workspace_fsd_visual_review') {
        const criticalCount = numericPayload(result, 'critical_count');
        const issueCount    = numericPayload(result, 'issue_count');
        if (criticalCount > 0) return 'fsd:visual_review:critical';
        return issueCount > 0 ? 'fsd:visual_review:issues' : 'fsd:visual_review:success';
    }

    if (at === 'workspace_fsd_clarify_spec') {
        const ready    = result.executionPayload['is_ready_to_implement'];
        const gapCount = numericPayload(result, 'gap_count');
        if (ready === true) return 'fsd:clarify_spec:ready';
        return gapCount > 0 ? 'fsd:clarify_spec:blocking_gaps' : `fsd:clarify_spec:${oc}`;
    }

    if (at === 'workspace_fsd_security_deep_scan') {
        const criticalCount = numericPayload(result, 'critical_count');
        const findingCount  = numericPayload(result, 'finding_count');
        if (criticalCount > 0) return 'fsd:security_deep_scan:critical';
        return findingCount > 0 ? 'fsd:security_deep_scan:findings' : 'fsd:security_deep_scan:clean';
    }

    if (at === 'workspace_fsd_arch_review')      return `fsd:arch_review:${oc}`;

    if (at === 'workspace_fsd_browser_debug') {
        const errorCount = numericPayload(result, 'error_count');
        return errorCount > 0 ? 'fsd:browser_debug:errors' : `fsd:browser_debug:${oc}`;
    }

    if (at === 'workspace_fsd_perf_profile') {
        const score = numericPayload(result, 'score');
        if (score === 0)   return 'fsd:perf_profile:failed';
        if (score < 50)    return 'fsd:perf_profile:hotspot';
        return `fsd:perf_profile:${oc}`;
    }

    // ── Cross-team negotiation (Sprint 16 Phase 6) ─────────────────────────
    if (at === 'workspace_fsd_negotiate') {
        if (oc === 'fail') return 'fsd:negotiate:fail';
        // The action records "pending_human_decision" — outcome is decided later
        // via the approval record, but we track submission as the episodic event
        return 'fsd:negotiate:submitted';
    }

    // Fallback — still namespaced under "fsd:" so it is easy to query
    return `fsd:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the full-stack developer role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildFsdEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildFsdEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title       = typeof task.payload['title']       === 'string' ? task.payload['title']       : '';
    const description = typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel   = (title || description || at).slice(0, 120);

    // UI component
    if (pattern === 'fsd:ui_component:success') {
        const framework = result.executionPayload['framework'] ?? 'unknown';
        return `UI component generated (${framework}): ${taskLabel}`;
    }
    if (pattern === 'fsd:ui_component:fail')
        return `UI component generation failed: ${taskLabel}`;

    // Design handoff
    if (pattern === 'fsd:design_handoff:figma_error')
        return `Design handoff failed — Figma error: ${taskLabel}`;
    if (pattern.startsWith('fsd:design_handoff'))
        return `Design handoff ${oc}: ${taskLabel}`;

    // Responsive
    if (pattern === 'fsd:responsive_check:issues') {
        const count = result.executionPayload['issue_count'] ?? '?';
        return `Responsive audit: ${count} issue(s) found: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:responsive_check'))
        return `Responsive check ${oc}: ${taskLabel}`;

    // Accessibility
    if (pattern === 'fsd:accessibility_audit:violations') {
        const count = result.executionPayload['violation_count'] ?? '?';
        return `Accessibility audit: ${count} violation(s): ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:accessibility_audit'))
        return `Accessibility audit ${oc}: ${taskLabel}`;

    // SEO
    if (pattern === 'fsd:seo_audit:issues') {
        const count = result.executionPayload['issue_count'] ?? '?';
        return `SEO audit: ${count} issue(s) found: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:seo_audit'))
        return `SEO audit ${oc}: ${taskLabel}`;

    // Performance audit
    if (pattern === 'fsd:perf_audit:regression') {
        const count = result.executionPayload['regression_count'] ?? '?';
        return `Frontend perf audit: ${count} regression(s): ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:perf_audit'))
        return `Frontend perf audit ${oc}: ${taskLabel}`;

    // State management
    if (pattern.startsWith('fsd:state_manage')) {
        const lib = result.executionPayload['library'] ?? 'unknown';
        return `State management scaffolded (${lib}) ${oc}: ${taskLabel}`;
    }

    // API integration
    if (pattern.startsWith('fsd:api_integrate'))
        return `API integration ${oc}: ${taskLabel}`;

    // Auth
    if (pattern.startsWith('fsd:auth_implement')) {
        const strategy = result.executionPayload['strategy'] ?? 'unknown';
        return `Auth (${strategy}) implemented ${oc}: ${taskLabel}`;
    }

    // Realtime
    if (pattern.startsWith('fsd:realtime_setup')) {
        const strategy = result.executionPayload['strategy'] ?? 'unknown';
        return `Realtime (${strategy}) setup ${oc}: ${taskLabel}`;
    }

    // Env setup
    if (pattern.startsWith('fsd:env_setup'))
        return `Environment files configured ${oc}: ${taskLabel}`;

    // Full-stack feature (flagship)
    if (pattern === 'fsd:fullstack_feature:success')
        return `Full-stack feature delivered: ${taskLabel}`;
    if (pattern === 'fsd:fullstack_feature:fail')
        return `Full-stack feature delivery failed: ${taskLabel}`;

    // Scaffold project
    if (pattern.startsWith('fsd:scaffold_project'))
        return `Project scaffolded ${oc}: ${taskLabel}`;

    // Deploy preview
    if (pattern === 'fsd:deploy_preview:success') {
        const url = typeof result.executionPayload['preview_url'] === 'string'
            ? ` → ${result.executionPayload['preview_url']}`
            : '';
        return `Deploy preview ready${url}: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:deploy_preview'))
        return `Deploy preview ${oc}: ${taskLabel}`;

    // Standup
    if (pattern.startsWith('fsd:standup'))
        return `FSD standup generated (${oc}): ${taskLabel}`;

    // ── Advanced capabilities (Sprint 16 Phase 4) ─────────────────────────────

    // Visual review
    if (pattern === 'fsd:visual_review:critical') {
        const count = result.executionPayload['critical_count'] ?? '?';
        return `Visual review: ${count} critical issue(s) found: ${taskLabel}`;
    }
    if (pattern === 'fsd:visual_review:issues') {
        const count = result.executionPayload['issue_count'] ?? '?';
        return `Visual review: ${count} issue(s) found: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:visual_review'))
        return `Visual review ${oc}: no issues found: ${taskLabel}`;

    // Spec clarification
    if (pattern === 'fsd:clarify_spec:ready')
        return `Spec ready to implement (${result.executionPayload['score'] ?? '?'}/100): ${taskLabel}`;
    if (pattern === 'fsd:clarify_spec:blocking_gaps') {
        const qCount = Array.isArray(result.executionPayload['questions'])
            ? (result.executionPayload['questions'] as unknown[]).length
            : '?';
        return `Spec needs clarification: ${qCount} question(s) generated: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:clarify_spec'))
        return `Spec analysis ${oc}: ${taskLabel}`;

    // Security deep scan
    if (pattern === 'fsd:security_deep_scan:critical') {
        const count = result.executionPayload['critical_count'] ?? '?';
        return `Security scan: ${count} critical vulnerability(ies) found: ${taskLabel}`;
    }
    if (pattern === 'fsd:security_deep_scan:findings') {
        const count = result.executionPayload['finding_count'] ?? '?';
        return `Security scan: ${count} finding(s), score ${result.executionPayload['score'] ?? '?'}/100: ${taskLabel}`;
    }
    if (pattern === 'fsd:security_deep_scan:clean')
        return `Security scan: clean — no vulnerabilities found: ${taskLabel}`;
    if (pattern.startsWith('fsd:security_deep_scan'))
        return `Security deep scan ${oc}: ${taskLabel}`;

    // Architecture review
    if (pattern === 'fsd:arch_review:success') {
        const adrTitle = typeof result.executionPayload['adr'] === 'object' && result.executionPayload['adr'] !== null
            ? ((result.executionPayload['adr'] as Record<string, unknown>)['title'] as string | undefined) ?? ''
            : '';
        return adrTitle
            ? `ADR generated: "${adrTitle}": ${taskLabel}`
            : `Architecture review complete: ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:arch_review'))
        return `Architecture review ${oc}: ${taskLabel}`;

    // Browser debug
    if (pattern === 'fsd:browser_debug:errors') {
        const eCount = result.executionPayload['error_count'] ?? '?';
        const nCount = result.executionPayload['net_failure_count'] ?? 0;
        return `Browser debug: ${eCount} error(s), ${nCount} network failure(s) at ${taskLabel}`;
    }
    if (pattern === 'fsd:browser_debug:success')
        return `Browser debug: no runtime errors detected at ${taskLabel}`;
    if (pattern.startsWith('fsd:browser_debug'))
        return `Browser debug ${oc}: ${taskLabel}`;

    // CPU perf profile
    if (pattern === 'fsd:perf_profile:failed')
        return `CPU profile failed (Playwright unavailable): ${taskLabel}`;
    if (pattern === 'fsd:perf_profile:hotspot') {
        const score  = result.executionPayload['score'] ?? '?';
        const topFns = Array.isArray(result.executionPayload['hot_functions'])
            ? (result.executionPayload['hot_functions'] as Array<{ functionName: string; selfPercent: number }>)
            : [];
        const topFn  = topFns[0];
        return topFn
            ? `CPU hotspot detected (score ${score}/100): "${topFn.functionName}" at ${topFn.selfPercent}% — ${taskLabel}`
            : `CPU hotspot detected (score ${score}/100): ${taskLabel}`;
    }
    if (pattern.startsWith('fsd:perf_profile'))
        return `CPU profile ${oc} (score ${result.executionPayload['score'] ?? '?'}/100): ${taskLabel}`;

    // ── Cross-team negotiation (Sprint 16 Phase 6) ─────────────────────────

    if (pattern === 'fsd:negotiate:fail')
        return `Negotiation request failed to submit: ${taskLabel}`;

    if (pattern === 'fsd:negotiate:submitted') {
        const type      = result.executionPayload['negotiation_type'] ?? 'unknown';
        const urgency   = result.executionPayload['urgency'] ?? 'medium';
        const termCount = result.executionPayload['term_count'] ?? 0;
        return `Negotiation request submitted (${type as string}, ${urgency as string} urgency, ${termCount as number} option(s)): ${taskLabel}`;
    }

    // Fallback
    return `Full-stack action "${at}" completed with status "${oc}": ${taskLabel}`;
}
