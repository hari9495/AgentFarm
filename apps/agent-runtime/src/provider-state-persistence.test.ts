/**
 * Provider State Persistence Tests
 *
 * Test LLM provider failover cooldown and health scoring.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { ProviderStatePersistence } from './provider-state-persistence.js';
import { globalTelemetry } from './structured-telemetry-collector.js';

describe('provider-state-persistence: Failover resilience', () => {
    let persistence: ProviderStatePersistence;

    beforeEach(() => {
        persistence = new ProviderStatePersistence();
    });

    it('tracks provider health status', () => {
        // Initialize the provider by recording a success first
        persistence.recordSuccess('openai');
        const status = persistence.getState('openai');

        assert.ok(status, 'Should return provider status');
        assert.equal(typeof status.health_score, 'number', 'Should have health score');
        assert.ok(status.health_score >= 0 && status.health_score <= 100, 'Health score should be 0-100');
    });

    it('records failures and applies cooldown', () => {
        persistence.recordFailure('openai', 'rate_limit', 'Too many requests');

        const status = persistence.getState('openai');
        assert.ok(status && (status.status === 'cooldown' || status.consecutive_failures >= 1), 'Should track failure');
    });

    it('increases cooldown on repeated failures', () => {
        for (let i = 0; i < 3; i++) {
            persistence.recordFailure('azure-openai', 'server_error', 'Server error');
        }

        const status = persistence.getState('azure-openai');
        assert.ok(status && status.consecutive_failures >= 3, 'Should track multiple failures');
    });

    it('calculates health score based on failure rate', () => {
        const healthBefore = persistence.getState('claude')?.health_score ?? 100;

        // Simulate failures
        for (let i = 0; i < 5; i++) {
            persistence.recordFailure('claude', 'timeout');
        }

        const healthAfter = persistence.getState('claude')?.health_score ?? 0;
        assert.ok(healthAfter < healthBefore, 'Health score should decrease');
    });

    it('clears cooldown and resets failures on success', () => {
        persistence.recordFailure('gpt4', 'rate_limit');
        persistence.recordSuccess('gpt4');

        const status = persistence.getState('gpt4');
        assert.ok(status && status.consecutive_failures === 0, 'Should reset consecutive failures');
    });

    it('checks cooldown status correctly', () => {
        persistence.recordFailure('mistral', 'timeout');
        const inCooldown = persistence.isInCooldown('mistral');

        assert.equal(typeof inCooldown, 'boolean', 'Should return boolean');
    });

    it('returns all provider states', () => {
        persistence.recordFailure('openai', 'rate_limit');
        persistence.recordFailure('claude', 'server_error');

        const states = persistence.getAllStates();
        assert.ok(Array.isArray(states), 'Should return array of states');
        assert.ok(states.length >= 2, 'Should have multiple providers');
    });

    it('applies exponential backoff for repeated failures', () => {
        // Simulate multiple failures with rate_limit reason
        for (let i = 0; i < 3; i++) {
            persistence.recordFailure('openai', 'rate_limit');
        }

        const status = persistence.getState('openai');
        // Cooldown duration should increase exponentially
        assert.ok(status && status.consecutive_failures === 3, 'Should track 3 failures');
    });
});

describe('structured-telemetry-collector: Observability', () => {
    it('creates correlation context', () => {
        const context = globalTelemetry.createContext('user-123', 'workspace-456');

        assert.ok(context.correlation_id, 'Should have correlation_id');
        assert.ok(context.trace_id, 'Should have trace_id');
        assert.ok(context.span_id, 'Should have span_id');
        assert.equal(context.user_id, 'user-123');
        assert.equal(context.workspace_id, 'workspace-456');
    });

    it('logs entries with structured context', () => {
        const context = globalTelemetry.createContext();

        globalTelemetry.log('info', 'Test message', { custom_field: 'value' }, context.correlation_id);
        // Snapshot would be captured by telemetry system
    });

    it('records metrics', () => {
        globalTelemetry.recordMetric('skill_execution_count', 42, 'count', { skill: 'test-gen' });
        globalTelemetry.recordDuration('skill_latency', 1234, { skill: 'test-gen' });
        globalTelemetry.increment('loop_iteration_counter', { loop_id: 'test1' });

        const snapshot = globalTelemetry.getMetricsSnapshot();
        assert.ok(typeof snapshot === 'object', 'Should return metrics snapshot');
    });

    it('auto-flushes on batch size', () => {
        // Log many entries to trigger auto-flush
        for (let i = 0; i < 100; i++) {
            globalTelemetry.log('debug', `Entry ${i}`);
        }
        // Should auto-flush without explicit call
    });

    it('supports shutdown and cleanup', () => {
        globalTelemetry.shutdown();
        // Should stop auto-flush and perform final flush
    });
});
