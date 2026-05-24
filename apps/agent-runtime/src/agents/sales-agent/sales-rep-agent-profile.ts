import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

// ---------------------------------------------------------------------------
// Sales Rep Role Profile
// Sprint 19 — Sales Rep vertical (2026-05-21)
//
// Defines the connector allowlist, local action allowlist, blocked actions,
// and role-profile alias resolution for the Sales Representative agent role.
//
// Connector strategy:
//   - CRM: HubSpot, Salesforce (update deals, log activities, create contacts)
//   - Prospecting: Apollo, Hunter (lead enrichment, email finding)
//   - Communication: email, Teams, Slack (outreach, internal notifications)
//   - Pipeline tracking: Jira, Linear (opportunity pipeline as board items)
//   - Meetings: Zoom, Google Meet, Microsoft Teams (call scheduling + joining)
// ---------------------------------------------------------------------------

export const SALES_REP_ROLE_ALLOWED_CONNECTORS = [
    // CRM platforms
    'hubspot',
    'salesforce',
    // Prospecting / enrichment
    'apollo',
    'hunter',
    'linkedin',
    // Communication
    'email',
    'teams',
    'slack',
    // Pipeline tracking
    'jira',
    'linear',
    // Meeting platforms
    'zoom',
    'google_meet',
    'microsoft_teams',
    // Calendar
    'calendar',
] as const;

export type SalesRepConnector = (typeof SALES_REP_ROLE_ALLOWED_CONNECTORS)[number];

export const SALES_REP_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── Working memory: persist contact notes and deal context ─────────────
    'workspace_memory_read',
    'workspace_memory_write',
    'workspace_memory_search',
    // ── Research & knowledge ─────────────────────────────────────────────
    'workspace_search_docs',
    'workspace_semantic_search',
    'workspace_list_files',
    'workspace_grep',
    // ── Desktop / browser automation for CRM + LinkedIn ──────────────────
    'workspace_browser_open',
    'workspace_app_launch',
    'workspace_web_login',
    'workspace_web_navigate',
    'workspace_web_read_page',
    'workspace_web_fill_form',
    'workspace_web_click',
    'workspace_web_extract_data',
    // ── Meetings and calls ────────────────────────────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    // ── Generic visual desktop loop ───────────────────────────────────────
    'workspace_visual_task',
    // ── Audit / policy ────────────────────────────────────────────────────
    'workspace_audit_export',
    'workspace_approval_status',
    'workspace_policy_preflight',
    // ── Connector testing (validate MCP health before outreach) ──────────
    'workspace_connector_test',
    // ── Sales Rep domain actions (Tier 24) ────────────────────────────────
    'workspace_prospect_research',
    'workspace_icp_score',
    'workspace_email_personalize',
    'workspace_outreach_send',
    'workspace_sequence_create',
    'workspace_reply_classify',
    'workspace_pre_meeting_research',
    'workspace_booking_invite',
    'workspace_contract_send',
    'workspace_deal_close',
    // ── Lead generation expansion (Sprint 20) ────────────────────────────
    'workspace_referral_log',
    'workspace_referral_request',
    'workspace_linkedin_outreach',
    'workspace_cold_call',
    'workspace_market_research',
];

export const SALES_REP_ROLE_BLOCKED_ACTIONS = [
    'run_shell_command',
    'code_edit',
    'code_edit_patch',
    'workspace_bulk_refactor',
    'workspace_subagent_spawn',
    'merge_pr',
    'deploy_production',
    'delete_resource',
    'change_permissions',
    'apply_patch',
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
] as const;

export const SALES_REP_ROLE_HIGH_RISK_ACTIONS = [
    'workspace_web_fill_form',  // form submission on behalf of company
    'workspace_meeting_interview_live',  // live customer call
] as const;

export const SALES_REP_ROLE_PROFILE_ALIASES = new Set([
    'sales_rep',
    'sales_representative',
    'sales',
    'account_executive',
    'ae',
    'business_development_representative',
    'bdr',
    'sales_development_representative',
    'sdr',
    'inside_sales',
    'account_manager',
]);

export const normalizeRoleProfileAlias = (profile: string): string => {
    return profile.trim().toLowerCase().replace(/[\s/]+/g, '_');
};

export const isSalesRepRoleProfile = (profile: string): boolean => {
    return SALES_REP_ROLE_PROFILE_ALIASES.has(normalizeRoleProfileAlias(profile));
};
