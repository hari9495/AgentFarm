// ============================================================================
// DEVOPS AGENT PROFILE
// Declares the full set of workspace actions the DevOps agent is allowed to
// execute and the connector integrations it may use.
//
// The DevOps profile is a superset of the developer profile — it inherits all
// developer actions and adds 15 infrastructure-domain workspace_devops_* actions.
//
// Imported by:
//   - role-profiles/index.ts   → ROLE_PROFILES['devops_engineer'].allowedActions
//   - local-workspace-executor.ts → action dispatch guard
// ============================================================================

import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';
import { DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS } from '../developer/developer-agent-profile.js';

// ---------------------------------------------------------------------------
// Allowed connectors
// ---------------------------------------------------------------------------

export const DEVOPS_ROLE_ALLOWED_CONNECTORS = [
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
    'pagerduty',
    // CI/CD
    'jenkins',
    'circleci',
    'github_actions',
    'gitlab_ci',
    'azure_pipelines',
    'tekton',
    'argocd',
    // Container registries
    'docker_hub',
    'ecr',         // AWS Elastic Container Registry
    'gcr',         // Google Container Registry
    'acr',         // Azure Container Registry
    'ghcr',        // GitHub Container Registry
    // Cloud providers
    'aws',
    'azure',
    'gcp',
    'terraform_cloud',
    // Kubernetes management
    'rancher',
    'lens',
    // Monitoring & observability
    'datadog',
    'grafana',
    'prometheus',
    'sentry',
    'new_relic',
    'cloudwatch',
    // Secret management
    'vault',
    'aws_secrets_manager',
    // Documentation
    'confluence',
    'notion',
] as const;

// ---------------------------------------------------------------------------
// Allowed local workspace actions
// ---------------------------------------------------------------------------

export const DEVOPS_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── All developer actions (superset) ─────────────────────────────────────
    ...DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS,
    // ── DevOps domain actions (workspace_devops_*) ────────────────────────────
    // Terraform / IaC
    'workspace_devops_tf_plan',
    'workspace_devops_tf_apply',
    'workspace_devops_tf_validate',
    'workspace_devops_tf_generate',
    // Kubernetes
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    'workspace_devops_k8s_status',
    'workspace_devops_k8s_logs',
    'workspace_devops_k8s_generate',
    // Docker
    'workspace_devops_docker_build',
    'workspace_devops_docker_push',
    // CI/CD
    'workspace_devops_pipeline_trigger',
    'workspace_devops_pipeline_status',
    // Incident & reporting
    'workspace_devops_incident_triage',
    'workspace_devops_standup_report',
];

// ---------------------------------------------------------------------------
// Blocked actions (hard block — must not run even if requested)
// ---------------------------------------------------------------------------

export const DEVOPS_ROLE_BLOCKED_ACTIONS: ReadonlyArray<string> = [
    'terraform_destroy',        // irreversible — human must destroy infra manually
    'delete_resource',          // irreversible
    'change_permissions',       // security-critical
    'run_shell_command',        // unrestricted shell bypass
    'drop_database',            // irreversible data loss
    'revoke_credentials',       // may lock out systems
] as const;

// ---------------------------------------------------------------------------
// High-risk actions requiring approval before execution
// ---------------------------------------------------------------------------

export const DEVOPS_ROLE_HIGH_RISK_ACTIONS: ReadonlyArray<string> = [
    // Infra changes that cost money or affect uptime
    'workspace_devops_tf_apply',
    // Kubernetes mutations (may affect running services)
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    // Pipeline triggers (may deploy to production)
    'workspace_devops_pipeline_trigger',
    // Inherited developer high-risk
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

export const DEVOPS_ROLE_PROFILE_ALIASES = new Set([
    'devops',
    'devops_engineer',
    'devops_agent',
    'sre',
    'site_reliability_engineer',
    'platform_engineer',
    'infrastructure_engineer',
    'infra_engineer',
    'cloud_engineer',
]);

export const normalizeDevopsRoleAlias = (profile: string): string =>
    profile.trim().toLowerCase().replace(/[\s/]+/g, '_');

export const isDevopsRoleProfile = (profile: string): boolean =>
    DEVOPS_ROLE_PROFILE_ALIASES.has(normalizeDevopsRoleAlias(profile));
