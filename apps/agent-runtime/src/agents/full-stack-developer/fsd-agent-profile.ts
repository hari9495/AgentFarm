// ============================================================================
// FULL-STACK DEVELOPER AGENT PROFILE
// Sprint 16 — Full-Stack Developer Role
//
// Declares the full set of workspace actions the full-stack developer agent is
// allowed to execute and the connector integrations it may use.
//
// The FSD profile is a superset of the developer profile — it includes all
// developer actions plus 15 frontend-specific workspace_fsd_* actions and the
// Figma connector for design handoff.
//
// Imported by:
//   - role-profiles/index.ts   → ROLE_PROFILES['fullstack_developer'].allowedActions
//   - local-workspace-executor.ts → action dispatch guard
// ============================================================================

import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';
import { DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS } from '../developer/developer-agent-profile.js';

// ---------------------------------------------------------------------------
// Allowed connectors
// ---------------------------------------------------------------------------

export const FSD_ROLE_ALLOWED_CONNECTORS = [
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
    // Design handoff (FSD-specific)
    'figma',
    'storybook',
    // Hosting / deployment
    'vercel',
    'netlify',
    'cloudflare_pages',
] as const;

// ---------------------------------------------------------------------------
// Allowed local workspace actions
// ---------------------------------------------------------------------------

export const FSD_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── All developer actions (superset) ─────────────────────────────────────
    ...DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS,
    // ── Full-Stack Developer domain actions (workspace_fsd_*) ─────────────────
    'workspace_fsd_ui_component',
    'workspace_fsd_design_handoff',
    'workspace_fsd_responsive_check',
    'workspace_fsd_accessibility_audit',
    'workspace_fsd_seo_audit',
    'workspace_fsd_perf_audit',
    'workspace_fsd_state_manage',
    'workspace_fsd_api_integrate',
    'workspace_fsd_auth_implement',
    'workspace_fsd_realtime_setup',
    'workspace_fsd_env_setup',
    'workspace_fsd_fullstack_feature',
    'workspace_fsd_scaffold_project',
    'workspace_fsd_deploy_preview',
    'workspace_fsd_standup_report',
    // ── Advanced capabilities (Sprint 16 Phase 4) ─────────────────────────────
    'workspace_fsd_visual_review',
    'workspace_fsd_clarify_spec',
    'workspace_fsd_security_deep_scan',
    'workspace_fsd_arch_review',
    // ── Live debugging + framework adapter (Sprint 16 Phase 5) ───────────────
    'workspace_fsd_browser_debug',
    'workspace_fsd_perf_profile',
];

// ---------------------------------------------------------------------------
// Blocked actions (hard block — must not run even if requested)
// ---------------------------------------------------------------------------

export const FSD_ROLE_BLOCKED_ACTIONS: ReadonlyArray<string> = [
    'merge_pr',           // requires human sign-off
    'deploy_production',  // requires ops pipeline + human approval
    'delete_resource',    // irreversible — requires human confirmation
    'change_permissions', // security-critical
    'run_shell_command',  // unrestricted shell bypass
] as const;

// ---------------------------------------------------------------------------
// High-risk actions requiring approval before execution
// ---------------------------------------------------------------------------

export const FSD_ROLE_HIGH_RISK_ACTIONS: ReadonlyArray<string> = [
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
    'workspace_azure_deploy_plan',
    'workspace_dependency_upgrade_apply',
    'workspace_migration_generate',
    'workspace_fsd_deploy_preview',
    'workspace_fsd_fullstack_feature',
    'git_push',
] as const;

// ---------------------------------------------------------------------------
// Role profile aliases (normalised lowercase)
// ---------------------------------------------------------------------------

export const FSD_ROLE_PROFILE_ALIASES = new Set([
    'fullstack_developer',
    'full_stack_developer',
    'fullstack',
    'full_stack',
    'fsd',
]);

export const normalizeFsdRoleAlias = (profile: string): string =>
    profile.trim().toLowerCase().replace(/[\s/]+/g, '_');

export const isFsdRoleProfile = (profile: string): boolean =>
    FSD_ROLE_PROFILE_ALIASES.has(normalizeFsdRoleAlias(profile));
