# AgentFarm Architecture Decision Log

## Purpose
Track architecture decisions with owner, status, and review dates before development begins.

## Status Legend
1. Planned
2. Under review
3. Approved
4. Rejected
5. Superseded

## Decision Records
## ADR-001: MVP Scope and Role Boundaries
1. Decision
- MVP supports Developer Agent only.
- QA and Manager roles move to scale phase.
2. Owner
- Product Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Prevents scope creep and protects release quality.

## ADR-002: Risk Taxonomy and Approval Thresholds
1. Decision
- Low risk actions auto-execute.
- Medium and high risk actions require human approval.
2. Owner
- Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Creates safe autonomy and clear operational controls.

## ADR-003: Connector Contract Model
1. Decision
- Define stable contract for Jira, Microsoft Teams, GitHub, and company email connectors.
2. Owner
- Engineering Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Reduces integration drift and onboarding delays.

## ADR-004: Audit Schema and Evidence Freshness Policy
1. Decision
- Use unified action and approval records.
- Evidence freshness target for active gates: 90 days.
2. Owner
- Product Lead and Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Supports trustworthy gate scoring and auditability.

## ADR-005: Kill Switch and Rollback Strategy
1. Decision
- Global kill switch must halt risky execution immediately.
- Resume requires authorized approval and incident notes.
2. Owner
- Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Improves incident containment and enterprise confidence.

## ADR-006: Database Portability Strategy (Prisma + Supabase Now)
1. Decision
- Use Prisma as the single data access and migration layer across services.
- Use Supabase hosted PostgreSQL for the near-term environment.
- Keep core backend paths provider-agnostic so migration to another PostgreSQL host remains low-friction.
- Avoid introducing Supabase-only backend coupling for core control-plane workflows unless explicitly approved.
2. Owner
- Platform Lead
3. Status
- Approved
4. Decision Date
- 2026-04-25
5. Review Date
- 2026-05-10
6. Impact
- Enables fast delivery with managed PostgreSQL now while preserving a clean migration path later.

## ADR-007: Multi-Provider LLM Routing with Health-Score Fallback
1. Decision
- The runtime LLM decision adapter supports nine named providers: openai, azure_openai, github_models, anthropic, google, xai (Grok), mistral, together, and agentfarm (heuristic-only).
- A tenth mode, `auto`, accepts a per-profile priority list and tries providers in order, falling back to the next on any error.
- Provider health scoring uses a 5-minute rolling window (max 20 entries per provider). Score = errorRate × 0.7 + (min(avgLatency, 10 000) / 10 000) × 0.3. Providers with lower scores are tried first; providers with no data score 0 and keep their configured order.
- The API Gateway LLM config route stores and redacts keys for all ten providers. The dashboard LLM Config panel exposes per-provider fields plus four model profiles: quality_first, speed_first, cost_balanced, and custom.
2. Owner
- Engineering Lead / AI Lead
3. Status
- Approved
4. Decision Date
- 2026-04-29
5. Review Date
- 2026-05-26
6. Impact
- Eliminates single-provider lock-in at runtime; health scoring improves reliability under partial provider outages; dashboard presets reduce operator configuration burden.

## ADR-008: Local Workspace Execution Surface (Tier 0–9 Actions)
1. Decision
- The Developer Agent operates on two execution surfaces: (a) connector actions via the API Gateway, and (b) local workspace actions executed directly in a sandboxed VM directory.
- 70+ local workspace action types across 12 tiers are implemented in `local-workspace-executor.ts`, dispatched from `runtime-server.ts` when the action type is in `LOCAL_WORKSPACE_ACTION_TYPES`.
- Sandbox path: `/tmp/agentfarm-workspaces/<tenantId>/<botId>/<workspaceKey>`. All file operations are enforced by `safeChildPath()`; path traversal and absolute paths are rejected. Shell output is filtered through `redactSecrets()` before returning.
- Risk classification for local actions follows the same HIGH/MEDIUM/LOW taxonomy already used for connector actions.
  - HIGH: workspace_git_push, workspace_run_command, workspace_shell_exec
  - MEDIUM: all write, edit, install, commit, format, version, changelog, PR, CI, fix, and autonomous-execution operations
  - LOW: all read, discovery, grep, analysis, blame, outline, preflight simulation, and review-prepare operations
- Action tiers:
  - Tier 0 (7): workspace_read_file, workspace_write_file, workspace_append_file, workspace_delete_file, workspace_list_dir, workspace_run_command, workspace_shell_exec
  - Tier 1 (5): workspace_grep, workspace_list_files, workspace_find_symbol, workspace_go_to_definition, workspace_hover_type
  - Tier 2 (8): workspace_git_status, workspace_git_diff, workspace_git_commit, workspace_git_push, workspace_git_branch, workspace_git_checkout, workspace_git_pull, workspace_git_log
  - Tier 3 (6): workspace_analyze_imports, workspace_code_coverage, workspace_complexity_metrics, workspace_security_scan, workspace_test_impact_analysis, workspace_ai_code_review
  - Tier 4 (6): workspace_extract_function, workspace_rename_symbol, workspace_inline_variable, workspace_move_symbol, workspace_generate_from_template, workspace_bulk_refactor
  - Tier 5 (6): workspace_run_tests, workspace_debug_breakpoint, workspace_profiler_run, workspace_repl_start, workspace_repl_execute, workspace_repl_stop
  - Tier 6 (7): workspace_summarize_folder, workspace_dependency_tree, workspace_package_lookup, workspace_language_adapter_python, workspace_language_adapter_java, workspace_language_adapter_go, workspace_language_adapter_csharp
  - Tier 7 (9): workspace_atomic_edit_set, workspace_dry_run_with_approval_chain, workspace_change_impact_report, workspace_rollback_to_checkpoint, workspace_search_docs, workspace_scout, workspace_checkpoint, workspace_install_deps, workspace_stash
  - Tier 8 (6, added 2026-04-30): workspace_generate_test, workspace_format_code, workspace_version_bump, workspace_changelog_generate, workspace_git_blame, workspace_outline_symbols
  - Tier 9 (11, added 2026-04-30): workspace_create_pr, workspace_run_ci_checks, workspace_fix_test_failures, workspace_security_fix_suggest, workspace_pr_review_prepare, workspace_dependency_upgrade_plan, workspace_release_notes_generate, workspace_incident_patch_pack, workspace_memory_profile, workspace_autonomous_plan_execute, workspace_policy_preflight
  - Tier 10 (10, added 2026-05-01): workspace_connector_test, workspace_pr_auto_assign, workspace_ci_watch, workspace_explain_code, workspace_add_docstring, workspace_refactor_plan, workspace_semantic_search, workspace_diff_preview, workspace_approval_status, workspace_audit_export
  - Tier 1/2 parity (9): file_move, file_delete, apply_patch, git_stash, git_log, run_linter, workspace_autonomous_loop, autonomous_loop, workspace_hover_type (duplicate alias)
- `globToRegex()` helper in local-workspace-executor.ts safely converts glob patterns to valid RegExp for workspace_grep; falls back to `/.*/` on any conversion error.
- Tier 9 adds PR creation, CI gate checking, automated test-fix loop, security suggestion routing, PR review summarization, dependency upgrade planning, release note generation, incident patch bundling, per-repo memory profiles, structured autonomous plan-execute flow, and policy preflight simulation. All 11 validated against 179/179 tests passing.
- Tier 10 adds connector health validation, CODEOWNERS-driven PR reviewer assignment, CI watch with log capture, code structural explanation, docstring stub generation (dry-run default), structured refactor planning, semantic regex search with context, diff preview without writes, approval status query, and audit evidence bundle export. All 10 validated against 190/190 tests passing.
2. Owner
- Engineering Lead
3. Status
- Approved
4. Decision Date
- 2026-04-30
5. Review Date
- 2026-05-26
6. Impact
- Developer Agent can read, write, search, validate, refactor, test, format, version, commit, create PRs, run CI checks, fix failing tests, suggest security patches, generate release notes, bundle incident patches, manage workspace memory profiles, execute autonomous plans with checkpoints, and simulate policy routing — all within the sandboxed workspace. workspace_scout + workspace_checkpoint + autonomous_loop + workspace_autonomous_plan_execute together form a safe, bounded autonomous coding loop with full audit trail. Approval gate for medium/high actions preserves human oversight over all destructive operations.

## ADR-009: Post-MVP Developer Agent Expansion and Multi-Agent Roadmap
1. Decision
- Post-MVP development follows the phased roadmap defined in the full system architecture document.
- Near-term (Pilot, Weeks 21–30): Production connector SDK hardening, autonomous coding loop chaining, per-workspace LLM config persistence, approval latency SLA enforcement, evidence freshness automation.
- Medium-term (Scale, Weeks 31–42): QA Agent role, Manager Agent role, multi-agent orchestration with shared approval queue, additional connectors (Confluence, Slack, Linear, Azure DevOps), container-native density migration from VM to Azure Container Apps.
- Enterprise (Week 43+): SAML/SSO federation, policy-pack customization per tenant, multi-region deployment, live meeting participation (separate voice pipeline gate required), compliance export automation, AgentFarm Marketplace, BYOM (bring-your-own-model) with same risk/approval layer, Developer Agent persistent workspace memory.
- Each new agent role requires: its own ADR, the same HIGH/MEDIUM/LOW risk taxonomy, full audit evidence, and capability snapshot binding before launch.
- Container-native density migration requires a separate ADR and security review before any tenant moves from VM isolation.
- Live meeting participation (voice join and spoken Q&A) is out of scope until a separate safety gate is established and approved by the Safety Lead.
2. Owner
- Product Lead + Engineering Lead
3. Status
- Planned
4. Decision Date
- 2026-04-30
5. Review Date
- 2026-06-30 (Scale Phase entry gate)
6. Impact
- Provides a governed, ADR-backed path from single-agent MVP to multi-agent enterprise platform. Prevents ad-hoc scope creep by requiring each expansion phase to go through the same architecture gate process that governed MVP.

## Change Rules
1. Any architecture change that affects release gates creates a new ADR entry.
2. Superseded ADRs must link to replacement ADR.
3. ADR status must be reviewed weekly in architecture governance meeting.

