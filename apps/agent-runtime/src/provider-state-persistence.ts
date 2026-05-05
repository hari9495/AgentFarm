/**
 * Provider State Persistence
 *
 * Durable failover state tracking with cooldown windows.
 * Prevents retry thundering when a provider is rate-limited or temporarily unavailable.
 */

import type { CooldownRecord, ProviderStateSnapshot, FailoverReason, ProviderHealthStatus } from '@agentfarm/shared-types';

export class ProviderStatePersistence {
    private states = new Map<string, ProviderStateSnapshot>();
    private cooldownPolicy = {
        max_consecutive_failures: 3,
        cooldown_duration_ms: 30000, // 30 seconds
        exponential_backoff_multiplier: 1.5,
        health_check_interval_ms: 5000,
    };

    /**
     * Check if a provider is in cooldown.
     */
    isInCooldown(providerId: string): boolean {
        const state = this.states.get(providerId);
        if (!state?.cooldown_record) return false;
        return state.cooldown_record.cooldown_until_ms > Date.now();
    }

    /**
     * Record a failed attempt for a provider.
     */
    recordFailure(providerId: string, reason: FailoverReason, errorMessage?: string): void {
        let state = this.states.get(providerId);

        if (!state) {
            state = {
                provider_id: providerId,
                status: 'degraded',
                health_score: 50,
                consecutive_failures: 1,
                total_requests: 1,
                error_rate: 1.0,
            };
        } else {
            state.consecutive_failures++;
            state.total_requests++;
            state.error_rate = state.consecutive_failures / state.total_requests;
        }

        // Determine cooldown duration based on reason and failure count
        let cooldownDuration = this.cooldownPolicy.cooldown_duration_ms;
        if (reason === 'rate_limit') {
            cooldownDuration *= 2; // Longer cooldown for rate limits
        }
        if (state.consecutive_failures > this.cooldownPolicy.max_consecutive_failures) {
            cooldownDuration *= Math.pow(this.cooldownPolicy.exponential_backoff_multiplier, state.consecutive_failures - 3);
        }

        state.cooldown_record = {
            provider_id: providerId,
            reason,
            cooldown_until_ms: Date.now() + cooldownDuration,
            attempt_count: state.consecutive_failures,
            last_error: errorMessage,
            last_attempt_at: Date.now(),
        };

        state.status = this.calculateStatus(state);
        state.health_score = this.calculateHealthScore(state);

        this.states.set(providerId, state);
    }

    /**
     * Record a successful attempt.
     */
    recordSuccess(providerId: string): void {
        let state = this.states.get(providerId);

        if (!state) {
            state = {
                provider_id: providerId,
                status: 'healthy',
                health_score: 100,
                consecutive_failures: 0,
                total_requests: 1,
                error_rate: 0,
                last_success_at: Date.now(),
            };
        } else {
            state.consecutive_failures = 0;
            state.total_requests++;
            state.error_rate = state.consecutive_failures / state.total_requests;
            state.last_success_at = Date.now();
        }

        // Clear cooldown on success
        state.cooldown_record = undefined;
        state.status = this.calculateStatus(state);
        state.health_score = this.calculateHealthScore(state);

        this.states.set(providerId, state);
    }

    /**
     * Get current state for a provider.
     */
    getState(providerId: string): ProviderStateSnapshot | undefined {
        return this.states.get(providerId);
    }

    /**
     * Get all provider states.
     */
    getAllStates(): ProviderStateSnapshot[] {
        return Array.from(this.states.values());
    }

    /**
     * Calculate provider status based on failure count and cooldown.
     */
    private calculateStatus(state: ProviderStateSnapshot): ProviderHealthStatus {
        if (state.cooldown_record?.cooldown_until_ms && state.cooldown_record.cooldown_until_ms > Date.now()) {
            return 'cooldown';
        }

        if (state.error_rate > 0.5) {
            return 'unavailable';
        }

        if (state.consecutive_failures > 0 || state.error_rate > 0.2) {
            return 'degraded';
        }

        return 'healthy';
    }

    /**
     * Calculate health score (0-100) for a provider.
     */
    private calculateHealthScore(state: ProviderStateSnapshot): number {
        if (!state.total_requests) return 50;

        // Base score on error rate
        let score = 100 * (1 - state.error_rate);

        // Penalty for consecutive failures
        score -= state.consecutive_failures * 10;

        // Bonus for recent success
        if (state.last_success_at) {
            const secondsSinceSuccess = (Date.now() - state.last_success_at) / 1000;
            if (secondsSinceSuccess < 60) {
                score += 10;
            }
        }

        return Math.max(0, Math.min(100, Math.floor(score)));
    }

    /**
     * Reset state for a provider.
     */
    reset(providerId: string): void {
        this.states.delete(providerId);
    }

    /**
     * Clear all state.
     */
    clearAll(): void {
        this.states.clear();
    }
}

export const globalProviderState = new ProviderStatePersistence();
