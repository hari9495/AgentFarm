/**
 * Sprint 2 — Role Enforcement Framework
 *
 * Shared types for role enforcement results and decline records.
 * Referenced by agent-runtime, api-gateway, and dashboard.
 */

/**
 * Outcome codes for role enforcement decisions.
 *
 * - `action_blocked`    — action_type is explicitly on the role's blocklist.
 * - `out_of_role`       — semantic classifier determined the task belongs to a different role.
 */
export type RoleDeclineCode = 'action_blocked' | 'out_of_role';

/**
 * Result returned by the role enforcement middleware.
 * Discriminated union on `allowed`.
 */
export type RoleEnforcementResult =
    | { allowed: true }
    | {
        allowed: false;
        /** Human-readable reason for the block. Logged and surfaced to the customer. */
        reason: string;
        /**
         * The role key that should handle this task, if determinable.
         * Null when the request doesn't clearly belong to any single role.
         * Used by the API gateway to surface upsell suggestions.
         */
        suggestedRole: string | null;
        /** Machine-readable decline classification. */
        declineCode: RoleDeclineCode;
    };

/**
 * Persistent record written to the audit log whenever a task is declined by role enforcement.
 * Captured in the api-gateway for incident review and billing protection reports.
 */
export interface RoleDeclineRecord {
    /** Unique identifier for this decline event. */
    declineId: string;
    /** Task identifier that was declined. */
    taskId: string;
    /** Bot / agent that attempted the task. */
    botId: string;
    /** Tenant that owns the bot. */
    tenantId: string;
    /** The active role of the bot that was enforced. */
    roleKey: string;
    /** Machine-readable decline reason. */
    declineCode: RoleDeclineCode;
    /** Human-readable reason for display. */
    reason: string;
    /**
     * Suggested role that should handle this task (null if undetermined).
     * Used by marketplace upsell engine.
     */
    suggestedRole: string | null;
    /** The action_type from the task payload that triggered the decline. */
    actionType: string;
    /** ISO-8601 timestamp of the decline. */
    declinedAt: string;
}
