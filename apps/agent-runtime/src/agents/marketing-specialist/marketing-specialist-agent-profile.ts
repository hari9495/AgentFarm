import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

export const MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS = [
    // Analytics
    'google_analytics',
    // Ad platforms
    'google_ads',
    'meta_ads',
    'linkedin_ads',
    // CRM & marketing automation
    'hubspot',
    'mailchimp',
    // SEO research
    'semrush',
    // Social media management
    'hootsuite',
    // Document platforms
    'google_drive',
    // Communication
    'slack',
    'microsoft_teams',
    // Email
    'gmail',
] as const;

export const MARKETING_SPECIALIST_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // Memory
    'workspace_memory_write',
    'workspace_memory_read',
    'workspace_memory_search',
    // File operations — read briefs and write reports/plans
    'code_read',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'workspace_diff',
    'workspace_search_docs',
    'workspace_package_lookup',
    // Git history — read product context from PR titles
    'git_log',
    // File write — produce campaign plans and reports on disk
    'workspace_write_file',
    // Browser actions — log into ad dashboards, CMS, analytics UIs when API not available
    'workspace_web_login',
    'workspace_web_navigate',
    'workspace_web_read_page',
    'workspace_web_fill_form',
    'workspace_web_click',
    'workspace_web_extract_data',
    // Web research — market research, competitor intel, trend scanning
    'workspace_web_search',
    // Meeting — join stakeholder calls, present campaign results
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    // Tier 46 — Marketing Specialist domain actions
    'workspace_ms_plan_campaign',
    'workspace_ms_monitor_campaign',
    'workspace_ms_optimize_ppc',
    'workspace_ms_segment_audience',
    'workspace_ms_analyze_competitor',
    'workspace_ms_keyword_research',
    'workspace_ms_build_email_sequence',
    'workspace_ms_schedule_social',
    'workspace_ms_generate_kpi_report',
    'workspace_ms_analyze_ab_test',
    'workspace_ms_market_research',
    'workspace_ms_optimize_conversion',
    'workspace_ms_coordinate_assets',
    'workspace_ms_align_cross_team',
    'workspace_ms_run_campaign_workflow',
    'workspace_ms_request_human_gate',
];

export const MARKETING_SPECIALIST_ROLE_BLOCKED_ACTIONS = [
    // Developer execution
    'merge_pr',
    'git_push',
    'git_commit',
    'run_tests',
    'run_linter',
    'run_pipeline',
    'deploy_production',
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_generate_test',
    'workspace_run_ci_checks',
    'workspace_security_test_report',
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
    // Calendar (Corporate Assistant territory)
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
] as const;

export const MARKETING_SPECIALIST_ROLE_PROFILE_ALIASES = new Set([
    'marketing_specialist',
    'marketingspecialist',
    'marketing specialist',
    'marketing manager',
    'growth marketer',
    'growth_marketer',
    'performance marketer',
    'performance_marketer',
    'digital marketer',
    'digital_marketer',
    'demand gen',
    'demand_gen',
    'demand generation',
    'demand_generation',
]);

export function isMarketingSpecialistRoleProfile(role: string): boolean {
    const normalized = role.toLowerCase().replace(/[\s-]+/g, '_');
    return MARKETING_SPECIALIST_ROLE_PROFILE_ALIASES.has(normalized) ||
        normalized === 'marketing_specialist';
}
