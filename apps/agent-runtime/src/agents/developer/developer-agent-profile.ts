// ============================================================================
// DEVELOPER AGENT PROFILE
// Sprint 16 — Developer Role
//
// Declares the full set of workspace actions the developer agent is allowed to
// execute and the connector integrations it may use.
//
// Imported by:
//   - role-profiles/index.ts   → ROLE_PROFILES['developer'].allowedActions
//   - local-workspace-executor.ts → action dispatch guard
// ============================================================================

import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

// ---------------------------------------------------------------------------
// Allowed connectors
// ---------------------------------------------------------------------------

export const DEVELOPER_ROLE_ALLOWED_CONNECTORS = [
    // Source control
    'github',
    'gitlab',
    'bitbucket',
    'azure_devops',
    // Issue trackers
    'jira',
    'linear',
    'github_issues',
    // Communication
    'slack',
    'microsoft_teams',
    // CI/CD
    'jenkins',
    'circleci',
    'github_actions',
    'gitlab_ci',
    // Documentation
    'confluence',
    'notion',
    // Monitoring & alerting
    'pagerduty',
    'datadog',
    'sentry',
    // Code quality
    'sonarqube',
    'codecov',
] as const;

// ---------------------------------------------------------------------------
// Allowed local workspace actions
// ---------------------------------------------------------------------------

export const DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── Developer domain actions (workspace_dev_*) ──────────────────────────
    'workspace_dev_implement_feature',
    'workspace_dev_fix_bug',
    'workspace_dev_code_review',
    'workspace_dev_refactor',
    'workspace_dev_write_tests',
    'workspace_dev_debug_session',
    'workspace_dev_create_pr',
    'workspace_dev_handle_issue',
    'workspace_dev_branch_manage',
    'workspace_dev_commit',
    'workspace_dev_security_audit',
    'workspace_dev_dependency_audit',
    'workspace_dev_performance_audit',
    'workspace_dev_code_quality',
    'workspace_dev_api_design',
    'workspace_dev_db_migration',
    'workspace_dev_onboard_codebase',
    'workspace_dev_standup_report',
    'workspace_dev_incident_response',
    'workspace_dev_tech_spec',
    // ── Core code inspection ─────────────────────────────────────────────────
    'code_read',
    'code_edit',
    'workspace_read_file',
    'workspace_write_file',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'workspace_diff',
    'workspace_diff_preview',
    'workspace_find_references',
    'workspace_rename_symbol',
    'workspace_extract_function',
    'workspace_go_to_definition',
    'workspace_hover_type',
    'workspace_analyze_imports',
    'workspace_outline_symbols',
    'workspace_explain_code',
    'workspace_semantic_search',
    'workspace_git_blame',
    'workspace_search_docs',
    'workspace_package_lookup',
    'workspace_summarize_folder',
    'workspace_dependency_tree',
    // ── Code editing & generation ────────────────────────────────────────────
    'workspace_atomic_edit_set',
    'workspace_bulk_refactor',
    'workspace_generate_from_template',
    'workspace_migration_helper',
    'workspace_add_docstring',
    'workspace_refactor_plan',
    'workspace_dead_code_remove',
    'workspace_interface_extract',
    'workspace_import_cleanup',
    'workspace_format_code',
    // ── Testing & CI ─────────────────────────────────────────────────────────
    'run_tests',
    'run_linter',
    'run_build',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_test_impact_analysis',
    'workspace_code_coverage',
    'workspace_complexity_metrics',
    'workspace_run_ci_checks',
    'workspace_ci_watch',
    'workspace_change_impact_report',
    // ── Git & repository operations ──────────────────────────────────────────
    'git_clone',
    'git_branch',
    'git_commit',
    'git_push',
    'git_log',
    'git_stash',
    'apply_patch',
    'workspace_checkpoint',
    'workspace_rollback_to_checkpoint',
    'workspace_create_pr',
    'workspace_pr_review_prepare',
    'workspace_pr_auto_assign',
    'workspace_post_pr_review',
    'workspace_pr_review_poll',
    'workspace_ci_status_poll',
    'workspace_approval_status',
    // ── GitHub intelligence ──────────────────────────────────────────────────
    'workspace_github_pr_status',
    'workspace_github_issue_triage',
    'workspace_github_issue_fix',
    // ── Security & compliance ────────────────────────────────────────────────
    'workspace_security_scan',
    'workspace_security_fix_suggest',
    'workspace_sast_scan',
    'workspace_secret_scan',
    'workspace_sbom_generate',
    'workspace_cve_check',
    'workspace_compliance_snapshot',
    // ── Performance & profiling ──────────────────────────────────────────────
    'workspace_benchmark_run',
    'workspace_memory_leak_detect',
    'workspace_bundle_size_analyze',
    'workspace_perf_regression_flag',
    'workspace_profiler_run',
    'workspace_memory_profile',
    // ── Database & schema ────────────────────────────────────────────────────
    'workspace_db_schema_diff',
    'workspace_migration_safety_check',
    'workspace_seed_data_generate',
    'workspace_query_explain_plan',
    'workspace_migration_generate',
    // ── Dependency management ────────────────────────────────────────────────
    'workspace_dependency_upgrade_plan',
    'workspace_dependency_upgrade_apply',
    'workspace_monorepo_boundary_check',
    // ── Debug sessions ───────────────────────────────────────────────────────
    'workspace_debug_breakpoint',
    'workspace_debug_session_start',
    'workspace_debug_session_evaluate',
    'workspace_debug_session_run',
    'workspace_debug_session_heap_snapshot',
    'workspace_debug_session_stop',
    // ── REPL ─────────────────────────────────────────────────────────────────
    'workspace_repl_start',
    'workspace_repl_execute',
    'workspace_repl_stop',
    // ── Release & changelog ──────────────────────────────────────────────────
    'workspace_version_bump',
    'workspace_changelog_generate',
    'workspace_release_notes_generate',
    // ── Language adapters ────────────────────────────────────────────────────
    'workspace_language_adapter_python',
    'workspace_language_adapter_java',
    'workspace_language_adapter_go',
    'workspace_language_adapter_csharp',
    // ── Governance & safety ──────────────────────────────────────────────────
    'workspace_policy_preflight',
    'workspace_dry_run_with_approval_chain',
    'workspace_audit_export',
    'workspace_connector_test',
    // ── Autonomous planning ──────────────────────────────────────────────────
    'workspace_autonomous_plan_execute',
    'workspace_subagent_spawn',
    'workspace_incident_patch_pack',
    // ── Deployment ───────────────────────────────────────────────────────────
    'workspace_azure_deploy_plan',
    // ── Communication ────────────────────────────────────────────────────────
    'workspace_slack_notify',
    // ── Memory ───────────────────────────────────────────────────────────────
    'workspace_memory_write',
    'workspace_memory_read',
    'workspace_memory_search',
    // ── AI code review (generic) ─────────────────────────────────────────────
    'workspace_ai_code_review',
    // ── Install deps & cleanup ───────────────────────────────────────────────
    'workspace_install_deps',
    'workspace_cleanup',
    // ── Web research ─────────────────────────────────────────────────────────
    'workspace_web_search',
    // ── Cross-repo navigation (Tier 33) ──────────────────────────────────────
    'workspace_crossrepo_clone',
    'workspace_crossrepo_search',
    'workspace_crossrepo_refactor',
    'workspace_crossrepo_status',
    'workspace_crossrepo_pr_create',
    // ── Proactive tech debt scanner (Tier 34) ────────────────────────────────
    'workspace_dev_proactive_scan',
    'workspace_dev_tech_debt_report',
    'workspace_dev_autofix_deps',
];

// ---------------------------------------------------------------------------
// Blocked actions (hard block — must not run even if requested)
// ---------------------------------------------------------------------------

export const DEVELOPER_ROLE_BLOCKED_ACTIONS: ReadonlyArray<string> = [
    'merge_pr',           // requires human sign-off
    'deploy_production',  // requires ops pipeline + human approval
    'delete_resource',    // irreversible — requires human confirmation
    'change_permissions', // security-critical
    'run_shell_command',  // unrestricted shell bypass
] as const;

// ---------------------------------------------------------------------------
// High-risk actions requiring approval before execution
// ---------------------------------------------------------------------------

export const DEVELOPER_ROLE_HIGH_RISK_ACTIONS: ReadonlyArray<string> = [
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
    'workspace_azure_deploy_plan',
    'workspace_dependency_upgrade_apply',
    'workspace_migration_generate',
    'git_push',
] as const;

// ---------------------------------------------------------------------------
// Role profile aliases (normalised lowercase)
// ---------------------------------------------------------------------------

export const DEVELOPER_ROLE_PROFILE_ALIASES = new Set([
    'developer',
    'dev',
    'software_engineer',
    'software_developer',
    'fullstack_developer',
    'backend_developer',
    'frontend_developer',
    'engineer',
]);

export const normalizeDevRoleAlias = (profile: string): string =>
    profile.trim().toLowerCase().replace(/[\s/]+/g, '_');

export const isDeveloperRoleProfile = (profile: string): boolean =>
    DEVELOPER_ROLE_PROFILE_ALIASES.has(normalizeDevRoleAlias(profile));
