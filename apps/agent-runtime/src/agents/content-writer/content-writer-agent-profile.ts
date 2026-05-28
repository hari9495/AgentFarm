import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

export const CONTENT_WRITER_ROLE_ALLOWED_CONNECTORS = [
    // Document platforms
    'google_drive',
    // Communication
    'slack',
    'microsoft_teams',
    // Email
    'gmail',
    // CMS platforms
    'wordpress',
    'contentful',
    'hubspot_cms',
    // Calendar
    'google_calendar',
    // Analytics
    'google_analytics',
] as const;

export const CONTENT_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // Memory — persist and recall content context
    'workspace_memory_write',
    'workspace_memory_read',
    'workspace_memory_search',
    // File operations — read briefs and produce draft files
    'code_read',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'workspace_diff',
    'workspace_search_docs',
    'workspace_package_lookup',
    // Git history — read recent PR titles for context
    'git_log',
    // File write — produce draft files on disk
    'workspace_write_file',
    // PR creation — route finished drafts to editors
    'workspace_create_pr',
    // Tier 28 — Content Writer domain actions
    'workspace_cw_research_topic',
    'workspace_cw_write_prose',
    'workspace_cw_seo_optimize',
    'workspace_cw_publish_cms',
    'workspace_cw_promote_draft',
    'workspace_cw_scheduled_publish',
    'workspace_cw_adapt_tone',
    'workspace_cw_source_images',
    'workspace_cw_schedule_content',
    'workspace_cw_fact_check',
    'workspace_cw_revision_apply',
    'workspace_cw_brand_voice_learn',
    'workspace_cw_verify_facts',
    'workspace_cw_review_prose',
    'workspace_cw_detect_plagiarism',
    'workspace_cw_clarify_brief',
    'workspace_cw_localize_content',
    'workspace_cw_analytics_report',
    'workspace_cw_send_for_review',
    'workspace_cw_run_workflow',
    'workspace_cw_request_human_gate',
    // ── Standup / live meetings (shared) ─────────────────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
];

export const CONTENT_WRITER_ROLE_BLOCKED_ACTIONS = [
    // Developer execution hard blocks
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
    'workspace_fix_test_failures',
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
    // Tester class
    'workspace_generate_test',
    'workspace_run_ci_checks',
    'workspace_security_test_report',
    // Calendar / scheduling (Corporate Assistant territory)
    'schedule_meeting',
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
] as const;

export const CONTENT_WRITER_ROLE_PROFILE_ALIASES = new Set([
    'content_writer',
    'contentwriter',
    'content writer',
    'blog writer',
    'copywriter',
    'copy writer',
    'marketing writer',
]);

/**
 * Returns true when the provided role string maps to the content_writer role.
 * Case-insensitive and tolerant of spaces/hyphens.
 */
export function isContentWriterRoleProfile(role: string): boolean {
    const normalized = role.toLowerCase().replace(/[\s-]+/g, '_');
    return CONTENT_WRITER_ROLE_PROFILE_ALIASES.has(normalized) ||
        normalized === 'content_writer';
}
