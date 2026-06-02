import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

export const TESTER_ROLE_ALLOWED_CONNECTORS = [
    // Project management
    'jira', 'linear', 'github', 'gitlab',
    // Communication
    'teams', 'slack', 'email',
    // CI/CD
    'jenkins', 'circleci',
    // Test automation
    'selenium', 'playwright', 'cypress', 'appium',
    // Performance
    'jmeter',
    // API testing
    'postman', 'soapui',
    // Test management
    'testrail', 'zephyr',
    // Security
    'burpsuite', 'owasp_zap',
    // Meeting platforms
    'google_meet', 'microsoft_teams', 'zoom',
] as const;

export const TESTER_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── Core code inspection ─────────────────────────────────────────────
    'code_read',
    'run_tests',
    'run_linter',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'git_log',
    'workspace_cleanup',
    'workspace_diff',
    'workspace_diff_preview',
    'workspace_memory_read',
    'workspace_find_references',
    'workspace_go_to_definition',
    'workspace_hover_type',
    'workspace_analyze_imports',
    'workspace_outline_symbols',
    'workspace_explain_code',
    'workspace_semantic_search',
    'workspace_git_blame',
    'workspace_search_docs',
    'workspace_package_lookup',
    // ── Test authoring & analysis ─────────────────────────────────────────
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_test_impact_analysis',
    'workspace_code_coverage',
    'workspace_complexity_metrics',
    'workspace_run_ci_checks',
    'workspace_change_impact_report',
    'workspace_approval_status',
    'workspace_audit_export',
    'workspace_pr_review_prepare',
    'workspace_policy_preflight',
    'workspace_connector_test',
    'workspace_refactor_plan',
    'workspace_dependency_upgrade_plan',
    // ── Language adapters ────────────────────────────────────────────────
    'workspace_language_adapter_python',
    'workspace_language_adapter_java',
    'workspace_language_adapter_go',
    'workspace_language_adapter_csharp',
    // ── Security scanning ────────────────────────────────────────────────
    'workspace_security_scan',
    'workspace_security_fix_suggest',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_cve_check',
    'workspace_compliance_snapshot',
    // ── Performance & benchmarks ─────────────────────────────────────────
    'workspace_benchmark_run',
    'workspace_perf_regression_flag',
    'workspace_memory_leak_detect',
    // ── Manual / Desktop browser testing (Tier 17) ───────────────────────
    'workspace_browser_open',
    'workspace_app_launch',
    'workspace_web_login',
    'workspace_web_navigate',
    'workspace_web_read_page',
    'workspace_web_fill_form',
    'workspace_web_click',
    'workspace_web_extract_data',
    // ── Chrome DevTools MCP — CDP-native actions (Tier 17b) ──────────────
    'workspace_lighthouse_audit',
    'workspace_console_logs',
    'workspace_network_requests',
    'workspace_heap_snapshot',
    // ── BrowserActionRouter — new action types (Tier 17c) ────────────────
    'workspace_dom_snapshot',
    'workspace_web_wait',
    'workspace_web_hover',
    'workspace_web_drag',
    'workspace_web_type',
    'workspace_web_press_key',
    'workspace_web_upload_file',
    'workspace_web_handle_dialog',
    'workspace_perf_trace_start',
    'workspace_perf_trace_stop',
    'workspace_perf_trace_analyze',
    'workspace_web_emulate',
    'workspace_web_resize',
    'workspace_tab_new',
    'workspace_tab_close',
    'workspace_tab_list',
    'workspace_tab_select',
    'workspace_network_request_detail',
    'workspace_screencast_start',
    'workspace_screencast_stop',
    'workspace_extension_list',
    'workspace_extension_install',
    'workspace_extension_trigger',
    // ── Tier 20: Testing tool integrations ───────────────────────────────
    'workspace_selenium_test_run',
    'workspace_cypress_test_run',
    'workspace_appium_test_run',
    'workspace_playwright_test_run',
    'workspace_load_test_run',
    'workspace_load_test_report',
    'workspace_load_test_regression',
    'workspace_api_test_run',
    'workspace_api_test_report',
    'workspace_dast_scan',
    'workspace_security_test_report',
    'workspace_test_case_sync',
    'workspace_test_run_publish',
    'workspace_visual_regression',
    // ── Meetings / Standup / Scrum / Interviews ───────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    'workspace_standup_report',
    // ── Exploratory testing ───────────────────────────────────────────────
    'workspace_exploratory_session',
    // ── Generic visual GUI loop (Gap 1) ───────────────────────────────────
    'workspace_visual_task',
    // ── Accessibility testing & defect reporting (Gap T-ax / T-bug fix) ──
    'workspace_axe_scan',
    'workspace_create_bug',
    // ── Tier 22: Mutation testing & contract testing ───────────────────────
    'workspace_mutation_test',
    'workspace_contract_test',
    // ── Tier 23: Test data management & real-device cloud testing ─────────
    'workspace_generate_test_data',
    'workspace_mobile_test',
    // ── Test authoring: direct file writes for test code (Gap T1 fix) ─────
    'code_edit',
    // ── Source control: commit and push test branches (Gap T2 fix) ────────
    'git_commit',
    'git_push',
    // ── Working memory: persist and search test session context (Gap T3 fix)
    'workspace_memory_write',
    'workspace_memory_search',
    // ── Sub-agent spawning: delegate mobile testing to mobile_engineer ─────
    'workspace_subagent_spawn',
];

export const TESTER_ROLE_BLOCKED_ACTIONS = [
    'merge_pr',
    'deploy_production',
    'delete_resource',
    'run_shell_command',
    'change_permissions',
    'code_edit_patch',
    'workspace_bulk_refactor',
] as const;

/** Sub-agents the Tester is permitted to spawn — keyed by role */
export const TESTER_SPAWNABLE_SUB_AGENTS = ['mobile_engineer'] as const;
export type TesterSpawnableSubAgent = (typeof TESTER_SPAWNABLE_SUB_AGENTS)[number];

export const TESTER_ROLE_HIGH_RISK_ACTIONS = [
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
] as const;

export const TESTER_ROLE_PROFILE_ALIASES = new Set([
    'tester',
    'tester_agent',
    'qa',
    'qa_engineer',
    'quality_assurance_engineer',
]);

export const normalizeRoleProfileAlias = (profile: string): string => {
    return profile.trim().toLowerCase().replace(/[\s/]+/g, '_');
};

export const isTesterRoleProfile = (profile: string): boolean => {
    return TESTER_ROLE_PROFILE_ALIASES.has(normalizeRoleProfileAlias(profile));
};
