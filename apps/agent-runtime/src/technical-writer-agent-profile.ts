import type { LocalWorkspaceActionType } from './local-workspace-executor.js';
import type { TechnicalWriterActionType } from './technical-writer-action-handler.js';

export const TECHNICAL_WRITER_ROLE_ALLOWED_CONNECTORS = [
    // Version control / code
    'github', 'gitlab',
    // Documentation platforms
    'confluence', 'google_drive',
    // Communication
    'slack',
] as const;

export const TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS: (LocalWorkspaceActionType | TechnicalWriterActionType)[] = [
    // Memory — persist and recall doc context
    'workspace_memory_write',
    'workspace_memory_read',
    'workspace_memory_search',
    // Code reading (to inspect diffs and extract JSDoc)
    'code_read',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'workspace_diff',
    'workspace_diff_preview',
    'workspace_find_references',
    'workspace_go_to_definition',
    'workspace_hover_type',
    'workspace_analyze_imports',
    'workspace_outline_symbols',
    'workspace_explain_code',
    'workspace_search_docs',
    'workspace_package_lookup',
    'git_log',
    // Documentation authoring (Tier 26)
    'workspace_tw_doc_diff',
    'workspace_tw_api_doc_openapi',
    'workspace_tw_api_doc_code',
    'workspace_tw_release_notes',
    'workspace_tw_style_check',
    'workspace_tw_standup_report',
    // PR creation (existing action type — TW creates doc PRs)
    'workspace_create_pr',
    // File write (Tier 27 — produce documentation files on disk)
    'workspace_write_file',
    // Sprint doc + all extended TW actions (Sprint 16)
    'workspace_tw_sme_interview',
    'workspace_tw_sprint_doc',
    'workspace_tw_manual',
    'workspace_tw_faq',
    'workspace_tw_tutorial',
    'workspace_tw_onboarding',
    'workspace_tw_whitepaper',
    'workspace_tw_endpoint_verify',
    'workspace_tw_audience_rewrite',
    'workspace_tw_feedback_analysis',
    'workspace_tw_nav_audit',
    'workspace_tw_localization',
    'workspace_tw_doc_audit',
    // Browser/UI discovery actions — closes product-knowledge + self-direction gaps
    'workspace_tw_product_crawl',
    'workspace_tw_screenshot_doc',
    'workspace_tw_doc_gap_scan',
];

export const TECHNICAL_WRITER_ROLE_BLOCKED_ACTIONS = [
    // Developer execution hard blocks
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
    // Recruiter class
    'search_candidates',
    'post_job',
    'score_resume',
    'send_offer',
    'book_interview',
    // Sales class
    'find_leads',
    'enrich_lead',
    'create_deal',
    'qualify_lead',
    'generate_proposal',
    'send_contract',
    // Customer support class
    'close_ticket',
    'handle_refund',
    'escalate_ticket',
    'chat_with_customer',
    // Marketing class
    'create_campaign',
    'schedule_post',
    'publish_ad',
    // Calendar / email (CA territory)
    'schedule_meeting',
    'send_email',
    'workspace_ca_email_compose',
    'workspace_ca_email_send',
    'workspace_ca_calendar_schedule',
] as const;

export const TECHNICAL_WRITER_ROLE_PROFILE_ALIASES = new Set([
    'technical_writer',
    'tech_writer',
    'tw',
]);

export function isTechnicalWriterRoleProfile(roleKey: string): boolean {
    return TECHNICAL_WRITER_ROLE_PROFILE_ALIASES.has(roleKey.toLowerCase());
}
