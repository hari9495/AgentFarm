import type { ActionPlan, StepResult } from '@agentfarm/shared-types';
import {
    executeLocalWorkspaceAction,
    type LocalWorkspaceActionType,
} from './local-workspace-executor.js';
import { TaskDependencyDag } from './task-dependency-dag.js';

const HARD_FAIL_ACTIONS = new Set(['workspace_web_login']);

/**
 * Executor function type — structurally compatible with executeLocalWorkspaceAction.
 * Exported so test files can type their stubs without importing local-workspace-executor.
 */
export type StepExecutor = typeof executeLocalWorkspaceAction;

export async function executePlan(
    plan: ActionPlan,
    tenantId: string,
    agentId: string,
    _executor: StepExecutor = executeLocalWorkspaceAction,
): Promise<StepResult[]> {

    // ── Decide execution path ─────────────────────────────────────────────
    const hasDeps = plan.steps.some((s) => (s.depends_on?.length ?? 0) > 0);

    if (!hasDeps) {
        // ── Sequential path (backward-compatible — no dependencies declared) ──
        const results: StepResult[] = [];

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i]!;
            const start = Date.now();

            try {
                const result = await _executor({
                    tenantId,
                    botId: agentId,
                    taskId: `plan-step-${i}`,
                    actionType: step.action as LocalWorkspaceActionType,
                    payload: step.params,
                });

                results.push({
                    step_index: i,
                    action: step.action,
                    success: result.ok,
                    output: result.ok ? result.output : undefined,
                    error: !result.ok ? (result.errorOutput ?? result.output ?? 'action failed') : undefined,
                    duration_ms: Date.now() - start,
                });

                if (!result.ok && HARD_FAIL_ACTIONS.has(step.action)) {
                    break;
                }
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                results.push({
                    step_index: i,
                    action: step.action,
                    success: false,
                    error: errorMsg,
                    duration_ms: Date.now() - start,
                });

                if (HARD_FAIL_ACTIONS.has(step.action)) {
                    break;
                }
            }
        }

        return results;
    }

    // ── Phase-aware parallel path (at least one step has depends_on) ──────

    const dag = new TaskDependencyDag();

    plan.steps.forEach((step, i) => {
        dag.addTask({
            taskId: String(i),
            label: step.action,
            depends_on: (step.depends_on ?? []).map(String),
            status: 'pending',
            depth: 0,
        });
    });

    const validation = dag.validate();
    if (!validation.valid) {
        throw new Error(`Plan has dependency errors: ${validation.errors.join(', ')}`);
    }

    const { phases } = dag.topologicalSort();

    const allResults: (StepResult | undefined)[] = new Array(plan.steps.length);
    let aborted = false;

    for (const phase of phases) {
        if (aborted) break;

        const phaseResults = await Promise.all(
            phase.map(async (taskId) => {
                const stepIndex = Number(taskId);
                const step = plan.steps[stepIndex]!;
                const start = Date.now();

                // Defensive: skip if any hard-fail dependency from a previous phase failed.
                // (In practice, aborted=true would have already broken the outer loop.)
                const depFailed = (step.depends_on ?? []).some(
                    (depIdx) =>
                        allResults[depIdx]?.success === false &&
                        HARD_FAIL_ACTIONS.has(plan.steps[depIdx]!.action),
                );

                if (depFailed) {
                    dag.updateStatus(taskId, 'failed');
                    return {
                        stepIndex,
                        result: {
                            step_index: stepIndex,
                            action: step.action,
                            success: false,
                            error: 'dependency failed',
                            duration_ms: 0,
                        } as StepResult,
                    };
                }

                dag.updateStatus(taskId, 'running');
                try {
                    const result = await _executor({
                        tenantId,
                        botId: agentId,
                        taskId: `plan-step-${stepIndex}`,
                        actionType: step.action as LocalWorkspaceActionType,
                        payload: step.params,
                    });

                    dag.updateStatus(taskId, result.ok ? 'done' : 'failed');

                    if (!result.ok && HARD_FAIL_ACTIONS.has(step.action)) {
                        aborted = true;
                    }

                    return {
                        stepIndex,
                        result: {
                            step_index: stepIndex,
                            action: step.action,
                            success: result.ok,
                            output: result.ok ? result.output : undefined,
                            error: !result.ok ? (result.errorOutput ?? result.output ?? 'action failed') : undefined,
                            duration_ms: Date.now() - start,
                        } as StepResult,
                    };
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    dag.updateStatus(taskId, 'failed');
                    if (HARD_FAIL_ACTIONS.has(step.action)) {
                        aborted = true;
                    }
                    return {
                        stepIndex,
                        result: {
                            step_index: stepIndex,
                            action: step.action,
                            success: false,
                            error: errorMsg,
                            duration_ms: Date.now() - start,
                        } as StepResult,
                    };
                }
            }),
        );

        for (const { stepIndex, result } of phaseResults) {
            allResults[stepIndex] = result;
        }
    }

    return allResults.filter((r): r is StepResult => r !== undefined);
}
