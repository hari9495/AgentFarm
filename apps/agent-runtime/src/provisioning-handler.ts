/**
 * Sprint 3 — Provisioning Handler
 *
 * Handles the wizard_complete signal and emits an agent_provisioning_requested
 * event that downstream workers consume to spin up the agent VM + runtime.
 *
 * Pure function — no I/O, fully unit-testable.
 */

import type { RoleKey } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface WizardCompleteEvent {
    sessionId: string;
    tenantId: string;
    botId: string;
    roleKey: string;
    correlationId: string;
}

export interface ProvisioningRequestedEvent {
    type: 'agent_provisioning_requested';
    sessionId: string;
    tenantId: string;
    botId: string;
    roleKey: RoleKey;
    requestedAt: string;  // ISO-8601
    correlationId: string;
}

export type ProvisioningEventEmitter = (event: ProvisioningRequestedEvent) => void;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Validates the wizard completion event, constructs an
 * `agent_provisioning_requested` event, emits it, and returns it.
 *
 * Throws a `TypeError` if any required field is missing or empty.
 */
export function handleWizardComplete(
    event: WizardCompleteEvent,
    emit: ProvisioningEventEmitter,
): ProvisioningRequestedEvent {
    const { sessionId, tenantId, botId, roleKey, correlationId } = event;

    if (!sessionId?.trim()) {
        throw new TypeError('WizardCompleteEvent.sessionId is required');
    }
    if (!tenantId?.trim()) {
        throw new TypeError('WizardCompleteEvent.tenantId is required');
    }
    if (!botId?.trim()) {
        throw new TypeError('WizardCompleteEvent.botId is required');
    }
    if (!roleKey?.trim()) {
        throw new TypeError('WizardCompleteEvent.roleKey is required');
    }
    if (!correlationId?.trim()) {
        throw new TypeError('WizardCompleteEvent.correlationId is required');
    }

    const provisioningEvent: ProvisioningRequestedEvent = {
        type: 'agent_provisioning_requested',
        sessionId,
        tenantId,
        botId,
        roleKey: roleKey as RoleKey,
        requestedAt: new Date().toISOString(),
        correlationId,
    };

    emit(provisioningEvent);
    return provisioningEvent;
}
