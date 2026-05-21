// ============================================================================
// TESTER EPISODIC HOOKS
// Sprint 18 — Tester Memory & Wizard Gaps (2026-05-21)
//
// Provides tester-specific pattern keys and summaries for episodic memory
// writes.  The generic runtime write captures `result.decision.actionType` as
// the pattern, which is too coarse for a QA agent — we want to remember things
// like "Cypress test_fail on auth module" or "DAST scan found HIGH findings".
//
// buildTesterEpisodicPattern  → derives a domain-specific pattern key
// buildTesterEpisodicSummary  → builds a richer, QA-contextualised summary
//
// Both are pure functions; no side-effects, easy to unit-test.
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'pass' | 'fail' {
    return result.status === 'success' ? 'pass' : 'fail';
}

function extractTestFramework(actionType: string): string | null {
    if (actionType.includes('cypress')) return 'Cypress';
    if (actionType.includes('playwright')) return 'Playwright';
    if (actionType.includes('selenium')) return 'Selenium';
    if (actionType.includes('appium')) return 'Appium';
    if (actionType.includes('load_test')) return 'k6/JMeter';
    if (actionType.includes('api_test')) return 'Newman';
    if (actionType.includes('dast')) return 'OWASP ZAP';
    if (actionType.includes('security')) return 'Security';
    if (actionType.includes('coverage')) return 'Coverage';
    if (actionType === 'run_tests') return 'UnitTest';
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a tester-specific episodic pattern key.
 *
 * The pattern is used as the ON CONFLICT key in AgentLongTermMemory — each
 * distinct pattern represents one "class" of QA knowledge per tenant.
 *
 * Examples:
 *   "tester:cypress:pass"
 *   "tester:playwright:fail"
 *   "tester:dast_scan:fail"
 *   "tester:load_test:pass"
 *   "tester:api_test:fail"
 *   "tester:coverage:fail"
 *   "tester:visual_regression:fail"
 *   "tester:test_authoring:generated"
 *   "tester:test_management:sync"
 */
export function buildTesterEpisodicPattern(
    _task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Test-framework specific patterns
    if (at.startsWith('workspace_cypress')) return `tester:cypress:${oc}`;
    if (at.startsWith('workspace_playwright')) return `tester:playwright:${oc}`;
    if (at.startsWith('workspace_selenium')) return `tester:selenium:${oc}`;
    if (at.startsWith('workspace_appium')) return `tester:appium:${oc}`;
    if (at === 'run_tests') return `tester:unit:${oc}`;

    // Performance / load testing
    if (at.startsWith('workspace_load_test_run')) return `tester:load_test:${oc}`;
    if (at === 'workspace_load_test_report') return `tester:load_report:${oc}`;

    // API testing
    if (at.startsWith('workspace_api_test_run')) return `tester:api_test:${oc}`;
    if (at === 'workspace_api_test_report') return `tester:api_report:${oc}`;

    // Security / DAST
    if (at === 'workspace_dast_scan') return `tester:dast_scan:${oc}`;
    if (at === 'workspace_security_test_report') return `tester:security_report:${oc}`;

    // Coverage
    if (at === 'workspace_code_coverage') return `tester:coverage:${oc}`;

    // Test authoring
    if (at === 'workspace_generate_test') return 'tester:test_authoring:generated';
    if (at === 'workspace_fix_test_failures') return 'tester:test_authoring:fixed';
    if (at === 'workspace_test_impact_analysis') return `tester:impact_analysis:${oc}`;

    // Test management (TestRail / Zephyr)
    if (at === 'workspace_test_case_sync') return 'tester:test_management:sync';
    if (at === 'workspace_test_run_publish') return 'tester:test_management:publish';

    // Visual regression
    if (at === 'workspace_visual_regression') return `tester:visual_regression:${oc}`;

    // Fallback — still namespaced under "tester:" so it's easy to query
    return `tester:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for tester tasks.
 *
 * Includes: framework, target component/file, outcome, failure reason, and
 * the task's natural-language objective — giving the agent useful context
 * when recalling similar past work.
 */
export function buildTesterEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const parts: string[] = [];

    const framework = extractTestFramework(result.decision.actionType);
    if (framework) parts.push(`Framework: ${framework}`);

    // Target component/file from whichever payload key is set
    const componentKeys = ['component', 'test_file', 'spec', 'target', 'module'] as const;
    for (const key of componentKeys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) {
            parts.push(`Target: ${v.trim().slice(0, 120)}`);
            break;
        }
    }

    // Outcome
    parts.push(`Outcome: ${result.status}`);

    // Failure details
    if (result.status !== 'success') {
        if (result.decision.reason) {
            parts.push(`Reason: ${result.decision.reason.slice(0, 200)}`);
        }
        if (result.errorMessage) {
            parts.push(`Error: ${result.errorMessage.slice(0, 200)}`);
        }
    }

    // Natural-language objective from task payload
    const summaryKeys = ['summary', 'objective', 'prompt', 'title'] as const;
    for (const key of summaryKeys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) {
            parts.push(v.trim().slice(0, 200));
            break;
        }
    }

    return parts.join(' | ').slice(0, 500);
}
