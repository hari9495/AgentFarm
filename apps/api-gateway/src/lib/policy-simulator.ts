/**
 * policy-simulator.ts — Phase 5 follow-up: "what would happen?" preview.
 *
 * Thin wrapper over the shared governance matcher (@agentfarm/shared-types) so the
 * dashboard simulator and the agent-runtime enforcer use IDENTICAL semantics —
 * one source of truth, no drift.
 *
 * Scope note: this simulates CUSTOMER policy only. The built-in hardcoded floor
 * (role blocklists + risk tiers) still applies on top and can only tighten the
 * result — so an `allow` here means "no customer rule blocks it".
 */

import {
    evaluateGovernanceRules,
    type GovernanceActionInput,
    type GovernanceMatchResult,
} from '@agentfarm/shared-types';
import type { GovernanceRule } from '@agentfarm/shared-types';

export type SimulationInput = GovernanceActionInput;
export type SimulationResult = GovernanceMatchResult;

export function simulatePolicyAction(
    rules: GovernanceRule[],
    input: SimulationInput,
): SimulationResult {
    return evaluateGovernanceRules(rules, input);
}
