import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

export const CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_CONNECTORS = [
    // Helpdesk / ticketing
    'zendesk', 'intercom', 'freshdesk', 'freshservice', 'servicenow', 'happyfox',
    // CRM
    'salesforce', 'hubspot', 'zoho_crm', 'microsoft_dynamics',
    // Email
    'gmail', 'outlook', 'exchange', 'generic_smtp', 'generic_rest_email',
    // Messaging
    'slack', 'microsoft_teams', 'discord', 'google_chat', 'generic_rest_messaging',
    // Commerce / billing
    'stripe', 'braintree', 'shopify', 'woocommerce', 'magento', 'razorpay',
    // Issue tracking (for escalated bugs)
    'jira', 'linear', 'asana', 'trello', 'clickup',
    // Knowledge base / docs
    'confluence', 'notion', 'google_drive',
    // Survey
    'surveymonkey', 'typeform',
    // Voice STT/TTS
    'sarvam_ai', 'deepgram',
    // Telephony
    'twilio', 'vonage', 'amazon_connect', 'genesys', 'generic_telephony',
] as const;

export const CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── Ticket lifecycle ──────────────────────────────────────────────────────
    'workspace_cse_ticket_open',
    'workspace_cse_ticket_update',
    'workspace_cse_ticket_close',
    'workspace_cse_ticket_merge',
    'workspace_cse_ticket_assign',
    // ── Customer communication ────────────────────────────────────────────────
    'workspace_cse_reply_compose',
    'workspace_cse_reply_send',
    'workspace_cse_reply_followup',
    'workspace_cse_outbound_call_log',
    // ── Knowledge base & diagnostics ─────────────────────────────────────────
    'workspace_cse_kb_search',
    'workspace_cse_kb_create_article',
    'workspace_cse_issue_diagnose',
    // ── Escalation ────────────────────────────────────────────────────────────
    'workspace_cse_escalate',
    'workspace_cse_deescalate',
    // ── Refunds & order management ───────────────────────────────────────────
    'workspace_cse_refund_process',
    'workspace_cse_order_modify',
    // ── Surveys ───────────────────────────────────────────────────────────────
    'workspace_cse_csat_send',
    'workspace_cse_nps_send',
    // ── CRM & case documentation ──────────────────────────────────────────────
    'workspace_cse_crm_update',
    'workspace_cse_case_document',
    // ── Analytics & reporting ─────────────────────────────────────────────────
    'workspace_cse_kpi_report',
    'workspace_cse_trend_analysis',
    'workspace_cse_standup_report',
    // ── Multi-channel operations ──────────────────────────────────────────────
    'workspace_cse_live_chat_handle',
    'workspace_cse_sla_check',
    // ── Voice (Sarvam AI STT/TTS) ─────────────────────────────────────────────
    'workspace_cse_voice_call_handle',
    'workspace_cse_voice_transcribe',
    // ── Standup / live meetings (shared) ─────────────────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
];
