/**
 * policy-simulator.ts — Phase 5 follow-up: "what would happen?" preview.
 *
 * Given the active customer policy rules (tenant + role, merged) and a sample
 * action, report whether the action would be DENIED by a customer rule and which
 * rule matched. This mirrors the direct-read enforcers' rule semantics.
 *
 * Scope note: this simulates CUSTOMER policy only. The built-in hardcoded floor
 * (role blocklists + risk tiers) still applies on top and can only tighten the
 * result — so an `allow` here means "no customer rule blocks it", not "the agent
 * will definitely run it".
 */

import type { GovernanceRule } from '@agentfarm/shared-types';

export interface SimulationInput {
    actionType: string;
    connector?: string;
    tool?: string;
    env?: string;
    /** True when the action mutates (write) — needed for connector read_only rules. */
    isWrite?: boolean;
}

export interface SimulationResult {
    effect: 'deny' | 'allow';
    matchedRule?: GovernanceRule;
    reason: string;
    /** Rules that match the surface but are time-windowed (decision depends on clock). */
    timeDependentRules: GovernanceRule[];
}

function actionMatches(rule: GovernanceRule, input: SimulationInput): boolean {
    return rule.actionType === '*' || rule.actionType === input.actionType;
}

function scopeMatches(rule: GovernanceRule, input: SimulationInput): boolean {
    if (rule.connector && rule.connector !== input.connector) return false;
    if (rule.tool && rule.tool !== input.tool) return false;
    if (rule.env && rule.env !== input.env) return false;
    return true;
}

/**
 * Evaluates the sample action against the merged deny rules. First matching deny
 * wins (strictest-wins, consistent with the enforcers).
 */
export function simulatePolicyAction(
    rules: GovernanceRule[],
    input: SimulationInput,
): SimulationResult {
    const timeDependentRules: GovernanceRule[] = [];

    for (const rule of rules) {
        if (rule.effect !== 'deny') continue;
        if (!scopeMatches(rule, input)) continue;

        // Connector read-only rule: denies WRITE actions on the scoped connector.
        if (rule.mode === 'read_only') {
            if (input.isWrite) {
                return {
                    effect: 'deny',
                    matchedRule: rule,
                    reason: `Connector '${rule.connector ?? '*'}' is read-only — write actions are denied.`,
                    timeDependentRules,
                };
            }
            continue;
        }

        if (!actionMatches(rule, input)) continue;

        // Time-window rules deny only OUTSIDE the allowed window — defer to runtime clock.
        if (rule.timeWindow) {
            timeDependentRules.push(rule);
            continue;
        }

        return {
            effect: 'deny',
            matchedRule: rule,
            reason:
                rule.reason ??
                `Denied by policy rule on '${rule.actionType}'${rule.connector ? ` (connector ${rule.connector})` : ''}${rule.env ? ` in env ${rule.env}` : ''}.`,
            timeDependentRules,
        };
    }

    return {
        effect: 'allow',
        reason:
            timeDependentRules.length > 0
                ? 'No unconditional customer rule blocks this action, but time-window rule(s) may deny it depending on the clock.'
                : 'No customer policy rule blocks this action. (Built-in role/risk defaults still apply.)',
        timeDependentRules,
    };
}
