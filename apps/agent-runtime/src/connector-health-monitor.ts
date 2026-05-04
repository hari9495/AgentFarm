import { randomUUID } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export type ConnectorHealthStatus = {
    connector_id: string;
    reachable: boolean;
    latency_ms: number;
    last_checked: string;
    consecutive_failures: number;
    last_error?: string;
};

type PingFn = () => Promise<{ reachable: boolean; latency_ms: number }>;

type MonitorEntry = {
    connector_id: string;
    pingFn: PingFn;
    intervalMs: number;
    lastChecked: number;
};

export class ConnectorHealthMonitor {
    private readonly entries = new Map<string, MonitorEntry>();
    private readonly statuses = new Map<string, ConnectorHealthStatus>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly storageDir: string;

    constructor(storageDir?: string) {
        this.storageDir = storageDir ?? join(tmpdir(), 'agentfarm-connector-health');
    }

    registerConnector(
        connectorId: string,
        pingFn: PingFn,
        intervalMs = 60_000,
    ): void {
        this.entries.set(connectorId, {
            connector_id: connectorId,
            pingFn,
            intervalMs,
            lastChecked: 0,
        });
        if (!this.statuses.has(connectorId)) {
            this.statuses.set(connectorId, {
                connector_id: connectorId,
                reachable: false,
                latency_ms: 0,
                last_checked: new Date(0).toISOString(),
                consecutive_failures: 0,
            });
        }
    }

    unregisterConnector(connectorId: string): void {
        this.entries.delete(connectorId);
        this.statuses.delete(connectorId);
    }

    async pingConnector(connectorId: string): Promise<ConnectorHealthStatus> {
        const entry = this.entries.get(connectorId);
        if (!entry) {
            throw new Error(`Connector '${connectorId}' not registered`);
        }
        const existing = this.statuses.get(connectorId)!;
        const start = Date.now();
        let result: { reachable: boolean; latency_ms: number };
        let lastError: string | undefined;
        try {
            result = await entry.pingFn();
        } catch (err) {
            const latency_ms = Date.now() - start;
            lastError = err instanceof Error ? err.message : String(err);
            result = { reachable: false, latency_ms };
        }
        const updated: ConnectorHealthStatus = {
            connector_id: connectorId,
            reachable: result.reachable,
            latency_ms: result.latency_ms,
            last_checked: new Date().toISOString(),
            consecutive_failures: result.reachable ? 0 : existing.consecutive_failures + 1,
            last_error: lastError,
        };
        this.statuses.set(connectorId, updated);
        entry.lastChecked = Date.now();
        await this.persistStatuses();
        return updated;
    }

    async pingAll(): Promise<ConnectorHealthStatus[]> {
        const results: ConnectorHealthStatus[] = [];
        for (const [id] of this.entries) {
            const status = await this.pingConnector(id);
            results.push(status);
        }
        return results;
    }

    getStatus(connectorId: string): ConnectorHealthStatus | undefined {
        return this.statuses.get(connectorId);
    }

    getAllStatuses(): ConnectorHealthStatus[] {
        return Array.from(this.statuses.values());
    }

    startPolling(intervalMs = 30_000): void {
        if (this.timer) return;
        this.timer = setInterval(async () => {
            const now = Date.now();
            for (const [id, entry] of this.entries) {
                if (now - entry.lastChecked >= entry.intervalMs) {
                    await this.pingConnector(id).catch(() => {/* logged in pingConnector */ });
                }
            }
        }, intervalMs);
    }

    stopPolling(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async persistStatuses(): Promise<void> {
        try {
            await mkdir(this.storageDir, { recursive: true });
            const file = join(this.storageDir, 'statuses.json');
            const payload = JSON.stringify(Array.from(this.statuses.values()), null, 2);
            await writeFile(file, payload, 'utf8');
        } catch {
            // persistence failure is non-fatal
        }
    }

    async loadStatuses(): Promise<void> {
        try {
            const file = join(this.storageDir, 'statuses.json');
            const raw = await readFile(file, 'utf8');
            const arr = JSON.parse(raw) as ConnectorHealthStatus[];
            for (const s of arr) {
                this.statuses.set(s.connector_id, s);
            }
        } catch {
            // no persisted state yet
        }
    }

    // Used in tests: reset state
    _reset(): void {
        this.entries.clear();
        this.statuses.clear();
        this.stopPolling();
    }
}

export const globalHealthMonitor = new ConnectorHealthMonitor();
