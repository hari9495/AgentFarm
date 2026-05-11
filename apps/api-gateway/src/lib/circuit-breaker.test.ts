/**
 * Phase 23 — Tests for apps/api-gateway/src/lib/circuit-breaker.ts
 *
 * Pattern: node:test, flat test() blocks, Date.now() key suffix for isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAllowed,
    recordSuccess,
    recordFailure,
    resetCircuit,
    getCircuitState,
    getAllCircuitStates,
} from './circuit-breaker.js';

// ── Test 1: closed circuit allows calls ──────────────────────────────────────

test('closed circuit: isAllowed returns true', () => {
    const key = `cb_closed_${Date.now()}`;
    assert.equal(isAllowed(key), true);
});

// ── Test 2: failures accumulate and open circuit at threshold ────────────────

test('after FAILURE_THRESHOLD failures circuit transitions to open', () => {
    const key = `cb_threshold_${Date.now()}`;
    // 5 is the default FAILURE_THRESHOLD
    for (let i = 0; i < 5; i++) {
        recordFailure(key);
    }
    const state = getCircuitState(key);
    assert.equal(state?.state, 'open');
    assert.equal(state?.failureCount, 5);
    assert.notEqual(state?.openedAt, null);
    assert.notEqual(state?.nextRetryAt, null);
});

// ── Test 3: open circuit denies calls ────────────────────────────────────────

test('open circuit: isAllowed returns false', () => {
    const key = `cb_open_deny_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
        recordFailure(key);
    }
    assert.equal(isAllowed(key), false);
});

// ── Test 4: open circuit transitions to half-open after duration ─────────────

test('open after openDurationMs: isAllowed transitions circuit to half-open', async () => {
    const key = `cb_halfopen_${Date.now()}`;
    // Use a very short openDurationMs so we can advance past it quickly
    const opts = { openDurationMs: 5, failureThreshold: 1 };
    recordFailure(key, opts);
    assert.equal(isAllowed(key, opts), false); // still open immediately

    // Wait for the open window to expire
    await new Promise<void>((resolve) => setTimeout(resolve, 15));

    // Now isAllowed should transition to half-open and return true
    assert.equal(isAllowed(key, opts), true);
    const state = getCircuitState(key);
    assert.equal(state?.state, 'half-open');
});

// ── Test 5: half-open + single failure re-opens ───────────────────────────────

test('half-open + single failure transitions back to open', async () => {
    const key = `cb_reopen_${Date.now()}`;
    const opts = { openDurationMs: 5, failureThreshold: 1 };

    recordFailure(key, opts);               // → open
    await new Promise<void>((r) => setTimeout(r, 15));
    assert.equal(isAllowed(key, opts), true); // → half-open probe
    recordFailure(key, opts);               // → re-open

    const state = getCircuitState(key);
    assert.equal(state?.state, 'open');
});

// ── Test 6: half-open + SUCCESS_THRESHOLD successes closes circuit ────────────

test('half-open + successThreshold successes closes the circuit', async () => {
    const key = `cb_close_${Date.now()}`;
    const opts = { openDurationMs: 5, failureThreshold: 1, successThreshold: 2 };

    recordFailure(key, opts);               // → open
    await new Promise<void>((r) => setTimeout(r, 15));
    assert.equal(isAllowed(key, opts), true); // → half-open

    recordSuccess(key, opts);               // 1st success
    assert.equal(getCircuitState(key)?.state, 'half-open');

    recordSuccess(key, opts);               // 2nd success → closed
    const state = getCircuitState(key);
    assert.equal(state?.state, 'closed');
    assert.equal(state?.failureCount, 0);
    assert.equal(state?.successCount, 0);
});

// ── Test 7: closed + success resets failureCount ─────────────────────────────

test('closed circuit + success resets failureCount to 0', () => {
    const key = `cb_reset_count_${Date.now()}`;
    // Accumulate some failures below the threshold
    const opts = { failureThreshold: 10 };
    recordFailure(key, opts);
    recordFailure(key, opts);
    assert.equal(getCircuitState(key)?.failureCount, 2);

    recordSuccess(key, opts);
    assert.equal(getCircuitState(key)?.failureCount, 0);
    assert.equal(getCircuitState(key)?.state, 'closed');
});

// ── Test 8: resetCircuit after open → isAllowed returns true ─────────────────

test('resetCircuit after open: isAllowed returns true (fresh closed entry)', () => {
    const key = `cb_manual_reset_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
        recordFailure(key);
    }
    assert.equal(isAllowed(key), false); // open

    resetCircuit(key);
    assert.equal(isAllowed(key), true);  // fresh closed
    assert.equal(getCircuitState(key)?.state, 'closed');
});

// ── Test 9: getCircuitState returns null for unknown key ──────────────────────

test('getCircuitState returns null for unknown key', () => {
    const key = `cb_unknown_${Date.now()}_xyzabc`;
    assert.equal(getCircuitState(key), null);
});

// ── Test 10: getAllCircuitStates contains known entry ─────────────────────────

test('getAllCircuitStates returns map containing known key', () => {
    const key = `cb_getall_${Date.now()}`;
    recordFailure(key);
    const all = getAllCircuitStates();
    assert.equal(all.has(key), true);
    assert.equal(all.get(key)?.failureCount, 1);
});
