/**
 * Sprint 3 — Setup Wizard Step Validator
 *
 * Validates each wizard step payload before the route advances the session.
 * Pure functions — no I/O, fully unit-testable.
 */

import type { SetupStep } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type StepValidationResult =
    | { valid: true }
    | { valid: false; field: string; reason: string };

// ---------------------------------------------------------------------------
// Allowed value sets
// ---------------------------------------------------------------------------

const VALID_ROLES: ReadonlySet<string> = new Set([
    'recruiter',
    'developer',
    'fullstack_developer',
    'tester',
    'business_analyst',
    'technical_writer',
    'content_writer',
    'sales_rep',
    'marketing_specialist',
    'corporate_assistant',
    'customer_support_executive',
    'project_manager_product_owner_scrum_master',
]);

const VALID_AUTH_TYPES: ReadonlySet<string> = new Set(['api_token', 'oauth', 'basic']);

// ---------------------------------------------------------------------------
// Per-step validators
// ---------------------------------------------------------------------------

export function validateSelectRolePayload(payload: unknown): StepValidationResult {
    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, field: 'roleKey', reason: 'Payload must be an object' };
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.roleKey !== 'string' || !VALID_ROLES.has(p.roleKey)) {
        return { valid: false, field: 'roleKey', reason: 'roleKey must be a valid RoleKey value' };
    }
    return { valid: true };
}

export function validateConnectToolsPayload(payload: unknown): StepValidationResult {
    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, field: 'connectors', reason: 'Payload must be an object' };
    }
    const p = payload as Record<string, unknown>;
    if (!Array.isArray(p.connectors) || p.connectors.length === 0) {
        return { valid: false, field: 'connectors', reason: 'At least one connector is required' };
    }
    for (const [i, c] of (p.connectors as unknown[]).entries()) {
        if (typeof c !== 'object' || c === null) {
            return { valid: false, field: `connectors[${i}]`, reason: 'Each connector must be an object' };
        }
        const conn = c as Record<string, unknown>;
        if (typeof conn.name !== 'string' || !conn.name.trim()) {
            return { valid: false, field: `connectors[${i}].name`, reason: 'Connector name is required' };
        }
        if (typeof conn.displayName !== 'string' || !conn.displayName.trim()) {
            return { valid: false, field: `connectors[${i}].displayName`, reason: 'Connector displayName is required' };
        }
        if (!VALID_AUTH_TYPES.has(conn.authType as string)) {
            return {
                valid: false,
                field: `connectors[${i}].authType`,
                reason: 'authType must be one of: api_token, oauth, basic',
            };
        }
    }
    return { valid: true };
}

export function validateConfigurePersonaPayload(payload: unknown): StepValidationResult {
    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, field: 'displayName', reason: 'Payload must be an object' };
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.displayName !== 'string' || !p.displayName.trim()) {
        return {
            valid: false,
            field: 'displayName',
            reason: 'displayName is required and must be a non-empty string',
        };
    }
    if (typeof p.emailAddress !== 'string' || !p.emailAddress.trim()) {
        return {
            valid: false,
            field: 'emailAddress',
            reason: 'emailAddress is required and must be a non-empty string',
        };
    }
    return { valid: true };
}

export function validateSetApprovalRulesPayload(payload: unknown): StepValidationResult {
    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, field: 'approvalPolicy', reason: 'Payload must be an object' };
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.approvalPolicy !== 'object' || p.approvalPolicy === null) {
        return { valid: false, field: 'approvalPolicy', reason: 'approvalPolicy is required' };
    }
    const policy = p.approvalPolicy as Record<string, unknown>;
    if (typeof policy.highRiskRequiresApproval !== 'boolean') {
        return {
            valid: false,
            field: 'approvalPolicy.highRiskRequiresApproval',
            reason: 'Must be a boolean',
        };
    }
    if (typeof policy.mediumRiskRequiresApproval !== 'boolean') {
        return {
            valid: false,
            field: 'approvalPolicy.mediumRiskRequiresApproval',
            reason: 'Must be a boolean',
        };
    }
    if (
        typeof policy.approvalTimeoutSeconds !== 'number' ||
        policy.approvalTimeoutSeconds < 60
    ) {
        return {
            valid: false,
            field: 'approvalPolicy.approvalTimeoutSeconds',
            reason: 'Must be a number >= 60 (seconds)',
        };
    }
    return { valid: true };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Validates the step payload for the given wizard step.
 * Returns { valid: true } or { valid: false, field, reason }.
 */
export function validateStepPayload(step: SetupStep, payload: unknown): StepValidationResult {
    switch (step) {
        case 'select_role':
            return validateSelectRolePayload(payload);
        case 'connect_tools':
            return validateConnectToolsPayload(payload);
        case 'configure_persona':
            return validateConfigurePersonaPayload(payload);
        case 'set_approval_rules':
            return validateSetApprovalRulesPayload(payload);
        case 'deploy':
            // No payload required for the deploy confirmation step.
            return { valid: true };
    }
}
