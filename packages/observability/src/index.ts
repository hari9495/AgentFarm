export const initObservability = (serviceName: string): void => {
  console.log(`[obs] initialized for ${serviceName}`);
};

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

