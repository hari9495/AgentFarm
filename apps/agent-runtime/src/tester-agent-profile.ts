import type { LocalWorkspaceActionType } from './local-workspace-executor.js';

export const TESTER_ROLE_ALLOWED_CONNECTORS = ['jira', 'teams', 'github', 'email'] as const;

export const TESTER_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    'code_read',
    'run_tests',
    'run_linter',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'git_log',
    'workspace_cleanup',
    'workspace_diff',
    'workspace_memory_read',
    // Tier 3: Analysis only (no refactoring)
    'workspace_find_references',
    'workspace_go_to_definition',
    'workspace_hover_type',
    'workspace_analyze_imports',
    'workspace_code_coverage',
    'workspace_complexity_metrics',
    'workspace_security_scan',
    // Tier 4: Test impact only
    'workspace_test_impact_analysis',
    // Tier 5: Search and package lookup only
    'workspace_search_docs',
    'workspace_package_lookup',
    // Tier 6: Language adapters (info only)
    'workspace_language_adapter_python',
    'workspace_language_adapter_java',
    'workspace_language_adapter_go',
    'workspace_language_adapter_csharp',
    // Tier 7: Impact reporting only
    'workspace_change_impact_report',
    // Tier 8: Read-only intelligence
    'workspace_git_blame',
    'workspace_outline_symbols',
    // Tier 9: Read-only pilot intelligence
    'workspace_security_fix_suggest',
    'workspace_pr_review_prepare',
    'workspace_dependency_upgrade_plan',
    'workspace_policy_preflight',
    // Tier 10: Read-only code intelligence and observability
    'workspace_connector_test',
    'workspace_explain_code',
    'workspace_refactor_plan',
    'workspace_semantic_search',
    'workspace_diff_preview',
    'workspace_approval_status',
    'workspace_audit_export',
];

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
