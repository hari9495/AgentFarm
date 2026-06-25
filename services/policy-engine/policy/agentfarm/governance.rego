# Phase 1 default governance bundle.
#
# Reproduces the hardcoded risk tiers from
# apps/agent-runtime/src/domain/risk-policy.ts (HIGH / MEDIUM => require_approval,
# everything else => allow) and layers per-tenant overlay rules on top.
#
# Tenant overlays live under data.agentfarm.tenants[<tenantId>]:
#   { "policyId": "...", "version": N, "rules": [ { actionType, effect, connector?, env? }, ... ] }
#
# Invariant: customer policy may only TIGHTEN. The final effect is the STRICTEST
# of the default tier effect and any matching tenant-rule effects
# (deny > require_approval > allow).

package agentfarm.governance

import rego.v1

strictness := {"allow": 1, "require_approval": 2, "deny": 3}

high_risk_actions := {
	"merge_release", "merge_pr", "delete_resource", "change_permissions", "deploy_production",
	"git_push", "run_shell_command", "workspace_repl_start", "workspace_repl_execute",
	"workspace_dry_run_with_approval_chain", "workspace_browser_open", "workspace_app_launch",
	"workspace_meeting_join", "workspace_meeting_speak", "workspace_meeting_interview_live",
	"workspace_subagent_spawn", "workspace_github_issue_fix", "workspace_cw_request_human_gate",
	"workspace_devops_tf_apply", "workspace_devops_k8s_deploy", "workspace_devops_k8s_rollback",
	"workspace_devops_pipeline_trigger", "workspace_mob_store_upload", "workspace_bootstrap_aws_org",
	"workspace_bootstrap_github_org", "workspace_bootstrap_k8s_cluster", "workspace_infra_ipmi_console",
	"workspace_fsd_roadmap_tick", "workspace_dev_gdb_session",
}

medium_risk_actions := {
	"update_status", "create_comment", "create_pr_comment", "create_pr", "send_message",
	"code_edit", "code_edit_patch", "code_search_replace", "run_build", "run_tests", "git_commit",
	"autonomous_loop", "create_pr_from_workspace", "workspace_memory_write", "git_stash",
	"apply_patch", "file_move", "file_delete", "run_linter", "workspace_install_deps",
	"workspace_checkpoint", "workspace_rename_symbol", "workspace_extract_function",
	"workspace_analyze_imports", "workspace_security_scan", "workspace_bulk_refactor",
	"workspace_atomic_edit_set", "workspace_generate_from_template", "workspace_migration_helper",
	"workspace_debug_breakpoint", "workspace_profiler_run", "workspace_rollback_to_checkpoint",
	"workspace_generate_test", "workspace_format_code", "workspace_version_bump",
	"workspace_changelog_generate", "workspace_create_pr", "workspace_run_ci_checks",
	"workspace_fix_test_failures", "workspace_pr_review_poll", "workspace_release_notes_generate",
	"workspace_incident_patch_pack", "workspace_memory_profile", "workspace_autonomous_plan_execute",
	"workspace_pr_auto_assign", "workspace_ci_watch", "workspace_add_docstring",
	"workspace_diff_preview", "workspace_audit_export", "workspace_github_pr_status",
	"workspace_github_issue_triage", "workspace_slack_notify", "mcp_tool_call", "mcp_tool_sequence",
}

# Default tier effect from the hardcoded sets.
tier_effect := "require_approval" if high_risk_actions[input.action]

else := "require_approval" if medium_risk_actions[input.action]

else := "allow"

# Tenant overlay for the requesting tenant (may be undefined).
tenant := data.agentfarm.tenants[input.tenantId]

# Does a tenant rule apply to this action?
rule_matches(rule) if {
	rule.actionType == input.action
	connector_ok(rule)
	env_ok(rule)
}

rule_matches(rule) if {
	rule.actionType == "*"
	connector_ok(rule)
	env_ok(rule)
}

connector_ok(rule) if not rule.connector
connector_ok(rule) if rule.connector == input.connector

env_ok(rule) if not rule.env
env_ok(rule) if rule.env == input.env

# Effects contributed by matching tenant rules.
matched_effects contains e if {
	some rule in tenant.rules
	rule_matches(rule)
	e := rule.effect
}

all_effects := {tier_effect} | matched_effects

max_strictness := max([strictness[e] | some e in all_effects])

# Final effect = strictest applicable.
effect := e if {
	some e in all_effects
	strictness[e] == max_strictness
}

# A tenant rule drove (or tied for) the winning effect.
tenant_drove if {
	some e in matched_effects
	strictness[e] == max_strictness
	tenant.policyId
}

reason_code := "allowed" if effect == "allow"

else := "policy_violation" if tenant_drove

else := "risk_threshold_exceeded"

reason := sprintf("Action '%s' resolved to '%s' by governance policy.", [input.action, effect])

base := {"effect": effect, "reasonCode": reason_code, "reason": reason}

provenance := {"matchedPolicyId": tenant.policyId, "matchedPolicyVersion": tenant.version} if tenant_drove

else := {}

decision := object.union(base, provenance)
