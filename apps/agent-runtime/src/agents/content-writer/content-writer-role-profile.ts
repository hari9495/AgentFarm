/**
 * Content Writer Role Profile
 *
 * Defines the security and classification layer for the content_writer role:
 *   - CONTENT_WRITER_BLOCKED_ACTIONS  — Set of action types hard-blocked for this role.
 *   - CONTENT_WRITER_APPROVAL_THRESHOLDS — Actions that require human approval.
 *   - CONTENT_WRITER_BLOCKED_KEYWORDS  — Keywords that flag a task as outside-role.
 *
 * Used by:
 *   - task-classifier.ts   → keyword-based heuristic block
 *   - runtime-server.ts    → isContentWriterBlockedAction() gate
 *   - role-profiles/index.ts → allowedActions / allowedConnectorTools
 */

import type { RoleKey } from '@agentfarm/shared-types';

// Keep this reference so TypeScript enforces the role key literal
export const CONTENT_WRITER_ROLE_KEY: RoleKey = 'content_writer';

// ---------------------------------------------------------------------------
// Blocked actions
// ---------------------------------------------------------------------------

/**
 * Actions that a content writer agent MUST NEVER execute.
 * This is a Set for O(1) lookup in the action gate.
 */
export const CONTENT_WRITER_BLOCKED_ACTIONS = new Set<string>([
    // Developer execution class
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'deploy_staging',
    'merge_pr',
    'git_push',
    'git_commit',
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    // Security / scanning class
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_security_test_report',
    'workspace_run_ci_checks',
    // Recruiter class
    'search_candidates',
    'post_job',
    'create_job_posting',
    'score_resume',
    'send_offer',
    'book_interview',
    'schedule_interview',
    // Sales class
    'find_leads',
    'enrich_lead',
    'create_deal',
    'update_deal',
    'qualify_lead',
    'generate_proposal',
    'send_contract',
    'handle_objection',
    // Customer support class
    'close_ticket',
    'handle_refund',
    'escalate_ticket',
    'chat_with_customer',
    // Calendar / scheduling (Corporate Assistant territory)
    'schedule_meeting',
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
    'workspace_ca_email_compose',
    'workspace_ca_email_send',
]);

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

/**
 * Actions that require human approval before execution.
 *   high   — always requires sign-off (external publication, destructive ops).
 *   medium — requires approval unless auto-approve is enabled for the tenant.
 */
export const CONTENT_WRITER_APPROVAL_THRESHOLDS: Record<'high' | 'medium', string[]> = {
    high: [
        'publish_content_external',
        'delete_content_page',
        'send_email_campaign_live',
    ],
    medium: [
        'mention_competitor',
        'workspace_create_pr',
        'workspace_cw_draft_blog',
        'workspace_cw_draft_email',
        'workspace_cw_route_editorial',
    ],
};

// ---------------------------------------------------------------------------
// Blocked keywords (task-classifier heuristics)
// ---------------------------------------------------------------------------

/**
 * Keywords in the task description that strongly indicate the task belongs
 * to a different role. Used by task-classifier.ts to reject before LLM call.
 */
export const CONTENT_WRITER_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Developer tasks
    'run unit tests',
    'run integration tests',
    'fix bug in code',
    'deploy to production',
    'deploy to staging',
    'merge pull request',
    'security scan',
    'run ci pipeline',
    // Recruiter tasks
    'job posting',
    'candidate profile',
    'resume screening',
    'interview loop',
    // Sales tasks
    'sales lead',
    'crm deal',
    'prospect outreach',
    'sales pipeline',
    // Customer support tasks
    'support ticket',
    'customer complaint',
    'refund request',
    // Marketing campaign (broader campaigns, not content writing)
    'ad copy brief',
    'paid media',
    'google ads',
    'facebook ads',
    // Scheduling
    'schedule a meeting',
    'book a calendar slot',
    'calendar invite',
];
