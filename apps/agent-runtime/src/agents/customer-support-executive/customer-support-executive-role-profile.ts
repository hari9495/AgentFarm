/**
 * Customer Support Executive — enforcement profile.
 *
 * Hard blocklist, keyword signals, and approval thresholds for the CSE role.
 * The base RoleProfile lives in role-profiles/index.ts.
 */

import type { RoleKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Hard-blocked action types (rejected before LLM, no quota spent)
// ---------------------------------------------------------------------------

export const CUSTOMER_SUPPORT_EXECUTIVE_BLOCKED_ACTIONS = new Set<string>([
    // Code operations
    'create_pr', 'merge_pr', 'git_push', 'git_commit',
    'run_tests', 'run_linter', 'run_pipeline', 'deploy_production',
    'workspace_security_scan', 'workspace_sast_scan',
    'workspace_dev_implement_feature', 'workspace_dev_fix_bug',
    // Recruiting
    'search_candidates', 'post_job', 'create_job_posting',
    'score_resume', 'send_offer', 'book_interview',
    // Sales prospecting
    'find_leads', 'enrich_lead', 'create_deal', 'update_deal',
    'qualify_lead', 'generate_proposal', 'send_contract',
    // Marketing
    'create_campaign', 'schedule_post', 'publish_ad', 'write_ad_copy',
    // DevOps
    'workspace_devops_tf_apply', 'workspace_devops_k8s_deploy',
    'workspace_devops_pipeline_trigger',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic pre-classification
// ---------------------------------------------------------------------------

export const CUSTOMER_SUPPORT_EXECUTIVE_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Code / engineering
    'pull request', 'merge request', 'code review', 'deploy to production',
    'run build', 'fix bug in code', 'debug the code', 'write unit tests',
    // Recruiting
    'job posting', 'candidate screening', 'offer letter', 'interview panel',
    // Sales
    'sales lead', 'crm deal', 'cold outreach', 'find prospects',
    // Marketing
    'ad copy', 'email blast', 'marketing campaign', 'publish ad',
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const CUSTOMER_SUPPORT_EXECUTIVE_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'workspace_cse_refund_process',   // any refund
        'workspace_cse_order_modify',     // subscription cancel or plan downgrade
        'workspace_cse_escalate',         // escalation to senior leadership
    ],
    medium: [
        'workspace_cse_reply_send',       // outbound reply to customer
        'workspace_cse_reply_followup',   // proactive follow-up
        'workspace_cse_csat_send',        // survey send
        'workspace_cse_nps_send',         // NPS send
        'workspace_cse_live_chat_handle', // live chat response
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map for out-of-scope requests
// ---------------------------------------------------------------------------

export const CSE_SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
    signals: ReadonlyArray<string>;
    suggestedRole: RoleKey;
}> = [
    {
        signals: ['pull request', 'code review', 'deploy', 'git push', 'run tests'],
        suggestedRole: 'developer',
    },
    {
        signals: ['job posting', 'candidate', 'offer letter', 'interview'],
        suggestedRole: 'recruiter',
    },
    {
        signals: ['sales lead', 'crm deal', 'cold outreach', 'prospects'],
        suggestedRole: 'sales_rep',
    },
    {
        signals: ['marketing campaign', 'ad copy', 'social media', 'publish ad'],
        suggestedRole: 'marketing_specialist',
    },
    {
        signals: ['sprint plan', 'backlog', 'scrum', 'project charter'],
        suggestedRole: 'project_manager_product_owner_scrum_master',
    },
];
