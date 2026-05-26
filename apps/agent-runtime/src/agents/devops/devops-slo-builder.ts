// ============================================================================
// DEVOPS SLO BUILDER
//
// SLI/SLO/error-budget lifecycle management:
//
//   Sloth CRD          — PrometheusServiceLevel (the de-facto OSS SLO tool)
//   Pyrra CRD          — ServiceLevelObjective alternative
//   Raw PrometheusRule — multi-window burn-rate alerting (Google SRE book)
//   Error budget math  — remaining budget, burn rate, TTL
//
// Pure functions for calculations; YAML builders for manifests.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SloObjectiveType = 'availability' | 'latency' | 'error_rate' | 'throughput' | 'custom';
export type SloBudgetingMethod = 'occurrences' | 'timeslices';

export interface SliDefinition {
    name:        string;
    description: string;
    sloName:     string;   // parent SLO name
    /** PromQL expression for good events (numerator) */
    goodMetric:  string;
    /** PromQL expression for total events (denominator) */
    totalMetric: string;
}

export interface SloSpec {
    name:             string;
    namespace:        string;
    service:          string;
    description:      string;
    objective:        number;       // target percentage, e.g. 99.9
    objectiveType:    SloObjectiveType;
    window:           string;       // rolling window, e.g. '30d'
    sli:              SliDefinition;
    budgetingMethod?: SloBudgetingMethod;
    labels?:          Record<string, string>;
    annotations?:     Record<string, string>;
}

export interface ErrorBudgetStatus {
    sloName:          string;
    objective:        number;      // e.g. 99.9
    windowDays:       number;
    totalMinutes:     number;
    budgetMinutes:    number;      // (1 - objective/100) * totalMinutes
    consumedMinutes:  number;
    remainingMinutes: number;
    consumedPercent:  number;
    remainingPercent: number;
    burnRate:         number;      // actual / expected burn rate (1.0 = on track)
    ttlMinutes?:      number;      // minutes until budget exhausted at current rate
    status:           'healthy' | 'warning' | 'critical' | 'exhausted';
}

export interface BurnRateAlert {
    alertName:   string;
    severity:    'critical' | 'warning' | 'page';
    longWindow:  string;   // e.g. '1h'
    shortWindow: string;   // e.g. '5m'
    burnRateThreshold: number;
    budgetConsumedPercent: number;  // how much of budget this alert protects
    forDuration: string;   // e.g. '2m'
}

// ---------------------------------------------------------------------------
// Error budget math
// ---------------------------------------------------------------------------

/**
 * Calculate error budget status from current observed error rate.
 * @param objective     SLO target percentage (e.g. 99.9)
 * @param windowDays    Rolling window in days (e.g. 30)
 * @param currentErrorRate  Current error rate as a fraction (e.g. 0.005 for 0.5%)
 * @param elapsedDays   How far into the window we are (default: windowDays)
 */
export function calculateErrorBudget(
    objective:        number,
    windowDays:       number,
    currentErrorRate: number,
    elapsedDays?:     number,
): ErrorBudgetStatus {
    const sloName         = `slo-${objective}`;
    const totalMinutes    = windowDays * 24 * 60;
    const elapsed         = (elapsedDays ?? windowDays) * 24 * 60;
    const allowedErrorRate = (100 - objective) / 100;
    const budgetMinutes   = allowedErrorRate * totalMinutes;

    const consumedMinutes  = currentErrorRate * elapsed;
    const remainingMinutes = budgetMinutes - consumedMinutes;
    const consumedPercent  = budgetMinutes > 0 ? (consumedMinutes / budgetMinutes) * 100 : 0;
    const remainingPercent = Math.max(0, 100 - consumedPercent);

    // Burn rate: how fast we're consuming the budget vs expected
    const expectedRate = elapsed > 0 ? elapsed / totalMinutes : 1;
    const burnRate     = expectedRate > 0 ? (consumedPercent / 100) / expectedRate : 0;

    // Time to exhaustion at current rate
    const ttlMinutes = burnRate > 0 && remainingMinutes > 0
        ? remainingMinutes / (consumedMinutes / Math.max(elapsed, 1)) : undefined;

    let status: ErrorBudgetStatus['status'];
    if (remainingPercent <= 0)        status = 'exhausted';
    else if (burnRate >= 14.4)        status = 'critical';  // 2% budget in 1h
    else if (burnRate >= 6)           status = 'warning';   // 5% budget in 6h
    else                              status = 'healthy';

    return {
        sloName, objective, windowDays, totalMinutes, budgetMinutes,
        consumedMinutes, remainingMinutes, consumedPercent, remainingPercent,
        burnRate, ttlMinutes, status,
    };
}

/**
 * Calculate the multi-window burn rate alerts following the Google SRE book approach.
 * Returns 4 alert windows that together cover 100% of the error budget.
 */
export function buildBurnRateAlerts(sloName: string, objective: number, window = '30d'): BurnRateAlert[] {
    const windowDays  = parseInt(window, 10) || 30;
    // Google SRE: 4 alert windows
    return [
        {
            alertName:             `${sloName}-burn-rate-high-critical`,
            severity:              'critical',
            longWindow:            '1h',
            shortWindow:           '5m',
            burnRateThreshold:     14.4,    // 2% budget in 1h
            budgetConsumedPercent: 2,
            forDuration:           '2m',
        },
        {
            alertName:             `${sloName}-burn-rate-high-warning`,
            severity:              'page',
            longWindow:            '6h',
            shortWindow:           '30m',
            burnRateThreshold:     6,       // 5% budget in 6h
            budgetConsumedPercent: 5,
            forDuration:           '15m',
        },
        {
            alertName:             `${sloName}-burn-rate-medium`,
            severity:              'warning',
            longWindow:            '1d',
            shortWindow:           '2h',
            burnRateThreshold:     3,       // 10% budget in 3d
            budgetConsumedPercent: 10,
            forDuration:           '1h',
        },
        {
            alertName:             `${sloName}-burn-rate-slow`,
            severity:              'warning',
            longWindow:            `${Math.round(windowDays / 3)}d`,
            shortWindow:           '6h',
            burnRateThreshold:     1,       // slow burn over the window
            budgetConsumedPercent: 100 * (1 / 3),
            forDuration:           '3h',
        },
    ];
}

// ---------------------------------------------------------------------------
// Sloth PrometheusServiceLevel CRD builder
// ---------------------------------------------------------------------------

/**
 * Generate a Sloth PrometheusServiceLevel CRD YAML.
 * Sloth is the most widely used OSS SLO tool — it compiles SLOs to Prometheus recording rules.
 * https://sloth.dev
 */
export function buildSlothSloYaml(spec: SloSpec): string {
    const labelsYaml = Object.entries({ service: spec.service, ...(spec.labels ?? {}) })
        .map(([k, v]) => `    ${k}: "${v}"`).join('\n');

    return `apiVersion: sloth.slok.dev/v1
kind: PrometheusServiceLevel
metadata:
  name: ${spec.name}
  namespace: ${spec.namespace}
  labels:
    app.kubernetes.io/name: ${spec.name}
    app.kubernetes.io/component: slo
spec:
  service: "${spec.service}"
  labels:
${labelsYaml}
  slos:
    - name: "${spec.sli.name}"
      objective: ${spec.objective}
      description: "${spec.description}"
      sli:
        events:
          errorQuery: >-
            ${spec.sli.totalMetric} - ${spec.sli.goodMetric}
          totalQuery: >-
            ${spec.sli.totalMetric}
      alerting:
        name: ${spec.name.replace(/-/g, '')}SLO
        labels:
          service: "${spec.service}"
        annotations:
          summary: "SLO burn rate alert for ${spec.service}"
          runbook_url: "https://wiki.example.com/runbooks/${spec.service}/slo"
        pageAlert:
          labels:
            severity: critical
        ticketAlert:
          labels:
            severity: warning`;
}

// ---------------------------------------------------------------------------
// Pyrra ServiceLevelObjective CRD builder
// ---------------------------------------------------------------------------

/**
 * Generate a Pyrra ServiceLevelObjective CRD YAML.
 * Pyrra provides a web UI on top of Prometheus SLO rules.
 * https://pyrra.dev
 */
export function buildPyrraObjectiveYaml(spec: SloSpec): string {
    const windowLabel = spec.window.replace(/\s/g, '');
    const ratio = (100 - spec.objective) / 100;

    return `apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: ${spec.name}
  namespace: ${spec.namespace}
  labels:
    pyrra.dev/team: platform
spec:
  target: "${spec.objective}"
  window: ${windowLabel}
  description: "${spec.description}"
  indicator:
    ratio:
      errors:
        metric: ${spec.sli.totalMetric}{job="${spec.service}"} - ${spec.sli.goodMetric}{job="${spec.service}"}
      total:
        metric: ${spec.sli.totalMetric}{job="${spec.service}"}
      grouping:
        - job`;
}

// ---------------------------------------------------------------------------
// Raw PrometheusRule builder for multi-window burn rate alerting
// ---------------------------------------------------------------------------

/**
 * Build a PrometheusRule CRD YAML with multi-window burn rate alerting rules.
 * Does NOT require Sloth or Pyrra — runs on any Prometheus + Alertmanager stack.
 */
export function buildSloAlertRulesCrd(spec: SloSpec): string {
    const errorRatio = `(${spec.sli.totalMetric} - ${spec.sli.goodMetric}) / ${spec.sli.totalMetric}`;
    const allowedError = (100 - spec.objective) / 100;
    const alerts = buildBurnRateAlerts(spec.name, spec.objective, spec.window);

    const rulesYaml = alerts.map((a) => `      - alert: ${a.alertName}
        expr: >-
          (
            sum(rate(${errorRatio}[${a.longWindow}])) / ${allowedError}
            > ${a.burnRateThreshold}
          )
          and
          (
            sum(rate(${errorRatio}[${a.shortWindow}])) / ${allowedError}
            > ${a.burnRateThreshold}
          )
        for: ${a.forDuration}
        labels:
          severity: ${a.severity}
          service: ${spec.service}
          slo: ${spec.name}
        annotations:
          summary: "High SLO burn rate for ${spec.service}"
          description: "Error budget for ${spec.name} burning at ${a.burnRateThreshold}x — ~${a.budgetConsumedPercent.toFixed(0)}% budget consumed."
          runbook_url: "https://wiki.example.com/runbooks/${spec.service}/slo"`).join('\n');

    // Recording rules for error budget remaining (useful for dashboards)
    const recordingRules = `      - record: slo:sli_error:ratio_rate5m
        expr: >-
          sum(rate(${errorRatio}[5m]))
        labels:
          service: ${spec.service}
          slo: ${spec.name}
      - record: slo:error_budget_remaining:ratio
        expr: >-
          1 - clamp_min(
            sum(rate(${errorRatio}[${spec.window}])) / ${allowedError},
            0
          )
        labels:
          service: ${spec.service}
          slo: ${spec.name}`;

    return `apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ${spec.name}-slo-alerts
  namespace: ${spec.namespace}
  labels:
    prometheus: kube-prometheus
    role: alert-rules
spec:
  groups:
    - name: ${spec.name}.slo.alerts
      interval: 30s
      rules:
${rulesYaml}
    - name: ${spec.name}.slo.recording
      interval: 30s
      rules:
${recordingRules}`;
}

// ---------------------------------------------------------------------------
// Formatted report
// ---------------------------------------------------------------------------

export function formatErrorBudgetReport(status: ErrorBudgetStatus): string {
    const lines = [
        `SLO: ${status.sloName} (${status.objective}% over ${status.windowDays}d)`,
        `Status: ${status.status.toUpperCase()}`,
        `Error budget total:     ${status.budgetMinutes.toFixed(1)} minutes`,
        `Error budget consumed:  ${status.consumedMinutes.toFixed(1)} minutes (${status.consumedPercent.toFixed(2)}%)`,
        `Error budget remaining: ${status.remainingMinutes.toFixed(1)} minutes (${status.remainingPercent.toFixed(2)}%)`,
        `Burn rate:              ${status.burnRate.toFixed(2)}x (1.0 = on track)`,
    ];
    if (status.ttlMinutes !== undefined) {
        const ttlHours = status.ttlMinutes / 60;
        lines.push(`Budget exhaustion in:   ${ttlHours < 1 ? `${status.ttlMinutes.toFixed(0)} min` : `${ttlHours.toFixed(1)} hours`} at current rate`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompt for SLO recommendations
// ---------------------------------------------------------------------------

export function buildSloPrompt(params: {
    service:        string;
    namespace:      string;
    description:    string;
    metrics:        string[];     // PromQL metrics the service exposes
    currentP99?:    string;       // observed p99 latency
    currentErrorRate?: string;    // observed error rate
    environment:    'production' | 'staging';
}): string {
    const metricList = params.metrics.map((m) => `  - ${m}`).join('\n');
    return [
        `Generate SLO (Service Level Objective) definitions for the following service.`,
        ``,
        `Service: ${params.service}`,
        `Namespace: ${params.namespace}`,
        `Description: ${params.description}`,
        `Environment: ${params.environment}`,
        params.currentP99        ? `Observed p99 latency: ${params.currentP99}` : '',
        params.currentErrorRate  ? `Observed error rate: ${params.currentErrorRate}` : '',
        ``,
        `Metrics exposed:`,
        metricList,
        ``,
        `Requirements:`,
        `  - Define 2-3 SLOs: availability (4xx/5xx rate), latency (p99), and optionally throughput`,
        `  - Use realistic objectives for ${params.environment}: 99.9% availability, p99 < 500ms`,
        `  - For each SLO produce: Sloth PrometheusServiceLevel YAML + raw PrometheusRule for burn rate alerts`,
        `  - SLO window: 30d rolling`,
        `  - Multi-window burn rate: 1h/5m (14.4x), 6h/30m (6x), 1d/2h (3x), 10d/6h (1x)`,
        ``,
        `Return a JSON array: [{ "filename": "...", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseSloOutput(raw: string): Array<{ filename: string; content: string }> {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed  = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item['filename'] === 'string' && typeof item['content'] === 'string')
            .map((item) => ({ filename: item['filename'] as string, content: item['content'] as string }));
    } catch {
        return [];
    }
}
