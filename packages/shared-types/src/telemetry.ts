/**
 * Structured Telemetry Types
 *
 * Observability, metrics collection, and optional Application Insights export.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
    timestamp: number;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    correlation_id?: string;
    duration_ms?: number;
    error?: Error;
};

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export type Metric = {
    name: string;
    type: MetricType;
    value: number;
    unit?: string;
    tags?: Record<string, string>;
    timestamp: number;
};

export type TelemetryEvent = {
    event_id: string;
    event_type: string;
    timestamp: number;
    correlation_id?: string;
    context?: Record<string, unknown>;
    data?: Record<string, unknown>;
};

export type MetricsSnapshot = {
    timestamp: number;
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, number[]>;
    summaries: Record<string, { count: number; sum: number; min: number; max: number }>;
};

export type CorrelationContext = {
    correlation_id: string;
    trace_id?: string;
    span_id?: string;
    user_id?: string;
    workspace_id?: string;
    started_at: number;
};

export type TelemetryExporter = {
    export(entries: LogEntry[]): Promise<void>;
    exportMetrics(metrics: Metric[]): Promise<void>;
};
