import { NodeSDK } from '@opentelemetry/sdk-node';
import { trace, metrics, type Tracer, type Meter } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';

// ─── Config & attribute types ─────────────────────────────────────────────────

export interface ObservabilityConfig {
  serviceName: string;
  azureConnectionString?: string;
  otlpEndpoint?: string;
  enableConsoleExporter?: boolean;
}

export interface AgentActionAttributes {
  taskId: string;
  agentId: string;
  workspaceId: string;
  actionType: string;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
}

// ─── Legacy event store (preserved for connector-gateway compatibility) ────────

export type ObservabilityEventSeverity = 'info' | 'warn' | 'error';

export interface ObservabilityEvent {
  source: string;
  eventType: string;
  severity: ObservabilityEventSeverity;
  message: string;
  correlationId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class ObservabilityEventStore {
  private events: ObservabilityEvent[] = [];

  emit(event: Omit<ObservabilityEvent, 'timestamp'>): ObservabilityEvent {
    const withTimestamp: ObservabilityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.events.push(withTimestamp);
    return withTimestamp;
  }

  list(filter?: { source?: string; eventType?: string; severity?: ObservabilityEventSeverity }): ObservabilityEvent[] {
    if (!filter) return [...this.events];
    return this.events.filter((event) => {
      if (filter.source && event.source !== filter.source) return false;
      if (filter.eventType && event.eventType !== filter.eventType) return false;
      if (filter.severity && event.severity !== filter.severity) return false;
      return true;
    });
  }
}

// ─── SDK lifecycle ─────────────────────────────────────────────────────────────

let initialised = false;
let currentSdk: NodeSDK | undefined;

/**
 * Bootstrap OpenTelemetry for the given service. Must be called before any
 * instrumented code loads. Safe to call multiple times — only the first call
 * takes effect; subsequent calls log a warning and return.
 *
 * Exporter resolution order:
 *  1. azureConnectionString → AzureMonitorTraceExporter
 *  2. otlpEndpoint          → OTLPTraceExporter + OTLPMetricExporter
 *  3. (neither)             → ConsoleSpanExporter + console.warn
 */
export const initObservability = (config: ObservabilityConfig): void => {
  if (initialised) {
    console.warn('[obs] initObservability called more than once — ignoring');
    return;
  }

  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName });
  const instrumentations = [new HttpInstrumentation(), new FastifyInstrumentation()];

  let metricReader: PeriodicExportingMetricReader | undefined;
  if (config.otlpEndpoint) {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${config.otlpEndpoint.replace(/\/$/, '')}/v1/metrics`,
      }),
    });
  }

  let sdk: NodeSDK;
  if (config.azureConnectionString) {
    sdk = new NodeSDK({
      resource,
      traceExporter: new AzureMonitorTraceExporter({ connectionString: config.azureConnectionString }),
      metricReader,
      instrumentations,
    });
  } else if (config.otlpEndpoint) {
    sdk = new NodeSDK({
      resource,
      traceExporter: new OTLPTraceExporter({ url: config.otlpEndpoint }),
      metricReader,
      instrumentations,
    });
  } else {
    console.warn(`[obs] No exporter configured for service "${config.serviceName}" — using ConsoleSpanExporter`);
    sdk = new NodeSDK({
      resource,
      traceExporter: new ConsoleSpanExporter(),
      instrumentations,
    });
  }

  sdk.start();
  currentSdk = sdk;
  initialised = true;
};

// ─── Provider accessors ────────────────────────────────────────────────────────

/** Returns the named tracer from the global TracerProvider. No-op safe before init. */
export const getTracer = (name: string): Tracer => trace.getTracer(name);

/** Returns the named meter from the global MeterProvider. No-op safe before init. */
export const getMeter = (name: string): Meter => metrics.getMeter(name);

// ─── Instrumentation helpers ───────────────────────────────────────────────────

/** Records a single agent action as a span. Never throws. */
export const recordAgentAction = (attrs: AgentActionAttributes): void => {
  try {
    const span = trace.getTracer('agentfarm.agent.action').startSpan('agent.action', {
      attributes: {
        'task.id': attrs.taskId,
        'agent.id': attrs.agentId,
        'workspace.id': attrs.workspaceId,
        'action.type': attrs.actionType,
        'action.success': attrs.success,
        ...(attrs.durationMs !== undefined ? { 'action.duration_ms': attrs.durationMs } : {}),
        ...(attrs.errorMessage ? { 'action.error': attrs.errorMessage } : {}),
      },
    });
    span.end();
  } catch {
    // observability must never disrupt the agent runtime
  }
};

/** Records task execution duration in the `agentfarm.task.duration` histogram. Never throws. */
export const recordTaskDuration = (taskId: string, durationMs: number, success: boolean): void => {
  try {
    metrics
      .getMeter('agentfarm.tasks')
      .createHistogram('agentfarm.task.duration', {
        description: 'Duration of agent task execution in milliseconds',
        unit: 'ms',
      })
      .record(durationMs, { 'task.id': taskId, 'task.success': String(success) });
  } catch {
    // observability must never disrupt the agent runtime
  }
};

/** Records approval latency in the `agentfarm.approval.latency` histogram. Never throws. */
export const recordApprovalLatency = (approvalId: string, latencyMs: number): void => {
  try {
    metrics
      .getMeter('agentfarm.approvals')
      .createHistogram('agentfarm.approval.latency', {
        description: 'Latency from approval request to decision in milliseconds',
        unit: 'ms',
      })
      .record(latencyMs, { 'approval.id': approvalId });
  } catch {
    // observability must never disrupt the agent runtime
  }
};

// ─── Test utilities ────────────────────────────────────────────────────────────

/** Reset SDK state between tests. Do not call in production code. */
export const resetObservabilityForTests = async (): Promise<void> => {
  initialised = false;
  if (currentSdk) {
    await currentSdk.shutdown().catch(() => undefined);
    currentSdk = undefined;
  }
};

