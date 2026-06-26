/**
 * role-baseline-blocks.ts — read-only snapshot of each role's BUILT-IN hard-block
 * action list (Phase 2 RBAC defaults), for display in the dashboard policy editor
 * so operators can see what is already blocked before adding customer rules.
 *
 * SOURCE OF TRUTH is agent-runtime's `role-action-registry.ts`
 * (`BLOCKED_ACTIONS_BY_ROLE`). This snapshot is kept in sync by a drift test in
 * agent-runtime (`role-baseline-blocks-drift.test.ts`) which fails if the registry
 * changes without updating this file. Customer policy can only TIGHTEN on top of
 * these — never remove them.
 */

export const BASELINE_BLOCKED_ACTIONS_BY_ROLE: Record<string, string[]> = {
    recruiter: [
        'code_edit', 'code_edit_patch', 'deploy_production', 'git_commit', 'git_push', 'merge_pr',
        'run_linter', 'run_pipeline', 'run_shell_command', 'run_tests', 'workspace_autonomous_plan_execute',
        'workspace_bulk_refactor', 'workspace_contract_send', 'workspace_deal_close', 'workspace_github_issue_fix',
        'workspace_icp_score', 'workspace_ms_optimize_ppc', 'workspace_ms_plan_campaign', 'workspace_ms_segment_audience',
        'workspace_negotiation_offer', 'workspace_objection_rebuttal', 'workspace_proposal_generate', 'workspace_subagent_spawn',
    ],
    developer: [
        'book_interview', 'change_permissions', 'chat_with_customer', 'close_ticket', 'create_campaign', 'create_deal',
        'create_job_posting', 'delete_resource', 'deploy_production', 'enrich_lead', 'escalate_ticket', 'find_leads',
        'generate_proposal', 'handle_objection', 'handle_refund', 'merge_pr', 'post_job', 'publish_ad', 'qualify_lead',
        'run_shell_command', 'schedule_interview', 'schedule_post', 'score_resume', 'search_candidates', 'send_candidate_email',
        'send_contract', 'send_offer', 'update_deal', 'workspace_mob_a11y_audit', 'workspace_mob_android_build',
        'workspace_mob_android_component', 'workspace_mob_android_test', 'workspace_mob_api_client', 'workspace_mob_auth_implement',
        'workspace_mob_deep_link', 'workspace_mob_ios_build', 'workspace_mob_ios_component', 'workspace_mob_ios_test',
        'workspace_mob_perf_profile', 'workspace_mob_push_notify', 'workspace_mob_scaffold_project', 'workspace_mob_standup_report',
        'workspace_mob_store_upload', 'write_ad_copy',
    ],
    fullstack_developer: ['change_permissions', 'delete_resource', 'deploy_production', 'merge_pr', 'run_shell_command'],
    tester: [
        'change_permissions', 'code_edit_patch', 'delete_resource', 'deploy_production', 'merge_pr',
        'run_shell_command', 'workspace_bulk_refactor',
    ],
    business_analyst: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_campaign', 'create_deal', 'create_job_posting', 'create_pr', 'deploy_production', 'enrich_lead',
        'escalate_ticket', 'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund',
        'merge_pr', 'post_job', 'publish_ad', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_interview',
        'schedule_post', 'score_resume', 'search_candidates', 'send_candidate_email', 'send_contract', 'send_offer',
        'update_deal', 'workspace_fix_test_failures', 'workspace_generate_test', 'workspace_sast_scan', 'workspace_secret_scan',
        'workspace_security_scan', 'workspace_subagent_spawn', 'write_ad_copy',
    ],
    technical_writer: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_campaign', 'create_deal', 'create_job_posting', 'deploy_production', 'enrich_lead', 'escalate_ticket',
        'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund', 'merge_pr',
        'post_job', 'publish_ad', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_interview',
        'schedule_meeting', 'schedule_post', 'score_resume', 'search_candidates', 'send_contract', 'send_email', 'send_offer',
        'update_deal', 'workspace_ca_calendar_cancel', 'workspace_ca_calendar_schedule', 'workspace_ca_email_compose',
        'workspace_ca_email_send', 'workspace_fix_test_failures', 'workspace_generate_test', 'workspace_sast_scan',
        'workspace_secret_scan', 'workspace_security_scan', 'write_ad_copy',
    ],
    content_writer: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_deal', 'create_job_posting', 'deploy_production', 'deploy_staging', 'enrich_lead', 'escalate_ticket',
        'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund', 'merge_pr',
        'post_job', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_interview', 'schedule_meeting',
        'score_resume', 'search_candidates', 'send_contract', 'send_offer', 'update_deal', 'workspace_ca_calendar_cancel',
        'workspace_ca_calendar_schedule', 'workspace_ca_email_compose', 'workspace_ca_email_send', 'workspace_fix_test_failures',
        'workspace_generate_test', 'workspace_run_ci_checks', 'workspace_sast_scan', 'workspace_secret_scan',
        'workspace_security_scan', 'workspace_security_test_report',
    ],
    sales_rep: [
        'apply_patch', 'change_permissions', 'code_edit', 'code_edit_patch', 'delete_resource', 'deploy_production',
        'merge_pr', 'run_shell_command', 'workspace_autonomous_plan_execute', 'workspace_bulk_refactor',
        'workspace_github_issue_fix', 'workspace_subagent_spawn',
    ],
    marketing_specialist: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_deal', 'create_job_posting', 'deploy_production', 'deploy_staging', 'enrich_lead', 'escalate_ticket',
        'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund', 'merge_pr',
        'post_job', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_interview', 'score_resume',
        'search_candidates', 'send_contract', 'send_offer', 'update_deal', 'workspace_ca_calendar_cancel',
        'workspace_ca_calendar_schedule', 'workspace_ca_email_compose', 'workspace_ca_email_send', 'workspace_generate_test',
        'workspace_run_ci_checks', 'workspace_sast_scan', 'workspace_secret_scan', 'workspace_security_scan',
        'workspace_security_test_report',
    ],
    corporate_assistant: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_campaign', 'create_deal', 'create_job_posting', 'create_pr', 'deploy_production', 'enrich_lead',
        'escalate_ticket', 'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund',
        'merge_pr', 'post_job', 'publish_ad', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_interview',
        'schedule_post', 'score_resume', 'search_candidates', 'send_candidate_email', 'send_contract', 'send_offer',
        'update_deal', 'workspace_fix_test_failures', 'workspace_generate_test', 'workspace_sast_scan', 'workspace_secret_scan',
        'workspace_security_scan', 'write_ad_copy',
    ],
    customer_support_executive: [
        'book_interview', 'create_campaign', 'create_deal', 'create_job_posting', 'create_pr', 'deploy_production',
        'enrich_lead', 'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'merge_pr', 'post_job', 'publish_ad',
        'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests', 'schedule_post', 'score_resume', 'search_candidates',
        'send_contract', 'send_offer', 'update_deal', 'workspace_dev_fix_bug', 'workspace_dev_implement_feature',
        'workspace_devops_k8s_deploy', 'workspace_devops_pipeline_trigger', 'workspace_devops_tf_apply', 'workspace_sast_scan',
        'workspace_security_scan', 'write_ad_copy',
    ],
    project_manager_product_owner_scrum_master: [
        'book_interview', 'chat_with_customer', 'close_ticket', 'code_edit', 'code_edit_patch', 'code_search_replace',
        'create_campaign', 'create_deal', 'create_job_posting', 'create_pr', 'deploy_production', 'deploy_staging',
        'enrich_lead', 'find_leads', 'generate_proposal', 'git_commit', 'git_push', 'handle_objection', 'handle_refund',
        'merge_pr', 'post_job', 'provision_vm', 'publish_ad', 'qualify_lead', 'run_linter', 'run_pipeline', 'run_tests',
        'scale_service', 'schedule_interview', 'schedule_post', 'score_resume', 'search_candidates', 'send_candidate_email',
        'send_contract', 'send_offer', 'update_deal', 'workspace_fix_test_failures', 'workspace_generate_test',
        'workspace_sast_scan', 'workspace_secret_scan', 'workspace_security_scan', 'workspace_subagent_spawn', 'write_ad_copy',
    ],
    devops_engineer: ['change_permissions', 'delete_resource', 'drop_database', 'revoke_credentials', 'run_shell_command', 'terraform_destroy'],
    mobile_engineer: ['change_permissions', 'delete_resource', 'deploy_production', 'revoke_signing_cert', 'run_shell_command'],
};
