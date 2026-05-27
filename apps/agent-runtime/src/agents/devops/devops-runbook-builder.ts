// ============================================================================
// DEVOPS RUNBOOK BUILDER
//
// Provides a lightweight runbook DSL interpreter for the
// workspace_devops_runbook_execute action.
//
// DSL Schema
// ----------
// A runbook is a JSON/YAML object with a `steps` array.  Each element is
// either a RunbookActionStep or a RunbookBranchNode.
//
//   RunbookActionStep:
//     id       — unique step identifier (required for branching targets)
//     action   — DevOps action type string, e.g. "workspace_devops_k8s_status"
//     payload  — arbitrary payload forwarded to the action
//     on_error — "abort" (default) | "continue" | "goto"
//     goto_step — step id to jump to when on_error=="goto"
//     retry    — number of retries on failure (default 0)
//     timeout_ms — per-step timeout passed to executeAction (informational)
//
//   RunbookBranchNode:
//     if   — condition expression string (see evaluateCondition)
//     then — step id to execute when condition is true
//     else — step id to execute when condition is false (optional)
//
// Condition expression grammar (subset, no eval):
//   <stepId>.ok === true|false
//   <stepId>.output includes '<text>'
//   <stepId>.output includes "<text>"
//   <stepId>.exitCode === <number>
//   true | false
//
// Example runbook:
// {
//   "name": "Rolling restart with verification",
//   "steps": [
//     { "id": "restart", "action": "workspace_devops_k8s_deploy",
//       "payload": { "action": "rollout_restart", "deployment": "api", "namespace": "prod" } },
//     { "if": "restart.ok === false", "then": "rollback", "else": "verify" },
//     { "id": "verify", "action": "workspace_devops_deploy_verify",
//       "payload": { "deployment": "api", "namespace": "prod" } },
//     { "if": "verify.ok === false", "then": "rollback", "else": "done" },
//     { "id": "rollback", "action": "workspace_devops_k8s_rollback",
//       "payload": { "deployment": "api", "namespace": "prod" } },
//     { "id": "done", "action": "workspace_devops_standup_report",
//       "payload": { "description": "Rolling restart completed." } }
//   ]
// }
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An action step in a runbook. */
export interface RunbookActionStep {
    /** Stable identifier; required when used as a branch target. */
    id:       string;
    /** DevOps action type string, e.g. "workspace_devops_k8s_status". */
    action:   string;
    /** Payload forwarded verbatim to the action handler. */
    payload:  Record<string, unknown>;
    /**
     * What to do when the action returns ok=false.
     *   "abort"    — stop the runbook (default)
     *   "continue" — proceed to the next step
     *   "goto"     — jump to goto_step
     */
    on_error?:  'abort' | 'continue' | 'goto';
    goto_step?: string;
    /** Number of retries on failure before applying on_error logic. */
    retry?:     number;
    /** Per-step timeout hint (ms) passed in the payload as __timeout_ms. */
    timeout_ms?: number;
}

/** A conditional branch node — no action is executed. */
export interface RunbookBranchNode {
    /** Condition expression evaluated against prior step results. */
    if:    string;
    /** ID of the step to execute when the condition is true. */
    then:  string;
    /** ID of the step to execute when the condition is false. */
    else?: string;
}

/**
 * A checkpoint node that pauses execution until a human approves or a signal
 * is received.  When encountered, the runbook halts and returns a partial
 * result with `pausedAt` set.  The orchestrator can resume by re-running the
 * runbook with `resume_from_step` pointing to the step AFTER this checkpoint.
 */
export interface RunbookCheckpointNode {
    /** Stable identifier for the checkpoint. */
    id:              string;
    /** Type discriminator. */
    checkpoint:      true;
    /** Human-readable reason displayed in the dashboard task. */
    require_approval: string;
    /**
     * Optional: escalation type for the dashboard task.
     * Defaults to 'approval_required'.
     */
    escalation_type?: string;
    /**
     * Optional: metadata forwarded to the dashboard task artifacts.
     */
    metadata?: Record<string, unknown>;
}

export type RunbookNode = RunbookActionStep | RunbookBranchNode | RunbookCheckpointNode;

/** Top-level runbook definition. */
export interface RunbookDefinition {
    name?:        string;
    description?: string;
    /** Ordered list of steps (action steps and branch nodes). */
    steps:        RunbookNode[];
}

/** Result of executing a single RunbookActionStep. */
export interface StepExecutionResult {
    stepId:      string;
    action:      string;
    ok:          boolean;
    output:      string;
    errorOutput: string;
    durationMs:  number;
    retries:     number;
    skipped:     boolean;
    exitCode?:   number;
}

/** Aggregated result of an entire runbook execution. */
export interface RunbookResult {
    name?:          string;
    ok:             boolean;
    stepsTotal:     number;
    stepsExecuted:  number;
    stepsSucceeded: number;
    stepsFailed:    number;
    abortedAt?:     string;
    /** Set when execution is paused at a checkpoint awaiting human approval. */
    pausedAt?:      string;
    /** The checkpoint node that triggered the pause. */
    pausedCheckpoint?: RunbookCheckpointNode;
    /** Step index to resume from after approval. */
    resumeFromIndex?: number;
    results:        StepExecutionResult[];
    report:         string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRunbookBranchNode(node: RunbookNode): node is RunbookBranchNode {
    return 'if' in node && 'then' in node;
}

export function isRunbookActionStep(node: RunbookNode): node is RunbookActionStep {
    return 'action' in node;
}

export function isRunbookCheckpointNode(node: RunbookNode): node is RunbookCheckpointNode {
    return 'checkpoint' in node && (node as RunbookCheckpointNode).checkpoint === true;
}

// ---------------------------------------------------------------------------
// Condition evaluator  (no eval — safe expression subset)
// ---------------------------------------------------------------------------

/**
 * Evaluates a condition string against the accumulated step results.
 *
 * Supported forms:
 *   true | false
 *   <stepId>.ok === true|false
 *   <stepId>.ok !== true|false
 *   <stepId>.output includes '<text>'
 *   <stepId>.output includes "<text>"
 *   <stepId>.exitCode === <number>
 */
export function evaluateCondition(
    condition: string,
    stepResults: Map<string, StepExecutionResult>,
): boolean {
    const cond = condition.trim();

    // Literal booleans
    if (cond === 'true')  return true;
    if (cond === 'false') return false;

    // <stepId>.ok === true|false
    const okEqMatch = cond.match(/^(\w+)\.ok\s*===\s*(true|false)$/);
    if (okEqMatch) {
        const [, stepId, expected] = okEqMatch;
        const r = stepResults.get(stepId!);
        if (!r) return expected === 'false';   // step not run → treat as failed
        return r.ok === (expected === 'true');
    }

    // <stepId>.ok !== true|false
    const okNeqMatch = cond.match(/^(\w+)\.ok\s*!==\s*(true|false)$/);
    if (okNeqMatch) {
        const [, stepId, expected] = okNeqMatch;
        const r = stepResults.get(stepId!);
        if (!r) return expected === 'true';
        return r.ok !== (expected === 'true');
    }

    // <stepId>.output includes 'text'  (single-quoted)
    const inclSqMatch = cond.match(/^(\w+)\.output\s+includes\s+'([^']*)'$/);
    if (inclSqMatch) {
        const [, stepId, text] = inclSqMatch;
        const r = stepResults.get(stepId!);
        return r ? r.output.includes(text!) : false;
    }

    // <stepId>.output includes "text"  (double-quoted)
    const inclDqMatch = cond.match(/^(\w+)\.output\s+includes\s+"([^"]*)"$/);
    if (inclDqMatch) {
        const [, stepId, text] = inclDqMatch;
        const r = stepResults.get(stepId!);
        return r ? r.output.includes(text!) : false;
    }

    // <stepId>.exitCode === <number>
    const exitCodeMatch = cond.match(/^(\w+)\.exitCode\s*===\s*(\d+)$/);
    if (exitCodeMatch) {
        const [, stepId, code] = exitCodeMatch;
        const r = stepResults.get(stepId!);
        if (!r) return false;
        return (r.exitCode ?? (r.ok ? 0 : 1)) === parseInt(code!, 10);
    }

    // Unknown — treat as false
    return false;
}

// ---------------------------------------------------------------------------
// Runbook parsing
// ---------------------------------------------------------------------------

/**
 * Parses a raw JSON string or plain object into a RunbookDefinition.
 * Throws a descriptive error if the input is invalid.
 */
export function parseRunbookDefinition(raw: unknown): RunbookDefinition {
    let obj: unknown = raw;

    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw);
        } catch (e) {
            throw new Error(`Runbook definition is not valid JSON: ${(e as Error).message}`);
        }
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Runbook definition must be a JSON object with a "steps" array');
    }

    const def = obj as Record<string, unknown>;
    if (!Array.isArray(def['steps']) || def['steps'].length === 0) {
        throw new Error('Runbook definition must contain a non-empty "steps" array');
    }

    const steps: RunbookNode[] = (def['steps'] as unknown[]).map((s, i) => {
        if (!s || typeof s !== 'object') {
            throw new Error(`Step ${i} is not an object`);
        }
        const step = s as Record<string, unknown>;

        if ('if' in step && 'then' in step) {
            if (typeof step['if'] !== 'string' || typeof step['then'] !== 'string') {
                throw new Error(`Branch node at index ${i} must have string "if" and "then" fields`);
            }
            return {
                if:   step['if'],
                then: step['then'],
                else: typeof step['else'] === 'string' ? step['else'] : undefined,
            } as RunbookBranchNode;
        }

        if ('checkpoint' in step && step['checkpoint'] === true) {
            if (typeof step['id'] !== 'string') {
                throw new Error(`Checkpoint node at index ${i} must have a string "id" field`);
            }
            return {
                id:               step['id'],
                checkpoint:       true,
                require_approval: typeof step['require_approval'] === 'string' ? step['require_approval'] : 'Manual approval required',
                escalation_type:  typeof step['escalation_type'] === 'string' ? step['escalation_type'] : undefined,
                metadata:         (step['metadata'] && typeof step['metadata'] === 'object' && !Array.isArray(step['metadata']))
                                    ? step['metadata'] as Record<string, unknown>
                                    : undefined,
            } as RunbookCheckpointNode;
        }

        if ('action' in step) {
            if (typeof step['id'] !== 'string') {
                throw new Error(`Action step at index ${i} must have a string "id" field`);
            }
            return {
                id:         step['id'],
                action:     String(step['action'] ?? ''),
                payload:    (step['payload'] && typeof step['payload'] === 'object' && !Array.isArray(step['payload']))
                                ? step['payload'] as Record<string, unknown>
                                : {},
                on_error:   ['abort', 'continue', 'goto'].includes(String(step['on_error'] ?? ''))
                                ? step['on_error'] as RunbookActionStep['on_error']
                                : 'abort',
                goto_step:  typeof step['goto_step'] === 'string' ? step['goto_step'] : undefined,
                retry:      typeof step['retry'] === 'number' ? step['retry'] : 0,
                timeout_ms: typeof step['timeout_ms'] === 'number' ? step['timeout_ms'] : undefined,
            } as RunbookActionStep;
        }

        throw new Error(`Step ${i} must have either an "action" field, "if"/"then" fields (branch), or "checkpoint: true" field`);
    });

    return {
        name:        typeof def['name'] === 'string'        ? def['name']        : undefined,
        description: typeof def['description'] === 'string' ? def['description'] : undefined,
        steps,
    };
}

// ---------------------------------------------------------------------------
// Runbook index builder
// ---------------------------------------------------------------------------

/**
 * Builds a Map of step-id → {stepIndex, node} for O(1) lookup.
 * Branch nodes are not indexed as they have no id.
 */
function buildStepIndex(nodes: RunbookNode[]): Map<string, { idx: number; node: RunbookActionStep }> {
    const index = new Map<string, { idx: number; node: RunbookActionStep }>();
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        if (isRunbookActionStep(node)) {
            index.set(node.id, { idx: i, node });
        }
    }
    return index;
}

// ---------------------------------------------------------------------------
// Runbook executor
// ---------------------------------------------------------------------------

type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<{
    ok:          boolean;
    output:      string;
    errorOutput?: string;
}>;

/**
 * Executes a runbook definition using the provided executeAction callback.
 *
 * @param runbook       — Parsed RunbookDefinition
 * @param executeAction — Callback that invokes a DevOps action
 * @param maxSteps      — Safety limit on total steps (default 50)
 */
export async function executeRunbook(
    runbook:       RunbookDefinition,
    executeAction: ExecuteActionFn,
    maxSteps = 50,
): Promise<RunbookResult> {
    const nodes      = runbook.steps;
    const stepIndex  = buildStepIndex(nodes);
    const results    = new Map<string, StepExecutionResult>();
    const ordered:   StepExecutionResult[] = [];

    let cursor     = 0;            // index into nodes[]
    let iterations = 0;
    let abortedAt: string | undefined;

    while (cursor < nodes.length && iterations < maxSteps) {
        iterations++;
        const node = nodes[cursor]!;

        // ── Branch node ──────────────────────────────────────────────────────
        if (isRunbookBranchNode(node)) {
            const taken = evaluateCondition(node.if, results);
            const target = taken ? node.then : (node.else ?? null);
            if (!target) {
                // No else branch — end of runbook
                break;
            }
            const entry = stepIndex.get(target);
            if (!entry) {
                // Unknown step id — abort
                abortedAt = `branch target "${target}" not found`;
                break;
            }
            cursor = entry.idx;
            continue;
        }

        // ── Checkpoint node ──────────────────────────────────────────────────
        if (isRunbookCheckpointNode(node)) {
            // Pause execution — return partial result with resumeFromIndex
            const succeeded2 = ordered.filter((r) => r.ok && !r.skipped).length;
            const failed2    = ordered.filter((r) => !r.ok && !r.skipped).length;
            const report2    = formatRunbookReport({
                name:           runbook.name,
                ok:             false,
                stepsTotal:     nodes.filter(isRunbookActionStep).length,
                stepsExecuted:  ordered.length,
                stepsSucceeded: succeeded2,
                stepsFailed:    failed2,
                pausedAt:       node.id,
                pausedCheckpoint: node,
                resumeFromIndex: cursor + 1,
                results:        ordered,
                report:         '',
            });
            return {
                name:             runbook.name,
                ok:               false,
                stepsTotal:       nodes.filter(isRunbookActionStep).length,
                stepsExecuted:    ordered.length,
                stepsSucceeded:   succeeded2,
                stepsFailed:      failed2,
                pausedAt:         node.id,
                pausedCheckpoint: node,
                resumeFromIndex:  cursor + 1,
                results:          ordered,
                report:           report2,
            };
        }

        // ── Action step ──────────────────────────────────────────────────────
        const step     = node as RunbookActionStep;
        let   retries  = 0;
        const maxRetry = Math.max(0, step.retry ?? 0);
        let   sub: { ok: boolean; output: string; errorOutput?: string } = { ok: false, output: '' };
        const stepStart = Date.now();

        do {
            const payload = step.timeout_ms
                ? { ...step.payload, __timeout_ms: step.timeout_ms }
                : step.payload;
            sub = await executeAction(step.action, payload);
            if (sub.ok) break;
            retries++;
        } while (retries <= maxRetry);

        const durationMs = Date.now() - stepStart;
        const stepResult: StepExecutionResult = {
            stepId:      step.id,
            action:      step.action,
            ok:          sub.ok,
            output:      sub.output ?? '',
            errorOutput: sub.errorOutput ?? '',
            durationMs,
            retries:     retries > 0 ? retries - 1 : 0,
            skipped:     false,
            exitCode:    typeof (sub as any)['exit_code'] === 'number' ? (sub as any)['exit_code'] : undefined,
        };

        results.set(step.id, stepResult);
        ordered.push(stepResult);

        if (!sub.ok) {
            const onError = step.on_error ?? 'abort';
            if (onError === 'abort') {
                abortedAt = step.id;
                cursor++;
                break;
            }
            if (onError === 'goto' && step.goto_step) {
                const entry = stepIndex.get(step.goto_step);
                if (!entry) {
                    abortedAt = `goto target "${step.goto_step}" not found`;
                    break;
                }
                cursor = entry.idx;
                continue;
            }
            // on_error === 'continue' — fall through to next step
        }

        cursor++;
    }

    const succeeded = ordered.filter((r) => r.ok && !r.skipped).length;
    const failed    = ordered.filter((r) => !r.ok && !r.skipped).length;
    const ok        = !abortedAt && failed === 0;

    const report = formatRunbookReport({
        name:           runbook.name,
        ok,
        stepsTotal:     nodes.filter(isRunbookActionStep).length,
        stepsExecuted:  ordered.length,
        stepsSucceeded: succeeded,
        stepsFailed:    failed,
        abortedAt,
        results:        ordered,
        report:         '',
    });

    return {
        name:           runbook.name,
        ok,
        stepsTotal:     nodes.filter(isRunbookActionStep).length,
        stepsExecuted:  ordered.length,
        stepsSucceeded: succeeded,
        stepsFailed:    failed,
        abortedAt,
        results:        ordered,
        report,
    };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Formats a RunbookResult into a human-readable markdown string. */
export function formatRunbookReport(result: RunbookResult): string {
    const lines: string[] = [];
    const name = result.name ?? 'Unnamed Runbook';

    lines.push(`# Runbook Report — ${name}`);
    const statusLabel = result.ok           ? '✅ Completed'
                      : result.pausedAt     ? `⏸️ Paused at checkpoint \`${result.pausedAt}\` — awaiting approval`
                      : result.abortedAt    ? `❌ Failed (aborted at ${result.abortedAt})`
                      : '❌ Failed';
    lines.push(`**Status:** ${statusLabel}`);
    if (result.pausedCheckpoint) {
        lines.push(`**Approval required:** ${result.pausedCheckpoint.require_approval}`);
        lines.push(`**Resume from index:** ${result.resumeFromIndex ?? 'N/A'}`);
    }
    lines.push('');
    lines.push(
        `| Total Steps | Executed | Succeeded | Failed |`,
    );
    lines.push(`|-------------|----------|-----------|--------|`);
    lines.push(
        `| ${result.stepsTotal} | ${result.stepsExecuted} | ${result.stepsSucceeded} | ${result.stepsFailed} |`,
    );
    lines.push('');
    lines.push('## Step Results');

    for (const r of result.results) {
        const icon     = r.skipped ? '⏭' : r.ok ? '✓' : '✗';
        const retry    = r.retries > 0 ? ` (${r.retries} retr${r.retries === 1 ? 'y' : 'ies'})` : '';
        lines.push(`\n${icon} **${r.stepId}** \`${r.action}\`${retry} — ${r.durationMs}ms`);
        if (!r.ok && r.errorOutput) {
            lines.push(`   ↳ ${r.errorOutput.slice(0, 300)}`);
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM helpers — runbook generation
// ---------------------------------------------------------------------------

/**
 * Builds a prompt asking the LLM to generate a runbook definition JSON for
 * a given objective.
 */
export function buildRunbookGenerationPrompt(
    objective:         string,
    availableActions?: string[],
    context?:          string,
): string {
    const lines: string[] = [];
    lines.push('# Runbook Generation Request');
    lines.push('');
    lines.push(`**Objective:** ${objective}`);
    if (context) {
        lines.push('');
        lines.push(`**Context:** ${context}`);
    }
    if (availableActions && availableActions.length > 0) {
        lines.push('');
        lines.push('**Available action types:**');
        for (const a of availableActions) {
            lines.push(`- \`${a}\``);
        }
    }
    lines.push('');
    lines.push('## Runbook DSL');
    lines.push('Each step must be one of:');
    lines.push('- **Action step**: `{ "id": "<id>", "action": "<action_type>", "payload": {...}, "on_error": "abort|continue|goto", "goto_step"?: "<id>", "retry"?: 0 }`');
    lines.push('- **Branch node**: `{ "if": "<condition>", "then": "<step_id>", "else"?: "<step_id>" }`');
    lines.push('');
    lines.push('Condition examples:');
    lines.push('- `restart.ok === false`');
    lines.push('- `verify.output includes "Ready"`');
    lines.push('- `deploy.exitCode === 0`');
    lines.push('');
    lines.push('## Task');
    lines.push('Generate a complete runbook as a JSON object with name, description, and steps.');
    lines.push('Respond ONLY with a valid JSON code block:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "name": "...",');
    lines.push('  "description": "...",');
    lines.push('  "steps": [ ... ]');
    lines.push('}');
    lines.push('```');
    return lines.join('\n');
}

/**
 * Extracts the JSON block from an LLM runbook generation response and parses
 * it into a RunbookDefinition.  Returns null if parsing fails.
 */
export function parseRunbookGenerationOutput(raw: string): RunbookDefinition | null {
    const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/i) ?? raw.match(/(\{[\s\S]+\})/);
    if (!jsonMatch) return null;
    try {
        return parseRunbookDefinition(jsonMatch[1]!.trim());
    } catch {
        return null;
    }
}
