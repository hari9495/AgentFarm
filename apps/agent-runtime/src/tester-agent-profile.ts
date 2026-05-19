import type { LocalWorkspaceActionType } from './local-workspace-executor.js';

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
    // ── Tier 20: Testing tool integrations ───────────────────────────────
    'workspace_selenium_test_run',
    'workspace_cypress_test_run',
    'workspace_appium_test_run',
    'workspace_playwright_test_run',
    'workspace_load_test_run',
    'workspace_load_test_report',
    'workspace_api_test_run',
    'workspace_api_test_report',
    'workspace_dast_scan',
    'workspace_security_test_report',
    'workspace_test_case_sync',
    'workspace_test_run_publish',
    'workspace_visual_regression',
];

export const TESTER_ROLE_BLOCKED_ACTIONS = [
    'merge_pr',
    'deploy_production',
    'delete_resource',
    'workspace_subagent_spawn',
    'run_shell_command',
    'change_permissions',
    'code_edit_patch',
    'workspace_bulk_refactor',
] as const;

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
