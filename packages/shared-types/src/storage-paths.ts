/**
 * Blob storage path scheme — ancestry encoded in the path structure.
 * This enables listing all artifacts for a customer with a single prefix query.
 * Examples: tenantId/agentInstanceId/sessionId/screenshotId paths
 */

/**
 * Generates blob path for a screenshot artifact.
 * Pattern: screenshots/{tenantId}/{agentInstanceId}/{sessionId}/{screenshotId}.png
 */
export function screenshotPath(
    tenantId: string,
    agentInstanceId: string,
    sessionId: string,
    screenshotId: string,
): string {
    return `screenshots/${tenantId}/${agentInstanceId}/${sessionId}/${screenshotId}.png`;
}

/**
 * Generates blob path for a recording artifact.
 * Pattern: recordings/{tenantId}/{agentInstanceId}/{recordingId}.mp4
 * One recording per session, stored at the agent-level.
 */
export function recordingPath(tenantId: string, agentInstanceId: string, recordingId: string): string {
    return `recordings/${tenantId}/${agentInstanceId}/${recordingId}.mp4`;
}

/**
 * Generates blob path for a DOM snapshot artifact.
 * Pattern: dom-snapshots/{tenantId}/{sessionId}/{actionId}.json
 * Stores JSON snapshot of page HTML at action time.
 */
export function domSnapshotPath(tenantId: string, sessionId: string, actionId: string): string {
    return `dom-snapshots/${tenantId}/${sessionId}/${actionId}.json`;
}

/**
 * Generates blob path for network log artifacts.
 * Pattern: network-logs/{tenantId}/{sessionId}/{actionId}.json
 */
export function networkLogPath(tenantId: string, sessionId: string, actionId: string): string {
    return `network-logs/${tenantId}/${sessionId}/${actionId}.json`;
}

/**
 * Generates blob path for DOM diff artifacts.
 * Pattern: dom-diffs/{tenantId}/{sessionId}/{actionId}.json
 */
export function domDiffPath(tenantId: string, sessionId: string, actionId: string): string {
    return `dom-diffs/${tenantId}/${sessionId}/${actionId}.json`;
}

/**
 * Generates blob path for compliance export archive.
 * Pattern: exports/{tenantId}/{exportId}.zip
 */
export function complianceExportPath(tenantId: string, exportId: string): string {
    return `exports/${tenantId}/${exportId}.zip`;
}

/**
 * List prefix for all artifacts belonging to a tenant.
 * Useful for compliance backups or data deletion (with customer permission).
 */
export function tenantArtifactPrefix(tenantId: string): string {
    return `${tenantId}/`;
}

/**
 * List prefix for all artifacts from a specific agent role across a tenant.
 * Useful for role-based audit reports.
 */
export function agentRolePrefix(tenantId: string, role: string): string {
    return `${tenantId}/agt_*_${role}_*/`;
}

/**
 * List prefix for all artifacts from a specific session.
 * Useful for reconstructing a complete session from blob storage alone.
 */
export function sessionArtifactPrefix(tenantId: string, sessionId: string): string {
    const parts = sessionId.split('_');
    const agentShort = parts[2]; // ses_agt_<agentShort>_...
    return `${tenantId}/agt_*_*_${agentShort}/${sessionId}/`;
}

/**
 * Validates that a screenshot path matches the expected format.
 * Useful for sanity-checking before uploading to blob storage.
 */
export function isValidScreenshotPath(path: string): boolean {
    return /^screenshots\/ten_[a-f0-9]+\/agt_[a-f0-9]+_[a-z0-9_]+_[a-f0-9]+\/ses_agt_[a-f0-9]+_[0-9T]+_[a-f0-9]+\/scr_act_ses_[a-f0-9]+_\d+_(before|after)\.png$/.test(
        path,
    );
}

/**
 * Validates that a recording path matches the expected format.
 */
export function isValidRecordingPath(path: string): boolean {
    return /^recordings\/ten_[a-f0-9]+\/agt_[a-f0-9]+_[a-z0-9_]+_[a-f0-9]+\/rec_ses_[a-f0-9]+\.mp4$/.test(
        path,
    );
}

/**
 * Extracts the session ID from a screenshot path.
 * Useful for grouping screenshots by session.
 */
export function extractSessionIdFromScreenshotPath(path: string): string | null {
    const match = path.match(/screenshots\/ten_[a-f0-9]+\/agt_[a-f0-9]+_[a-z0-9_]+_[a-f0-9]+\/(ses_agt_[a-f0-9]+_[0-9T]+_[a-f0-9]+)\//);
    return match ? match[1] : null;
}

/**
 * Extracts the tenant ID from any artifact path.
 */
export function extractTenantIdFromPath(path: string): string | null {
    const match = path.match(/(ten_[a-f0-9]+)\//);
    return match ? match[1] : null;
}
