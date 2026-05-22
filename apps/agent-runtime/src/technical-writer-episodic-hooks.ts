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

    return `Technical writer action "${at}" completed with status "${oc}": ${taskLabel}`;
}
