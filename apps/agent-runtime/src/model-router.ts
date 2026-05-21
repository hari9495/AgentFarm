/**
 * model-router.ts
 *
 * Task-type aware LLM model routing.
 *
 * A human developer chooses the right tool for the job:
 * - Complex code generation → best available code model (Claude 3.5 Sonnet)
 * - Security / structured analysis → strongest reasoning model (GPT-4o)
 * - Quick lookups, reads, grepping → fastest / cheapest model
 * - Everything else → fall back to the workspace-configured default
 *
 * Integration point: call routeModelForTask() inside processOneTask, just
 * before calling processDeveloperTaskWithMemory.  Replace `activeModelProvider`
 * with the returned `provider` so the LLM resolver picks the right model.
 */

import type { ModelProfileKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Actions that strongly benefit from a code-specialised model.
 * These are compute / latency intensive — use the quality profile.
 */
const CODE_INTENSIVE_ACTIONS = new Set([
    'code_edit',
    'code_edit_patch',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_bulk_refactor',
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
    'workspace_github_review_pr',
]);

/**
 * Actions that benefit from deep reasoning / structured output.
 */
const REASONING_INTENSIVE_ACTIONS = new Set([
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_dependency_audit',
    'workspace_architecture_review',
    'workspace_performance_profile',
    'workspace_threat_model',
]);

/**
 * Lightweight read-only actions — use the fastest / cheapest model profile.
 */
const CHEAP_ACTIONS = new Set([
    'workspace_grep',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_search_symbol',
    'workspace_read_logs',
    'workspace_tail_logs',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelProviderKey = 'anthropic' | 'openai' | 'agentfarm' | string;

export interface ModelRouteDecision {
    /** LLM provider to use for this task. */
    provider: ModelProviderKey;
    /** Model profile (maps to latency / quality settings in LLM resolver). */
    profile: ModelProfileKey;
    /** Human-readable reason for audit logging. */
    reason: string;
    /** True when the router overrode the workspace default. */
    overridden: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select the optimal provider + profile for an action type.
 *
 * @param actionType          The classified action type (e.g. 'code_edit').
 * @param workspaceProvider   The workspace-level default provider.
 * @param workspaceProfile    The workspace-level default profile.
 */
export function routeModelForTask(
    actionType: string,
    workspaceProvider: ModelProviderKey,
    workspaceProfile: ModelProfileKey = 'cost_balanced',
): ModelRouteDecision {
    if (CODE_INTENSIVE_ACTIONS.has(actionType)) {
        return {
            provider: 'anthropic',
            profile: 'quality_first',
            reason: `Code-intensive action '${actionType}' routed to Anthropic (quality_first).`,
            overridden: workspaceProvider !== 'anthropic' || workspaceProfile !== 'quality_first',
        };
    }

    if (REASONING_INTENSIVE_ACTIONS.has(actionType)) {
        return {
            provider: 'openai',
            profile: 'quality_first',
            reason: `Reasoning-intensive action '${actionType}' routed to OpenAI (quality_first).`,
            overridden: workspaceProvider !== 'openai' || workspaceProfile !== 'quality_first',
        };
    }

    if (CHEAP_ACTIONS.has(actionType)) {
        return {
            provider: workspaceProvider,
            profile: 'speed_first',
            reason: `Lightweight action '${actionType}' using workspace provider at speed_first.`,
            overridden: workspaceProfile !== 'speed_first',
        };
    }

    // Default: workspace config unchanged
    return {
        provider: workspaceProvider,
        profile: workspaceProfile,
        reason: `Action '${actionType}' using workspace default (${workspaceProvider}/${workspaceProfile}).`,
        overridden: false,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the model profile a task should use, as a convenience wrapper
 * for callers who only need the profile key.
 */
export function resolveModelProfileForTask(
    actionType: string,
    workspaceProfile: ModelProfileKey,
): ModelProfileKey {
    if (CODE_INTENSIVE_ACTIONS.has(actionType) || REASONING_INTENSIVE_ACTIONS.has(actionType)) {
        return 'quality_first';
    }
    if (CHEAP_ACTIONS.has(actionType)) {
        return 'speed_first';
    }
    return workspaceProfile;
}
