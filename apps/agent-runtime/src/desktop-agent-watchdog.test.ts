import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startDesktopAgentWatchdog } from './desktop-agent-watchdog.js';

// ---------------------------------------------------------------------------
// Helpers — fake fetch builders
// ---------------------------------------------------------------------------

function makeOkFetch(): typeof fetch {
    return async (_url, _opts) =>
        new Response('{"status":"ok"}', { status: 200 });
}

function makeFailFetch(statusCode = 500): typeof fetch {
    return async (_url, _opts) =>
        new Response('{"error":"down"}', { status: statusCode });
}

function makeNetworkErrorFetch(): typeof fetch {
    return async (_url, _opts) => {
        throw new Error('ECONNREFUSED');
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startDesktopAgentWatchdog', () => {
    it('returns healthy status after a successful poll', async () => {
        let polled = false;
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://localhost:6080',
            intervalMs: 60_000, // large — will only run the immediate poll
            _fetchFn: async (_url, _opts) => {
                polled = true;
                return new Response('{"status":"ok"}', { status: 200 });
            },
        });

        // Wait for the immediate async poll to complete
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        assert.equal(polled, true);
        assert.equal(handle.getStatus(), 'healthy');
        assert.equal(handle.getConsecutiveFailures(), 0);
        handle.stop();
    });

    it('transitions to degraded after a single failure', async () => {
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://localhost:6080',
            intervalMs: 60_000,
            failureThreshold: 3,
            _fetchFn: makeFailFetch(),
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        assert.equal(handle.getStatus(), 'degraded');
        assert.equal(handle.getConsecutiveFailures(), 1);
        handle.stop();
    });

    it('transitions to unreachable after failureThreshold consecutive failures', async () => {
        let callCount = 0;
        const downEvents: string[] = [];
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://desktop:6080',
            intervalMs: 5,      // rapid polling for test
            failureThreshold: 3,
            onDown: (url) => downEvents.push(url),
            _fetchFn: async () => {
                callCount++;
                throw new Error('ECONNREFUSED');
            },
        });

        // Wait for at least 3 polls
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        handle.stop();
        assert.ok(callCount >= 3, `Expected ≥3 calls, got ${callCount}`);
        assert.equal(handle.getStatus(), 'unreachable');
        assert.ok(downEvents.includes('http://desktop:6080'));
    });

    it('fires onDown only once per down episode', async () => {
        const downEvents: number[] = [];
        let tick = 0;
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://desktop:6080',
            intervalMs: 5,
            failureThreshold: 2,
            onDown: (_url, failures) => downEvents.push(failures),
            _fetchFn: async () => {
                tick++;
                throw new Error('fail');
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        handle.stop();
        // onDown should fire exactly once even though many polls occurred
        assert.equal(downEvents.length, 1);
    });

    it('fires onRecover when agent comes back after being unreachable', async () => {
        const recoverEvents: string[] = [];
        let tick = 0;
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://desktop:6080',
            intervalMs: 5,
            failureThreshold: 2,
            onRecover: (url) => recoverEvents.push(url),
            _fetchFn: async () => {
                tick++;
                // Fail for first 3 polls, then recover
                if (tick <= 3) throw new Error('down');
                return new Response('ok', { status: 200 });
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        handle.stop();
        assert.ok(recoverEvents.includes('http://desktop:6080'));
    });

    it('stop() prevents further polling', async () => {
        let callCount = 0;
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://localhost:6080',
            intervalMs: 10,
            _fetchFn: async () => {
                callCount++;
                return new Response('ok', { status: 200 });
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        const countAtStop = callCount;
        handle.stop();
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        // Should not increase significantly after stop
        assert.ok(callCount <= countAtStop + 1);
    });

    it('resets to healthy when poll succeeds after degraded', async () => {
        let tick = 0;
        const handle = startDesktopAgentWatchdog({
            desktopAgentUrl: 'http://localhost:6080',
            intervalMs: 5,
            failureThreshold: 5,
            _fetchFn: async () => {
                tick++;
                // Fail first 2 polls, then succeed
                if (tick <= 2) throw new Error('down');
                return new Response('ok', { status: 200 });
            },
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        handle.stop();
        assert.equal(handle.getStatus(), 'healthy');
        assert.equal(handle.getConsecutiveFailures(), 0);
    });
});
