/**
 * Generates a tenant ID: ten_<8-char-hex>
 * Every other ID in the system will reference this tenant ID.
 */
export declare function generateTenantId(): string;
/**
 * Generates an agent instance ID: agt_<tenant-short>_<role>_<4-char-hex>
 * Embeds tenant ID to enable role-based queries without joins.
 * @param tenantId - The parent tenant ID (e.g., "ten_7f3a9c2b")
 * @param role - Agent role (e.g., "developer", "tester", "qa_engineer")
 */
export declare function generateAgentInstanceId(tenantId: string, role: string): string;
/**
 * Generates a session ID: ses_agt_<agt-short>_<timestamp>_<4-char-hex>
 * Includes ISO timestamp (YYYYMMDDTHHMMSS format) for temporal queries.
 * @param agentInstanceId - The parent agent instance ID
 */
export declare function generateSessionId(agentInstanceId: string): string;
/**
 * Generates an action ID: act_ses_<ses-short>_<sequence-padded>
 * Sequence number is zero-padded to 3 digits for lexicographic ordering.
 * @param sessionId - The parent session ID
 * @param sequence - Sequential action number within the session (0, 1, 2, ...)
 */
export declare function generateActionId(sessionId: string, sequence: number): string;
/**
 * Generates a recording ID: rec_ses_<ses-short>
 * One recording per session, named consistently.
 * @param sessionId - The parent session ID
 */
export declare function generateRecordingId(sessionId: string): string;
/**
 * Generates a screenshot ID: scr_<action-id>_<timing>
 * Timing is "before" or "after" to distinguish pre/post action screenshots.
 * @param actionId - The parent action ID
 * @param timing - Either "before" or "after"
 */
export declare function generateScreenshotId(actionId: string, timing: 'before' | 'after'): string;
/**
 * Decodes the session ID from an action ID.
 * Useful for finding all actions in a session from just the action ID.
 */
export declare function decodeSessionIdFromActionId(actionId: string): string;
/**
 * Decodes the agent instance ID from a session ID.
 * Useful for role-based queries without database joins.
 */
export declare function decodeAgentInstanceIdFromSessionId(sessionId: string): string;
/**
 * Decodes the tenant ID from an agent instance ID.
 */
export declare function decodeTenantIdFromAgentInstanceId(agentInstanceId: string): string;
/**
 * Validates that an ID has the expected prefix.
 */
export declare function validateIdPrefix(id: string, expectedPrefix: string): boolean;
/**
 * Extracts all ID components from the full audit chain.
 * Returns null if the ID chain is incomplete or invalid.
 */
export declare function decodeAuditChain(actionId: string): {
    actionId: string;
    sessionId?: string;
    agentInstanceId?: string;
    tenantId?: string;
};
