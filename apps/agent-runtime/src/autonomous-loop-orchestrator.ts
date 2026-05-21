/**
 * Autonomous Skill Loop Orchestrator
 *
 * Self-iterating skill execution engine that runs a skill, evaluates success,
 * and auto-retries or branches until success criteria are met.
 *
 * Core use case: "automatically iterate until tests pass"
 * Example: run test → if failed, suggest fix → apply fix → re-run test → success
 *
 * Features:
 * - Configurable success criteria (test pass rate, linter clean, coverage threshold, custom)
 * - Automatic branching to alternate skills on failure
 * - Learning from successful patterns (reusable sequences)
 * - Cost-aware (max tokens, max iterations)
 * - Full execution tracing with decision tracking
 * - Graceful degradation (escalate, abort)
 */

import { randomUUID } from 'node:crypto';
import type {
    LoopConfig,
    LoopState,
    LoopStepTrace,
    LoopRunResult,
    LoopDecision,
} from '@agentfarm/shared-types';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import {
    getSkillHandler,
    generateTestsWithLLM,
    runTypeCoverageWithTsc,
} from './skill-execution-engine.js';
import type { SkillOutput } from './skill-execution-engine.js';

// Hard ceiling on loop iterations. Prevents runaway agent loops from
// calling paid APIs indefinitely (e.g. a retry loop with no backoff).
// Callers may specify a lower limit via config.max_iterations; this cap
// is the absolute maximum regardless of what the caller requests.
const MAX_LOOP_ITERATIONS_HARD_CAP = 25;

export class AutonomousLoopOrchestrator {
    private activeLoops = new Map<string, LoopRunResult>();
    private loopHistory: LoopRunResult[] = [];

    constructor(private learningStore?: any) { }

    /**
     * Execute an autonomous loop: iterate skills until success criteria met or max iterations reached.
     */
    async execute(config: LoopConfig): Promise<LoopRunResult> {
        const loopId = config.loop_id || randomUUID();
        const startedAt = Date.now();
        const trace: LoopStepTrace[] = [];

        let currentState: LoopState = 'running';
        let iterationCount = 0;
        let currentSkill = config.initial_skill;
        let previousOutput: Record<string, unknown> | null = null;
        let cumulativeTokensCost = 0;

        // Clamp caller-supplied max_iterations to the hard cap so a misconfigured
        // or adversarially-crafted loop config cannot trigger unbounded API calls.
        const effectiveMaxIterations = Math.min(config.max_iterations, MAX_LOOP_ITERATIONS_HARD_CAP);

        // Check if we should reuse a learned successful pattern
        if (config.allow_learning && this.learningStore) {
            const pattern = this.learningStore.findPattern(JSON.stringify(config.initial_skill.inputs));
            if (pattern && pattern.success_rate > 0.8) {
                // Try the learned sequence first
                for (const skillId of pattern.successful_sequence) {
                    const skill = config.initial_skill;
                    skill.skill_id = skillId;
                    const result = await this.executeSkill(skillId, previousOutput || config.initial_skill.inputs);
                    iterationCount++;
                    trace.push(this.buildTrace(iterationCount, skillId, previousOutput || config.initial_skill.inputs, result, 'retry'));
                    previousOutput = result.result;

                    if (this.checkSuccessCriteria(result, config.success_criteria, previousOutput)) {
                        currentState = 'success';
                        cumulativeTokensCost += result.duration_ms;
                        if (this.learningStore) {
                            this.learningStore.recordSuccess(JSON.stringify(config.initial_skill.inputs), pattern.successful_sequence);
                        }
                        break;
                    }
                }
                if (currentState === 'success') {
                    return this.buildLoopResult(loopId, 'success', iterationCount, Date.now() - startedAt, trace, previousOutput, 'Learned pattern succeeded');
                }
            }
        }

        // Main iteration loop
        while (iterationCount < effectiveMaxIterations) {
            iterationCount++;

            // Execute current skill
            const result = await this.executeSkill(currentSkill.skill_id, previousOutput || config.initial_skill.inputs);
            cumulativeTokensCost += result.duration_ms;

            // Check cost limits
            if (config.max_cost_tokens && cumulativeTokensCost > config.max_cost_tokens) {
                currentState = 'failed';
                trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, 'abort'));
                break;
            }

            // Check timeout
            if (config.timeout_seconds && (Date.now() - startedAt) / 1000 > config.timeout_seconds) {
                currentState = 'failed';
                trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, 'abort'));
                break;
            }

            // Build trace entry
            let decision: LoopDecision = 'retry';

            // Check success criteria
            if (this.checkSuccessCriteria(result, config.success_criteria, result.result)) {
                currentState = 'success';
                trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, 'retry'));
                if (this.learningStore && config.allow_learning) {
                    this.learningStore.recordSuccess(JSON.stringify(config.initial_skill.inputs), [currentSkill.skill_id]);
                }
                break;
            }

            // If failed and allow_failure, try branches
            if (!result.ok && config.branches && config.branches.length > 0) {
                const nextBranch = config.branches.find((b) => !b.on_failure_try_next) || config.branches[0];
                if (nextBranch) {
                    decision = 'branch_alternate';
                    currentSkill = nextBranch;
                    trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, decision));
                    previousOutput = result.result;
                    continue;
                }
            }

            // If skill failed and no success, escalate
            if (!result.ok) {
                decision = 'escalate';
                currentState = 'failed';
                trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, decision));
                break;
            }

            trace.push(this.buildTrace(iterationCount, currentSkill.skill_id, previousOutput || config.initial_skill.inputs, result, decision));
            previousOutput = result.result;
        }

        // Check if we hit max iterations without success
        if (currentState === 'running' && iterationCount >= effectiveMaxIterations) {
            currentState = 'failed';
        }

        const result = this.buildLoopResult(
            loopId,
            currentState,
            iterationCount,
            Date.now() - startedAt,
            trace,
            previousOutput,
            currentState === 'success' ? 'Success criteria met' : `Failed after ${iterationCount} iterations`,
        );

        this.loopHistory.push(result);
        if (this.loopHistory.length > 100) {
            this.loopHistory = this.loopHistory.slice(-100);
        }

        return result;
    }

    /**
     * Check if output meets success criteria.
     */
    private checkSuccessCriteria(output: SkillOutput, criteria: any, outputData: Record<string, unknown>): boolean {
        if (!criteria || !output.ok) return false;

        switch (criteria.type) {
            case 'test_pass_rate':
                const passRate = (outputData.pass_rate || 0) as number;
                return passRate >= (criteria.threshold || 1.0);

            case 'linter_clean':
                return (outputData.error_count || 0) === 0;

            case 'coverage_threshold':
                const coverage = (outputData.coverage || 0) as number;
                return coverage >= (criteria.threshold || 80);

            case 'custom_check':
                return output.ok && !output.summary.toLowerCase().includes('fail');

            default:
                return output.ok;
        }
    }

    /**
     * Execute a single skill and return its output.
     *
     * Pre-enriches inputs for skills that have an LLM/tsc-backed mode but
     * accept caller-supplied results (so the sync handler can use real data
     * instead of hardcoded defaults):
     *   - test-generator: calls generateTestsWithLLM() to populate llm_test_code
     *   - type-coverage-reporter: calls runTypeCoverageWithTsc() to populate tsc_result
     */
    private async executeSkill(skillId: string, inputs: Record<string, unknown>): Promise<SkillOutput> {
        const handler = getSkillHandler(skillId);
        if (!handler) {
            return {
                ok: false,
                skill_id: skillId,
                summary: `No handler registered for skill "${skillId}"`,
                result: { error: 'no_handler' },
                risk_level: 'low',
                requires_approval: false,
                actions_taken: [],
                duration_ms: 0,
            };
        }

        const enrichedInputs = await this.enrichInputsForSkill(skillId, inputs);

        const startedAt = Date.now();
        const output = handler(enrichedInputs, startedAt);
        return output;
    }

    /**
     * Pre-compute LLM/tsc results for skills whose sync handler accepts an
     * optional result field. Failures are swallowed — the handler then falls
     * back to its built-in heuristic/template path.
     */
    private async enrichInputsForSkill(
        skillId: string,
        inputs: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        if (skillId === 'test-generator') {
            // Skip if caller already supplied test code or if ANTHROPIC_API_KEY is missing.
            if (typeof inputs['llm_test_code'] === 'string' && (inputs['llm_test_code'] as string).trim()) {
                return inputs;
            }
            if (!process.env['ANTHROPIC_API_KEY']) return inputs;

            const filePath = typeof inputs['file_path'] === 'string' ? inputs['file_path'] : '';
            const functionName = typeof inputs['function_name'] === 'string' ? inputs['function_name'] : '';
            if (!filePath || !functionName) return inputs;

            const functionSignature = typeof inputs['function_signature'] === 'string'
                ? inputs['function_signature']
                : `${functionName}(input: unknown): unknown`;
            const testFramework = typeof inputs['test_framework'] === 'string'
                ? inputs['test_framework']
                : 'node:test';
            const edgeCases = Array.isArray(inputs['edge_cases'])
                ? (inputs['edge_cases'] as unknown[]).filter((x): x is string => typeof x === 'string')
                : [];

            // Read source file when available; fall back to caller-supplied function_source
            let functionSource = typeof inputs['function_source'] === 'string'
                ? (inputs['function_source'] as string)
                : '';
            if (!functionSource) {
                try {
                    const workspaceRoot = typeof inputs['workspace_dir'] === 'string'
                        ? inputs['workspace_dir'] as string
                        : process.cwd();
                    const absPath = resolvePath(workspaceRoot, filePath);
                    functionSource = await readFile(absPath, 'utf8');
                } catch {
                    // Source unavailable — let the handler use its template fallback.
                    return inputs;
                }
            }

            const llmCode = await generateTestsWithLLM(
                filePath,
                functionName,
                functionSignature,
                functionSource,
                edgeCases,
                testFramework,
            );
            if (llmCode) {
                return { ...inputs, llm_test_code: llmCode };
            }
            return inputs;
        }

        if (skillId === 'type-coverage-reporter') {
            // Skip if caller already supplied a real tsc_result
            if (
                inputs['tsc_result'] !== null &&
                typeof inputs['tsc_result'] === 'object' &&
                !Array.isArray(inputs['tsc_result'])
            ) {
                return inputs;
            }
            const targetDir = typeof inputs['target_dir'] === 'string' ? inputs['target_dir'] : '';
            const workspaceRoot = typeof inputs['workspace_dir'] === 'string'
                ? inputs['workspace_dir'] as string
                : process.cwd();
            const rootDir = targetDir ? resolvePath(workspaceRoot, targetDir) : workspaceRoot;
            const tscResult = await runTypeCoverageWithTsc(rootDir);
            if (tscResult) {
                return { ...inputs, tsc_result: tscResult };
            }
            return inputs;
        }

        return inputs;
    }

    /**
     * Build a trace entry for a step.
     */
    private buildTrace(
        iteration: number,
        skillId: string,
        input: Record<string, unknown>,
        output: SkillOutput,
        decision: LoopDecision,
    ): LoopStepTrace {
        return {
            iteration,
            skill_id: skillId,
            input,
            output: output.result,
            duration_ms: output.duration_ms,
            success: output.ok,
            decision,
            timestamp: Date.now(),
        };
    }

    /**
     * Build the final loop result.
     */
    private buildLoopResult(
        loopId: string,
        state: LoopState,
        iterations: number,
        totalDurationMs: number,
        trace: LoopStepTrace[],
        finalOutput: Record<string, unknown> | null,
        reason: string,
    ): LoopRunResult {
        return {
            loop_id: loopId,
            state,
            iterations,
            total_duration_ms: totalDurationMs,
            trace,
            final_output: finalOutput || {},
            success_reason: state === 'success' ? reason : undefined,
            failure_reason: state !== 'success' ? reason : undefined,
        };
    }

    /**
     * Get recent loop runs.
     */
    getRecentRuns(limit = 20): LoopRunResult[] {
        return this.loopHistory.slice(-limit).reverse();
    }

    /**
     * Get a specific loop run by ID.
     */
    getRunById(loopId: string): LoopRunResult | undefined {
        return this.loopHistory.find((r) => r.loop_id === loopId);
    }

    /**
     * Cancel an active loop.
     */
    cancelLoop(loopId: string): boolean {
        const run = this.activeLoops.get(loopId);
        if (run) {
            run.state = 'cancelled';
            this.activeLoops.delete(loopId);
            this.loopHistory.push(run);
            return true;
        }
        return false;
    }
}

export const globalLoopOrchestrator = new AutonomousLoopOrchestrator();
