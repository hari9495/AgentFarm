import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

export const RECRUITER_ROLE_ALLOWED_CONNECTORS = [
    // Job boards & talent platforms
    'linkedin',
    'linkedin_recruiter',
    'indeed',
    'glassdoor',
    // Prospecting / enrichment
    'apollo',
    'hunter',
    // ATS platforms
    'greenhouse',
    'lever',
    'workday',
    'ashby',
    'icims',
    // Communication
    'gmail',
    'outlook',
    'slack',
    'microsoft_teams',
    // Calendar / scheduling
    'google_calendar',
    'calendly',
    'cal_com',
    // Document platforms
    'google_drive',
    // E-signature
    'docusign',
    'zoho_sign',
    // CRM (for candidate relationship management)
    'hubspot',
    'salesforce',
] as const;

export type RecruiterConnector = (typeof RECRUITER_ROLE_ALLOWED_CONNECTORS)[number];

export const RECRUITER_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── Working memory: persist candidate notes and pipeline context ───────
    'workspace_memory_read',
    'workspace_memory_write',
    'workspace_memory_search',
    // ── Research & knowledge ───────────────────────────────────────────────
    'workspace_search_docs',
    'workspace_semantic_search',
    'workspace_list_files',
    'workspace_grep',
    // ── File write — produce JDs, offer letters, reports ──────────────────
    'workspace_write_file',
    // ── Web research — market intel, competitor benchmarking ──────────────
    'workspace_web_search',
    // ── Browser automation for ATS and LinkedIn ───────────────────────────
    'workspace_browser_open',
    'workspace_app_launch',
    'workspace_web_login',
    'workspace_web_navigate',
    'workspace_web_read_page',
    'workspace_web_fill_form',
    'workspace_web_click',
    'workspace_web_extract_data',
    // ── Meetings — phone screens, panel debriefs ───────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    // ── Generic visual desktop loop ───────────────────────────────────────
    'workspace_visual_task',
    // ── Audit / approval ──────────────────────────────────────────────────
    'workspace_audit_export',
    'workspace_approval_status',
    'workspace_policy_preflight',
    // ── Connector health ─────────────────────────────────────────────────
    'workspace_connector_test',
    // ── Tier 47 — Recruiter domain actions (12 original) ─────────────────
    'workspace_rec_build_jd',
    'workspace_rec_post_job',
    'workspace_rec_source_candidates',
    'workspace_rec_screen_resume',
    'workspace_rec_send_outreach',
    'workspace_rec_schedule_interview',
    'workspace_rec_conduct_phone_screen',
    'workspace_rec_gather_feedback',
    'workspace_rec_manage_pipeline',
    'workspace_rec_generate_offer',
    'workspace_rec_market_intelligence',
    'workspace_rec_request_human_gate',
    // ── Tier 47 — Recruiter domain actions (9 gap-remediation additions) ──
    'workspace_rec_check_bgc',           // FCRA-compliant background check initiation
    'workspace_rec_compose_rejection',   // EEOC-safe rejection email by pipeline stage
    'workspace_rec_negotiate_offer',     // Counter-offer evaluation and verbal scripts
    'workspace_rec_scan_jd_bias',        // DEI / inclusive language scan on job description
    'workspace_rec_validate_credentials',// Domain credential checker (RN, JD, CPA, PE, etc.)
    'workspace_rec_run_reference_check', // Reference questionnaire and debrief summary
    'workspace_rec_manage_talent_pool',  // Silver-medal CRM, nurture sequences, re-engagement
    'workspace_rec_approve_requisition', // Multi-level headcount / budget approval workflow
    'workspace_rec_onboarding_handoff',  // Post-offer Day-1 checklist and welcome sequence
];

export const RECRUITER_ROLE_BLOCKED_ACTIONS = [
    // Engineering execution — not recruiter territory
    'run_shell_command',
    'code_edit',
    'code_edit_patch',
    'merge_pr',
    'git_push',
    'git_commit',
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'workspace_bulk_refactor',
    'workspace_subagent_spawn',
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
    // Sales-only actions
    'workspace_icp_score',
    'workspace_deal_close',
    'workspace_proposal_generate',
    'workspace_negotiation_offer',
    'workspace_contract_send',
    'workspace_objection_rebuttal',
    // Marketing-only actions
    'workspace_ms_plan_campaign',
    'workspace_ms_optimize_ppc',
    'workspace_ms_segment_audience',
] as const;

export const RECRUITER_ROLE_HIGH_RISK_ACTIONS = [
    'workspace_rec_generate_offer',         // binding employment offer
    'workspace_rec_post_job',               // public job posting
    'workspace_meeting_interview_live',     // live interview with candidate
    'workspace_web_fill_form',              // form submission on external ATS/board
    'workspace_rec_check_bgc',             // background check — FCRA-regulated action
    'workspace_rec_approve_requisition',   // triggers multi-level spend approval
] as const;

export const RECRUITER_ROLE_PROFILE_ALIASES = new Set([
    'recruiter',
    'talent_acquisition',
    'talent acquisition',
    'talent_acquisition_specialist',
    'ta_specialist',
    'sourcer',
    'technical_recruiter',
    'technical recruiter',
    'hr_recruiter',
    'hr recruiter',
    'recruitment_specialist',
    'recruitment specialist',
    'hiring_manager_support',
    'talent_partner',
]);

export const normalizeRecruiterRoleAlias = (profile: string): string =>
    profile.trim().toLowerCase().replace(/[\s/-]+/g, '_');

export const isRecruiterRoleProfile = (profile: string): boolean =>
    RECRUITER_ROLE_PROFILE_ALIASES.has(normalizeRecruiterRoleAlias(profile));
