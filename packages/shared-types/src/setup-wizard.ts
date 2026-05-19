/**
 * Sprint 3 — Setup Wizard
 *
 * Shared types for the multi-step self-service wizard that onboards a hiring
 * company from role selection through to agent provisioning.
 *
 * Steps in order:
 *  1. select_role        — choose the agent role (developer, tester, etc.)
 *  2. connect_tools      — add API-token connectors (GitHub, Jira, Slack, etc.)
 *  3. configure_persona  — set agent name, email, avatar, disclosure footer
 *  4. set_approval_rules — configure approval thresholds for this agent
 *  5. deploy             — confirm and fire provisioning
 */

import type { RoleKey } from './index.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type SetupStep =
    | 'select_role'
    | 'connect_tools'
    | 'configure_persona'
    | 'set_approval_rules'
    | 'deploy';

/** Ordered step sequence — used by the wizard to validate advancement. */
export const SETUP_STEPS: ReadonlyArray<SetupStep> = [
    'select_role',
    'connect_tools',
    'configure_persona',
    'set_approval_rules',
    'deploy',
];

export type SetupWizardStatus = 'in_progress' | 'completed' | 'abandoned';

export type ConnectorAuthType = 'api_token' | 'oauth' | 'basic';

export type ConnectorStatus = 'pending' | 'connected' | 'failed';

// ---------------------------------------------------------------------------
// Connector configuration
// ---------------------------------------------------------------------------

export interface ConnectorConfig {
    /** Internal connector key — e.g. "github", "jira", "slack" */
    name: string;
    /** Human-readable label shown in the wizard UI */
    displayName: string;
    /** Authentication method chosen for this connector */
    authType: ConnectorAuthType;
    /** Connection lifecycle status */
    status: ConnectorStatus;
    /** ISO-8601 timestamp when the connector was successfully connected, or null */
    configuredAt: string | null;
}

// ---------------------------------------------------------------------------
// Approval policy
// ---------------------------------------------------------------------------

export interface ApprovalPolicyConfig {
    highRiskRequiresApproval: boolean;
    mediumRiskRequiresApproval: boolean;
    /** Seconds before an unanswered approval request auto-expires */
    approvalTimeoutSeconds: number;
}

// ---------------------------------------------------------------------------
// Wizard session record (API contract)
// ---------------------------------------------------------------------------

export interface SetupWizardSessionRecord {
    id: string;
    tenantId: string;
    /** Bot id created during configure_persona step, null before that step */
    botId: string | null;
    currentStep: SetupStep;
    completedSteps: SetupStep[];
    selectedRole: RoleKey | null;
    connectors: ConnectorConfig[];
    /** Bot id used to link persona — populated during configure_persona step */
    personaBotId: string | null;
    approvalPolicy: ApprovalPolicyConfig | null;
    status: SetupWizardStatus;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Step payload input types
// ---------------------------------------------------------------------------

export interface CreateWizardInput {
    /** Optionally pre-select a role to skip step 1 */
    initialRoleKey?: RoleKey;
}

export interface SelectRoleStepPayload {
    roleKey: RoleKey;
}

export interface ConnectToolsStepPayload {
    connectors: Array<{
        name: string;
        displayName: string;
        authType: ConnectorAuthType;
    }>;
}

export interface ConfigurePersonaStepPayload {
    /** Id of the bot whose persona was configured in this step */
    botId: string;
}

export interface SetApprovalRulesStepPayload {
    approvalPolicy: ApprovalPolicyConfig;
}

/** Deploy step requires no additional payload — confirming the preceding steps suffices. */
export type DeployStepPayload = Record<string, never>;

export type WizardStepPayload =
    | SelectRoleStepPayload
    | ConnectToolsStepPayload
    | ConfigurePersonaStepPayload
    | SetApprovalRulesStepPayload
    | DeployStepPayload;

// ---------------------------------------------------------------------------
// Wizard completion event (emitted when deploy step is confirmed)
// ---------------------------------------------------------------------------

export interface WizardCompletionPayload {
    sessionId: string;
    tenantId: string;
    botId: string;
    roleKey: RoleKey;
    correlationId: string;
}
