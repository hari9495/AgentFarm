import type { ActionPlan, StepResult } from '@agentfarm/shared-types';
import {
    executeLocalWorkspaceAction,
    type LocalWorkspaceActionType,
} from './local-workspace-executor.js';

const HARD_FAIL_ACTIONS = new Set(['workspace_web_login']);

export async function executePlan(
    plan: ActionPlan,
    tenantId: string,
    agentId: string,
): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        const start = Date.now();

        try {
            const result = await executeLocalWorkspaceAction({
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
