# Developer Bot Architecture

**Last updated:** 2026-05-01

## Purpose
Define how the AgentFarm Developer Bot operates across multiple technologies. This document covers:
- the implemented local workspace execution action catalog
- the MVP and production-ready architecture
- JSON schemas for stack detection and tech adapters

## Design Principles
1. The LLM is the reasoning engine, not the whole system.
2. Repo-aware execution is mandatory for reliable code changes.
3. Technology-specific behavior must be isolated behind adapters.
4. Every generated change must be validated by tools.
5. Cross-stack behavior must use normalized intents, not framework-specific prompts.

---

## Implemented Action Catalog (local-workspace-executor.ts)

The Developer Agent executes all local workspace operations through `executeLocalWorkspaceAction()`. Each action runs in a sandboxed directory (`/tmp/agentfarm-workspaces/<tenantId>/<botId>/<workspaceKey>`).

### Git Actions

| Action | Payload Fields | Output |
|---|---|---|
| `git_clone` | `remote_url`, `workspace_key`, `branch?` | `cloned:<remote>` |
| `git_branch` | `workspace_key`, `branch_name?`, `auto_name?`, `task_type?`, `task_description?` | branch name created |
| `git_commit` | `workspace_key`, `message?`, `auto_message?`, `task_type?`, `change_summary?` | commit SHA |
| `git_push` | `workspace_key`, `branch?`, `remote?`, `force?` | push result (**HIGH risk**) |
| `git_stash` | `workspace_key`, `action` (`push`\|`pop`\|`drop`\|`list`), `message?` | stash output |
| `git_log` | `workspace_key`, `limit?`, `branch?`, `since?` | JSON `[{hash, short_hash, subject, author_name, author_email, date}]` |

### Code Read/Write Actions

| Action | Payload Fields | Output |
|---|---|---|
| `code_read` | `workspace_key`, `file_path` | file content |
| `code_edit` | `workspace_key`, `file_path`, `content` | `written:<path>` |
| `code_edit_patch` | `workspace_key`, `file_path`, `old_snippet`, `new_snippet` | patch result |
| `code_search_replace` | `workspace_key`, `pattern`, `replacement`, `flags?`, `file_pattern?` | JSON `{file, replacements_count}[]` |
| `apply_patch` | `workspace_key`, `patch_text`, `check_only?` | `patch:applied:ok` or `patch:check:ok` |
| `file_move` | `workspace_key`, `from_path`, `to_path` | `moved:<from>→<to>` |
| `file_delete` | `workspace_key`, `file_path`, `recursive?` | `deleted:<path>` |

### Execution Actions

| Action | Payload Fields | Output |
|---|---|---|
| `run_build` | `workspace_key`, `command?`, `max_time_ms?` | build stdout/stderr, exit code |
| `run_tests` | `workspace_key`, `command?`, `max_time_ms?` | test stdout/stderr, exit code |
| `run_linter` | `workspace_key`, `command?`, `fix?`, `file_path?`, `max_time_ms?` | lint output |
| `workspace_install_deps` | `workspace_key`, `command?` | install output (auto-detects pnpm/yarn/npm/pip/go/cargo) |
| `run_shell_command` | `workspace_key`, `command`, `timeout_ms?` | stdout/stderr (**HIGH risk**, allowlisted commands only) |

### Workspace Intelligence Actions

| Action | Payload Fields | Output |
|---|---|---|
| `workspace_list_files` | `workspace_key`, `pattern?`, `max_depth?`, `include_dirs?` | JSON string array of relative paths |
| `workspace_grep` | `workspace_key`, `pattern`, `file_pattern?`, `context_lines?`, `max_results?` | JSON `[{file, line, col, text, context_before?, context_after?}]` |
| `workspace_scout` | `workspace_key`, `include_readme?`, `include_deps?` | JSON summary: language, framework, package_manager, test_command, build_command, scripts, readme_excerpt, dependencies |
| `workspace_checkpoint` | `workspace_key`, `checkpoint_name?`, `restore_from?` | `checkpoint:saved:<branch>` or `checkpoint:restored:<ref>` |
| `workspace_diff` | `workspace_key` | git diff output |
| `workspace_cleanup` | `workspace_key` | `cleanup:ok` |

### Memory & PR Actions

| Action | Payload Fields | Output |
|---|---|---|
| `workspace_memory_write` | `workspace_key`, `key`, `value` | `memory:written` |
| `workspace_memory_read` | `workspace_key`, `key?` | JSON object of stored notes |
| `create_pr_from_workspace` | `workspace_key`, `title?`, `body?`, `base?` | JSON `{pr_title, pr_body}` |
| `autonomous_loop` | `workspace_key`, `fix_command`, `test_command?`, `max_attempts?` | JSON `{log, attempts: [{attempt, passed, test_exit_code, ...}]}` |

### Tier 12 Specialist Profiles

Tier 12 mutation flows now support a native specialist-profile layer instead of depending on external agent CLIs. The profile is selected explicitly with `specialist_profile` or inferred from the prompt/workflow. The resolved profile is returned in dry-run and execution output for auditability.

| Profile | Primary Actions | Imported Source Basis | Runtime Decision |
|---|---|---|---|
| `general_software_engineer` | `workspace_subagent_spawn` | OpenClaw `code-reviewer` agent | Adapted into AgentFarm-native execution brief |
| `github_issue_fix` | `workspace_github_issue_fix`, `workspace_subagent_spawn` | OpenClaw `gh-issues`, `github`, `github-issue-triager` | GitHub repair workflow kept native, source logic adapted |
| `github_pr_review` | `workspace_github_pr_status`, `workspace_subagent_spawn` | OpenClaw `github` skill, `github-pr-reviewer`, `code-reviewer` agents | Read-only PR intelligence plus structured review rubric |
| `github_issue_triage` | `workspace_github_issue_triage`, `workspace_subagent_spawn` | OpenClaw `github-issue-triager`, `github`, `slack` | Adapted triage/routing workflow |
| `azure_deployment` | `workspace_azure_deploy_plan`, `workspace_subagent_spawn` | OpenClaw `Azure CLI`, `azd-deployment`, `azure-infra`, `deploy-guardian` | Azure planning brief with deterministic deploy/rollback guidance |
| `deploy_guardian` | `workspace_subagent_spawn` | OpenClaw `deploy-guardian`, `slack` | Adapted deploy monitoring and rollback posture |
| `incident_responder` | `workspace_subagent_spawn` | OpenClaw `incident-responder`, `slack` | Adapted incident triage and communication posture |

#### Tier 12 Payload Extensions

The following payload fields are now supported on Tier 12 autonomous mutation flows:

| Field | Actions | Purpose |
|---|---|---|
| `specialist_profile` / `workflow_profile` | `workspace_subagent_spawn`, `workspace_github_issue_fix`, `workspace_github_issue_triage`, `workspace_azure_deploy_plan` | Force a specialist profile instead of prompt inference |
| `workflow` | `workspace_subagent_spawn`, `workspace_github_issue_fix`, `workspace_azure_deploy_plan` | Hint profile resolution and execution posture |
| `initial_plan` | `workspace_subagent_spawn`, `workspace_github_issue_fix` | Deterministic pre-verification edit/build/test steps; can now be emitted by the LLM planner as payload overrides |
| `fix_attempts` | `workspace_subagent_spawn`, `workspace_github_issue_fix` | Deterministic retry steps for bounded repair loops; can now be emitted by the LLM planner as payload overrides |
| `test_commands` | `workspace_subagent_spawn`, `workspace_github_issue_fix` | Per-attempt verification commands |
| `test_command`, `build_command` | `workspace_subagent_spawn`, `workspace_azure_deploy_plan` | Explicit verification/build commands or planner-emitted overrides for dry-run and execution paths |
| `issue_title`, `issue_body` | `workspace_github_issue_fix` | Dry-run and offline planning without requiring live GitHub fetch |
| `labels` | `workspace_github_issue_triage` | Enables offline issue classification and routing without a live GitHub round-trip |
| `objective`, `environment`, `subscription`, `resource_group`, `location`, `service_name` | `workspace_azure_deploy_plan` | Deterministic Azure deployment planning inputs for preflight, deploy, verify, and rollback output |

The runtime still executes through `executeAutonomousLoop()` and returns `engine: agentfarm-autonomous`; the imported skills and agents are treated as workflow blueprints, not executable dependencies.

The LLM decision adapter can now return sanitized `payloadOverrides`, and runtime-server preserves that merged `executionPayload` through approval intake, direct local execution, and connector execution. This lets `workspace_subagent_spawn` receive model-generated `initial_plan` and `fix_attempts` without discarding the original user payload.

---

## Minimal MVP Architecture
The MVP optimizes for one strong workflow: make safe, localized code changes in a known repository.

### Goals
1. Support a small number of common stacks well.
2. Detect stack automatically from repo signals.
3. Convert user requests into normalized engineering intents.
4. Route those intents into stack-specific code generation rules.
5. Apply changes and validate with typecheck, test, and lint when available.

### MVP Components

1. **Request Intake** — Accepts user task such as "add auth", "create CRUD API", "fix failing test". Produces a normalized task envelope.

2. **Repo Scanner (`workspace_scout`)** — Reads lockfiles, package manifests, config files. Detects language, framework, build tools, test tools, package manager, and deployment style. _Implemented as `workspace_scout` action._

3. **Stack Detector** — Produces a ranked list of likely stacks with confidence. Picks the primary adapter only when confidence exceeds a threshold.

4. **Intent Planner** — Converts user request into normalized engineering operations: `create_endpoint`, `add_validation`, `create_model`, `update_tests`, `fix_type_error`, `add_ui_form`.

5. **Tech Adapter** — One adapter per supported stack. Encodes conventions for project layout, dependency patterns, test strategy, code style, file ownership boundaries, validation commands.

6. **Patch Executor (`code_edit`, `code_edit_patch`, `code_search_replace`, `apply_patch`)** — Applies file changes. Keeps edits local and minimal. Avoids touching unrelated files. _All implemented._

7. **Validation Runner (`run_tests`, `run_build`, `run_linter`)** — Runs the cheapest relevant check first: targeted unit test → typecheck → lint → broader package validation. _All implemented with auto-detection._

8. **Fix Loop (`autonomous_loop`)** — If validation fails, retries within the same local slice. Returns structured JSON with per-attempt results. Stops after bounded attempts. _Implemented._

### MVP Supported Stacks
1. TypeScript + Next.js
2. TypeScript + Fastify or Express
3. Python + FastAPI
4. Java + Spring Boot
5. C# + ASP.NET Core Web API

### MVP Data Flow
```text
User Request
  -> Request Intake
  -> workspace_scout  (language/framework detection)
  -> Stack Detector   (adapter selection)
  -> Intent Planner   (normalized ops)
  -> Tech Adapter     (stack conventions)
  -> code_edit / code_edit_patch / apply_patch  (patch execution)
  -> run_tests / run_build / run_linter         (validation)
  -> autonomous_loop  (fix loop if validation fails)
  -> git_commit / create_pr_from_workspace / git_push
```



2. Repo Intelligence Service
- Builds a structured model of the repository.
- Tracks:
  - languages
  - frameworks
  - package graph
  - test runners
  - deployment model
  - code ownership boundaries
  - quality commands

3. Stack Detection Service
- Produces ranked stack candidates.
- Handles mixed monorepos, such as Next.js frontend plus NestJS backend plus Python jobs.
- Supports multiple active adapters in one repo.

4. Intent Orchestrator
- Breaks a request into sub-operations.
- Assigns each sub-operation to the correct adapter.
- Example:
  - UI change -> Next.js adapter
  - API contract update -> Fastify adapter
  - schema migration -> Prisma adapter

5. Adapter Registry
- Central registry of supported technology adapters.
- Each adapter declares:
  - supported stacks
  - supported operations
  - constraints
  - validation strategy
  - fallback behavior

6. Prompt and Context Builder
- Selects only the relevant code context.
- Injects repo conventions, coding rules, and stack-specific instructions.
- Prevents cross-stack contamination.

7. Execution Sandbox
- Runs edits and validation in a controlled environment.
- Separates planning from mutation.
- Enables rollback on failed workflows.

8. Policy and Risk Engine
- Classifies changes by risk.
- Example:
  - low: isolated test fix
  - medium: API behavior change
  - high: auth, infra, secrets, data deletion
- Requires human approval for medium or high-risk categories if configured.

9. Validation and Repair Service
- Executes validation pipelines.
- Performs bounded local repair loops.
- Captures structured failure reasons.

10. Evidence and Audit Service
- Stores:
  - detected stack
  - chosen adapter
  - generated plan
  - files changed
  - commands run
  - validation results
  - approval events

11. Memory Service
- Stores repo-specific learning safely.
- Example:
  - preferred test command
  - stable paths for domain models
  - team naming conventions
  - successful migration patterns

### Production Data Flow
```text
User Request
  -> Task Gateway
  -> Repo Intelligence Service
  -> Stack Detection Service
  -> Intent Orchestrator
  -> Adapter Registry lookup
  -> Prompt and Context Builder
  -> Execution Sandbox
  -> Validation and Repair Service
  -> Evidence and Audit Service
  -> Final Result
```

### Production Safety Controls
1. Require adapter confidence threshold before code generation.
2. Require repo-local examples before broad code generation in unfamiliar stacks.
3. Enforce protected paths for secrets, infra, and identity code.
4. Allow rollback or patch rejection on validation failure.
5. Record every risky action with traceability.

## Technology Strategy
The developer bot should not ask, "What should the LLM do for this technology?"
It should ask, "Which adapter owns this technology, and what are that adapter's rules?"

### Recommended Separation
1. Normalized Intent Layer
- Shared across all stacks.
- Example: `create_endpoint`, `add_test`, `fix_build_error`.

2. Stack Detection Layer
- Determines which adapters are active.

3. Tech Adapter Layer
- Converts normalized intents into framework-correct file changes.

4. Validation Layer
- Ensures the adapter's output actually works.

## JSON Schema: Stack Detection Result
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentfarm.dev/schemas/stack-detection-result.schema.json",
  "title": "StackDetectionResult",
  "type": "object",
  "required": [
    "repoId",
    "detectedAt",
    "primaryStack",
    "candidates",
    "signals",
    "validationCommands"
  ],
  "properties": {
    "repoId": {
      "type": "string"
    },
    "detectedAt": {
      "type": "string",
      "format": "date-time"
    },
    "primaryStack": {
      "$ref": "#/$defs/stackCandidate"
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/stackCandidate"
      }
    },
    "signals": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/detectionSignal"
      }
    },
    "validationCommands": {
      "$ref": "#/$defs/validationCommands"
    },
    "repoShape": {
      "type": "string",
      "enum": ["single-app", "monorepo", "polyrepo-fragment", "unknown"]
    },
    "notes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "$defs": {
    "stackCandidate": {
      "type": "object",
      "required": ["id", "language", "framework", "confidence", "packageManager"],
      "properties": {
        "id": {
          "type": "string"
        },
        "language": {
          "type": "string"
        },
        "framework": {
          "type": "string"
        },
        "runtime": {
          "type": "string"
        },
        "packageManager": {
          "type": "string"
        },
        "buildTool": {
          "type": "string"
        },
        "testTool": {
          "type": "string"
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "rootPaths": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "detectionSignal": {
      "type": "object",
      "required": ["kind", "value", "weight"],
      "properties": {
        "kind": {
          "type": "string",
          "enum": ["file", "dependency", "config", "import", "folder", "script"]
        },
        "value": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "weight": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    },
    "validationCommands": {
      "type": "object",
      "properties": {
        "install": {
          "type": "array",
          "items": { "type": "string" }
        },
        "build": {
          "type": "array",
          "items": { "type": "string" }
        },
        "typecheck": {
          "type": "array",
          "items": { "type": "string" }
        },
        "lint": {
          "type": "array",
          "items": { "type": "string" }
        },
        "test": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

## JSON Schema: Tech Adapter Definition
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentfarm.dev/schemas/tech-adapter.schema.json",
  "title": "TechAdapterDefinition",
  "type": "object",
  "required": [
    "adapterId",
    "displayName",
    "stacks",
    "supportedOperations",
    "fileRules",
    "validationStrategy"
  ],
  "properties": {
    "adapterId": {
      "type": "string"
    },
    "displayName": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "stacks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      }
    },
    "supportedOperations": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "create_endpoint",
          "create_model",
          "update_model",
          "add_validation",
          "add_ui_form",
          "fix_type_error",
          "fix_test",
          "refactor_component",
          "add_migration",
          "update_contract",
          "add_tests"
        ]
      }
    },
    "fileRules": {
      "type": "object",
      "required": ["ownedGlobs", "forbiddenGlobs"],
      "properties": {
        "ownedGlobs": {
          "type": "array",
          "items": { "type": "string" }
        },
        "forbiddenGlobs": {
          "type": "array",
          "items": { "type": "string" }
        },
        "preferredRoots": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "conventions": {
      "type": "object",
      "properties": {
        "dependencyStyle": {
          "type": "string"
        },
        "testPlacement": {
          "type": "string"
        },
        "configFiles": {
          "type": "array",
          "items": { "type": "string" }
        },
        "notes": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "validationStrategy": {
      "type": "object",
      "required": ["order"],
      "properties": {
        "order": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["targeted-test", "typecheck", "lint", "build", "integration-test"]
          }
        },
        "commands": {
          "type": "object",
          "properties": {
            "targeted-test": {
              "type": "array",
              "items": { "type": "string" }
            },
            "typecheck": {
              "type": "array",
              "items": { "type": "string" }
            },
            "lint": {
              "type": "array",
              "items": { "type": "string" }
            },
            "build": {
              "type": "array",
              "items": { "type": "string" }
            },
            "integration-test": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        }
      }
    },
    "riskHints": {
      "type": "object",
      "properties": {
        "protectedAreas": {
          "type": "array",
          "items": { "type": "string" }
        },
        "requiresApprovalFor": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

## Example: Next.js Adapter Instance
```json
{
  "adapterId": "nextjs-app-router-typescript",
  "displayName": "Next.js App Router + TypeScript",
  "version": "1.0.0",
  "stacks": ["typescript", "react", "nextjs-app-router"],
  "supportedOperations": [
    "add_ui_form",
    "fix_type_error",
    "fix_test",
    "refactor_component",
    "create_endpoint",
    "add_tests"
  ],
  "fileRules": {
    "ownedGlobs": ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx", "lib/**/*.ts"],
    "forbiddenGlobs": ["infrastructure/**", "services/**"],
    "preferredRoots": ["app", "components", "lib"]
  },
  "conventions": {
    "dependencyStyle": "workspace-first",
    "testPlacement": "near-feature-or-tests-folder",
    "configFiles": ["next.config.ts", "tsconfig.json", "package.json"],
    "notes": [
      "Prefer App Router conventions",
      "Prefer server/client boundaries to be explicit",
      "Validate route handlers and page components separately"
    ]
  },
  "validationStrategy": {
    "order": ["typecheck", "targeted-test", "build"],
    "commands": {
      "typecheck": ["pnpm typecheck"],
      "targeted-test": ["pnpm test"],
      "build": ["pnpm build"]
    }
  },
  "riskHints": {
    "protectedAreas": ["app/api/auth/**", "middleware.ts"],
    "requiresApprovalFor": ["auth-flow-changes", "billing-flow-changes"]
  }
}
```

## Operational Recommendation for AgentFarm
For the Developer Bot in AgentFarm, the best rollout path is:
1. Ship MVP with a small adapter set and strong validation.
2. Build repo intelligence before broadening stack support.
3. Treat adapter coverage as a product surface with versioning.
4. Store evidence for every generated change.
5. Expand stack support only after each adapter is stable in production.

## Immediate Next Steps
1. Implement `stack-detection-result` as a shared package contract.
2. Implement `tech-adapter` registry as a shared internal package.
3. Add repo scan jobs that produce a cached repo profile.
4. Route developer bot requests through normalized intents before code generation.
5. Add approval and evidence hooks for risky code changes.
