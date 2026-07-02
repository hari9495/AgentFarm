/**
 * Phase 3 — Verb-level connector/MCP governance: read/write classifier.
 *
 * Classifies connector action verbs as read vs write so a customer policy with
 * `mode: 'read_only'` can mechanically block writes. Covers BOTH vocabularies:
 *   - the 9-value runtime connector exec actionType union, and
 *   - the 34 `NormalizedActionType` verbs in @agentfarm/connector-contracts.
 *
 * Fail-safe: any verb not in the explicit read set is treated as a WRITE, so an
 * unknown/new action can never slip through a read-only restriction.
 */

const READ_VERBS: ReadonlySet<string> = new Set<string>([
    // runtime connector exec vocabulary
    'read_task',
    'list_prs',
    // normalized connector vocabulary (@agentfarm/connector-contracts)
    'get_task',
    'list_tasks',
    'list_sprints',
    'get_sprint_issues',
    'list_workflow_runs',
    'get_workflow_run',
    'list_emails',
    'read_email',
    'read_thread',
    'get_call_status',
    'get_call_recording',
    'get_record',
    'search_records',
]);

/** Returns true when the verb mutates state (or is unknown — fail-safe). */
export function isWriteVerb(actionType: string): boolean {
    return !READ_VERBS.has(actionType);
}

/** Returns true when the verb is a known read-only action. */
export function isReadVerb(actionType: string): boolean {
    return READ_VERBS.has(actionType);
}
