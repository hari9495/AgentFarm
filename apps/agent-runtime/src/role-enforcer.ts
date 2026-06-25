/**
 * Sprint 2 — Role Enforcement Framework
 *
 * Enforcement middleware: gates task execution so agents only perform work that
 * belongs to their assigned role.
 *
 * Two enforcement phases (in order):
 *
 *  Phase 1 — Hard block (action_type level)
 *    Checks the task's action_type against the developer role's explicit blocklist.
 *    No LLM call, no quota spend. Instant decline with `declineCode: 'action_blocked'`.
 *
 *  Phase 2 — Semantic soft block (description level)
 *    Calls the keyword-heuristic classifier (or an injectable LLM fn).
 *    Only blocks when confidence >= 0.70 that the task belongs to another role.
 *    Decline code: `out_of_role`.
 *
 * Both phases populate `suggestedRole` from the developer profile's signal map so
 * the api-gateway can surface a marketplace upsell in the dashboard.
 */

import type { RoleKey, RoleEnforcementResult } from '@agentfarm/shared-types';
import type { TaskEnvelope } from './execution-engine.js';
import type { TaskClassifierFn } from './task-classifier.js';
import { classifyTaskForRole } from './task-classifier.js';
import { SUGGEST_ROLE_FOR_BLOCKED } from './agents/developer/developer-role-profile.js';
import { getBlockedActionsForRole } from './role-action-registry.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determines which role should handle the declined task.
 * Scans the developer profile's signal map for the first entry whose keyword
 * set overlaps with the combined action_type + description string.
 */
function resolveSuggestedRole(actionType: string, taskDescription: string): RoleKey | null {
    const combined = `${actionType} ${taskDescription}`.toLowerCase();

    for (const { signals, suggestedRole } of SUGGEST_ROLE_FOR_BLOCKED) {
        if (signals.some(signal => combined.includes(signal.toLowerCase()))) {
            return suggestedRole;
        }
    }

    return null;
}

/**
 * Extracts the action_type from the task payload as a lower-case string.
 * Returns an empty string when not set (treated as an unknown / passthrough action).
 */
function getActionType(task: TaskEnvelope): string {
    const raw = task.payload['action_type'];
    return typeof raw === 'string' ? raw.toLowerCase() : '';
}

/**
 * Builds a combined task description for signal matching.
 */
function getTaskDescription(task: TaskEnvelope): string {
    return [task.payload['prompt'], task.payload['description'], task.payload['intent']]
        .filter((v): v is string => typeof v === 'string')
        .join(' ');
}

// ---------------------------------------------------------------------------
// Public enforcer
// ---------------------------------------------------------------------------

export interface EnforceRoleOptions {
    /**
     * Injectable classifier function for the semantic soft-block phase.
     * When omitted the heuristic keyword classifier is used.
     * Pass a custom implementation in tests or when an LLM classifier is available.
     */
    classifierFn?: TaskClassifierFn;
    /**
     * Phase 2 — extra hard-block actions from a customer `GovernancePolicy(scope=role)`
     * overlay. Unioned on top of the code registry: customer policy can only
     * TIGHTEN (add blocks), never loosen the built-in role blocklist.
     */
    blockedActionsOverride?: ReadonlySet<string>;
}

/**
 * Evaluates whether the task is permitted for the given role.
 *
 * @param task     The task envelope to evaluate (after audit-context enrichment).
 * @param roleKey  The active role of the agent executing this task.
 * @param options  Optional: inject a classifier function for the soft-block phase.
 * @returns        `{ allowed: true }` or a detailed decline record.
 */
export async function enforceRole(
    task: TaskEnvelope,
    roleKey: RoleKey,
    options?: EnforceRoleOptions,
): Promise<RoleEnforcementResult> {
    const actionType = getActionType(task);
    const taskDescription = getTaskDescription(task);

    // -----------------------------------------------------------------------
    // Phase 1: Hard block — action_type is on this role's blocklist.
    // Phase 2: applies to ALL roles via the central registry, plus any
    // customer GovernancePolicy(scope=role) overlay (union = tighten-only).
    // -----------------------------------------------------------------------
    const blockedActions = getBlockedActionsForRole(roleKey);
    const isBlocked =
        blockedActions.has(actionType) ||
        (options?.blockedActionsOverride?.has(actionType) ?? false);
    if (actionType && isBlocked) {
        return {
            allowed: false,
            declineCode: 'action_blocked',
            reason: `Action type "${actionType}" is not permitted for the ${roleKey} role.`,
            suggestedRole: resolveSuggestedRole(actionType, taskDescription),
        };
    }

    // -----------------------------------------------------------------------
    // Phase 2: Semantic soft block — classifier checks task description intent
    // -----------------------------------------------------------------------
    const classification = await classifyTaskForRole(task, roleKey, options?.classifierFn);

    if (!classification.belongsToRole && classification.confidence >= 0.70) {
        return {
            allowed: false,
            declineCode: 'out_of_role',
            reason: classification.reason,
            suggestedRole: resolveSuggestedRole(actionType, taskDescription),
        };
    }

    // -----------------------------------------------------------------------
    // Allowed — proceed to LLM risk routing in the execution engine
    // -----------------------------------------------------------------------
    return { allowed: true };
}
