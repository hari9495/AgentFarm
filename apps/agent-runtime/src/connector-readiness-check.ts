/**
 * connector-readiness-check.ts
 *
 * Checks whether the connectors required for a given action type are
 * configured (i.e., have a valid OAuth / API token stored for the workspace).
 *
 * If a required connector is missing, the agent surfaces a setup guidance
 * message to the human instead of attempting to execute and failing mid-task.
 *
 * Integration point: call checkConnectorReadiness() inside processOneTask,
 * after connector token injection but before LLM execution.  If the result
 * is not ready and the action requires a live connector, return early with
 * a 'connector_setup_required' status.
 */

import { resolveAllConnectorTokens } from './connector-token-resolver.js';

// ---------------------------------------------------------------------------
// Constants — which connectors are needed for each action family
// ---------------------------------------------------------------------------

/**
 * Maps action_type (or action prefix) → required connector types.
 * Only connectors whose absence is a hard blocker are listed; if the agent
 * can still do useful work without a connector it is not listed here.
 */
export const CONNECTOR_REQUIREMENTS: Record<string, string[]> = {
    // GitHub family
    workspace_github_create_pr: ['github'],
    workspace_github_issue_fix: ['github'],
    workspace_github_review_pr: ['github'],
    workspace_github_comment_issue: ['github'],
    git_push: ['github'],
    create_pr: ['github'],

    // Jira / issue tracker family
    workspace_jira_create_issue: ['jira'],
    workspace_jira_update_issue: ['jira'],
    create_issue: ['jira'],
    comment_issue: ['jira'],

    // CI/CD
    run_pipeline: ['github', 'jenkins'],

    // Messaging / notifications (soft requirement — included for guidance)
    workspace_slack_notify: ['slack'],
    workspace_teams_notify: ['teams'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectorReadinessResult {
    /** True when all required connectors for the action are configured. */
    ready: boolean;
    /** Connector types that are required but have no active token. */
    missing: string[];
    /** Human-readable setup guidance for the missing connectors. */
    guidance: string;
}

export interface ConnectorReadinessOptions {
    gatewayUrl: string;
    sessionToken: string;
    workspaceId: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether connectors required for `actionType` are configured.
 *
 * @param actionType  The classified action type (e.g. 'git_push').
 * @param options     Gateway URL + session token to resolve tokens.
 * @returns           ReadinessResult — check `.ready` before proceeding.
 */
export async function checkConnectorReadiness(
    actionType: string,
    options: ConnectorReadinessOptions,
): Promise<ConnectorReadinessResult> {
    const required = CONNECTOR_REQUIREMENTS[actionType];

    // No specific connector requirement for this action → always ready
    if (!required || required.length === 0) {
        return { ready: true, missing: [], guidance: '' };
    }

    let resolvedTokens: Record<string, unknown> = {};
    try {
        resolvedTokens = await resolveAllConnectorTokens(required, options.workspaceId, {
            gatewayUrl: options.gatewayUrl,
            sessionToken: options.sessionToken,
        });
    } catch {
        // Token resolution failure is treated as "all missing"
        resolvedTokens = {};
    }

    const missing = required.filter((type) => {
        const creds = resolvedTokens[type];
        return !creds || Object.keys(creds as object).length === 0;
    });

    if (missing.length === 0) {
        return { ready: true, missing: [], guidance: '' };
    }

    const guidance = buildSetupGuidance(actionType, missing);
    return { ready: false, missing, guidance };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SETUP_DOCS: Record<string, string> = {
    github: 'Go to Settings → Integrations → GitHub and connect your account.',
    jira: 'Go to Settings → Integrations → Jira and enter your Jira domain and API token.',
    slack: 'Go to Settings → Integrations → Slack and install the AgentFarm Slack app.',
    teams: 'Go to Settings → Integrations → Microsoft Teams and connect your tenant.',
    jenkins: 'Go to Settings → Integrations → Jenkins and enter your Jenkins URL and credentials.',
};

function buildSetupGuidance(actionType: string, missing: string[]): string {
    const steps = missing.map((type) => {
        const doc = SETUP_DOCS[type] ?? `Set up the '${type}' connector in your workspace settings.`;
        return `• ${type.charAt(0).toUpperCase() + type.slice(1)}: ${doc}`;
    });

    return [
        `The agent needs the following connector(s) to execute '${actionType}':`,
        '',
        ...steps,
        '',
        'Once connected, re-submit the task and the agent will proceed automatically.',
    ].join('\n');
}
