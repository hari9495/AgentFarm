// ============================================================================
// DEVOPS SCHEDULED MONITOR BUILDER
//
// Builders for the workspace_devops_scheduled_monitor action.
// Manages recurring metric/log/endpoint health checks by creating structured
// monitor specifications that can be persisted and re-run on a schedule.
//
// Sub-actions:
//   create_metric_watch   — Create a Prometheus metric threshold monitor spec
//   create_log_watch      — Create a log pattern monitor spec (kubectl/journald)
//   create_endpoint_watch — Create an HTTP endpoint monitor spec
//   evaluate              — Run a monitor check now (one-shot)
//   report                — Generate a health summary from multiple check results
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonitorType = 'metric' | 'log' | 'endpoint';
export type MonitorSeverity = 'critical' | 'warning' | 'info';
export type MonitorStatus = 'ok' | 'warning' | 'critical' | 'unknown' | 'error';

export interface MetricWatchSpec {
    kind:          'metric';
    id:            string;
    name:          string;
    description?:  string;
    query:         string;   // PromQL expression
    prometheusUrl: string;
    warnThreshold?:   number;
    critThreshold?:   number;
    comparison:    '>' | '<' | '>=' | '<=' | '==';
    severity:      MonitorSeverity;
    labels?:       Record<string, string>;
}

export interface LogWatchSpec {
    kind:          'log';
    id:            string;
    name:          string;
    description?:  string;
    pattern:       string;   // grep/regex pattern
    source:        'kubectl' | 'journald' | 'file';
    target:        string;   // pod/unit name or file path
    namespace?:    string;
    sinceSeconds?: number;
    severity:      MonitorSeverity;
    suppressIfContains?: string[];   // noise filter patterns
}

export interface EndpointWatchSpec {
    kind:          'endpoint';
    id:            string;
    name:          string;
    description?:  string;
    url:           string;
    method?:       'GET' | 'POST' | 'HEAD';
    expectedStatus: number;
    warnLatencyMs?: number;
    critLatencyMs?: number;
    bodyContains?:  string;
    headers?:       Record<string, string>;
    tlsCheck?:      boolean;
    severity:       MonitorSeverity;
}

export type MonitorSpec = MetricWatchSpec | LogWatchSpec | EndpointWatchSpec;

export interface MonitorCheckResult {
    id:          string;
    name:        string;
    status:      MonitorStatus;
    value?:      number | string;
    message:     string;
    checkedAt:   string;
    latencyMs?:  number;
}

export interface MonitorReport {
    checkedAt:  string;
    ok:         number;
    warning:    number;
    critical:   number;
    unknown:    number;
    results:    MonitorCheckResult[];
}

// ---------------------------------------------------------------------------
// Spec builders
// ---------------------------------------------------------------------------

export function buildMetricWatchSpec(params: Omit<MetricWatchSpec, 'kind'>): MetricWatchSpec {
    return { kind: 'metric', ...params };
}

export function buildLogWatchSpec(params: Omit<LogWatchSpec, 'kind'>): LogWatchSpec {
    return { kind: 'log', ...params };
}

export function buildEndpointWatchSpec(params: Omit<EndpointWatchSpec, 'kind'>): EndpointWatchSpec {
    return { kind: 'endpoint', ...params };
}

// ---------------------------------------------------------------------------
// CLI command builders — what the agent runs to evaluate a monitor
// ---------------------------------------------------------------------------

/**
 * Prometheus instant query (returns value to compare against threshold).
 * Uses curl against the Prometheus HTTP API.
 */
export function buildPrometheusInstantQueryArgs(params: {
    prometheusUrl: string;
    query:         string;
    token?:        string;
}): string[] {
    const url = `${params.prometheusUrl.replace(/\/$/, '')}/api/v1/query`;
    const qs  = `query=${encodeURIComponent(params.query)}`;
    const cmd = ['curl', '-s'];
    if (params.token) { cmd.push('-H', `Authorization: Bearer ${params.token}`); }
    cmd.push(`${url}?${qs}`);
    return cmd;
}

/**
 * Log watch via kubectl logs.
 */
export function buildLogWatchKubectlArgs(spec: LogWatchSpec): string[] {
    const cmd = ['kubectl', 'logs'];
    if (spec.namespace)     { cmd.push('-n', spec.namespace); }
    if (spec.sinceSeconds)  { cmd.push(`--since=${spec.sinceSeconds}s`); }
    cmd.push(spec.target);
    // pipe through grep (run via sh -c)
    return ['sh', '-c', `${cmd.join(' ')} 2>&1 | grep -c '${spec.pattern.replace(/'/g, "'\\''")}'`];
}

/**
 * Log watch via journald.
 */
export function buildLogWatchJournaldArgs(spec: LogWatchSpec): string[] {
    const since = spec.sinceSeconds ? `${spec.sinceSeconds} seconds ago` : '5 minutes ago';
    return ['sh', '-c',
        `journalctl -u '${spec.target}' --since '${since}' --no-pager 2>&1 | grep -c '${spec.pattern.replace(/'/g, "'\\''")}'`,
    ];
}

/**
 * Log watch via file.
 */
export function buildLogWatchFileArgs(spec: LogWatchSpec): string[] {
    const since = spec.sinceSeconds ?? 300;
    return ['sh', '-c',
        `find '${spec.target}' -newer /tmp/.monitor_${spec.id} -exec grep -c '${spec.pattern.replace(/'/g, "'\\''")}'  {} \\; 2>/dev/null || echo 0`,
    ];
}

export function buildLogWatchArgs(spec: LogWatchSpec): string[] {
    switch (spec.source) {
        case 'kubectl':  return buildLogWatchKubectlArgs(spec);
        case 'journald': return buildLogWatchJournaldArgs(spec);
        case 'file':     return buildLogWatchFileArgs(spec);
    }
}

/**
 * Endpoint check via curl — returns HTTP code + latency.
 */
export function buildEndpointCheckArgs(spec: EndpointWatchSpec): string[] {
    const method = spec.method ?? 'GET';
    const cmd    = ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}:%{time_total}'];
    for (const [k, v] of Object.entries(spec.headers ?? {})) {
        cmd.push('-H', `${k}: ${v}`);
    }
    if (spec.tlsCheck === false) { cmd.push('-k'); }
    cmd.push('-X', method, spec.url);
    return cmd;
}

/**
 * Full endpoint check that also captures body (for bodyContains check).
 */
export function buildEndpointBodyCheckArgs(spec: EndpointWatchSpec): string[] {
    const method = spec.method ?? 'GET';
    const cmd    = ['curl', '-s', '-w', '\\n%{http_code}:%{time_total}'];
    for (const [k, v] of Object.entries(spec.headers ?? {})) {
        cmd.push('-H', `${k}: ${v}`);
    }
    if (spec.tlsCheck === false) { cmd.push('-k'); }
    cmd.push('-X', method, spec.url);
    return cmd;
}

// ---------------------------------------------------------------------------
// Result evaluation
// ---------------------------------------------------------------------------

export function evaluateMetricResult(spec: MetricWatchSpec, raw: string): MonitorCheckResult {
    const checkedAt = new Date().toISOString();
    try {
        const j       = JSON.parse(raw);
        const results = j?.data?.result ?? [];
        if (results.length === 0) {
            return { id: spec.id, name: spec.name, status: 'unknown', message: 'No data returned by query', checkedAt };
        }
        const val = parseFloat(results[0]?.value?.[1] ?? 'NaN');
        if (isNaN(val)) {
            return { id: spec.id, name: spec.name, status: 'unknown', message: 'Non-numeric query result', checkedAt };
        }
        const compare = (threshold: number): boolean => {
            switch (spec.comparison) {
                case '>':  return val >  threshold;
                case '<':  return val <  threshold;
                case '>=': return val >= threshold;
                case '<=': return val <= threshold;
                case '==': return val === threshold;
            }
        };
        if (spec.critThreshold !== undefined && compare(spec.critThreshold)) {
            return { id: spec.id, name: spec.name, status: 'critical', value: val, message: `Value ${val} ${spec.comparison} critical threshold ${spec.critThreshold}`, checkedAt };
        }
        if (spec.warnThreshold !== undefined && compare(spec.warnThreshold)) {
            return { id: spec.id, name: spec.name, status: 'warning',  value: val, message: `Value ${val} ${spec.comparison} warning threshold ${spec.warnThreshold}`, checkedAt };
        }
        return { id: spec.id, name: spec.name, status: 'ok', value: val, message: `Value ${val} within thresholds`, checkedAt };
    } catch {
        return { id: spec.id, name: spec.name, status: 'error', message: `Failed to parse metric response: ${raw.slice(0, 200)}`, checkedAt };
    }
}

export function evaluateLogResult(spec: LogWatchSpec, raw: string): MonitorCheckResult {
    const checkedAt  = new Date().toISOString();
    const matchCount = parseInt(raw.trim(), 10);
    if (isNaN(matchCount)) {
        return { id: spec.id, name: spec.name, status: 'error', message: `Could not parse match count: ${raw.slice(0, 100)}`, checkedAt };
    }
    if (matchCount > 0) {
        return { id: spec.id, name: spec.name, status: spec.severity === 'critical' ? 'critical' : 'warning',
            value: matchCount, message: `Pattern "${spec.pattern}" matched ${matchCount} line(s)`, checkedAt };
    }
    return { id: spec.id, name: spec.name, status: 'ok', value: 0, message: `No matches for pattern "${spec.pattern}"`, checkedAt };
}

export function evaluateEndpointResult(spec: EndpointWatchSpec, raw: string): MonitorCheckResult {
    const checkedAt = new Date().toISOString();
    try {
        const lastLine  = raw.trim().split('\n').pop() ?? '';
        const [codeStr, timeStr] = lastLine.split(':');
        const code      = parseInt(codeStr ?? '0', 10);
        const latencyMs = Math.round(parseFloat(timeStr ?? '0') * 1000);

        if (code !== spec.expectedStatus) {
            return { id: spec.id, name: spec.name, status: 'critical', value: code,
                message: `HTTP ${code} (expected ${spec.expectedStatus})`, checkedAt, latencyMs };
        }
        if (spec.critLatencyMs && latencyMs >= spec.critLatencyMs) {
            return { id: spec.id, name: spec.name, status: 'critical', value: latencyMs,
                message: `Latency ${latencyMs}ms exceeds critical threshold ${spec.critLatencyMs}ms`, checkedAt, latencyMs };
        }
        if (spec.warnLatencyMs && latencyMs >= spec.warnLatencyMs) {
            return { id: spec.id, name: spec.name, status: 'warning', value: latencyMs,
                message: `Latency ${latencyMs}ms exceeds warning threshold ${spec.warnLatencyMs}ms`, checkedAt, latencyMs };
        }
        return { id: spec.id, name: spec.name, status: 'ok', value: code, message: `HTTP ${code} in ${latencyMs}ms`, checkedAt, latencyMs };
    } catch {
        return { id: spec.id, name: spec.name, status: 'error', message: `Failed to parse endpoint response`, checkedAt };
    }
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export function buildMonitorReport(results: MonitorCheckResult[]): MonitorReport {
    return {
        checkedAt: new Date().toISOString(),
        ok:        results.filter((r) => r.status === 'ok').length,
        warning:   results.filter((r) => r.status === 'warning').length,
        critical:  results.filter((r) => r.status === 'critical').length,
        unknown:   results.filter((r) => r.status === 'unknown' || r.status === 'error').length,
        results,
    };
}

export function formatMonitorReport(report: MonitorReport): string {
    const statusIcon: Record<MonitorStatus, string> = {
        ok: '✅', warning: '⚠️', critical: '🔴', unknown: '❓', error: '💥',
    };
    const summary = `**OK:** ${report.ok} | **Warning:** ${report.warning} | **Critical:** ${report.critical} | **Unknown:** ${report.unknown}`;
    const lines   = [
        '# Monitor Health Report',
        `*Checked at: ${report.checkedAt}*`,
        summary,
        '',
        '| Status | Monitor | Value | Message |',
        '|--------|---------|-------|---------|',
    ];
    for (const r of report.results) {
        const icon = statusIcon[r.status] ?? '?';
        lines.push(`| ${icon} ${r.status} | ${r.name} | ${r.value ?? '-'} | ${r.message} |`);
    }
    return lines.join('\n');
}

export function buildMonitorAlertMessage(result: MonitorCheckResult, severity: MonitorSeverity): string {
    const emoji = result.status === 'critical' ? '🚨' : '⚠️';
    return [
        `${emoji} *Monitor Alert: ${result.name}*`,
        `*Status:* ${result.status.toUpperCase()}`,
        `*Severity:* ${severity}`,
        `*Value:* ${result.value ?? 'N/A'}`,
        `*Message:* ${result.message}`,
        `*Checked at:* ${result.checkedAt}`,
    ].join('\n');
}
