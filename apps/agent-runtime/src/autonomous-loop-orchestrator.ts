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
import { getSkillHandler } from './skill-execution-engine.js';
import type { SkillOutput } from './skill-execution-engine.js';

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
        while (iterationCount < config.max_iterations) {
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
        if (currentState === 'running' && iterationCount >= config.max_iterations) {
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

        const startedAt = Date.now();
        const output = handler(inputs, startedAt);
        return output;
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
