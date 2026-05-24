// ============================================================================
// MOBILE EPISODIC HOOKS
// Provides mobile-specific pattern keys and summaries for episodic memory.
//
// buildMobileEpisodicPattern  → derives a domain-specific key, e.g.:
//   "mob:ios_component:success"
//   "mob:android_build:fail"
//   "mob:store_upload:success"
//   "mob:a11y_audit:violations"
//
// buildMobileEpisodicSummary  → richer context summary for the memory record.
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
 * Derives a mobile-specific episodic pattern key.
 *
 * Examples:
 *   "mob:ios_component:success"
 *   "mob:ios_build:fail"
 *   "mob:android_component:success"
 *   "mob:a11y_audit:violations"
 *   "mob:store_upload:success"
 *   "mob:perf_profile:hotspot"
 */
export function buildMobileEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // ── iOS ──────────────────────────────────────────────────────────────────
    if (at === 'workspace_mob_ios_component')  return `mob:ios_component:${oc}`;

    if (at === 'workspace_mob_ios_build') {
        if (oc === 'fail') return 'mob:ios_build:fail';
        const warnings = numericPayload(result, 'warning_count');
        return warnings > 0 ? 'mob:ios_build:warnings' : 'mob:ios_build:success';
    }

    if (at === 'workspace_mob_ios_test') {
        const failed = numericPayload(result, 'failed');
        if (oc === 'fail' || failed > 0) return 'mob:ios_test:fail';
        return 'mob:ios_test:success';
    }

    // ── Android ──────────────────────────────────────────────────────────────
    if (at === 'workspace_mob_android_component') return `mob:android_component:${oc}`;

    if (at === 'workspace_mob_android_build') {
        if (oc === 'fail') return 'mob:android_build:fail';
        const warnings = numericPayload(result, 'warning_count');
        return warnings > 0 ? 'mob:android_build:warnings' : 'mob:android_build:success';
    }

    if (at === 'workspace_mob_android_test') {
        const failed = numericPayload(result, 'failed');
        if (oc === 'fail' || failed > 0) return 'mob:android_test:fail';
        return 'mob:android_test:success';
    }

    // ── Cross-platform ────────────────────────────────────────────────────────
    if (at === 'workspace_mob_api_client') return `mob:api_client:${oc}`;

    if (at === 'workspace_mob_push_notify') {
        const platform = result.executionPayload['platform'];
        if (platform === 'ios')     return `mob:push_notify:ios:${oc}`;
        if (platform === 'android') return `mob:push_notify:android:${oc}`;
        return `mob:push_notify:${oc}`;
    }

    if (at === 'workspace_mob_deep_link') return `mob:deep_link:${oc}`;

    if (at === 'workspace_mob_auth_implement') {
        const strategy = result.executionPayload['strategy'];
        return typeof strategy === 'string'
            ? `mob:auth_implement:${strategy}:${oc}`
            : `mob:auth_implement:${oc}`;
    }

    if (at === 'workspace_mob_perf_profile') {
        if (oc === 'fail') return 'mob:perf_profile:fail';
        const hasHotspot = result.executionPayload['has_hotspot'];
        return hasHotspot === true ? 'mob:perf_profile:hotspot' : 'mob:perf_profile:success';
    }

    if (at === 'workspace_mob_a11y_audit') {
        const issues = numericPayload(result, 'issue_count');
        return issues > 0 ? 'mob:a11y_audit:violations' : `mob:a11y_audit:${oc}`;
    }

    if (at === 'workspace_mob_store_upload') {
        const platform = result.executionPayload['platform'];
        if (oc === 'fail') {
            return typeof platform === 'string'
                ? `mob:store_upload:${platform}:fail`
                : 'mob:store_upload:fail';
        }
        return typeof platform === 'string'
            ? `mob:store_upload:${platform}:success`
            : 'mob:store_upload:success';
    }

    if (at === 'workspace_mob_scaffold_project') return `mob:scaffold_project:${oc}`;
    if (at === 'workspace_mob_standup_report')   return `mob:standup:${oc}`;

    // Fallback — namespaced under "mob:"
    return `mob:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for the Mobile role.
 * Used as the `summary` field in AgentLongTermMemory writes.
 */
export function buildMobileEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const pattern = buildMobileEpisodicPattern(task, result);
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    const title       = typeof task.payload['title']       === 'string' ? task.payload['title']       : '';
    const description = typeof task.payload['description'] === 'string' ? task.payload['description'] : '';
    const taskLabel   = (title || description || at).slice(0, 120);

    // ── iOS ──────────────────────────────────────────────────────────────────

    if (pattern === 'mob:ios_component:success') {
        const fc = numericPayload(result, 'file_count');
        return `SwiftUI component generated (${fc} file(s)): ${taskLabel}`;
    }
    if (pattern === 'mob:ios_component:fail')
        return `SwiftUI component generation failed: ${taskLabel}`;

    if (pattern === 'mob:ios_build:fail')
        return `iOS build FAILED: ${taskLabel}`;
    if (pattern === 'mob:ios_build:warnings') {
        const wc = numericPayload(result, 'warning_count');
        return `iOS build succeeded with ${wc} warning(s): ${taskLabel}`;
    }
    if (pattern === 'mob:ios_build:success')
        return `iOS build succeeded: ${taskLabel}`;

    if (pattern === 'mob:ios_test:fail') {
        const failed = numericPayload(result, 'failed');
        const passed = numericPayload(result, 'passed');
        return `iOS tests: ${failed} failed, ${passed} passed: ${taskLabel}`;
    }
    if (pattern === 'mob:ios_test:success') {
        const passed = numericPayload(result, 'passed');
        return `iOS tests: all ${passed} passed: ${taskLabel}`;
    }

    // ── Android ──────────────────────────────────────────────────────────────

    if (pattern === 'mob:android_component:success') {
        const fc = numericPayload(result, 'file_count');
        return `Compose component generated (${fc} file(s)): ${taskLabel}`;
    }
    if (pattern === 'mob:android_component:fail')
        return `Compose component generation failed: ${taskLabel}`;

    if (pattern === 'mob:android_build:fail')
        return `Android build FAILED: ${taskLabel}`;
    if (pattern === 'mob:android_build:warnings') {
        const wc = numericPayload(result, 'warning_count');
        return `Android build succeeded with ${wc} warning(s): ${taskLabel}`;
    }
    if (pattern === 'mob:android_build:success')
        return `Android build succeeded: ${taskLabel}`;

    if (pattern === 'mob:android_test:fail') {
        const failed = numericPayload(result, 'failed');
        const passed = numericPayload(result, 'passed');
        return `Android tests: ${failed} failed, ${passed} passed: ${taskLabel}`;
    }
    if (pattern === 'mob:android_test:success') {
        const passed = numericPayload(result, 'passed');
        return `Android tests: all ${passed} passed: ${taskLabel}`;
    }

    // ── Cross-platform ────────────────────────────────────────────────────────

    if (pattern.startsWith('mob:api_client')) {
        const platform = result.executionPayload['platform'] ?? 'unknown';
        const fc       = numericPayload(result, 'file_count');
        return `${platform as string} API client generated (${fc} file(s)) ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('mob:push_notify')) {
        const platform = result.executionPayload['platform'] ?? 'both';
        return `Push notification configured (${platform as string}) ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('mob:deep_link')) {
        const platform = result.executionPayload['platform'] ?? 'both';
        return `Deep link / universal links configured (${platform as string}) ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('mob:auth_implement')) {
        const strategy = result.executionPayload['strategy'] ?? 'unknown';
        const platform = result.executionPayload['platform'] ?? 'both';
        return `Mobile auth (${strategy as string}, ${platform as string}) ${oc}: ${taskLabel}`;
    }

    if (pattern === 'mob:perf_profile:hotspot') {
        const platform = result.executionPayload['platform'] ?? 'unknown';
        return `Mobile perf profile: hotspot detected (${platform as string}): ${taskLabel}`;
    }
    if (pattern === 'mob:perf_profile:fail')
        return `Mobile perf profile failed: ${taskLabel}`;
    if (pattern.startsWith('mob:perf_profile'))
        return `Mobile perf profile ${oc}: ${taskLabel}`;

    if (pattern === 'mob:a11y_audit:violations') {
        const ic = numericPayload(result, 'issue_count');
        return `Mobile a11y audit: ${ic} violation(s) found: ${taskLabel}`;
    }
    if (pattern.startsWith('mob:a11y_audit'))
        return `Mobile accessibility audit ${oc}: no issues: ${taskLabel}`;

    if (pattern.includes('mob:store_upload')) {
        const platform = result.executionPayload['platform'] ?? 'unknown';
        if (oc === 'fail')
            return `Store upload FAILED (${platform as string}): ${taskLabel}`;
        const version = result.executionPayload['version'] ?? '';
        return version
            ? `Store upload ${oc} (${platform as string}, v${version as string}): ${taskLabel}`
            : `Store upload ${oc} (${platform as string}): ${taskLabel}`;
    }

    if (pattern.startsWith('mob:scaffold_project')) {
        const platform = result.executionPayload['platform'] ?? 'unknown';
        return `Mobile project scaffolded (${platform as string}) ${oc}: ${taskLabel}`;
    }

    if (pattern.startsWith('mob:standup'))
        return `Mobile standup generated (${oc}): ${taskLabel}`;

    // Fallback
    return `Mobile action "${at}" completed with status "${oc}": ${taskLabel}`;
}
