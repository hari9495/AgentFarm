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
    // ── Gap 4 — Cloud & GitHub org bootstrap ─────────────────────────────────
    'workspace_bootstrap_aws_org',
    'workspace_bootstrap_github_org',
    'workspace_bootstrap_k8s_cluster',
    // ── Gap 6 — Hardware / network physical debugging ────────────────────────
    'workspace_infra_ipmi_console',
    'workspace_infra_netconf_query',
    'workspace_infra_remote_diag',
    // ── Gap 1 — Helm ─────────────────────────────────────────────────────────
    'workspace_devops_helm_install',
    'workspace_devops_helm_rollback',
    'workspace_devops_helm_diff',
    'workspace_devops_helm_generate',
    // ── Gap 2 — DORA Metrics ─────────────────────────────────────────────────
    'workspace_devops_dora_metrics',
    // ── Gap 3 — Post-Deploy Verification ─────────────────────────────────────
    'workspace_devops_deploy_verify',
    // ── Gap 4 — Environment Promotion ────────────────────────────────────────
    'workspace_devops_env_promote',
    // ── Gap 5 — Release Notes ────────────────────────────────────────────────
    'workspace_devops_release_notes',
    // ── Gap 6 — Container Security Scanning ──────────────────────────────────
    'workspace_devops_image_scan',
    // ── Gap 7 — Pipeline Config Generation ───────────────────────────────────
    'workspace_devops_pipeline_generate',
    // ── Gap 8 — Cost Estimation ───────────────────────────────────────────────
    'workspace_devops_cost_estimate',
    // ── Gap 9 — Drift Detection ───────────────────────────────────────────────
    'workspace_devops_drift_check',
    // ── Gap 10 — Secret Rotation & Cert Renewal ───────────────────────────────
    'workspace_devops_secret_rotate',
    'workspace_devops_cert_renew',
    // ── P1 Gap 1 — Cloud CLI (AWS / Azure / GCP) ──────────────────────────────
    'workspace_devops_aws_cli',
    'workspace_devops_az_cli',
    'workspace_devops_gcloud_cli',
    // ── P1 Gap 2 — Terraform State Management ─────────────────────────────────
    'workspace_devops_tf_state',
    // ── P1 Gap 3 — Kubernetes RBAC ────────────────────────────────────────────
    'workspace_devops_k8s_rbac',
    // ── P1 Gap 4 — Observability Management ───────────────────────────────────
    'workspace_devops_grafana_dashboard',
    'workspace_devops_alert_rule',
    // ── P1 Gap 5 — Deployment Strategy Builder ────────────────────────────────
    'workspace_devops_blue_green',
    'workspace_devops_canary',
    // ── P2 Gap 6 — ArgoCD / GitOps ────────────────────────────────────────────
    'workspace_devops_argocd',
    // ── P2 Gap 7 — HPA / VPA / Autoscaler ─────────────────────────────────────
    'workspace_devops_k8s_autoscale',
    // ── P2 Gap 8 — Database / exec-into-pod ───────────────────────────────────
    'workspace_devops_k8s_exec',
    // ── P2 Gap 9 — DNS & Load Balancer ────────────────────────────────────────
    'workspace_devops_dns',
    'workspace_devops_lb',
    // ── P2 Gap 10 — Service Mesh (Istio / Linkerd) ────────────────────────────
    'workspace_devops_service_mesh',
    // ── P3 Gap 11 — SLO / Error Budgets ───────────────────────────────────────
    'workspace_devops_slo',
    // ── P3 Gap 12 — CIS Compliance Scanning ───────────────────────────────────
    'workspace_devops_compliance_scan',
    // ── P3 Gap 13 — Container Registry Hygiene ────────────────────────────────
    'workspace_devops_registry',
    // ── P3 Gap 14 — Load / Performance Testing ────────────────────────────────
    'workspace_devops_load_test',
    // ── P4 Gap 15 — Live Metrics Querying ─────────────────────────────────────
    'workspace_devops_metrics_query',
    // ── P4 Gap 16 — Database Administration ───────────────────────────────────
    'workspace_devops_db_admin',
    // ── P4 Gap 17 — FinOps / Cost Optimization ────────────────────────────────
    'workspace_devops_finops',
    // ── P4 Gap 18 — Fleet / Multi-Cluster Management ──────────────────────────
    'workspace_devops_fleet',
    // ── P5 Gap 19 — Windows Server Administration ─────────────────────────────
    'workspace_devops_windows',
    // ── P5 Gap 20 — Chaos Engineering ─────────────────────────────────────────
    'workspace_devops_chaos',
    // ── P5 Gap 21 — MLOps Pipeline Management ─────────────────────────────────
    'workspace_devops_mlops',
    // ── P5 Gap 22 — Incident Containment ──────────────────────────────────────
    'workspace_devops_incident_contain',
    // ── Bucket 2 Gap 1 — Interactive Debug Session ─────────────────────────
    'workspace_devops_debug_session',
    // ── Bucket 2 Gap 5 — Runbook Executor ──────────────────────────────────
    'workspace_devops_runbook_execute',
    // ── Bucket 3 — Network Diagnostics ─────────────────────────────────────
    'workspace_devops_net_diag',
    // ── Bucket 3 — Human Handoff / Dashboard Escalation ────────────────────
    'workspace_devops_human_handoff',
    // ── Wave 1 Gap 1 — Port-forward / SSH Tunnel ───────────────────────────
    'workspace_devops_tunnel',
    // ── Wave 1 Gap 2 — Prometheus Management API ───────────────────────────
    'workspace_devops_prometheus_mgmt',
    // ── Wave 1 Gap 3 — Vault Dynamic Secrets ──────────────────────────────
    'workspace_devops_vault_dynamic',
    // ── Wave 1 Gap 4 — Argo Workflows ─────────────────────────────────────
    'workspace_devops_argo_workflow',
    // ── Wave 1 Gap 5 — Backstage Catalog ──────────────────────────────────
    'workspace_devops_backstage',
    // ── Wave 1 Gap 6 — Slack Incident Channel ─────────────────────────────
    'workspace_devops_slack_incident',
    // ── Wave 2 Gap 1 — Scheduled Monitor ──────────────────────────────────
    'workspace_devops_scheduled_monitor',
    // ── Wave 2 Gap 2 — Incident Context / Noise Filter ────────────────────
    'workspace_devops_incident_context',
    // ── Standup / live meetings (shared) ─────────────────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
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
    // Helm mutations (may affect running services)
    'workspace_devops_helm_install',
    'workspace_devops_helm_rollback',
    // Pipeline triggers (may deploy to production)
    'workspace_devops_pipeline_trigger',
    // Secret rotation (may break dependents)
    'workspace_devops_secret_rotate',
    // Blue/green and canary — affect production traffic routing
    'workspace_devops_blue_green',
    'workspace_devops_canary',
    // ArgoCD sync — deploys to cluster
    'workspace_devops_argocd',
    // DNS record changes — affect external routing
    'workspace_devops_dns',
    // LB listener rule changes — affect traffic routing
    'workspace_devops_lb',
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
