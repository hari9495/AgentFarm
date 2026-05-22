import type { LocalWorkspaceActionType } from './local-workspace-executor.js';

export const CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS = [
    // Email
    'gmail', 'outlook', 'smtp',
    // Calendar
    'google_calendar', 'outlook_calendar',
    // Communication
    'teams', 'slack',
    // Documents
    'google_drive', 'confluence',
    // Meeting platforms
    'google_meet', 'microsoft_teams', 'zoom',
] as const;

export const CORPORATE_ASSISTANT_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // Memory — persist and recall task context
    'workspace_memory_write',
    'workspace_memory_read',
    'workspace_memory_search',
    // Meetings / standup
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_standup_report',
    // Email (Tier 25)
    'workspace_ca_email_compose',
    'workspace_ca_email_send',
    'workspace_ca_email_classify',
    // Calendar (Tier 25)
    'workspace_ca_calendar_check',
    'workspace_ca_calendar_schedule',
    'workspace_ca_calendar_cancel',
    // Documents (Tier 25)
    'workspace_ca_document_create',
    'workspace_ca_document_update',
    // Escalation (Tier 25)
    'workspace_ca_escalate',
    'workspace_ca_message_send',
];

export const CORPORATE_ASSISTANT_ROLE_BLOCKED_ACTIONS = [
    // Developer-class hard blocks
    'create_pr',
    'merge_pr',
    'git_push',
    'git_commit',
    'run_tests',
    'run_linter',
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'deploy_production',
    'run_pipeline',
    'workspace_security_scan',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    // Recruiter-class hard blocks
    'search_candidates',
    'post_job',
    'score_resume',
    'send_offer',
    'book_interview',
    // Sales-class hard blocks
    'find_leads',
    'enrich_lead',
    'create_deal',
    'qualify_lead',
    'send_contract',
] as const;

export const CORPORATE_ASSISTANT_ROLE_HIGH_RISK_ACTIONS = [
    'send_email_external',
    'schedule_meeting_external',
    'share_document_external',
] as const;

export const CORPORATE_ASSISTANT_ROLE_PROFILE_ALIASES = new Set([
    'corporate_assistant',
    'corporate_assistant_agent',
    'executive_assistant',
    'office_assistant',
    'internal_assistant',
]);

export const isCorporateAssistantRoleProfile = (profile: string): boolean => {
    const normalized = profile.trim().toLowerCase().replace(/[\s/]+/g, '_');
    return CORPORATE_ASSISTANT_ROLE_PROFILE_ALIASES.has(normalized);
};
