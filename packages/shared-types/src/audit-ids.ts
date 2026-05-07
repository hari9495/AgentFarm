import { randomBytes } from 'node:crypto';

/**
 * Generates a short random hex identifier.
 * Default 4 bytes = 8 hex chars. Adjust bytes for longer IDs.
 */
function shortId(bytes = 4): string {
    return randomBytes(bytes).toString('hex');
}

/**
 * Generates a tenant ID: ten_<8-char-hex>
 * Every other ID in the system will reference this tenant ID.
 */
export function generateTenantId(): string {
    return `ten_${shortId(4)}`;
}

/**
 * Generates an agent instance ID: agt_<tenant-short>_<role>_<4-char-hex>
 * Embeds tenant ID to enable role-based queries without joins.
 * @param tenantId - The parent tenant ID (e.g., "ten_7f3a9c2b")
 * @param role - Agent role (e.g., "developer", "tester", "qa_engineer")
 */
export function generateAgentInstanceId(tenantId: string, role: string): string {
    const tenShort = tenantId.split('_')[1]; // Extract "7f3a9c2b" from "ten_7f3a9c2b"
    if (!tenShort || tenShort.length === 0) {
        throw new Error(`Invalid tenantId format: ${tenantId}`);
    }
    const roleSanitized = role.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `agt_${tenShort}_${roleSanitized}_${shortId(2)}`;
}

/**
 * Generates a session ID: ses_agt_<agt-short>_<timestamp>_<4-char-hex>
 * Includes ISO timestamp (YYYYMMDDTHHMMSS format) for temporal queries.
 * @param agentInstanceId - The parent agent instance ID
 */
export function generateSessionId(agentInstanceId: string): string {
    const parts = agentInstanceId.split('_');
    const agtShort = parts[parts.length - 1]; // Last segment is the random part
    if (!agtShort || agtShort.length === 0) {
        throw new Error(`Invalid agentInstanceId format: ${agentInstanceId}`);
    }

    // ISO timestamp: YYYYMMDDTHHMMSS
    const ts = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    return `ses_agt_${agtShort}_${ts}_${shortId(2)}`;
}

/**
 * Generates an action ID: act_ses_<ses-short>_<sequence-padded>
 * Sequence number is zero-padded to 3 digits for lexicographic ordering.
 * @param sessionId - The parent session ID
 * @param sequence - Sequential action number within the session (0, 1, 2, ...)
 */
export function generateActionId(sessionId: string, sequence: number): string {
    const parts = sessionId.split('_');
    const sesShort = parts[parts.length - 2]; // The random part before timestamp
    if (!sesShort || sesShort.length === 0) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
    }

    const seq = String(sequence).padStart(3, '0');
    return `act_ses_${sesShort}_${seq}`;
}

/**
 * Generates a recording ID: rec_ses_<ses-short>
 * One recording per session, named consistently.
 * @param sessionId - The parent session ID
 */
export function generateRecordingId(sessionId: string): string {
    const parts = sessionId.split('_');
    const sesShort = parts[parts.length - 2];
    if (!sesShort || sesShort.length === 0) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
    }
    return `rec_ses_${sesShort}`;
}

/**
 * Generates a screenshot ID: scr_<action-id>_<timing>
 * Timing is "before" or "after" to distinguish pre/post action screenshots.
 * @param actionId - The parent action ID
 * @param timing - Either "before" or "after"
 */
export function generateScreenshotId(actionId: string, timing: 'before' | 'after'): string {
    if (timing !== 'before' && timing !== 'after') {
        throw new Error(`Invalid timing: ${timing}. Must be 'before' or 'after'.`);
    }
    return `scr_${actionId}_${timing}`;
}

/**
 * Decodes the session ID from an action ID.
 * Useful for finding all actions in a session from just the action ID.
 */
export function decodeSessionIdFromActionId(actionId: string): string {
    // act_ses_9b2f_001 -> ses_agt_9b2f_... (reconstruct partially)
    // Note: We return the prefix pattern, full ID requires database lookup
    const match = actionId.match(/act_ses_([a-f0-9]+)_\d+/);
    if (!match) {
        throw new Error(`Invalid actionId format: ${actionId}`);
    }
    return `ses_agt_${match[1]}_*`; // Prefix pattern for querying
}

/**
 * Decodes the agent instance ID from a session ID.
 * Useful for role-based queries without database joins.
 */
export function decodeAgentInstanceIdFromSessionId(sessionId: string): string {
    // ses_agt_4e1d_20250507T143022_9b2f -> agt_<tenShort>_<role>_4e1d
    // Note: We can only recover the last segment; role/tenant require database
    const match = sessionId.match(/ses_agt_([a-f0-9]+)_/);
    if (!match) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
    }
    return `agt_*_*_${match[1]}`; // Prefix pattern for querying
}

/**
 * Decodes the tenant ID from an agent instance ID.
 */
export function decodeTenantIdFromAgentInstanceId(agentInstanceId: string): string {
    // agt_7f3a9c2b_developer_4e1d -> ten_7f3a9c2b
    const match = agentInstanceId.match(/agt_([a-f0-9]+)_/);
    if (!match) {
        throw new Error(`Invalid agentInstanceId format: ${agentInstanceId}`);
    }
    return `ten_${match[1]}`;
}

/**
 * Validates that an ID has the expected prefix.
 */
export function validateIdPrefix(id: string, expectedPrefix: string): boolean {
    return id.startsWith(`${expectedPrefix}_`);
}

/**
 * Extracts all ID components from the full audit chain.
 * Returns null if the ID chain is incomplete or invalid.
 */
export function decodeAuditChain(
    actionId: string,
): {
    actionId: string;
    sessionId?: string;
    agentInstanceId?: string;
    tenantId?: string;
} {
    const decoded: {
        actionId: string;
        sessionId?: string;
        agentInstanceId?: string;
        tenantId?: string;
    } = { actionId };

    if (actionId.startsWith('act_ses_')) {
        decoded.sessionId = decodeSessionIdFromActionId(actionId);
    }

    return decoded;
}
