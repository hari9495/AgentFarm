/**
 * H7 — Autonomy guardrail proof.
 *
 * The autonomous loop already iterates skills; these tests prove the SAFETY guardrails
 * that make autonomy safe to run unattended:
 *   1. a runaway config (huge max_iterations) is clamped to the hard cap, and
 *   2. every run terminates in a terminal state with a complete, auditable trace.
 * See docs/AUTONOMY-GUARDRAILS.md for the full control list.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AutonomousLoopOrchestrator } from './autonomous-loop-orchestrator.js';

const HARD_CAP = 25; // mirrors MAX_LOOP_ITERATIONS_HARD_CAP

describe('H7 autonomy guardrails', () => {
    it('clamps a runaway max_iterations to the hard cap (no unbounded paid-API loops)', async () => {
        const orchestrator = new AutonomousLoopOrchestrator();
        const result = await orchestrator.execute({
            loop_id: 'guardrail-runaway',
            initial_skill: { skill_id: 'test-generator', inputs: { file_path: 'x.ts' } },
            // Adversarial / misconfigured: ask for a million iterations.
            success_criteria: { type: 'test_pass_rate', threshold: 1.0 },
            max_iterations: 1_000_000,
        });
        assert.ok(result.iterations <= HARD_CAP, `iterations (${result.iterations}) must not exceed hard cap ${HARD_CAP}`);
    });

    it('always reaches a terminal state with an auditable trace', async () => {
        const orchestrator = new AutonomousLoopOrchestrator();
        const result = await orchestrator.execute({
            loop_id: 'guardrail-terminal',
            initial_skill: { skill_id: 'test-generator', inputs: { file_path: 'y.ts' } },
            success_criteria: { type: 'test_pass_rate', threshold: 1.0 },
            max_iterations: 3,
        });
        assert.ok(['success', 'failed'].includes(result.state as string), 'must end success or failed, never left running');
        assert.ok(Array.isArray(result.trace) && result.trace.length > 0, 'must produce an audit trace');
        // Every trace step records the iteration index and a decision — the audit record.
        for (const step of result.trace) {
            assert.equal(typeof step.iteration, 'number');
            assert.ok(step.decision !== undefined, 'each trace step records a decision');
        }
        assert.ok(result.iterations <= 3, 'respects the caller-supplied lower bound');
    });

    it('respects a caller-supplied limit below the hard cap', async () => {
        const orchestrator = new AutonomousLoopOrchestrator();
        const result = await orchestrator.execute({
            loop_id: 'guardrail-lowbound',
            initial_skill: { skill_id: 'test-generator', inputs: { file_path: 'z.ts' } },
            success_criteria: { type: 'test_pass_rate', threshold: 1.0 },
            max_iterations: 2,
        });
        assert.ok(result.iterations <= 2);
    });
});
