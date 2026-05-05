/**
 * Autonomous Skill Loop Types
 *
 * Defines the contract for self-iterating skill execution with learning.
 * Core use case: "automatically iterate until tests pass"
 */

export type LoopState = 'created' | 'running' | 'waiting_decision' | 'success' | 'failed' | 'cancelled';

export type LoopDecision = 'retry' | 'branch_alternate' | 'escalate' | 'abort';

export type SuccessCriteria = {
    type: 'test_pass_rate' | 'linter_clean' | 'coverage_threshold' | 'custom_check';
    threshold?: number;
    max_iterations?: number;
    timeout_seconds?: number;
};

export type SkillBranch = {
    skill_id: string;
    inputs: Record<string, unknown>;
    on_failure_try_next?: boolean;
    weight?: number;
};

export type LoopConfig = {
    loop_id: string;
    initial_skill: SkillBranch;
    success_criteria: SuccessCriteria;
    branches?: SkillBranch[];
    max_iterations: number;
    max_cost_tokens?: number;
    allow_learning?: boolean;
    timeout_seconds?: number;
};

export type LoopStepTrace = {
    iteration: number;
    skill_id: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration_ms: number;
    success: boolean;
    decision: LoopDecision;
    next_skill_id?: string;
    timestamp: number;
};

export type LoopRunResult = {
    loop_id: string;
    state: LoopState;
    iterations: number;
    total_duration_ms: number;
    trace: LoopStepTrace[];
    final_output?: Record<string, unknown>;
    success_reason?: string;
    failure_reason?: string;
    learned_pattern_id?: string;
};

export type LearnedPattern = {
    pattern_id: string;
    input_fingerprint: string;
    successful_sequence: string[];
    success_rate: number;
    use_count: number;
    last_used: number;
    created_at: number;
};
