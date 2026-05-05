import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WakeCoalescer } from './wake-coalescer.js';

// Helper: sleep n milliseconds
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('WakeCoalescer', () => {
    describe('constructor', () => {
        it('throws if windowMs <= 0', () => {
            assert.throws(() => new WakeCoalescer(0), RangeError);
            assert.throws(() => new WakeCoalescer(-1), RangeError);
        });

        it('accepts positive windowMs', () => {
            const c = new WakeCoalescer(100);
            assert.equal(c.getStats().total_triggers, 0);
        });
    });

    describe('trigger — basic scheduling', () => {
        it('returns "scheduled" for the first trigger', async () => {
            const c = new WakeCoalescer(50);
            const result = c.trigger('timer', () => { });
            assert.equal(result, 'scheduled');
            c.cancel();
        });

        it('executes callback after the window', async () => {
            const c = new WakeCoalescer(60);
            let called = false;
            c.trigger('assignment', () => { called = true; });
            await sleep(100);
            assert.equal(called, true);
        });

        it('increments executions_count after execution', async () => {
            const c = new WakeCoalescer(40);
            c.trigger('on_demand', () => { });
            await sleep(80);
            assert.equal(c.getStats().executions_count, 1);
        });
    });

    describe('trigger — coalescing', () => {
        it('returns "coalesced" for subsequent triggers within the window', () => {
            const c = new WakeCoalescer(200);
            c.trigger('timer', () => { });
            const r = c.trigger('assignment', () => { });
            assert.equal(r, 'coalesced');
            c.cancel();
        });

        it('coalesces multiple triggers into a single execution', async () => {
            const c = new WakeCoalescer(80);
            let callCount = 0;
            c.trigger('timer', () => { callCount++; });
            c.trigger('assignment', () => { callCount++; });
            c.trigger('on_demand', () => { callCount++; });
            await sleep(150);
            // Only one execution should have happened
            assert.equal(callCount, 1);
            assert.equal(c.getStats().executions_count, 1);
        });

        it('tracks coalesced_count correctly', async () => {
            const c = new WakeCoalescer(80);
            c.trigger('timer', () => { });
            c.trigger('timer', () => { });
            c.trigger('timer', () => { });
            await sleep(150);
            const stats = c.getStats();
            assert.equal(stats.total_triggers, 3);
            assert.equal(stats.coalesced_count, 2);
            assert.equal(stats.executions_count, 1);
        });

        it('latest callback wins when coalesced', async () => {
            const c = new WakeCoalescer(80);
            let winner = 'none';
            c.trigger('timer', () => { winner = 'first'; });
            c.trigger('assignment', () => { winner = 'second'; });
            c.trigger('automation', () => { winner = 'third'; });
            await sleep(150);
            assert.equal(winner, 'third');
        });

        it('allows a new trigger after previous window completes', async () => {
            const c = new WakeCoalescer(60);
            let executions = 0;
            c.trigger('timer', () => { executions++; });
            await sleep(100); // first window completes
            c.trigger('on_demand', () => { executions++; });
            await sleep(100); // second window completes
            assert.equal(executions, 2);
            assert.equal(c.getStats().executions_count, 2);
        });
    });

    describe('cancel', () => {
        it('returns false when nothing is pending', () => {
            const c = new WakeCoalescer(100);
            assert.equal(c.cancel(), false);
        });

        it('returns true and prevents execution when pending', async () => {
            const c = new WakeCoalescer(100);
            let called = false;
            c.trigger('timer', () => { called = true; });
            assert.equal(c.cancel(), true);
            await sleep(150);
            assert.equal(called, false);
            assert.equal(c.getStats().executions_count, 0);
        });

        it('clears pending flag', () => {
            const c = new WakeCoalescer(100);
            c.trigger('timer', () => { });
            assert.equal(c.getStats().pending, true);
            c.cancel();
            assert.equal(c.getStats().pending, false);
        });
    });

    describe('flush', () => {
        it('returns false when nothing is pending', () => {
            const c = new WakeCoalescer(100);
            assert.equal(c.flush(), false);
        });

        it('executes callback immediately and returns true', async () => {
            const c = new WakeCoalescer(500); // long window
            let called = false;
            c.trigger('on_demand', () => { called = true; });
            const result = c.flush();
            assert.equal(result, true);
            // Give microtasks a tick to run
            await sleep(10);
            assert.equal(called, true);
        });

        it('increments executions_count on flush', async () => {
            const c = new WakeCoalescer(500);
            c.trigger('timer', () => { });
            c.flush();
            await sleep(10);
            assert.equal(c.getStats().executions_count, 1);
        });
    });

    describe('getStats', () => {
        it('tracks last_trigger_at', () => {
            const c = new WakeCoalescer(200);
            const before = Date.now();
            c.trigger('automation', () => { });
            const stats = c.getStats();
            assert.ok(stats.last_trigger_at !== null);
            assert.ok((stats.last_trigger_at as number) >= before);
            c.cancel();
        });

        it('tracks last_execution_at after execution', async () => {
            const c = new WakeCoalescer(50);
            c.trigger('timer', () => { });
            await sleep(100);
            const stats = c.getStats();
            assert.ok(stats.last_execution_at !== null);
        });

        it('returns pending: true while timer is running', () => {
            const c = new WakeCoalescer(200);
            c.trigger('assignment', () => { });
            assert.equal(c.getStats().pending, true);
            c.cancel();
        });
    });

    describe('reset', () => {
        it('clears all counters', async () => {
            const c = new WakeCoalescer(40);
            c.trigger('timer', () => { });
            c.trigger('timer', () => { });
            await sleep(80);
            c.reset();
            const stats = c.getStats();
            assert.equal(stats.total_triggers, 0);
            assert.equal(stats.coalesced_count, 0);
            assert.equal(stats.executions_count, 0);
            assert.equal(stats.last_trigger_at, null);
            assert.equal(stats.last_execution_at, null);
            assert.equal(stats.pending, false);
        });

        it('cancels pending execution on reset', async () => {
            const c = new WakeCoalescer(200);
            let called = false;
            c.trigger('timer', () => { called = true; });
            c.reset();
            await sleep(300);
            assert.equal(called, false);
        });
    });

    describe('async callbacks', () => {
        it('handles async callbacks without throwing', async () => {
            const c = new WakeCoalescer(50);
            let done = false;
            c.trigger('on_demand', async () => {
                await sleep(10);
                done = true;
            });
            await sleep(150);
            assert.equal(done, true);
        });
    });
});
