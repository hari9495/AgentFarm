/**
 * Structured Telemetry Collector
 *
 * Observability: structured logging, correlation IDs, metrics, and optional Application Insights export.
 */

import type { LogEntry, Metric, LogLevel, CorrelationContext, TelemetryExporter } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

export class StructuredTelemetryCollector {
    private logs: LogEntry[] = [];
    private metrics: Metric[] = [];
    private contexts = new Map<string, CorrelationContext>();
    private exporter?: TelemetryExporter;
    private batchSize = 100;
    private flushIntervalMs = 5000;
    private flushTimer?: NodeJS.Timeout;

    constructor(exporter?: TelemetryExporter) {
        this.exporter = exporter;
        this.startAutoFlush();
    }

    /**
     * Create or get a correlation context for tracing.
     */
    createContext(userId?: string, workspaceId?: string): CorrelationContext {
        const context: CorrelationContext = {
            correlation_id: randomUUID(),
            trace_id: randomUUID(),
            span_id: randomUUID(),
            user_id: userId,
            workspace_id: workspaceId,
            started_at: Date.now(),
        };

        this.contexts.set(context.correlation_id, context);
        return context;
    }

    /**
     * Log an entry with structured context.
     */
    log(level: LogLevel, message: string, context?: Record<string, unknown>, correlationId?: string): void {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            context,
            correlation_id: correlationId,
        };

        this.logs.push(entry);

        // Auto-flush if batch size exceeded
        if (this.logs.length >= this.batchSize) {
            this.flush().catch(console.error);
        }
    }

    /**
     * Record a metric (counter, gauge, histogram, etc.)
     */
    recordMetric(name: string, value: number, unit?: string, tags?: Record<string, string>): void {
        const metric: Metric = {
            name,
            type: 'gauge',
            value,
            unit,
            tags,
            timestamp: Date.now(),
        };

        this.metrics.push(metric);
    }

    /**
     * Record execution duration.
     */
    recordDuration(name: string, durationMs: number, tags?: Record<string, string>): void {
        this.recordMetric(name, durationMs, 'ms', tags);
    }

    /**
     * Increment a counter.
     */
    increment(name: string, tags?: Record<string, string>): void {
        const existing = this.metrics.find((m) => m.name === name && JSON.stringify(m.tags) === JSON.stringify(tags));

        if (existing) {
            existing.value++;
        } else {
            this.recordMetric(name, 1, '', tags);
        }
    }

    /**
     * Flush logs to exporter.
     */
    async flush(): Promise<void> {
        if (this.logs.length === 0 && this.metrics.length === 0) {
            return;
        }

        if (this.exporter) {
            try {
                if (this.logs.length > 0) {
                    await this.exporter.export(this.logs);
                }
                if (this.metrics.length > 0) {
                    await this.exporter.exportMetrics(this.metrics);
                }
            } catch (error) {
                console.error('Failed to export telemetry:', error);
            }
        }

        this.logs = [];
        this.metrics = [];
    }

    /**
     * Get metrics snapshot.
     */
    getMetricsSnapshot(): Record<string, number> {
        const snapshot: Record<string, number> = {};
        for (const metric of this.metrics) {
            snapshot[metric.name] = metric.value;
        }
        return snapshot;
    }

    /**
     * Start automatic flush on interval.
     */
    private startAutoFlush(): void {
        this.flushTimer = setInterval(() => {
            this.flush().catch(console.error);
        }, this.flushIntervalMs);
    }

    /**
     * Stop auto-flush and clean up.
     */
    shutdown(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flush().catch(console.error);
    }
}

export const globalTelemetry = new StructuredTelemetryCollector();
