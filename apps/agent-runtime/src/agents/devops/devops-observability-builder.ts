// ============================================================================
// DEVOPS OBSERVABILITY BUILDER
//
// Builders for observability stack management:
//   - Grafana dashboard creation (LLM-generated JSON model)
//   - Prometheus alert rules (PrometheusRule CRD YAML)
//   - Datadog monitor creation (REST API payload)
//   - PagerDuty service + escalation policy (REST API payload)
//
// All LLM calls return typed payloads; parsers strip markdown fences.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrafanaPanel {
    title:      string;
    type:       'graph' | 'stat' | 'gauge' | 'table' | 'logs' | 'timeseries';
    query:      string;   // PromQL / LogQL expression
    unit?:      string;   // e.g. 'short', 'percent', 'reqps'
    thresholds?: Array<{ value: number; color: 'green' | 'yellow' | 'red' }>;
}

export interface PrometheusAlertRule {
    alert:        string;
    expr:         string;   // PromQL expression
    forDuration?: string;   // e.g. '5m'
    severity:     'critical' | 'warning' | 'info';
    summary:      string;
    description?: string;
    labels?:      Record<string, string>;
}

export interface DatadogMonitorPayload {
    name:             string;
    type:             'metric alert' | 'log alert' | 'service check';
    query:            string;
    message:          string;
    thresholds:       { critical?: number; warning?: number; ok?: number };
    tags:             string[];
    notify_no_data:   boolean;
    renotify_interval: number;
}

export interface PagerDutyServicePayload {
    name:              string;
    description:       string;
    escalationPolicyId: string;
    alertCreation:     'create_alerts_and_incidents' | 'create_incidents';
    incidentUrgencyRule: { type: 'constant'; urgency: 'high' | 'low' };
}

// ---------------------------------------------------------------------------
// Grafana dashboard prompt + parser
// ---------------------------------------------------------------------------

export function buildGrafanaDashboardPrompt(params: {
    serviceOrApp: string;
    description:  string;
    metrics:      string[];    // PromQL metrics the service exposes
    namespace?:   string;
    panels?:      GrafanaPanel[];
    datasource?:  string;      // default: 'Prometheus'
}): string {
    const metricList = params.metrics.map((m) => `  - ${m}`).join('\n');
    const panelHints = params.panels?.map((p) => `  - ${p.title} (${p.type}): ${p.query}`).join('\n') ?? '';

    return [
        `Generate a production-ready Grafana dashboard JSON for the following service.`,
        ``,
        `Service: ${params.serviceOrApp}`,
        `Description: ${params.description}`,
        `Kubernetes namespace: ${params.namespace ?? 'default'}`,
        `Prometheus datasource: ${params.datasource ?? 'Prometheus'}`,
        ``,
        `Metrics exposed:`,
        metricList,
        ``,
        panelHints ? `Suggested panels:\n${panelHints}` : '',
        ``,
        `Dashboard requirements:`,
        `  - Include a "Service Overview" row: request rate, error rate, p50/p95/p99 latency`,
        `  - Include a "Resources" row: CPU usage, memory usage, pod count`,
        `  - Include a "Errors" row: 4xx/5xx rate, error log count`,
        `  - Add templating variables: $namespace, $pod`,
        `  - Set refresh: 30s, time range: last 1h`,
        `  - Use uid: "${params.serviceOrApp.toLowerCase().replace(/[^a-z0-9]/g, '-')}-dashboard"`,
        ``,
        `Return a JSON object that is a valid Grafana dashboard model (not wrapped in an array).`,
        `The object must have: title, uid, panels[], templating, time, refresh.`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseGrafanaDashboard(raw: string): Record<string, unknown> | null {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * Build the Grafana HTTP API request args for creating/updating a dashboard.
 * Caller must pipe the JSON body.
 */
export function buildGrafanaDashboardApiPayload(dashboard: Record<string, unknown>, folderId = 0): Record<string, unknown> {
    return {
        dashboard,
        folderId,
        overwrite: true,
        message:   'Created by AgentFarm DevOps agent',
    };
}

// ---------------------------------------------------------------------------
// Prometheus alert rules (PrometheusRule CRD)
// ---------------------------------------------------------------------------

/**
 * Build an LLM prompt for generating Prometheus alert rules for a service.
 */
export function buildAlertRulePrompt(params: {
    serviceOrApp: string;
    description:  string;
    namespace?:   string;
    slos?:        Array<{ metric: string; threshold: number; window: string }>;
}): string {
    const sloList = (params.slos ?? []).map((s) =>
        `  - ${s.metric} must stay below ${s.threshold}% over ${s.window}`,
    ).join('\n');

    return [
        `Generate Prometheus alerting rules as a Kubernetes PrometheusRule CRD for:`,
        ``,
        `Service: ${params.serviceOrApp}`,
        `Description: ${params.description}`,
        `Namespace: ${params.namespace ?? 'default'}`,
        sloList ? `SLO targets:\n${sloList}` : '',
        ``,
        `Include rules for:`,
        `  1. High error rate (5xx > 1% over 5m) — severity: critical`,
        `  2. High latency (p99 > 1s over 5m) — severity: warning`,
        `  3. Pod crash-looping — severity: critical`,
        `  4. Pod OOMKill — severity: warning`,
        `  5. Service down (0 healthy pods) — severity: critical`,
        `  6. Disk / memory pressure (>85%) — severity: warning`,
        ``,
        `Requirements:`,
        `  - Use for: duration (e.g. 5m) on all rules to avoid flapping`,
        `  - Add labels: team, severity, service`,
        `  - Add annotations: summary, description, runbook_url (placeholder)`,
        `  - apiVersion: monitoring.coreos.com/v1, kind: PrometheusRule`,
        ``,
        `Return a JSON array: [{ "filename": "alert-rules.yaml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseAlertRuleOutput(raw: string): Array<{ filename: string; content: string }> {
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

/**
 * Build a PrometheusRule CRD YAML directly from typed rules (no LLM needed for simple cases).
 */
export function buildPrometheusRuleCrd(params: {
    name:      string;
    namespace: string;
    groups:    Array<{
        name:  string;
        rules: PrometheusAlertRule[];
    }>;
}): string {
    const groupsYaml = params.groups.map((g) => {
        const rulesYaml = g.rules.map((r) => [
            `      - alert: ${r.alert}`,
            `        expr: ${r.expr}`,
            r.forDuration ? `        for: ${r.forDuration}` : '',
            `        labels:`,
            `          severity: ${r.severity}`,
            ...Object.entries(r.labels ?? {}).map(([k, v]) => `          ${k}: "${v}"`),
            `        annotations:`,
            `          summary: "${r.summary}"`,
            r.description ? `          description: "${r.description}"` : '',
        ].filter(Boolean).join('\n')).join('\n');
        return [`    - name: ${g.name}`, `      rules:`, rulesYaml].join('\n');
    }).join('\n');

    return [
        `apiVersion: monitoring.coreos.com/v1`,
        `kind: PrometheusRule`,
        `metadata:`,
        `  name: ${params.name}`,
        `  namespace: ${params.namespace}`,
        `  labels:`,
        `    prometheus: kube-prometheus`,
        `    role: alert-rules`,
        `spec:`,
        `  groups:`,
        groupsYaml,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Datadog monitor builder
// ---------------------------------------------------------------------------

export function buildDatadogMonitorPayload(params: {
    name:        string;
    service:     string;
    description: string;
    type?:       DatadogMonitorPayload['type'];
    query?:      string;
    criticalThreshold?: number;
    warningThreshold?:  number;
    tags?:       string[];
    notifyChannels?: string[];  // e.g. ['@slack-engineering', '@pagerduty-prod']
}): DatadogMonitorPayload {
    const notifyStr = (params.notifyChannels ?? []).join(' ');
    const query = params.query ??
        `avg(last_5m):avg:${params.service}.error_rate{service:${params.service}} > ${params.criticalThreshold ?? 0.05}`;

    return {
        name:    params.name,
        type:    params.type ?? 'metric alert',
        query,
        message: [
            `## ${params.name}`,
            `${params.description}`,
            ``,
            `**Impact:** Service degradation detected on ${params.service}`,
            `**Runbook:** https://wiki.example.com/runbooks/${params.service}`,
            ``,
            notifyStr || '@slack-on-call',
        ].join('\n'),
        thresholds: {
            critical: params.criticalThreshold ?? 0.05,
            warning:  params.warningThreshold  ?? 0.01,
        },
        tags:              [`service:${params.service}`, ...(params.tags ?? [])],
        notify_no_data:    false,
        renotify_interval: 60,
    };
}

// ---------------------------------------------------------------------------
// PagerDuty service builder
// ---------------------------------------------------------------------------

export function buildPagerDutyServicePayload(params: {
    name:               string;
    description:        string;
    escalationPolicyId: string;
    urgency?:           'high' | 'low';
    autoResolveTimeout?: number;  // seconds
}): PagerDutyServicePayload {
    return {
        name:             params.name,
        description:      params.description,
        escalationPolicyId: params.escalationPolicyId,
        alertCreation:    'create_alerts_and_incidents',
        incidentUrgencyRule: {
            type:    'constant',
            urgency: params.urgency ?? 'high',
        },
    };
}

/**
 * Build a Grafana alert notification channel payload for Slack.
 */
export function buildGrafanaSlackNotifierPayload(params: {
    name:       string;
    webhookUrl: string;
    channel:    string;
    mention?:   string;
}): Record<string, unknown> {
    return {
        name:     params.name,
        type:     'slack',
        isDefault: false,
        settings: {
            url:          params.webhookUrl,
            recipient:    params.channel,
            mention:      params.mention ?? '',
            uploadImage:  true,
            token:        '',
        },
    };
}
