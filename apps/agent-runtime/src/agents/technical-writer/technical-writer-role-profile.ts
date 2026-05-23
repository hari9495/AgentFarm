/**
 * Sprint 16 — Technical Writer Role Enforcement Profile
 *
 * Extended enforcement configuration for the Technical Writer role.
 * The base RoleProfile (connector allowlist + allowed actions) lives in
 * role-profiles/index.ts and technical-writer-agent-profile.ts.
 *
 * This module adds enforcement-specific data:
 *   - Action-type hard blocklist (rejected before LLM, no quota spent)
 *   - Blocked keyword signals for semantic heuristic classification
 *   - Approval thresholds (high vs medium risk for this role)
 */

import type { RoleKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Action-type hard blocklist
// ---------------------------------------------------------------------------

export const TECHNICAL_WRITER_BLOCKED_ACTIONS = new Set<string>([
    // Developer execution class
    'merge_pr',
    'git_push',
    'git_commit',
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
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
    // Marketing class
    'create_campaign',
    'schedule_post',
    'publish_ad',
    'write_ad_copy',
    // Calendar / email (Corporate Assistant territory)
    'schedule_meeting',
    'send_email',
    'workspace_ca_email_compose',
    'workspace_ca_email_send',
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic classification
// ---------------------------------------------------------------------------

export const TECHNICAL_WRITER_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Developer / engineering
    'run unit tests', 'run integration tests', 'deploy to production', 'ci/cd pipeline',
    'run build', 'fix bug in code', 'debug the code', 'code review',
    'write unit test', 'write integration test', 'add a test',
    // Recruiter
    'job posting', 'job description', 'candidate', 'interview candidate',
    'resume screening', 'recruitment', 'offer letter', 'hiring pipeline',
    // Sales
    'sales lead', 'crm deal', 'pipeline stage', 'sales proposal',
    'outbound prospecting', 'cold outreach', 'find prospects',
    // Customer support
    'support ticket', 'customer complaint', 'refund request',
    'chat with customer', 'live chat support',
    // Marketing
    'marketing campaign', 'ad copy', 'social media post',
    'email blast', 'newsletter campaign', 'publish ad',
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const TECHNICAL_WRITER_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'publish_doc_external',       // publishing to external-facing doc site
        'delete_doc_page',            // permanently deleting an existing doc page
        'overwrite_doc_page',         // replacing all content on an existing page
    ],
    medium: [
        'create_pr',                  // opening any PR with doc changes
        'create_document',            // creating a new document
        'update_document',            // updating an existing document
        'workspace_tw_doc_diff',      // applying a diff-derived doc update
        'workspace_tw_release_notes', // publishing release notes
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map
// ---------------------------------------------------------------------------

export const TW_SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
    signals: ReadonlyArray<string>;
    suggestedRole: RoleKey;
}> = [
        {
            signals: ['fix bug', 'run tests', 'deploy to production', 'code review'],
            suggestedRole: 'developer',
        },
        {
            signals: ['search candidates', 'job posting', 'interview candidate'],
            suggestedRole: 'recruiter',
        },
        {
            signals: ['sales lead', 'crm deal', 'outbound prospecting'],
            suggestedRole: 'sales_rep',
        },
        {
            signals: ['support ticket', 'customer complaint', 'refund request'],
            suggestedRole: 'customer_support_executive',
        },
        {
            signals: ['marketing campaign', 'ad copy', 'newsletter campaign'],
            suggestedRole: 'marketing_specialist',
        },
    ];
