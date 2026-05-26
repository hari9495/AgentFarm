/**
 * Marketing Specialist Role Profile
 *
 * Defines the security and classification layer for the marketing_specialist role:
 *   - MARKETING_SPECIALIST_BLOCKED_ACTIONS      — hard-blocked action types
 *   - MARKETING_SPECIALIST_APPROVAL_THRESHOLDS  — actions requiring human approval
 *   - MARKETING_SPECIALIST_BLOCKED_KEYWORDS     — task-classifier heuristic rejections
 *
 * Used by:
 *   - task-classifier.ts   → keyword-based heuristic block
 *   - runtime-server.ts    → isMarketingSpecialistBlockedAction() gate
 *   - role-profiles/index.ts → allowedActions / allowedConnectorTools
 */

import type { RoleKey } from '@agentfarm/shared-types';

export const MARKETING_SPECIALIST_ROLE_KEY: RoleKey = 'marketing_specialist';

// ---------------------------------------------------------------------------
// Blocked actions
// ---------------------------------------------------------------------------

export const MARKETING_SPECIALIST_BLOCKED_ACTIONS = new Set<string>([
    // Developer execution
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
    // Security / scanning
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_security_test_report',
    'workspace_run_ci_checks',
    // Recruiter
    'search_candidates',
    'post_job',
    'create_job_posting',
    'score_resume',
    'send_offer',
    'book_interview',
    'schedule_interview',
    // Sales
    'find_leads',
    'enrich_lead',
    'create_deal',
    'update_deal',
    'qualify_lead',
    'generate_proposal',
    'send_contract',
    'handle_objection',
    // Customer support
    'close_ticket',
    'handle_refund',
    'escalate_ticket',
    'chat_with_customer',
    // Corporate Assistant calendar
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
    'workspace_ca_email_compose',
    'workspace_ca_email_send',
]);

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const MARKETING_SPECIALIST_APPROVAL_THRESHOLDS: Record<'high' | 'medium', string[]> = {
    high: [
        'workspace_ms_run_campaign_workflow',   // activating a live campaign
        'send_email_campaign_live',             // bulk send to external list
        'workspace_ms_request_human_gate',      // explicit approval gate
        'delete_campaign',
    ],
    medium: [
        'workspace_ms_optimize_ppc',            // bid/budget changes on live campaigns
        'workspace_ms_build_email_sequence',    // setting up automation to external recipients
        'workspace_ms_schedule_social',         // publishing scheduled posts
        'workspace_ms_coordinate_assets',       // commissioning paid creative work
        'workspace_create_pr',
    ],
};

// ---------------------------------------------------------------------------
// Blocked keywords (task-classifier heuristics)
// ---------------------------------------------------------------------------

export const MARKETING_SPECIALIST_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
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
    // Customer support
    'support ticket',
    'customer complaint',
    'refund request',
    // Scheduling (Corporate Assistant)
    'schedule a meeting',
    'book a calendar slot',
    'calendar invite',
];
