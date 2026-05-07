/**
 * Retention policy contracts — customer-configurable data lifecycle management.
 * Policies determine when audit artifacts (screenshots, recordings, snapshots) can be deleted.
 * Supports zero auto-delete (null = never delete) to zero-delete enterprise compliance.
 */

export type RetentionPolicyAction = 'never_delete' | 'manual_delete' | 'auto_delete_after_days';

export type RetentionPolicyScope = 'tenant' | 'workspace' | 'role';

export type RetentionPolicyStatus = 'active' | 'archived' | 'superseded';

/**
 * Retention policy record — defines when session artifacts can be cleaned up.
 * Customers configure via dashboard (future feature).
 * Zero auto-delete is the default for enterprise compliance.
 */
export interface RetentionPolicyRecord {
    id: string;

    /** Tenant that owns this policy */
    tenantId: string;

    /** Optional: workspace-scoped policy (overrides tenant default) */
    workspaceId?: string;

    /** Optional: role-scoped policy (e.g., 'developer' actions only) */
    roleKey?: string;

    /** Customer-friendly policy name (e.g., "90-day developer cleanup") */
    name: string;

    /** Detailed description of retention behavior */
    description?: string;

    /** Scope of this policy */
    scope: RetentionPolicyScope;

    /** Action to take when policy expires */
    action: RetentionPolicyAction;

    /**
     * Days until deletion (only used if action === 'auto_delete_after_days').
     * Null means "never auto-delete".
     */
    retentionDays?: number;

    /**
     * Manual deletion trigger method:
     * - 'user_initiated': User requests deletion via dashboard
     * - 'scheduled': Runs on a recurring schedule
     * - 'api_triggered': External system initiates cleanup
     */
    deletionTrigger?: 'user_initiated' | 'scheduled' | 'api_triggered';

    /** For scheduled deletions: cron expression (e.g., "0 2 * * 0" for weekly Sunday 2am) */
    deletionSchedule?: string;

    /** ISO 8601 timestamp when policy becomes effective */
    effectiveFrom: string;

    /** ISO 8601 timestamp when policy expires (if superseded) */
    expiredAt?: string;

    /** Current status of this policy */
    status: RetentionPolicyStatus;

    /** Optional: audit trail of policy changes */
    changeHistory?: Array<{
        changedAt: string;
        changedBy: string;
        previousValues: Record<string, unknown>;
        reason?: string;
    }>;

    /** Correlation ID for auditing */
    correlationId: string;

    /** ISO 8601 timestamp */
    createdAt: string;

    /** ISO 8601 timestamp */
    updatedAt: string;

    /** User who created this policy */
    createdBy: string;

    /** User who last modified this policy */
    updatedBy: string;
}

/**
 * Policy evaluation result — determines if an artifact can be deleted.
 */
export interface RetentionPolicyEvaluation {
    sessionId: string;
    tenantId: string;
    policyId: string;
    canDelete: boolean;
    reason: string; // e.g., "retention policy expires 2026-08-07", "never auto-delete policy"
    expiresAt?: string; // ISO 8601 when artifact can be safely deleted
}

/**
 * Default policy constants — sensible enterprise defaults.
 */
export const DEFAULT_RETENTION_POLICIES = {
    /** Never delete — for regulated industries or compliance requirements */
    NEVER_DELETE: {
        name: 'Never Delete',
        action: 'never_delete',
        scope: 'tenant',
        description: 'Retain all audit artifacts indefinitely (compliance mode)',
    } as const,

    /** 90-day retention — typical SaaS audit trail */
    DAYS_90: {
        name: '90-Day Retention',
        action: 'auto_delete_after_days',
        retentionDays: 90,
        scope: 'tenant',
        description: 'Automatically delete artifacts older than 90 days',
    } as const,

    /** 30-day retention — for cost optimization */
    DAYS_30: {
        name: '30-Day Retention',
        action: 'auto_delete_after_days',
        retentionDays: 30,
        scope: 'tenant',
        description: 'Automatically delete artifacts older than 30 days',
    } as const,

    /** 7-day retention — minimal compliance footprint */
    DAYS_7: {
        name: '7-Day Retention',
        action: 'auto_delete_after_days',
        retentionDays: 7,
        scope: 'tenant',
        description: 'Automatically delete artifacts older than 7 days',
    } as const,
} as const;
