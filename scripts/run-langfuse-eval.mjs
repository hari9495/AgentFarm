/**
 * run-langfuse-eval.mjs — run a scored offline experiment over the
 * `agent-decision-evals` dataset and record the run in Langfuse.
 *
 * For each item it runs the real decision resolver (when an LLM provider is
 * configured via AF_MODEL_PROVIDER + keys) and scores 1.0 when the resolved
 * actionType matches the item's expectedOutput, else 0.0. Langfuse shows the
 * run's average score so you can track agent quality across versions/prompts.
 *
 * If no provider is configured it falls back to a stub runner so the harness
 * (dataset run + trace linking + scoring) can still be exercised end-to-end.
 *
 * Run (from a dir with tsx, e.g. apps/agent-runtime):
 *   node --env-file=../../.env --import tsx ../../scripts/run-langfuse-eval.mjs
 */

import { runDatasetExperiment } from '../packages/llm-trace/src/index.ts';
import { createLlmDecisionResolver } from '../apps/agent-runtime/src/llm-decision-adapter.ts';

const DATASET = 'agent-decision-evals';
const runName = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const resolver = createLlmDecisionResolver(process.env);
if (!resolver) {
    console.log('No LLM provider configured (AF_MODEL_PROVIDER/keys) — using stub runner to exercise the harness.');
}

const heuristic = { actionType: 'unknown', confidence: 0.5, riskLevel: 'low', route: 'execute', reason: 'eval' };

const summary = await runDatasetExperiment(DATASET, runName, async ({ input, expectedOutput }) => {
    let actionType = 'stub_no_provider';
    if (resolver) {
        const task = { taskId: `eval-${Math.random().toString(36).slice(2)}`, payload: { instruction: String(input), roleKey: 'developer' }, enqueuedAt: Date.now() };
        try {
            const result = await resolver({ task, heuristicDecision: heuristic });
            actionType = result.decision.actionType;
        } catch (err) {
            actionType = `error:${err instanceof Error ? err.message : 'unknown'}`;
        }
    }
    const score = actionType === expectedOutput ? 1 : 0;
    return { output: actionType, score, comment: `expected=${expectedOutput} got=${actionType}` };
});

console.log(`\nrun '${runName}' on '${DATASET}':`, JSON.stringify(summary));
if (summary.ran === 0) {
    console.log('Nothing ran — is the dataset seeded? (scripts/seed-langfuse-eval-dataset.mjs) and Langfuse configured?');
}
