// ============================================================================
// PROJECT MANAGER / SCRUM MASTER — EPISODIC HOOKS
//
// Provides PM/SM-specific pattern keys and summaries for episodic memory
// writes. The generic runtime write captures result.decision.actionType as the
// pattern, which is too coarse — we want to remember things like
// "pm:sprint_plan:completed" or "pm:blocker:escalated".
//
// buildPmEpisodicPattern  → derives a domain-specific key
// buildPmEpisodicSummary  → richer PM-context summary
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

function strPayload(result: ProcessedTaskResult, key: string): string {
    const v = result.executionPayload[key];
    return typeof v === 'string' ? v : '';
}

function numericPayload(result: ProcessedTaskResult, key: string): number {
    const v = result.executionPayload[key];
    return typeof v === 'number' ? v : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a PM/SM-specific episodic pattern key.
 *
 * Examples:
 *   "pm:sprint_plan:completed"
 *   "pm:blocker:escalated"
 *   "pm:velocity:trend_declining"
 *   "pm:retro:action_items_captured"
 *   "pm:risk:new_high_risk"
 *   "pm:status_report:success"
 */
export function buildPmEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // --- PM (Project Manager) domain ---
    if (at === 'workspace_pm_project_charter')  return `pm:charter:${oc}`;
    if (at === 'workspace_pm_budget_forecast')  return `pm:budget:${oc}`;
    if (at === 'workspace_pm_change_request')   return `pm:change_request:${oc}`;
    if (at === 'workspace_pm_milestone_plan')   return `pm:milestone:${oc}`;
    if (at === 'workspace_pm_dependency_map')   return `pm:dependency_map:${oc}`;

    if (at === 'workspace_pm_status_report') {
        const ragStatus = strPayload(result, 'rag_status');
        if (ragStatus === 'red')    return 'pm:status_report:red';
        if (ragStatus === 'amber')  return 'pm:status_report:amber';
        return `pm:status_report:${oc}`;
    }

    if (at === 'workspace_pm_risk_register') {
        const highRiskCount = numericPayload(result, 'high_risk_count');
        return highRiskCount > 0 ? 'pm:risk:new_high_risk' : `pm:risk_register:${oc}`;
    }

    // --- SM (Scrum Master) domain ---
    if (at === 'workspace_pm_sprint_plan') {
        const approvalStatus = strPayload(result, 'approvalStatus');
        return approvalStatus === 'auto_approved'
            ? 'pm:sprint_plan:completed'
            : `pm:sprint_plan:${oc}`;
    }

    if (at === 'workspace_pm_backlog_groom') return `pm:backlog_groom:${oc}`;

    if (at === 'workspace_pm_velocity_report') {
        const trend = strPayload(result, 'velocity_trend');
        if (trend === 'declining')  return 'pm:velocity:trend_declining';
        if (trend === 'improving')  return 'pm:velocity:trend_improving';
        return `pm:velocity_report:${oc}`;
    }

    if (at === 'workspace_pm_standup_summary') return `pm:standup:${oc}`;

    if (at === 'workspace_pm_retrospective') {
        const actionCount = numericPayload(result, 'action_item_count');
        return actionCount > 0
            ? 'pm:retro:action_items_captured'
            : `pm:retro:${oc}`;
    }

    if (at === 'workspace_pm_impediment_log') {
        const escalated = result.executionPayload['escalated'] === true;
        return escalated ? 'pm:blocker:escalated' : `pm:impediment:${oc}`;
    }

    if (at === 'workspace_pm_ceremony_agenda') return `pm:ceremony_agenda:${oc}`;

    // --- Proactive ---
    if (at === 'workspace_pm_proactive_blocker_scan') {
        const blockerCount = numericPayload(result, 'blocker_count');
        return blockerCount > 0 ? 'pm:proactive:blockers_found' : 'pm:proactive:blocker_scan_clear';
    }

    if (at === 'workspace_pm_proactive_scope_drift') {
        const driftDetected = result.executionPayload['drift_detected'] === true;
        return driftDetected ? 'pm:proactive:scope_drift_detected' : 'pm:proactive:scope_aligned';
    }

    return `pm:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the PM/SM role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildPmEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildPmEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title =
        typeof task.payload['title'] === 'string' ? task.payload['title'] :
        typeof task.payload['project_name'] === 'string' ? task.payload['project_name'] :
        typeof task.payload['sprint_name'] === 'string' ? task.payload['sprint_name'] :
        typeof task.payload['description'] === 'string' ? task.payload['description'] : at;
    const taskLabel = title.slice(0, 120);

    // Charter
    if (pattern === 'pm:charter:success')
        return `Project charter created: ${taskLabel}`;
    if (pattern === 'pm:charter:fail')
        return `Project charter creation failed: ${taskLabel}`;

    // Budget
    if (pattern.startsWith('pm:budget'))
        return `Budget forecast ${oc}: ${taskLabel}`;

    // Change request
    if (pattern.startsWith('pm:change_request'))
        return `Change request ${oc}: ${taskLabel}`;

    // Milestone
    if (pattern.startsWith('pm:milestone'))
        return `Milestone plan ${oc}: ${taskLabel}`;

    // Status report
    if (pattern === 'pm:status_report:red')
        return `Status report RED — project at risk: ${taskLabel}`;
    if (pattern === 'pm:status_report:amber')
        return `Status report AMBER — caution required: ${taskLabel}`;
    if (pattern.startsWith('pm:status_report'))
        return `Status report ${oc}: ${taskLabel}`;

    // Risk
    if (pattern === 'pm:risk:new_high_risk') {
        const count = result.executionPayload['high_risk_count'] ?? '?';
        return `Risk register: ${count} high-risk item(s) identified: ${taskLabel}`;
    }
    if (pattern.startsWith('pm:risk_register'))
        return `Risk register updated ${oc}: ${taskLabel}`;

    // Sprint plan
    if (pattern === 'pm:sprint_plan:completed')
        return `Sprint plan committed: ${taskLabel}`;
    if (pattern.startsWith('pm:sprint_plan'))
        return `Sprint plan ${oc}: ${taskLabel}`;

    // Backlog
    if (pattern.startsWith('pm:backlog_groom'))
        return `Backlog groomed ${oc}: ${taskLabel}`;

    // Velocity
    if (pattern === 'pm:velocity:trend_declining')
        return `Velocity declining — team may need support: ${taskLabel}`;
    if (pattern === 'pm:velocity:trend_improving')
        return `Velocity improving — team on track: ${taskLabel}`;
    if (pattern.startsWith('pm:velocity'))
        return `Velocity report ${oc}: ${taskLabel}`;

    // Standup
    if (pattern.startsWith('pm:standup'))
        return `Standup summary ${oc}: ${taskLabel}`;

    // Retro
    if (pattern === 'pm:retro:action_items_captured') {
        const count = result.executionPayload['action_item_count'] ?? '?';
        return `Retrospective complete — ${count} action item(s) captured: ${taskLabel}`;
    }
    if (pattern.startsWith('pm:retro'))
        return `Retrospective ${oc}: ${taskLabel}`;

    // Blockers
    if (pattern === 'pm:blocker:escalated')
        return `Blocker escalated to stakeholders: ${taskLabel}`;
    if (pattern.startsWith('pm:impediment'))
        return `Impediment logged ${oc}: ${taskLabel}`;

    // Ceremony
    if (pattern.startsWith('pm:ceremony'))
        return `Ceremony agenda generated ${oc}: ${taskLabel}`;

    // Proactive
    if (pattern === 'pm:proactive:blockers_found') {
        const count = result.executionPayload['blocker_count'] ?? '?';
        return `Proactive scan: ${count} blocker(s) detected`;
    }
    if (pattern === 'pm:proactive:blocker_scan_clear')
        return 'Proactive blocker scan: no open blockers found';
    if (pattern === 'pm:proactive:scope_drift_detected')
        return `Scope drift detected vs. original charter: ${taskLabel}`;
    if (pattern === 'pm:proactive:scope_aligned')
        return 'Proactive scope check: delivery aligned with charter';

    // Fallback
    return `PM/SM action "${at}" completed with status "${oc}": ${taskLabel}`;
}
