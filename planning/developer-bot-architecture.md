# Developer Bot Architecture

## Purpose
Define how the AgentFarm Developer Bot should operate across multiple technologies without relying on the LLM alone. This document gives:
- a minimal MVP architecture
- a production-ready architecture
- JSON schemas for stack detection and tech adapters

## Design Principles
1. The LLM is the reasoning engine, not the whole system.
2. Repo-aware execution is mandatory for reliable code changes.
3. Technology-specific behavior must be isolated behind adapters.
4. Every generated change must be validated by tools.
5. Cross-stack behavior must use normalized intents, not framework-specific prompts.

## Minimal MVP Architecture
The MVP should optimize for one strong workflow: make safe, localized code changes in a known repository.

### Goals
1. Support a small number of common stacks well.
2. Detect stack automatically from repo signals.
3. Convert user requests into normalized engineering intents.
4. Route those intents into stack-specific code generation rules.
5. Apply changes and validate with typecheck, test, and lint when available.

### MVP Components
1. Request Intake
- Accepts user task such as "add auth", "create CRUD API", "fix failing test", or "refactor this component".
- Produces a normalized task envelope.

2. Repo Scanner
- Reads lockfiles, package manifests, config files, imports, and folder structure.
- Detects language, framework, build tools, test tools, package manager, and deployment style.

3. Stack Detector
- Produces a ranked list of likely stacks with confidence.
- Picks the primary adapter only when confidence exceeds a threshold.
- Requests user confirmation if ambiguous.

4. Intent Planner
- Converts the user request into normalized engineering operations.
- Example operations:
  - `create_endpoint`
  - `add_validation`
  - `create_model`
  - `update_tests`
  - `fix_type_error`
  - `add_ui_form`

5. Tech Adapter
- One adapter per supported stack.
- Encodes conventions for:
  - project layout
  - dependency patterns
  - test strategy
  - code style
  - file ownership boundaries
  - validation commands

6. Patch Executor
- Applies file changes.
- Keeps edits local and minimal.
- Avoids touching unrelated files.

7. Validation Runner
- Runs the cheapest relevant check first.
- Example order:
  - targeted unit test
  - targeted typecheck
  - targeted lint
  - broader package validation if necessary

8. Fix Loop
- If validation fails, retry within the same local slice.
- Stop after bounded attempts and surface a blocker report.

### MVP Supported Stacks
Recommended first adapters:
1. TypeScript + Next.js
2. TypeScript + Fastify or Express
3. Python + FastAPI
4. Java + Spring Boot
5. C# + ASP.NET Core Web API

### MVP Data Flow
```text
User Request
  -> Request Intake
  -> Repo Scanner
  -> Stack Detector
  -> Intent Planner
  -> Tech Adapter
  -> Patch Executor
  -> Validation Runner
  -> Success or Fix Loop
```

### MVP Storage
Store only the minimum persistent state:
1. Repo profile
2. Last successful validation commands
3. Preferred adapter for the repo
4. Known file boundaries
5. Common failure patterns

## Production-Ready Architecture
The production architecture should support scale, consistency, auditability, and multi-repo reliability.

### Goals
1. Support many stacks and hybrid repositories.
2. Make routing deterministic and explainable.
3. Reuse successful patterns across repos without leaking tenant data.
4. Provide auditable execution for each generated change.
5. Enable policy enforcement, safe retries, and approval for risky operations.

### Production Components
1. Task Gateway
- Entry point for all developer bot requests.
- Handles auth, quotas, request shaping, and trace IDs.

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
