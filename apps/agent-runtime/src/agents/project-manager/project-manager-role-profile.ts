/**
 * Project Manager / Scrum Master Role Enforcement Profile
 *
 * Enforcement configuration for the PM/SM dual-persona role.
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

export const PROJECT_MANAGER_BLOCKED_ACTIONS = new Set<string>([
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
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_security_scan',
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
    'chat_with_customer',
    // Infrastructure class — PM does not manage deployments
    'deploy_production',
    'deploy_staging',
    'provision_vm',
    'scale_service',
    // Marketing class
    'create_campaign',
    'schedule_post',
    'publish_ad',
    'write_ad_copy',
]);

// ---------------------------------------------------------------------------
// Semantic keyword signals for heuristic classification
// ---------------------------------------------------------------------------

export const PROJECT_MANAGER_BLOCKED_KEYWORDS: ReadonlyArray<string> = [
    // Developer / engineering
    'pull request', 'merge request', 'code review', 'unit test',
    'integration test', 'deploy to production', 'ci/cd pipeline',
    'run build', 'fix bug in code', 'debug the code', 'write code',
    'code coverage', 'run tests', 'git push', 'git commit',
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
    // DevOps
    'provision vm', 'scale service', 'deploy to production',
    'kubernetes cluster', 'terraform apply', 'docker build',
];

// ---------------------------------------------------------------------------
// Connector allowlist
// ---------------------------------------------------------------------------

export const PROJECT_MANAGER_CONNECTOR_ALLOWLIST: ReadonlyArray<string> = [
    'jira',         // sprint management, backlog, epic tracking
    'linear',       // issue tracking, sprint cycles
    'asana',        // project and milestone tracking
    'trello',       // board-based kanban management
    'clickup',      // project management
    'confluence',   // project charters, status reports, retro notes
    'notion',       // documentation and knowledge base
    'slack',        // standup posts, blocker escalations, team comms
    'teams',        // stakeholder updates, meeting facilitation
    'outlook',      // stakeholder reporting, milestone notifications
    'gmail',        // stakeholder communication
];

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export const PROJECT_MANAGER_APPROVAL_THRESHOLDS: Readonly<{
    high: ReadonlyArray<string>;
    medium: ReadonlyArray<string>;
}> = {
    high: [
        'workspace_pm_project_charter',  // charter commits scope, budget, timeline to stakeholders
        'workspace_pm_budget_forecast',  // budget changes affect executive decisions
        'workspace_pm_change_request',   // formal scope or timeline change requiring sign-off
        'workspace_pm_milestone_plan',   // milestone commitments shared with stakeholders
    ],
    medium: [
        'workspace_pm_status_report',     // project health report sent to stakeholders
        'workspace_pm_risk_register',     // risk log update affects escalation routing
        'workspace_pm_sprint_plan',       // sprint commitment locks team capacity
        'workspace_pm_backlog_groom',     // groomed stories get estimated and prioritized
        'workspace_pm_velocity_report',   // velocity data informs executive forecasts
        'workspace_pm_retrospective',     // retro action items assigned to named individuals
        'workspace_pm_dependency_map',    // dependency changes affect delivery dates
    ],
} as const;

// ---------------------------------------------------------------------------
// Suggested-role map
// ---------------------------------------------------------------------------

export const PM_SUGGEST_ROLE_FOR_BLOCKED: ReadonlyArray<{
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
                'unit test', 'integration test', 'test coverage',
                'workspace_generate_test', 'write test cases',
            ],
            suggestedRole: 'tester',
        },
        {
            signals: [
                'brd', 'business requirements', 'gap analysis',
                'user story', 'acceptance criteria', 'stakeholder interview',
            ],
            suggestedRole: 'business_analyst',
        },
        {
            signals: [
                'write documentation', 'api docs', 'release notes',
                'style guide', 'technical documentation',
            ],
            suggestedRole: 'technical_writer',
        },
    ];
