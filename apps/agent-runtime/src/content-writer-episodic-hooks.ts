// ============================================================================
// CONTENT WRITER EPISODIC HOOKS
// Sprint 17 — Content Writer Role
//
// Provides content-writer-specific pattern keys and summaries for episodic
// memory writes. The generic runtime write captures result.decision.actionType
// as the pattern, which is too coarse for a content writer — we want to
// remember things like "blog draft generated for SaaS audience" or
// "fact check flagged 2 unverified claims".
//
// buildContentWriterEpisodicPattern → derives a domain-specific pattern key
// buildContentWriterEpisodicSummary → richer content-context summary
//
// Both are pure functions; no side-effects, easy to unit-test.
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a content-writer-specific episodic pattern key.
 *
 * Pattern keys used as ON CONFLICT keys in AgentLongTermMemory:
 *   "cw:brief:parsed"
 *   "cw:draft:blog:success"
 *   "cw:draft:email:success"
 *   "cw:draft:social:success"
 *   "cw:draft:announcement:success"
 *   "cw:draft:fail"
 *   "cw:fact_check:clean"
 *   "cw:fact_check:flagged"
 *   "cw:editorial:routed"
 */
export function buildContentWriterEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Brief parsing
    if (at === 'workspace_cw_parse_brief' || at === 'parseContentBrief') {
        return 'cw:brief:parsed';
    }

    // Draft generation — derive format from action type or payload
    if (at === 'workspace_cw_draft_blog' || at === 'buildContentDraft:blog') {
        return oc === 'success' ? 'cw:draft:blog:success' : 'cw:draft:fail';
    }
    if (at === 'workspace_cw_draft_email' || at === 'buildContentDraft:email') {
        return oc === 'success' ? 'cw:draft:email:success' : 'cw:draft:fail';
    }
    if (at === 'workspace_cw_draft_social' || at === 'buildContentDraft:social') {
        return oc === 'success' ? 'cw:draft:social:success' : 'cw:draft:fail';
    }
    if (at === 'workspace_cw_draft_announcement' || at === 'buildContentDraft:announcement') {
        return oc === 'success' ? 'cw:draft:announcement:success' : 'cw:draft:fail';
    }

    // Fact check
    if (at === 'workspace_cw_fact_check' || at === 'checkFactualClaims') {
        const flagged =
            typeof result.executionPayload['flaggedCount'] === 'number' &&
            result.executionPayload['flaggedCount'] > 0;
        return flagged ? 'cw:fact_check:flagged' : 'cw:fact_check:clean';
    }

    // Editorial routing
    if (at === 'workspace_cw_route_editorial' || at === 'routeToEditor') {
        return 'cw:editorial:routed';
    }

    // PR creation (routing draft for review)
    if (at === 'create_pr' || at === 'workspace_create_pr') {
        return `cw:pr:${oc}`;
    }

    // Standup
    if (at === 'workspace_cw_standup_report' || at === 'buildContentWriterStandupSummary') {
        return `cw:standup:${oc}`;
    }

    // Fallback
    return `cw:action:${oc}`;
}

/**
 * Builds a richer episodic summary for the content writer role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildContentWriterEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildContentWriterEpisodicPattern(task, result);
    const at = result.decision.actionType;

    const title =
        typeof task.payload['title'] === 'string' ? task.payload['title'] : '';
    const description =
        typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel = title || description || at;

    if (pattern === 'cw:brief:parsed') {
        return `Content brief parsed: ${taskLabel}`;
    }
    if (pattern.startsWith('cw:draft:') && pattern.endsWith(':success')) {
        const format = pattern.replace('cw:draft:', '').replace(':success', '');
        return `${format} draft generated successfully: ${taskLabel}`;
    }
    if (pattern === 'cw:draft:fail') {
        return `Content draft generation failed: ${taskLabel}`;
    }
    if (pattern === 'cw:fact_check:clean') {
        return `Fact check passed — no unverified claims: ${taskLabel}`;
    }
    if (pattern === 'cw:fact_check:flagged') {
        const count = typeof result.executionPayload['flaggedCount'] === 'number'
            ? result.executionPayload['flaggedCount']
            : '?';
        return `Fact check flagged ${count} unverified claim(s): ${taskLabel}`;
    }
    if (pattern === 'cw:editorial:routed') {
        return `Draft routed to editor: ${taskLabel}`;
    }
    if (pattern.startsWith('cw:pr:')) {
        return `Draft PR ${pattern.endsWith(':success') ? 'opened' : 'failed'}: ${taskLabel}`;
    }
    if (pattern.startsWith('cw:standup:')) {
        return `Content writer standup report generated: ${taskLabel}`;
    }

    return `Content writer task completed (${at}): ${taskLabel}`;
}
