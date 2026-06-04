// ============================================================================
// TASK MEMORY PROFILE — Phase 2 of FluxMem adaptive retrieval
//
// Every AgentFarm action type maps to one of four memory profiles that control
// which of the three RAG retrieval paths to run:
//
//   document      → all 3 paths (prior work + templates + lessons)
//   analytical    → prior work + lessons (skip templates; analysis doesn't need them)
//   sequential    → prior work (topK=2) + lessons (skip templates; follow-ups are quick)
//   conversational→ lessons only (skip everything; real-time responses need minimal context)
//
// Impact:
//   - conversational saves ~2 HTTP round-trips per real-time interaction
//   - analytical skips compliance/template fetches that add noise to investigation prompts
//   - sequential reduces topK, keeping prompt context tight for standup/email tasks
//
// Usage in action handlers:
//   const memConfig = deriveMemoryConfig(actionType);
//   const ragCtx = await buildBaRagContext(ragQuery, url, token, wsId, memConfig);
// ============================================================================

export type TaskMemoryProfile = 'document' | 'analytical' | 'sequential' | 'conversational';

export interface MemoryRetrievalConfig {
    usePriorWork: boolean;
    useTemplates: boolean;
    useLessons: boolean;
    /** Override topK for path 1 (prior work). Defaults to each retriever's own topK. */
    priorWorkTopK?: number;
}

// ---------------------------------------------------------------------------
// Profile → config mapping
// ---------------------------------------------------------------------------

const PROFILE_CONFIGS: Record<TaskMemoryProfile, MemoryRetrievalConfig> = {
    document:      { usePriorWork: true,  useTemplates: true,  useLessons: true                },
    analytical:    { usePriorWork: true,  useTemplates: false, useLessons: true                },
    sequential:    { usePriorWork: true,  useTemplates: false, useLessons: true,  priorWorkTopK: 2 },
    conversational:{ usePriorWork: false, useTemplates: false, useLessons: true                },
};

// ---------------------------------------------------------------------------
// Action type → profile override map
// (only list actions whose profile can't be reliably inferred by the heuristic)
// ---------------------------------------------------------------------------

const ACTION_PROFILE_OVERRIDES: Record<string, TaskMemoryProfile> = {
    // BA — document drafting
    'workspace_ba_draft_brd':                        'document',
    'workspace_ba_draft_user_story':                 'document',
    'workspace_ba_finalize_brd':                     'document',
    'workspace_ba_finalize_acceptance_criteria':     'document',
    'workspace_ba_process_map':                      'document',
    'workspace_ba_uat_checklist':                    'document',
    // BA — analysis
    'workspace_ba_gap_analysis':                     'analytical',
    'workspace_ba_impact_analysis':                  'analytical',
    'workspace_ba_solution_eval':                    'analytical',
    'workspace_ba_rtm_generate':                     'analytical',
    'workspace_ba_proactive_ac_check':               'analytical',
    'workspace_ba_proactive_epic_check':             'analytical',
    'workspace_ba_proactive_conflict_scan':          'analytical',
    // BA — sequential
    'workspace_ba_elicit_requirements':              'sequential',
    'workspace_ba_stakeholder_update':               'sequential',
    'share_spec_external':                           'sequential',

    // PM — document
    'workspace_pm_project_charter':                  'document',
    'workspace_pm_status_report':                    'document',
    'workspace_pm_risk_register':                    'document',
    'workspace_pm_change_request':                   'document',
    'workspace_pm_milestone_plan':                   'document',
    'workspace_pm_sprint_plan':                      'document',
    'workspace_pm_retrospective':                    'document',
    'workspace_pm_ceremony_agenda':                  'sequential',
    // PM — analytical
    'workspace_pm_dependency_map':                   'analytical',
    'workspace_pm_budget_forecast':                  'analytical',
    'workspace_pm_backlog_groom':                    'analytical',
    'workspace_pm_velocity_report':                  'analytical',
    'workspace_pm_proactive_blocker_scan':           'analytical',
    'workspace_pm_proactive_scope_drift':            'analytical',
    'workspace_pm_delivery_forecast':                'analytical',
    'workspace_pm_sprint_health_check':              'analytical',
    // PM — sequential
    'workspace_pm_standup_summary':                  'sequential',
    'workspace_pm_impediment_log':                   'sequential',
    'workspace_pm_schedule_standup':                 'sequential',
    'workspace_pm_handoff_to_developer':             'sequential',
    'workspace_pm_handoff_to_tester':                'sequential',
    'workspace_pm_check_handoff_status':             'sequential',
    'workspace_pm_board_sync':                       'sequential',

    // Sales — analytical
    'workspace_prospect_research':                   'analytical',
    'workspace_icp_score':                           'analytical',
    'workspace_pre_meeting_research':                'analytical',
    'workspace_market_research':                     'analytical',
    // Sales — document
    'workspace_sequence_create':                     'document',
    'workspace_contract_send':                       'document',
    'workspace_deal_close':                          'document',
    'workspace_demo_script_generate':                'document',
    'workspace_slide_deck_generate':                 'document',
    // Sales — sequential
    'workspace_email_personalize':                   'sequential',
    'workspace_outreach_send':                       'sequential',
    'workspace_booking_invite':                      'sequential',
    'workspace_referral_log':                        'sequential',
    'workspace_referral_request':                    'sequential',
    'workspace_linkedin_outreach':                   'sequential',
    'workspace_demo_followup':                       'sequential',
    // Sales — conversational
    'workspace_reply_classify':                      'conversational',
    'workspace_cold_call':                           'conversational',
    'workspace_demo_present':                        'conversational',

    // Developer — document
    'workspace_dev_implement_feature':               'document',
    'workspace_dev_tech_spec':                       'document',
    'workspace_dev_api_design':                      'document',
    'workspace_dev_db_migration':                    'document',
    'workspace_dev_create_pr':                       'document',
    // Developer — analytical
    'workspace_dev_fix_bug':                         'analytical',
    'workspace_dev_code_review':                     'analytical',
    'workspace_dev_debug_session':                   'analytical',
    'workspace_dev_performance_audit':               'analytical',
    'workspace_dev_security_audit':                  'analytical',
    'workspace_dev_dependency_audit':                'analytical',
    'workspace_dev_code_quality':                    'analytical',
    'workspace_dev_onboard_codebase':                'analytical',
    'workspace_dev_incident_response':               'analytical',
    'workspace_dev_refactor':                        'analytical',
    'workspace_dev_write_tests':                     'analytical',
    // Developer — sequential
    'workspace_dev_standup_report':                  'sequential',
    'workspace_dev_commit':                          'sequential',
    'workspace_dev_branch_manage':                   'sequential',
    'workspace_dev_handle_issue':                    'sequential',

    // DevOps — analytical (most actions are investigative)
    'workspace_devops_debug_session':                'analytical',
    'workspace_devops_deploy_verify':                'analytical',
    'workspace_devops_compliance_scan':              'analytical',
    'workspace_devops_cost_estimate':                'analytical',
    'workspace_devops_dora_metrics':                 'analytical',
    'workspace_devops_chaos':                        'analytical',
    'workspace_devops_canary':                       'analytical',
    'workspace_devops_blue_green':                   'analytical',
    // DevOps — sequential
    'workspace_devops_alert_rule':                   'sequential',
    'workspace_devops_dns':                          'sequential',
    'workspace_devops_cert_renew':                   'sequential',
    'workspace_devops_db_admin':                     'sequential',

    // Content Writer — document
    'workspace_cw_write_prose':                      'document',
    'workspace_cw_revision_apply':                   'document',
    'workspace_cw_localize_content':                 'document',
    // Content Writer — analytical
    'workspace_cw_research_topic':                   'analytical',
    'workspace_cw_seo_optimize':                     'analytical',
    'workspace_cw_review_prose':                     'analytical',
    'workspace_cw_fact_check':                       'analytical',
    'workspace_cw_verify_facts':                     'analytical',
    'workspace_cw_detect_plagiarism':                'analytical',
    'workspace_cw_analytics_report':                 'analytical',
    // Content Writer — sequential
    'workspace_cw_adapt_tone':                       'sequential',
    'workspace_cw_schedule_content':                 'sequential',
    'workspace_cw_scheduled_publish':                'sequential',
    'workspace_cw_send_for_review':                  'sequential',
    'workspace_cw_promote_draft':                    'sequential',
    'workspace_cw_publish_cms':                      'sequential',
    'workspace_cw_run_workflow':                     'sequential',
    'workspace_cw_brand_voice_learn':                'sequential',

    // Technical Writer — document (almost all TW actions produce documents)
    // default 'document' from heuristic is correct for most TW actions

    // Recruiter — document
    // default 'document' for JD, offer, onboarding
    // analytical for screening, interview scoring

    // Marketing — document
    // default 'document' for campaign, content, reports
    // sequential for social posts, email blasts
    'workspace_ms_email_campaign':                   'document',
    'workspace_ms_social_post':                      'sequential',
    'workspace_ms_ad_copy':                          'document',
    'workspace_ms_content_calendar':                 'document',
    'workspace_ms_brand_guidelines':                 'document',
    'workspace_ms_campaign_brief':                   'document',
    'workspace_ms_analytics_report':                 'analytical',
    'workspace_ms_competitor_analysis':              'analytical',
    'workspace_ms_ab_test_setup':                    'analytical',
    'workspace_ms_kpi_report':                       'analytical',

    // FSD — document vs analytical
    'workspace_fsd_ui_component':                    'document',
    'workspace_fsd_api_endpoint':                    'document',
    'workspace_fsd_database_schema':                 'document',
    'workspace_fsd_architecture_decision':           'document',
    'workspace_fsd_code_review':                     'analytical',
    'workspace_fsd_performance_audit':               'analytical',
    'workspace_fsd_accessibility_audit':             'analytical',
    'workspace_fsd_standup_report':                  'sequential',

    // Mobile — document vs analytical
    'workspace_mobile_component':                    'document',
    'workspace_mobile_screen':                       'document',
    'workspace_mobile_navigation':                   'document',
    'workspace_mobile_api_integration':              'analytical',
    'workspace_mobile_performance_audit':            'analytical',
    'workspace_mobile_accessibility_audit':          'analytical',
    'workspace_mobile_test_plan':                    'analytical',

    // Tester — analytical (most testing tasks are investigative)
    'workspace_tester_test_plan':                    'document',
    'workspace_tester_test_cases':                   'document',
    'workspace_tester_test_report':                  'document',
    'workspace_tester_bug_report':                   'analytical',
    'workspace_tester_regression_suite':             'analytical',
    'workspace_tester_coverage_analysis':            'analytical',
    'workspace_tester_performance_test':             'analytical',
    'workspace_tester_security_test':                'analytical',
    'workspace_tester_standup_report':               'sequential',

    // Corporate Assistant — conversational for most, document for formal outputs
    'workspace_ca_email_compose':                    'sequential',
    'workspace_ca_document_create':                  'document',
    'workspace_ca_document_update':                  'document',
    'workspace_ca_email_classify':                   'conversational',
    'workspace_ca_message_send':                     'conversational',
    'workspace_ca_standup_report':                   'sequential',
    'workspace_ca_calendar_schedule':                'sequential',
    'workspace_ca_calendar_check':                   'conversational',
    'workspace_ca_calendar_cancel':                  'sequential',
    'workspace_ca_escalate':                         'sequential',

    // Customer Support — conversational + analytical
    'workspace_cse_reply_compose':                   'conversational',
    'workspace_cse_reply_send':                      'conversational',
    'workspace_cse_reply_followup':                  'sequential',
    'workspace_cse_live_chat_handle':                'conversational',
    'workspace_cse_voice_call_handle':               'conversational',
    'workspace_cse_issue_diagnose':                  'analytical',
    'workspace_cse_trend_analysis':                  'analytical',
    'workspace_cse_kpi_report':                      'analytical',
    'workspace_cse_case_document':                   'document',
    'workspace_cse_kb_create_article':               'document',
    'workspace_cse_refund_process':                  'sequential',
    'workspace_cse_order_modify':                    'sequential',
    'workspace_cse_ticket_open':                     'sequential',
    'workspace_cse_ticket_update':                   'sequential',
    'workspace_cse_ticket_close':                    'sequential',
    'workspace_cse_ticket_assign':                   'sequential',
    'workspace_cse_ticket_merge':                    'sequential',
    'workspace_cse_escalate':                        'sequential',
    'workspace_cse_deescalate':                      'conversational',
    'workspace_cse_standup_report':                  'sequential',
    'workspace_cse_sla_check':                       'analytical',
    'workspace_cse_crm_update':                      'sequential',

    // Meeting Agent — conversational (live meeting context)
    'workspace_meeting_join':                        'conversational',
    'workspace_meeting_speak':                       'conversational',
    'workspace_meeting_transcribe':                  'conversational',
    'workspace_meeting_summarize':                   'analytical',
    'workspace_meeting_action_items':                'sequential',
};

// ---------------------------------------------------------------------------
// Heuristic fallback — infer profile from action type string patterns
// ---------------------------------------------------------------------------

function inferProfileFromPattern(actionType: string): TaskMemoryProfile {
    const at = actionType.toLowerCase();

    if (/standup|follow.?up|update|notify|schedule|handoff|hand_off|send|reply|message|email|invite|commit|publish|post/.test(at)) {
        return 'sequential';
    }
    if (/live.?chat|voice|call|classify|deescalate/.test(at)) {
        return 'conversational';
    }
    if (/research|analysis|analyse|scan|audit|review|debug|monitor|forecast|health|score|velocity|coverage|diagnos|metric/.test(at)) {
        return 'analytical';
    }
    return 'document';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the MemoryRetrievalConfig for a given action type.
 *
 * First checks the explicit override map; falls back to a regex heuristic;
 * defaults to 'document' (all 3 paths) when neither matches.
 *
 * Returns a stable config object — safe to pass directly to build*RagContext.
 */
export function deriveMemoryConfig(actionType: string): MemoryRetrievalConfig {
    const profile =
        ACTION_PROFILE_OVERRIDES[actionType] ??
        inferProfileFromPattern(actionType);
    return PROFILE_CONFIGS[profile];
}

export { PROFILE_CONFIGS };
