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
    effect: 'deny' | 'require_approval' | 'allow';
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

/** Does a non-time-windowed rule match this action's surface? (mode handled by caller) */
function ruleApplies(rule: GovernanceRule, input: GovernanceActionInput): boolean {
    if (!scopeMatches(rule, input)) return false;
    if (rule.mode === 'read_only') return input.isWrite === true; // read_only denies writes only
    return actionMatches(rule, input);
}

function ruleReason(rule: GovernanceRule, verb: string): string {
    if (rule.reason) return rule.reason;
    if (rule.mode === 'read_only') return `Connector '${rule.connector ?? '*'}' is read-only — write actions are ${verb}.`;
    return `${verb} by policy rule on '${rule.actionType}'${rule.connector ? ` (connector ${rule.connector})` : ''}${rule.env ? ` in env ${rule.env}` : ''}.`;
}

/**
 * Evaluates an action against customer rules with strictest-wins:
 *   deny > require_approval > allow.
 * First matching deny wins; otherwise first matching require_approval; else allow.
 * Time-window rules are reported separately (their decision depends on the runtime
 * clock and is enforced by the time enforcer).
 */
export function evaluateGovernanceRules(
    rules: GovernanceRule[],
    input: GovernanceActionInput,
): GovernanceMatchResult {
    const timeDependentRules: GovernanceRule[] = [];
    let firstApproval: GovernanceRule | undefined;

    for (const rule of rules) {
        if (rule.effect !== 'deny' && rule.effect !== 'require_approval') continue;
        if (!ruleApplies(rule, input)) continue;

        if (rule.timeWindow) {
            timeDependentRules.push(rule);
            continue;
        }

        if (rule.effect === 'deny') {
            return { effect: 'deny', matchedRule: rule, reason: ruleReason(rule, 'Denied'), timeDependentRules };
        }
        // require_approval — remember the first, but keep scanning for a stricter deny
        if (!firstApproval) firstApproval = rule;
    }

    if (firstApproval) {
        return {
            effect: 'require_approval',
            matchedRule: firstApproval,
            reason: ruleReason(firstApproval, 'Requires approval'),
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
