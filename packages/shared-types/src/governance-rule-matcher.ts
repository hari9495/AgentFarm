/**
 * governance-rule-matcher.ts — the single, shared evaluator for governance
 * deny rules against a concrete action.
 *
 * One matcher, used everywhere:
 *   - agent-runtime `policy-runtime.ts` (action-level enforcement)
 *   - api-gateway `policy-simulator.ts` (the dashboard "what would happen?" preview)
 *
 * This removes the previous dual-path split (OPA overlay vs. direct DB reads):
 * all governance evaluation now reads the same active `GovernancePolicy` document
 * and applies identical semantics. Customer rules can only TIGHTEN — only `deny`
 * effects are evaluated here.
 */

import type { GovernanceRule } from './governance-policy.js';

export interface GovernanceActionInput {
    actionType: string;
    connector?: string;
    tool?: string;
    env?: string;
    /** True when the action mutates (write) — needed for connector read_only rules. */
    isWrite?: boolean;
}

export interface GovernanceMatchResult {
    effect: 'deny' | 'allow';
    matchedRule?: GovernanceRule;
    reason: string;
    /** Rules that match the surface but are time-windowed (decision depends on the clock). */
    timeDependentRules: GovernanceRule[];
}

function scopeMatches(rule: GovernanceRule, input: GovernanceActionInput): boolean {
    if (rule.connector && rule.connector !== input.connector) return false;
    if (rule.tool && rule.tool !== input.tool) return false;
    if (rule.env && rule.env !== input.env) return false;
    return true;
}

function actionMatches(rule: GovernanceRule, input: GovernanceActionInput): boolean {
    return rule.actionType === '*' || rule.actionType === input.actionType;
}

/**
 * Evaluates a sample/real action against deny rules. First matching deny wins
 * (strictest-wins). Time-window rules are reported separately (their decision
 * depends on the runtime clock and is enforced by the time enforcer).
 */
export function evaluateGovernanceRules(
    rules: GovernanceRule[],
    input: GovernanceActionInput,
): GovernanceMatchResult {
    const timeDependentRules: GovernanceRule[] = [];

    for (const rule of rules) {
        if (rule.effect !== 'deny') continue;
        if (!scopeMatches(rule, input)) continue;

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
