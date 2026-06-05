// ============================================================================
// AGENTFARM SUPPORT AGENT PROFILE
// Declares the connectors and actions the internal support agent may use.
//
// This is an internal agent — it reads AgentFarm's own platform internals
// (logs, traces, DB state) and applies fixes on behalf of tenants. It is
// NOT a customer-facing product feature.
//
// Imported by:
//   - local-workspace-executor.ts → action dispatch guard
//   - mcp-provisioner.ts          → connector provisioning
// ============================================================================

import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';

// ---------------------------------------------------------------------------
// Allowed connectors (external integrations the support agent may call)
// ---------------------------------------------------------------------------

export const AGENTFARM_SUPPORT_ALLOWED_CONNECTORS = [
    'github',
    'slack',
    'microsoft_teams',
    'pagerduty',
    'datadog',
    'grafana',
] as const;

export type AgentfarmSupportConnector = (typeof AGENTFARM_SUPPORT_ALLOWED_CONNECTORS)[number];

// ---------------------------------------------------------------------------
// Allowed local workspace actions
// ---------------------------------------------------------------------------

export const AGENTFARM_SUPPORT_ALLOWED_ACTIONS: LocalWorkspaceActionType[] = [
    // Core support lifecycle
    'agentfarm_support_issue_ingest',
    'agentfarm_support_diagnose',
    'agentfarm_support_config_fix',
    'agentfarm_support_chat_reply',
    'agentfarm_support_voice_reply',
    'agentfarm_support_code_fix_dispatch',
    'agentfarm_support_infra_fix_dispatch',
    'agentfarm_support_escalate',
    'agentfarm_support_resolve',
    // Read-only workspace introspection (for diagnostic context)
    'workspace_read_file',
    'workspace_grep',
    'workspace_list_files',
    // Notification relay
    'workspace_slack_notify',
    // Meeting / voice presence
    'workspace_meeting_join',
    'workspace_meeting_speak',
];

// ---------------------------------------------------------------------------
// Blocked actions (irreversible or out of scope for support)
// ---------------------------------------------------------------------------

export const AGENTFARM_SUPPORT_BLOCKED_ACTIONS: ReadonlyArray<string> = [
    'run_shell_command',
    'git_push',
    'workspace_devops_tf_apply',
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    'drop_database',
    'delete_resource',
] as const;

// ---------------------------------------------------------------------------
// High-risk actions requiring explicit approval before execution
// ---------------------------------------------------------------------------

export const AGENTFARM_SUPPORT_HIGH_RISK_ACTIONS: ReadonlyArray<string> = [
    'agentfarm_support_code_fix_dispatch',
    'agentfarm_support_infra_fix_dispatch',
] as const;

// ---------------------------------------------------------------------------
// Role name used in task routing and registry lookups
// ---------------------------------------------------------------------------

export const AGENTFARM_SUPPORT_ROLE_NAME = 'agentfarm-support' as const;

export const AGENTFARM_SUPPORT_ROLE_ALIASES = new Set([
    'agentfarm-support',
    'agentfarm_support',
    'platform_support',
    'internal_support',
    'support_agent',
]);

export const isAgentfarmSupportRole = (profile: string): boolean =>
    AGENTFARM_SUPPORT_ROLE_ALIASES.has(profile.trim().toLowerCase().replace(/[\s/]+/g, '_').replace(/-/g, '_'));
