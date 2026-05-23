// ============================================================================
// TECHNICAL WRITER EPISODIC HOOKS
// Sprint 16 — Technical Writer Role
//
// Provides technical-writer-specific pattern keys and summaries for episodic
// memory writes. The generic runtime write captures result.decision.actionType
// as the pattern, which is too coarse for a technical writer — we want to
// remember things like "API doc generated from OpenAPI spec" or
// "style guide check found 3 passive-voice violations".
//
// buildTechnicalWriterEpisodicPattern  → derives a domain-specific key
// buildTechnicalWriterEpisodicSummary  → richer writer-context summary
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
 * Derives a technical-writer-specific episodic pattern key.
 *
 * Examples:
 *   "tw:doc_update:success"
 *   "tw:doc_update:fail"
 *   "tw:api_doc:generated"
 *   "tw:release_notes:built"
 *   "tw:style_check:violations"
 *   "tw:style_check:clean"
 *   "tw:pr:opened"
 */
export function buildTechnicalWriterEpisodicPattern(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Doc diff / update actions
    if (at === 'workspace_tw_doc_diff' || at === 'buildDocUpdateFromDiff' || at === 'update_document') {
        return oc === 'success' ? 'tw:doc_update:success' : 'tw:doc_update:fail';
    }

    // API doc generation
    if (at === 'workspace_tw_api_doc_openapi' || at === 'generateApiDocFromOpenApi') {
        return 'tw:api_doc:generated';
    }
    if (at === 'workspace_tw_api_doc_code' || at === 'generateApiDocFromCode') {
        return 'tw:api_doc:generated';
    }

    // Release notes
    if (at === 'workspace_tw_release_notes' || at === 'buildReleaseNotes') {
        return 'tw:release_notes:built';
    }

    // Style guide check
    if (at === 'workspace_tw_style_check' || at === 'checkAgainstStyleGuide') {
        const hasViolations = result.status !== 'success' ||
            (typeof result.executionPayload['totalViolations'] === 'number' &&
                result.executionPayload['totalViolations'] > 0);
        return hasViolations ? 'tw:style_check:violations' : 'tw:style_check:clean';
    }

    // PR opened
    if (at === 'create_pr' || at === 'workspace_create_pr' || at === 'createPrFromWorkspace') {
        return 'tw:pr:opened';
    }

    // Standup report
    if (at === 'workspace_tw_standup_report' || at === 'buildTechnicalWriterStandupSummary') {
        return `tw:standup:${oc}`;
    }

    // SME interview
    if (at === 'workspace_tw_sme_interview') {
        const mode = typeof result.executionPayload['mode'] === 'string'
            ? result.executionPayload['mode']
            : 'plan';
        if (mode === 'synthesise') return `tw:sme_interview:brief:${oc}`;
        return `tw:sme_interview:plan:${oc}`;
    }

    // Sprint doc
    if (at === 'workspace_tw_sprint_doc') {
        const docType = typeof result.executionPayload['doc_type'] === 'string'
            ? result.executionPayload['doc_type']
            : 'unknown';
        return `tw:sprint_doc:${docType}:${oc}`;
    }

    // Content format actions
    if (at === 'workspace_tw_manual')      return `tw:manual:${oc}`;
    if (at === 'workspace_tw_faq')         return `tw:faq:${oc}`;
    if (at === 'workspace_tw_tutorial')    return `tw:tutorial:${oc}`;
    if (at === 'workspace_tw_onboarding')  return `tw:onboarding:${oc}`;
    if (at === 'workspace_tw_whitepaper')  return `tw:whitepaper:${oc}`;

    // Endpoint verification
    if (at === 'workspace_tw_audience_rewrite')  return `tw:audience_rewrite:${oc}`;
    if (at === 'workspace_tw_feedback_analysis') return `tw:feedback_analysis:${oc}`;
    if (at === 'workspace_tw_nav_audit')         return `tw:nav_audit:${oc}`;
    if (at === 'workspace_tw_localization')      return `tw:localization:${oc}`;
    if (at === 'workspace_tw_doc_audit')         return `tw:doc_audit:${oc}`;

    if (at === 'workspace_tw_endpoint_verify') {
        const failCount = typeof result.executionPayload['fail_count'] === 'number'
            ? result.executionPayload['fail_count']
            : 0;
        return failCount > 0 ? 'tw:endpoint_verify:partial' : `tw:endpoint_verify:${oc}`;
    }

    // Browser/UI discovery
    if (at === 'workspace_tw_product_crawl') {
        const pageCount = typeof result.executionPayload['pages_crawled'] === 'number'
            ? result.executionPayload['pages_crawled']
            : 0;
        return pageCount > 0 ? `tw:product_crawl:${oc}` : 'tw:product_crawl:fail';
    }
    if (at === 'workspace_tw_screenshot_doc') return `tw:screenshot_doc:${oc}`;
    if (at === 'workspace_tw_doc_gap_scan') {
        const pct = typeof result.executionPayload['coverage_percent'] === 'number'
            ? result.executionPayload['coverage_percent']
            : 0;
        if (pct >= 80) return 'tw:doc_gap_scan:high_coverage';
        if (pct >= 50) return 'tw:doc_gap_scan:medium_coverage';
        return 'tw:doc_gap_scan:low_coverage';
    }

    // Accuracy verification
    if (at === 'workspace_tw_verify_doc_steps') {
        const failCount  = typeof result.executionPayload['fail_count']  === 'number' ? result.executionPayload['fail_count']  : 0;
        const errorCount = typeof result.executionPayload['error_count'] === 'number' ? result.executionPayload['error_count'] : 0;
        if (oc !== 'success') return 'tw:verify_doc_steps:fail';
        if (failCount + errorCount === 0) return 'tw:verify_doc_steps:all_pass';
        if (failCount + errorCount > 3)   return 'tw:verify_doc_steps:many_failures';
        return 'tw:verify_doc_steps:some_failures';
    }

    // Human-parity actions
    if (at === 'workspace_tw_interact_product') return `tw:interact_product:${oc}`;
    if (at === 'workspace_tw_pr_review_respond') {
        const fixedCount = typeof result.executionPayload['fixed_count'] === 'number' ? result.executionPayload['fixed_count'] : 0;
        return fixedCount > 0 ? 'tw:pr_review_respond:fixes_applied' : `tw:pr_review_respond:${oc}`;
    }
    if (at === 'workspace_tw_doc_index') return `tw:doc_index:${oc}`;
    if (at === 'workspace_tw_roadmap_context') return `tw:roadmap_context:${oc}`;

    // Fallback
    return `tw:action:${oc}`;
}

/**
 * Builds a richer episodic summary for the technical writer role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildTechnicalWriterEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildTechnicalWriterEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title = typeof task.payload['title'] === 'string' ? task.payload['title'] : '';
    const description =
        typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel = title || description || at;

    if (pattern === 'tw:doc_update:success') {
        return `Documentation updated successfully: ${taskLabel}`;
    }
    if (pattern === 'tw:doc_update:fail') {
        return `Documentation update failed: ${taskLabel}`;
    }
    if (pattern === 'tw:api_doc:generated') {
        return `API documentation generated from ${at.includes('code') ? 'source code' : 'OpenAPI spec'}: ${taskLabel}`;
    }
    if (pattern === 'tw:release_notes:built') {
        return `Release notes built: ${taskLabel}`;
    }
    if (pattern === 'tw:style_check:violations') {
        return `Style guide check found violations: ${taskLabel}`;
    }
    if (pattern === 'tw:style_check:clean') {
        return `Style guide check passed: ${taskLabel}`;
    }
    if (pattern === 'tw:pr:opened') {
        return `Documentation PR opened: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:sme_interview:plan')) {
        return `SME interview plan generated (mode: ${result.executionPayload['mode'] ?? 'plan'}): ${taskLabel}`;
    }
    if (pattern.startsWith('tw:sme_interview:brief')) {
        const openQ = typeof result.executionPayload['open_questions'] === 'number'
            ? ` — ${result.executionPayload['open_questions']} open question(s)`
            : '';
        return `SME doc brief synthesised${openQ}: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:sprint_doc')) {
        const docType = typeof result.executionPayload['doc_type'] === 'string'
            ? result.executionPayload['doc_type']
            : 'unknown';
        return `Sprint ${docType} document built (sprint ${result.executionPayload['sprint_number'] ?? '?'}): ${taskLabel}`;
    }

    if (pattern === 'tw:manual:success')     return `User manual generated: ${taskLabel}`;
    if (pattern === 'tw:manual:fail')        return `User manual generation failed: ${taskLabel}`;
    if (pattern === 'tw:faq:success')        return `FAQ document generated: ${taskLabel}`;
    if (pattern === 'tw:faq:fail')           return `FAQ generation failed: ${taskLabel}`;
    if (pattern === 'tw:tutorial:success')   return `Tutorial generated: ${taskLabel}`;
    if (pattern === 'tw:tutorial:fail')      return `Tutorial generation failed: ${taskLabel}`;
    if (pattern === 'tw:onboarding:success') return `Onboarding guide generated: ${taskLabel}`;
    if (pattern === 'tw:onboarding:fail')    return `Onboarding guide generation failed: ${taskLabel}`;
    if (pattern === 'tw:whitepaper:success') return `White paper generated: ${taskLabel}`;
    if (pattern === 'tw:whitepaper:fail')    return `White paper generation failed: ${taskLabel}`;

    if (pattern.startsWith('tw:audience_rewrite')) {
        const mode = typeof result.executionPayload['mode'] === 'string' ? result.executionPayload['mode'] : 'analyze';
        const score = result.executionPayload['match_score'];
        const scoreStr = typeof score === 'number' ? ` (score: ${score}/100)` : '';
        return `Audience ${mode} complete${scoreStr}: ${taskLabel}`;
    }
    if (pattern.startsWith('tw:feedback_analysis')) {
        const gaps = result.executionPayload['top_gaps'];
        const gapCount = Array.isArray(gaps) ? gaps.length : '?';
        return `Feedback analysis complete — ${gapCount} top gap(s) identified: ${taskLabel}`;
    }
    if (pattern.startsWith('tw:nav_audit')) {
        const score = result.executionPayload['health_score'];
        const label = result.executionPayload['health_label'];
        return `Navigation audit complete — ${score}/100 (${label}): ${taskLabel}`;
    }
    if (pattern.startsWith('tw:localization')) {
        const urgent = result.executionPayload['urgent'];
        return `Localisation status checked — ${urgent} urgent item(s): ${taskLabel}`;
    }
    if (pattern.startsWith('tw:doc_audit')) {
        const score = result.executionPayload['overall_health_score'];
        const label = result.executionPayload['health_label'];
        return `Doc lifecycle audit complete — ${score}/100 (${label}): ${taskLabel}`;
    }

    if (pattern.startsWith('tw:endpoint_verify')) {
        const success = result.executionPayload['success_count'] ?? '?';
        const fail = result.executionPayload['fail_count'] ?? '?';
        return `Endpoint verification complete — ${success} reachable, ${fail} unreachable: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:product_crawl')) {
        const pages = result.executionPayload['pages_crawled'] ?? '?';
        const features = result.executionPayload['features_found'] ?? '?';
        return `Product crawl complete — ${pages} page(s) read, ${features} features found: ${taskLabel}`;
    }
    if (pattern.startsWith('tw:screenshot_doc')) {
        const title = result.executionPayload['title'] ?? taskLabel;
        const shot = result.executionPayload['screenshot_path'] ? ' (screenshot captured)' : '';
        return `UI page documented${shot}: ${title}`;
    }
    if (pattern.startsWith('tw:doc_gap_scan')) {
        const pct = result.executionPayload['coverage_percent'] ?? '?';
        const gaps = result.executionPayload['undocumented_count'] ?? '?';
        return `Doc gap scan: ${pct}% covered, ${gaps} undocumented feature(s): ${taskLabel}`;
    }

    if (pattern.startsWith('tw:verify_doc_steps')) {
        const total   = result.executionPayload['total_steps']   ?? '?';
        const passed  = result.executionPayload['pass_count']    ?? '?';
        const failed  = result.executionPayload['fail_count']    ?? '?';
        const errors  = result.executionPayload['error_count']   ?? '?';
        const skipped = result.executionPayload['skipped_count'] ?? '?';
        const outcome = pattern === 'tw:verify_doc_steps:all_pass'
            ? 'all steps passed'
            : `${failed} step(s) failed, ${errors} error(s)`;
        return `Doc step verification: ${total} steps — ${passed} passed, ${outcome} (${skipped} skipped): ${taskLabel}`;
    }

    if (pattern.startsWith('tw:interact_product')) {
        const pages    = result.executionPayload['observed_page_count'] ?? '?';
        const features = (result.executionPayload['observed_features'] as unknown[] | undefined)?.length ?? '?';
        return `Product interaction session: ${pages} page(s) observed, ${features} UI feature(s) captured: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:pr_review_respond')) {
        const fixed  = result.executionPayload['fixed_count']  ?? '?';
        const manual = result.executionPayload['manual_count'] ?? '?';
        return `PR review response: ${fixed} comment(s) auto-fixed, ${manual} requiring manual review: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:doc_index')) {
        const total  = result.executionPayload['total_docs']    ?? '?';
        const topics = result.executionPayload['total_topics']  ?? '?';
        return `Doc index built: ${total} file(s) indexed, ${topics} topic(s) mapped: ${taskLabel}`;
    }

    if (pattern.startsWith('tw:roadmap_context')) {
        const deprecated = result.executionPayload['deprecated_count'] ?? '?';
        const breaking   = result.executionPayload['breaking_count']   ?? '?';
        const upcoming   = result.executionPayload['upcoming_count']   ?? '?';
        return `Roadmap context built: ${deprecated} deprecated, ${breaking} breaking, ${upcoming} upcoming: ${taskLabel}`;
    }

    return `Technical writer action "${at}" completed with status "${oc}": ${taskLabel}`;
}
