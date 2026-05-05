/**
 * Provider Failover State Types
 *
 * Durable, normalized failover state for LLM provider resilience.
 */

export type FailoverReason =
    | 'rate_limit'
    | 'auth_expired'
    | 'billing_disabled'
    | 'timeout'
    | 'server_error'
    | 'invalid_request'
    | 'quota_exceeded'
    | 'unclassified';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'cooldown' | 'unavailable';

export type CooldownRecord = {
    provider_id: string;
    reason: FailoverReason;
    cooldown_until_ms: number;
    attempt_count: number;
    last_error?: string;
    last_attempt_at: number;
};

export type ProviderStateSnapshot = {
    provider_id: string;
    status: ProviderHealthStatus;
    health_score: number;
    cooldown_record?: CooldownRecord;
    last_success_at?: number;
    consecutive_failures: number;
    total_requests: number;
    error_rate: number;
};

export type ProviderFailoverPolicy = {
    max_consecutive_failures: number;
    cooldown_duration_ms: number;
    exponential_backoff_multiplier: number;
    health_check_interval_ms: number;
    error_classification_rules?: Record<string, FailoverReason>;
};
