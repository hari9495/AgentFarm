import type { TaskRunResult, StepResult } from '@agentfarm/shared-types';
import { planTask } from './task-planner.js';
import { executePlan } from './plan-executor.js';

function buildReplanContext(results: StepResult[]): string {
    return results
        .map((r) =>
            r.success
                ? `Step ${r.step_index} (${r.action}): SUCCESS — ${r.output ?? 'no output'}`
                : `Step ${r.step_index} (${r.action}): FAILED — ${r.error ?? 'unknown error'}`,
        )
        .join('\n');
}

export async function runTask(
    task: string,
    tenantId: string,
    agentId: string,
    maxReplans = 3,
): Promise<TaskRunResult> {
    let allResults: StepResult[] = [];
    let replansUsed = 0;
    let context: string | undefined;
    let depGraphUsed = false;

    for (let attempt = 0; attempt <= maxReplans; attempt++) {
        const plan = await planTask(task, context);
        const results = await executePlan(plan, tenantId, agentId);
        depGraphUsed ||= plan.steps.some((s) => (s.depends_on?.length ?? 0) > 0);

        allResults = [...allResults, ...results];

        const allSucceeded = results.every((r) => r.success);
        if (allSucceeded) {
            return {
                success: true,
                steps_taken: allResults.length,
                final_results: allResults,
                replans_used: replansUsed,
                goal: plan.goal,
                depGraphUsed,
            };
        }

        if (attempt < maxReplans) {
            replansUsed++;
            context = buildReplanContext(allResults);
        }
    }

    return {
        success: false,
        steps_taken: allResults.length,
        final_results: allResults,
        replans_used: replansUsed,
        goal: task,
        depGraphUsed,
    };
}
