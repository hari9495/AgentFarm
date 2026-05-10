import { randomUUID } from 'crypto';
import type { GoalPlan } from '@agentfarm/shared-types';

// ── Keyword → action-type mapping ────────────────────────────────────────────
//
// Values on the right are drawn exclusively from ConnectorActionType and
// DesktopActionType as defined in @agentfarm/shared-types:
//
//   ConnectorActionType: 'read_task' | 'create_comment' | 'update_status'
//                       | 'send_message' | 'create_pr_comment' | 'send_email'
//   DesktopActionType:   'launch' | 'click' | 'type' | 'upload'
//                       | 'screenshot' | 'select_file'
//
// Mapping table (keyword → nearest existing action type):
//   pull request | pull_request | review → 'create_pr_comment'
//   pr                                   → 'create_pr_comment'
//   slack | notify | message | chat      → 'send_message'   (direct match)
//   document | docs | readme             → 'create_comment'  (documentation comments)
//   jira | ticket | issue                → 'read_task'        (reading/creating task records)
//   test | spec | coverage               → 'read_task'        (closest connector action for test verification)
//   fix | bug | error | broken           → 'update_status'   (resolving a bug changes ticket status)
//   deploy | release | ship              → 'update_status'   (deployment changes release status)
//   github | commit | push               → 'update_status'   (git push updates task/PR status)
//
// Priority order matters: multi-word and specific keywords are checked before
// single-character ones. 'create' was intentionally excluded — it is too
// generic and causes false positives against PR intents.
// When no keyword matches, the action name is set to 'unknown'.

const KEYWORD_MAP: ReadonlyArray<readonly [readonly string[], string]> = [
    [['pull request', 'pull_request', 'review'], 'create_pr_comment'],
    [['pr'], 'create_pr_comment'],
    [['slack', 'notify', 'message', 'chat'], 'send_message'],
    [['document', 'docs', 'readme'], 'create_comment'],
    [['jira', 'ticket', 'issue'], 'read_task'],
    [['test', 'spec', 'coverage'], 'read_task'],
    [['fix', 'bug', 'error', 'broken'], 'update_status'],
    [['deploy', 'release', 'ship'], 'update_status'],
    [['github', 'commit', 'push'], 'update_status'],
] as const;

/**
 * Resolve the nearest action-type string for the given free-text input.
 * Scans the KEYWORD_MAP in priority order; first match wins.
 *
 * Matching rules:
 *  - Multi-word keywords (contain a space) → substring match
 *  - Single keywords ≤ 2 chars ('pr') → exact word boundary `\bkw\b`
 *    to prevent substring matches like 'pr' inside 'production'
 *  - Single keywords > 2 chars → prefix word boundary `\bkw` so that
 *    stems match ('test' matches 'tests', 'deploy' matches 'deployment')
 *
 * Returns 'unknown' when no keyword matches.
 */
function resolveActionName(input: string): string {
    const lower = input.toLowerCase();
    for (const [keywords, actionName] of KEYWORD_MAP) {
        for (const kw of keywords) {
            let matched: boolean;
            if (kw.includes(' ')) {
                matched = lower.includes(kw);
            } else if (kw.length <= 2) {
                matched = new RegExp(`\\b${kw}\\b`).test(lower);
            } else {
                matched = new RegExp(`\\b${kw}`).test(lower);
            }
            if (matched) return actionName;
        }
    }
    return 'unknown';
}

/**
 * Parse a natural-language goal description into a structured GoalPlan.
 *
 * This is a keyword-only parser — no LLM call is made.
 * The returned plan has status 'pending' and a single GoalAction whose
 * `name` holds the inferred ConnectorActionType (or 'unknown').
 *
 * Fields that require runtime context (tenantId, workspaceId, botId,
 * correlationId) are left as empty strings; callers should fill them
 * in before persisting the plan.
 */
export function parseGoal(input: string): GoalPlan {
    const actionName = resolveActionName(input);
    const now = new Date().toISOString();

    return {
        id: randomUUID(),
        contractVersion: '1.0.0',
        tenantId: '',
        workspaceId: '',
        botId: '',
        goalDescription: input,
        currentState: { current: input },
        targetState: { desired: `Complete: ${input}` },
        actions: [
            {
                id: randomUUID(),
                name: actionName,
                preconditions: {},
                effects: { completed: true },
                cost: 1,
            },
        ],
        totalCost: 1,
        status: 'pending',
        currentActionIndex: 0,
        replanCount: 0,
        correlationId: '',
        createdAt: now,
        updatedAt: now,
    };
}
