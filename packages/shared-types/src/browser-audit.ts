/**
 * Browser audit types — complete record of every action an agent takes in a browser.
 * All IDs embed their parent IDs as prefixes for zero-join audit queries.
 */

export interface NetworkEntry {
    method: string; // GET, POST, PUT, DELETE, etc.
    url: string;
    status?: number;
    durationMs?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string;
    responseBody?: string;
    errorMessage?: string;
}

export interface BrowserActionAuditEvent {
    // ========== IDENTITY CHAIN ==========
    // All four levels present on every record — enables zero-join queries.

    /** Action ID: act_ses_<session-short>_<sequence> */
    id: string;

    /** Session ID: ses_agt_<agent-short>_<timestamp>_<random> */
    sessionId: string;

    /** Agent Instance ID: agt_<tenant-short>_<role>_<random> */
    agentInstanceId: string;

    /** Tenant ID: ten_<random> */
    tenantId: string;

    // ========== ACTION METADATA ==========
    /** Sequential number within this session (0, 1, 2, ...) */
    sequence: number;

    /** Type of browser action performed */
    actionType:
    | 'click'
    | 'fill'
    | 'navigate'
    | 'select'
    | 'submit'
    | 'key_press'
    | 'screenshot'
    | 'hover'
    | 'scroll'
    | 'wait';

    /** CSS selector or XPath of the target element */
    targetSelector: string;

    /** Human-readable text content of the target element */
    targetText: string;

    /** Value typed/selected (for fill, select, key_press actions) */
    inputValue?: string;

    /** URL of the page at action time */
    pageUrl: string;

    // ========== EVIDENCE REFERENCES ==========
    // IDs only — actual files stored in blob storage, keyed by these IDs.

    /** Screenshot ID before action: scr_<action-id>_before */
    screenshotBeforeId: string;

    /** Screenshot ID after action: scr_<action-id>_after */
    screenshotAfterId: string;

    /** Full signed URL to screenshot before (blob storage) */
    screenshotBeforeUrl: string;

    /** Full signed URL to screenshot after (blob storage) */
    screenshotAfterUrl: string;

    /**
     * SHA256 hash of the page HTML before action.
     * Used as tamper-check: if HTML changes unexpectedly, hash mismatch indicates replay/manual edit.
     */
    domSnapshotHashBefore?: string;

    /**
     * SHA256 hash of the page HTML after action.
     */
    domSnapshotHashAfter?: string;

    /** Network requests captured during this action */
    networkLog: NetworkEntry[];

    // ========== OUTCOME ==========
    /** Milliseconds from action start to completion */
    durationMs: number;

    /** True if action completed without errors */
    success: boolean;

    /** Error message if action failed */
    errorMessage?: string;

    /** Failure classification (e.g., 'element_not_found', 'timeout', 'network_error') */
    failureClass?: string;

    /** ISO 8601 timestamp when action occurred */
    timestamp: string;

    // ========== CORRECTNESS ASSERTION ==========
    /** Optional correctness check result from diff-verifier */
    correctnessAssertion?: {
        screenshotDiffPercentage: number; // 0-100
        domChangesDetected: boolean;
        networkActivityUnexpected: boolean;
        verifiedAt: string;
    };
}

export interface SessionAuditRecord {
    // ========== IDENTITY ==========
    /** Session ID: ses_agt_<agent-short>_<timestamp>_<random> */
    id: string;

    /** Agent Instance ID: agt_<tenant-short>_<role>_<random> */
    agentInstanceId: string;

    /** Tenant ID: ten_<random> */
    tenantId: string;

    // ========== SESSION CONTEXT ==========
    /** Links to existing TaskRecord for this session */
    taskId: string;

    /** Agent role (e.g., 'developer', 'tester', 'qa_engineer') */
    role: string;

    // ========== RECORDING REFERENCE ==========
    /** Recording ID: rec_ses_<session-short> */
    recordingId: string;

    /** Full signed URL to .mp4 recording in blob storage */
    recordingUrl: string;

    // ========== SESSION STATE ==========
    /** ISO 8601 timestamp when session started */
    startedAt: string;

    /** ISO 8601 timestamp when session ended (null if running) */
    endedAt?: string;

    /** Total number of actions recorded in this session */
    actionCount: number;

    /** Session status */
    status: 'running' | 'completed' | 'failed' | 'error';

    /** User-facing summary if session failed */
    failureReason?: string;

    // ========== RETENTION POLICY ==========
    /**
     * ISO 8601 timestamp when this record should be automatically deleted.
     * Null means "never auto-delete" — retention policy configured per-customer.
     * Customers will configure this via dashboard (future feature).
     */
    retentionExpiresAt?: string;

    /**
     * Customer-configured retention policy ID that governs this session.
     * Enables audit of which policy applies to which records.
     */
    retentionPolicyId?: string;
}

export interface BrowserActionAuditIndex {
    /**
     * For compliance and performance optimization:
     * - Query all actions for a tenant
     * - Query all actions by role across all customers
     * - Query by timestamp ranges
     * - Reconstruct full session from action IDs alone
     */
    tenantId: string;
    agentInstanceId: string;
    sessionId: string;
    timestamp: string;
    actionType: string;
}

/**
 * Compliance export schema — flattened audit trail for external audit systems.
 */
export interface AuditComplianceExport {
    exportId: string; // Unique export identifier
    tenantId: string;
    exportedAt: string;
    periodStart: string;
    periodEnd: string;
    sessionCount: number;
    actionCount: number;
    totalRecordingDurationMs: number;
    sessions: SessionAuditRecord[];
    actions: BrowserActionAuditEvent[];
}
