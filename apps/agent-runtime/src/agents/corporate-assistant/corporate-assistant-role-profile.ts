/**
 * Sprint 15 — Corporate Assistant Role Enforcement Profile
 *
 * Extended enforcement configuration for the Corporate Assistant role.
 * The base RoleProfile (connector allowlist + allowed actions) lives in
 * role-profiles/index.ts and corporate-assistant-agent-profile.ts.
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

export const CORPORATE_ASSISTANT_BLOCKED_ACTIONS = new Set<string>([
    // Developer / Tester class
    'create_pr',
    'merge_pr',
    'git_push',
    'git_commit',
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    // Recruiter class
    'search_candidates',
    'post_job',
    'create_job_posting',
    'score_resume',
    'send_offer',
    'book_interview',
    'schedule_interview',
    'send_candidate_email',
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
    'chat_with_customer',
    'close_ticket',
    'handle_refund',
    'escalate_ticket',
    // Marketing class
    'create_campaign',
    'schedule_post',
    'publish_ad',
    'write_ad_copy',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic classification
// ---------------------------------------------------------------------------

export const CORPORATE_ASSISTANT_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Developer / engineering
    'pull request', 'merge request', 'code review', 'code coverage',
    'unit test', 'integration test', 'deploy to production', 'ci/cd pipeline',
    'run build', 'fix bug in code', 'debug the code',
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
    'email blast', 'newsletter', 'publish ad',
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const CORPORATE_ASSISTANT_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'send_email_external',      // email to external (non-tenant) domain
        'share_document_external',  // document shared outside tenant boundary
        'schedule_meeting_external', // meeting with external attendees
    ],
    medium: [
        'send_email',               // any email send
        'schedule_meeting',         // any calendar event
        'create_document',          // new document creation
        'send_message',             // messaging channel post
        'updateExistingDocument',   // in-place document update
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map
// ---------------------------------------------------------------------------

export const CA_SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
    signals: ReadonlyArray<string>;
    suggestedRole: RoleKey;
}> = [
        {
            signals: [
                'create_pr', 'merge_pr', 'code review', 'run tests',
                'deploy to production', 'git push',
            ],
            suggestedRole: 'developer',
        },
        {
            signals: [
                'search_candidates', 'job posting', 'resume', 'interview candidate',
                'offer letter',
            ],
            suggestedRole: 'recruiter',
        },
        {
            signals: [
                'find_leads', 'crm deal', 'sales proposal', 'cold outreach',
                'prospecting',
            ],
            suggestedRole: 'sales_rep',
        },
        {
            signals: [
                'run_tests', 'workspace_cypress', 'workspace_playwright',
                'unit test', 'integration test',
            ],
            suggestedRole: 'tester',
        },
        {
            signals: [
                'support ticket', 'customer complaint', 'chat with customer',
                'refund request',
            ],
            suggestedRole: 'customer_support_executive',
        },
        {
            signals: [
                'marketing campaign', 'ad copy', 'social media post',
                'newsletter', 'publish ad',
            ],
            suggestedRole: 'marketing_specialist',
        },
    ];
