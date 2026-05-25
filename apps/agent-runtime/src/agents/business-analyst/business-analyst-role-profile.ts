/**
 * Business Analyst Role Enforcement Profile
 *
 * Extended enforcement configuration for the Business Analyst role.
 * The base RoleProfile (connector allowlist + allowed actions) lives in
 * role-profiles/index.ts.
 *
 * This module adds enforcement-specific data:
 *   - Action-type hard blocklist (rejected before LLM, no quota spent)
 *   - Blocked keyword signals for semantic heuristic classification
 *   - Connector allowlist (mirrors role-profiles/index.ts for gating MCP tools)
 *   - Approval thresholds (high vs medium risk for this role)
 *   - Suggested-role map (feeds marketplace upsell when a task is declined)
 */

import type { RoleKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Action-type hard blocklist
// ---------------------------------------------------------------------------
// Any task whose action_type exactly matches one of these values is immediately
// rejected before LLM classification, saving quota and ensuring zero leakage.

export const BUSINESS_ANALYST_BLOCKED_ACTIONS = new Set<string>([
    // Developer execution class — code changes must go through Developer / FSD
    'create_pr',
    'merge_pr',
    'git_push',
    'git_commit',
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_subagent_spawn',
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
    'close_ticket',
    'handle_refund',
    'escalate_ticket',
    'chat_with_customer',
    // Marketing class
    'create_campaign',
    'schedule_post',
    'publish_ad',
    'write_ad_copy',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic classification
// ---------------------------------------------------------------------------

export const BUSINESS_ANALYST_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Developer / engineering
    'pull request', 'merge request', 'code review', 'unit test',
    'integration test', 'deploy to production', 'ci/cd pipeline',
    'run build', 'fix bug in code', 'debug the code', 'write code',
    'code coverage', 'run tests', 'git push',
    // Recruiter
    'job posting', 'job description', 'candidate', 'interview candidate',
    'resume screening', 'recruitment', 'offer letter', 'hiring pipeline',
    // Sales
    'sales lead', 'crm deal', 'pipeline stage', 'sales proposal',
    'outbound prospecting', 'cold outreach', 'find prospects', 'qualify lead',
    // Customer support
    'support ticket', 'customer complaint', 'refund request',
    'chat with customer', 'live chat support',
    // Marketing
    'marketing campaign', 'ad copy', 'social media post',
    'email blast', 'newsletter campaign', 'publish ad',
];

// ---------------------------------------------------------------------------
// Connector allowlist
// ---------------------------------------------------------------------------

export const BUSINESS_ANALYST_CONNECTOR_ALLOWLIST: ReadonlyArray<string> = [
    'jira',         // story and ticket management, requirement tracking
    'confluence',   // BRD, spec, and process documentation
    'notion',       // documentation and knowledge base
    'linear',       // lightweight issue tracking
    'asana',        // project and task tracking
    'trello',       // board-based task tracking
    'clickup',      // project management
    'slack',        // stakeholder communication
    'teams',        // stakeholder communication
    'outlook',      // stakeholder updates and meeting invites
    'gmail',        // stakeholder updates and meeting invites
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const BUSINESS_ANALYST_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'workspace_ba_finalize_brd',                  // sign off a BRD ready for development hand-off
        'workspace_ba_finalize_acceptance_criteria',  // lock acceptance criteria after stakeholder review
        'share_spec_external',                        // share a specification outside the tenant boundary
    ],
    medium: [
        'workspace_ba_draft_brd',           // draft a new Business Requirements Document
        'workspace_ba_draft_user_story',    // create a user story with acceptance criteria
        'workspace_ba_impact_analysis',     // impact analysis against existing live functionality
        'workspace_ba_stakeholder_update',  // send a status update to stakeholders
        'create_task',                      // create a ticket or task in a tracker
        'update_task_status',               // update an existing ticket status
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map
// ---------------------------------------------------------------------------

export const BA_SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
    signals: ReadonlyArray<string>;
    suggestedRole: RoleKey;
}> = [
        {
            signals: [
                'create_pr', 'merge_pr', 'code review', 'run tests',
                'deploy to production', 'git push', 'write code', 'fix bug',
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
                'prospecting', 'qualify lead',
            ],
            suggestedRole: 'sales_rep',
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
                'newsletter campaign', 'publish ad',
            ],
            suggestedRole: 'marketing_specialist',
        },
        {
            signals: [
                'unit test', 'integration test', 'test coverage', 'run test suite',
                'workspace_generate_test', 'write test cases',
            ],
            suggestedRole: 'tester',
        },
        {
            signals: [
                'write documentation', 'api docs', 'release notes',
                'style guide', 'technical documentation',
            ],
            suggestedRole: 'technical_writer',
        },
    ];
