/**
 * workflow-runtime.ts — Sequential pipeline execution with per-step retry and rollback.
 *
 * Executes a list of steps in order. Each step is retried up to maxRetries times
 * on failure. If a step exhausts its retries, completed steps are rolled back in
 * reverse order (best-effort) before returning the failure result.
 *
 * See docs/QUALITY_GATES.md §8 for the full design.
 */

export type StepResult = {
    ok: boolean;
    output?: string;
    error?: string;
};

export type WorkflowStep = {
    id: string;
    name: string;
    execute: () => Promise<StepResult>;
    rollback?: () => Promise<void>;
    maxRetries?: number;
};

export type WorkflowResult = {
    ok: boolean;
    completedSteps: string[];
    failedStep: string | null;
    rolledBackSteps: string[];
    outputs: Record<string, string>;
    error?: string;
};

function getDefaultMaxRetries(): number {
    const raw = process.env['AF_WORKFLOW_STEP_MAX_RETRIES'];
    if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 0) return n;
    }
    return 2;
}

export function getWorkflowStepMaxRetries(): number {
    return getDefaultMaxRetries();
}

/**
 * Execute a sequence of steps in order with per-step retry and reverse rollback.
 *
 * @param steps  Ordered list of steps to execute.
 * @returns      WorkflowResult describing what succeeded, what failed, and what was rolled back.
 */
export async function runWorkflow(steps: WorkflowStep[]): Promise<WorkflowResult> {
    const completedSteps: string[] = [];
    const outputs: Record<string, string> = {};

    for (const step of steps) {
        const maxRetries = step.maxRetries ?? getDefaultMaxRetries();
        let lastError = '';
        let succeeded = false;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await step.execute();
                if (result.ok) {
                    completedSteps.push(step.id);
                    if (result.output) outputs[step.id] = result.output;
                    succeeded = true;
                    break;
                }
                lastError = result.error ?? 'step returned ok=false';
            } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
            }
        }

        if (!succeeded) {
            // Roll back completed steps in reverse order, best-effort
            const rolledBackSteps: string[] = [];
            const stepsWithRollback = steps
                .filter((s) => completedSteps.includes(s.id) && typeof s.rollback === 'function')
                .reverse();

            for (const s of stepsWithRollback) {
                try {
                    await s.rollback!();
                    rolledBackSteps.push(s.id);
                } catch {
                    // best-effort — rollback errors never block the result
                }
            }

            return {
                ok: false,
                completedSteps,
                failedStep: step.id,
                rolledBackSteps,
                outputs,
                error: `Step "${step.name}" failed after ${maxRetries + 1} attempt(s): ${lastError}`,
            };
        }
    }

    return {
        ok: true,
        completedSteps,
        failedStep: null,
        rolledBackSteps: [],
        outputs,
    };
}
