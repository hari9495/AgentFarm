// ============================================================================
// AGENT HIRE CONTRACT (Sprint 5, 2026-05-15)
// ============================================================================
// Versioned record emitted when a customer completes payment and the system
// automatically enqueues a ProvisioningJob for the agent VM.
//
// contractVersion: CONTRACT_VERSIONS.AGENT_HIRE
// ============================================================================

/**
 * AgentHireRecord — written to audit log when a hire is triggered.
 * The provisioning worker picks up the ProvisioningJob row automatically.
 */
export interface AgentHireRecord {
    contractVersion: string;
    correlationId: string;
    jobId: string;
    orderId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    planId: string;
    triggerSource: 'payment_webhook';
    requestedAt: string; // ISO 8601
}
