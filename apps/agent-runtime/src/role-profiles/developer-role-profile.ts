/**
 * Sprint 2 — Role Enforcement Framework
 *
 * Extended enforcement configuration for the Developer role.
 * The base RoleProfile (connector allowlist + allowed actions) lives in role-profiles/index.ts.
 * This module adds the enforcement-specific data that the role enforcer needs:
 *   - Explicit action blocklist (hard block — not just "not allowed", but actively forbidden)
 *   - Blocked keyword signals for semantic classification
 *   - Suggested-role map (feeds marketplace upsell when a task is declined)
 *   - Approval thresholds (high vs medium risk actions specific to the Developer role)
 */

import type { RoleKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Action-type hard blocklist
// ---------------------------------------------------------------------------
// Any task whose action_type exactly matches one of these values is immediately
// rejected before LLM classification, saving quota and ensuring zero leakage.
// Grouped by the role that SHOULD handle these actions.

export const DEVELOPER_BLOCKED_ACTIONS = new Set<string>([
    // Recruiter actions
    'create_job_posting',
    'post_job',
    'search_candidates',
    'schedule_interview',
    'send_candidate_email',
    'send_offer',
    'book_interview',
    'score_resume',
    // Sales actions
    'find_leads',
    'enrich_lead',
    'create_deal',
    'update_deal',
    'generate_proposal',
    'send_contract',
    'qualify_lead',
    'handle_objection',
    // Customer support actions
    'escalate_ticket',
    'close_ticket',
    'handle_refund',
    'chat_with_customer',
    // Marketing actions
    'create_campaign',
    'schedule_post',
    'publish_ad',
    'write_ad_copy',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic classification
// ---------------------------------------------------------------------------
// When the action_type is not in the hard blocklist, the task description is
// checked for these keywords. Any match triggers the soft-block path.

export const DEVELOPER_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    'job posting',
    'job description',
    'candidate',
    'interview',
    'hire someone',
    'recruitment',
    'applicant',
    'resume',
    'offer letter',
    'sales lead',
    'sales prospect',
    'crm deal',
    'sales proposal',
    'support ticket',
    'customer complaint',
    'refund request',
    'marketing campaign',
    'ad copy',
    'social media post',
    'email blast',
    'newsletter',
];

// ---------------------------------------------------------------------------
// Connector allowlist (mirrors role-profiles/index.ts for gating MCP tools)
// ---------------------------------------------------------------------------

export const DEVELOPER_CONNECTOR_ALLOWLIST: ReadonlyArray<string> = [
    'github',
    'gitlab',
    'bitbucket',
    'jira',
    'linear',
    'confluence',
    'slack',
    'azure_devops',
    'sonarqube',
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------
// These supplement the global HIGH_RISK_ACTIONS / MEDIUM_RISK_ACTIONS sets in
// the execution engine with developer-role–specific semantic signals.

export const DEVELOPER_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'run_pipeline',
        'deploy_production',
        'merge_pr',
        'delete_resource',
        'git_push',
        'change_permissions',
    ],
    medium: [
        'create_pr',
        'create_issue',
        'comment_issue',
        'code_edit',
        'git_commit',
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map
// ---------------------------------------------------------------------------
// When a task is declined, the enforcement result includes `suggestedRole` so
// the api-gateway can surface "Did you mean to hire a Recruiter?" on the dashboard.
// Each entry lists keyword signals (action_type fragments OR description keywords)
// that map to the correct role.

export const SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
    signals: ReadonlyArray<string>;
    suggestedRole: RoleKey;
}> = [
        {
            signals: [
                'create_job_posting',
                'post_job',
                'search_candidates',
                'schedule_interview',
                'send_candidate_email',
                'send_offer',
                'book_interview',
                'score_resume',
                'job posting',
                'job description',
                'candidate',
                'interview',
                'hire someone',
                'recruitment',
                'applicant',
                'resume',
                'offer letter',
            ],
            suggestedRole: 'recruiter',
        },
        {
            signals: [
                'find_leads',
                'enrich_lead',
                'create_deal',
                'update_deal',
                'generate_proposal',
                'send_contract',
                'qualify_lead',
                'handle_objection',
                'sales lead',
                'sales prospect',
                'crm deal',
                'sales proposal',
            ],
            suggestedRole: 'sales_rep',
        },
        {
            signals: [
                'escalate_ticket',
                'close_ticket',
                'handle_refund',
                'chat_with_customer',
                'support ticket',
                'customer complaint',
                'refund request',
            ],
            suggestedRole: 'customer_support_executive',
        },
        {
            signals: [
                'create_campaign',
                'schedule_post',
                'publish_ad',
                'write_ad_copy',
                'marketing campaign',
                'ad copy',
                'social media post',
                'email blast',
                'newsletter',
            ],
            suggestedRole: 'marketing_specialist',
        },
    ];
