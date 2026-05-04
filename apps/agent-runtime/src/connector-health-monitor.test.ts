import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { ConnectorHealthMonitor } from './connector-health-monitor.js';

describe('connector-health-monitor: ConnectorHealthMonitor', () => {
    let monitor: ConnectorHealthMonitor;

    beforeEach(() => {
        monitor = new ConnectorHealthMonitor('/tmp/test-agentfarm-health');
    });

    it('registerConnector adds connector to status map', () => {
        monitor.registerConnector('slack', async () => ({ reachable: true, latency_ms: 10 }));
        const status = monitor.getStatus('slack');
        assert.ok(status, 'should have status after register');
        assert.equal(status?.connector_id, 'slack');
    });

    it('pingConnector returns reachable=true for healthy ping', async () => {
        monitor.registerConnector('github', async () => ({ reachable: true, latency_ms: 42 }));
        const status = await monitor.pingConnector('github');
        assert.equal(status.reachable, true);
        assert.equal(status.latency_ms, 42);
        assert.equal(status.consecutive_failures, 0);
    });

    it('pingConnector returns reachable=false and increments failures on error', async () => {
        monitor.registerConnector('failing', async () => { throw new Error('timeout'); });
        const status = await monitor.pingConnector('failing');
        assert.equal(status.reachable, false);
        assert.equal(status.consecutive_failures, 1);
        assert.ok(status.last_error?.includes('timeout'));
    });

    it('consecutive_failures resets to 0 after recovery', async () => {
        let attempt = 0;
        monitor.registerConnector('flaky', async () => {
            attempt++;
            if (attempt === 1) throw new Error('first fail');
            return { reachable: true, latency_ms: 5 };
        });
        await monitor.pingConnector('flaky');
        const recovered = await monitor.pingConnector('flaky');
        assert.equal(recovered.consecutive_failures, 0);
    });

    it('getAllStatuses returns all registered connectors', async () => {
        monitor.registerConnector('a', async () => ({ reachable: true, latency_ms: 1 }));
        monitor.registerConnector('b', async () => ({ reachable: true, latency_ms: 2 }));
        await monitor.pingAll();
        const all = monitor.getAllStatuses();
        assert.ok(all.length >= 2);
    });

    it('pingAll pings every registered connector', async () => {
        const pings: string[] = [];
        monitor.registerConnector('x', async () => { pings.push('x'); return { reachable: true, latency_ms: 1 }; });
        monitor.registerConnector('y', async () => { pings.push('y'); return { reachable: true, latency_ms: 2 }; });
        await monitor.pingAll();
        assert.ok(pings.includes('x'));
        assert.ok(pings.includes('y'));
    });

    it('pingConnector throws for unknown connector id', async () => {
        await assert.rejects(
            () => monitor.pingConnector('nonexistent'),
            (err: Error) => {
                assert.ok(err.message.includes('not registered'));
                return true;
            },
        );
    });

    it('unregisterConnector removes connector', () => {
        monitor.registerConnector('temp', async () => ({ reachable: true, latency_ms: 1 }));
        monitor.unregisterConnector('temp');
        assert.equal(monitor.getStatus('temp'), undefined);
    });
});
