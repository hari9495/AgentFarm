// ============================================================================
// DEVOPS METRICS QUERY BUILDER
//
// Live metrics and log querying against running observability backends:
//
//   Prometheus   — instant query (/api/v1/query) + range query (/api/v1/query_range)
//   Datadog      — metrics query API v1/v2
//   Loki         — log range query (/loki/api/v1/query_range)
//   Elasticsearch — full-text + structured log search via DSL
//   CloudWatch   — get-metric-data + Logs Insights
//
// All calls use curl or the AWS CLI so no SDK dependency is needed.
// Results are fed to an LLM prompt for root-cause analysis.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricsProvider = 'prometheus' | 'datadog' | 'loki' | 'elasticsearch' | 'cloudwatch';

export interface MetricsDataPoint {
    timestamp:  string;
    value:      number | string;
    labels?:    Record<string, string>;
}

export interface MetricsQueryResult {
    provider:   MetricsProvider;
    query:      string;
    dataPoints: MetricsDataPoint[];
    raw?:       string;
}

export interface MetricsAnalysis {
    status:     'normal' | 'warning' | 'critical';
    summary:    string;
    trend:      'improving' | 'stable' | 'degrading';
    root_cause: string | null;
    actions:    string[];
}

// ---------------------------------------------------------------------------
// Prometheus builders
// ---------------------------------------------------------------------------

/** Instant query — single point in time. */
export function buildPrometheusInstantQueryArgs(params: {
    prometheusUrl: string;
    query:         string;
    time?:         string;         // ISO or Unix timestamp; default: now
    bearerToken?:  string;
}): string[] {
    const url  = `${params.prometheusUrl}/api/v1/query`;
    const args = ['curl', '-s', '-G', url,
        '--data-urlencode', `query=${params.query}`];
    if (params.time)        args.push('--data-urlencode', `time=${params.time}`);
    if (params.bearerToken) args.push('-H', `Authorization: Bearer ${params.bearerToken}`);
    return args;
}

/** Range query — returns a time-series of data points. */
export function buildPrometheusRangeQueryArgs(params: {
    prometheusUrl: string;
    query:         string;
    start:         string;         // ISO or Unix
    end:           string;
    step:          string;         // e.g. '60s', '5m'
    bearerToken?:  string;
}): string[] {
    const url  = `${params.prometheusUrl}/api/v1/query_range`;
    const args = ['curl', '-s', '-G', url,
        '--data-urlencode', `query=${params.query}`,
        '--data-urlencode', `start=${params.start}`,
        '--data-urlencode', `end=${params.end}`,
        '--data-urlencode', `step=${params.step}`];
    if (params.bearerToken) args.push('-H', `Authorization: Bearer ${params.bearerToken}`);
    return args;
}

/** List available metric names (for discovery). */
export function buildPrometheusLabelValuesArgs(prometheusUrl: string, label = '__name__'): string[] {
    return ['curl', '-s', `${prometheusUrl}/api/v1/label/${label}/values`];
}

// ---------------------------------------------------------------------------
// Datadog builders
// ---------------------------------------------------------------------------

export function buildDatadogMetricQueryArgs(params: {
    apiKey:   string;
    appKey:   string;
    query:    string;
    fromUnix: number;           // Unix timestamp (seconds)
    toUnix:   number;
    site?:    string;           // default: datadoghq.com
}): string[] {
    const site = params.site ?? 'datadoghq.com';
    const url  = `https://api.${site}/api/v1/query?from=${params.fromUnix}&to=${params.toUnix}&query=${encodeURIComponent(params.query)}`;
    return ['curl', '-s', url,
        '-H', `DD-API-KEY: ${params.apiKey}`,
        '-H', `DD-APPLICATION-KEY: ${params.appKey}`];
}

/** Datadog Logs search (v2). */
export function buildDatadogLogsQueryArgs(params: {
    apiKey:  string;
    appKey:  string;
    query:   string;
    from:    string;            // ISO timestamp
    to:      string;
    limit?:  number;
    site?:   string;
}): string[] {
    const site = params.site ?? 'datadoghq.com';
    const body = JSON.stringify({
        filter: { query: params.query, from: params.from, to: params.to },
        page:   { limit: params.limit ?? 100 },
        sort:   'timestamp',
    });
    return ['curl', '-s', '-X', 'POST', `https://api.${site}/api/v2/logs/events/search`,
        '-H', `DD-API-KEY: ${params.apiKey}`,
        '-H', `DD-APPLICATION-KEY: ${params.appKey}`,
        '-H', 'Content-Type: application/json',
        '-d', body];
}

// ---------------------------------------------------------------------------
// Loki builders
// ---------------------------------------------------------------------------

export function buildLokiRangeQueryArgs(params: {
    lokiUrl:   string;
    query:     string;           // LogQL e.g. {app="myapp"} |= "error"
    start?:    string;           // Nanosecond Unix or RFC3339
    end?:      string;
    limit?:    number;
    direction?: 'forward' | 'backward';
    bearerToken?: string;
}): string[] {
    const url  = `${params.lokiUrl}/loki/api/v1/query_range`;
    const args = ['curl', '-s', '-G', url,
        '--data-urlencode', `query=${params.query}`,
        '--data-urlencode', `limit=${params.limit ?? 200}`,
        '--data-urlencode', `direction=${params.direction ?? 'backward'}`];
    if (params.start)       args.push('--data-urlencode', `start=${params.start}`);
    if (params.end)         args.push('--data-urlencode', `end=${params.end}`);
    if (params.bearerToken) args.push('-H', `Authorization: Bearer ${params.bearerToken}`);
    return args;
}

// ---------------------------------------------------------------------------
// Elasticsearch builders
// ---------------------------------------------------------------------------

export function buildElasticsearchSearchArgs(params: {
    url:     string;
    index:   string;
    body:    string;             // JSON query DSL
    apiKey?: string;
    basicAuth?: string;          // user:pass
}): string[] {
    const args = ['curl', '-s', '-X', 'POST', `${params.url}/${params.index}/_search`,
        '-H', 'Content-Type: application/json',
        '-d', params.body];
    if (params.apiKey)    args.push('-H', `Authorization: ApiKey ${params.apiKey}`);
    if (params.basicAuth) args.push('-u', params.basicAuth);
    return args;
}

/** Build an Elasticsearch query DSL for log search. */
export function buildElasticsearchQueryDsl(params: {
    message?:  string;
    level?:    'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
    service?:  string;
    traceId?:  string;
    from?:     string;           // ISO
    to?:       string;
    size?:     number;
    fields?:   string[];
}): string {
    const must: unknown[] = [];
    if (params.message) must.push({ match: { message: params.message } });
    if (params.level)   must.push({ term: { 'log.level': params.level } });
    if (params.service) must.push({ term: { 'service.name': params.service } });
    if (params.traceId) must.push({ term: { 'trace.id': params.traceId } });

    const filter: unknown[] = [];
    if (params.from || params.to) {
        filter.push({ range: { '@timestamp': {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to   ? { lte: params.to   } : {}),
        } } });
    }

    const body: Record<string, unknown> = {
        size:  params.size ?? 100,
        sort:  [{ '@timestamp': { order: 'desc' } }],
        query: { bool: { must, filter } },
    };
    if (params.fields?.length) {
        body['_source'] = params.fields;
    }
    return JSON.stringify(body);
}

// ---------------------------------------------------------------------------
// CloudWatch builders
// ---------------------------------------------------------------------------

export function buildCloudWatchGetMetricArgs(params: {
    namespace:   string;
    metricName:  string;
    dimensions:  Record<string, string>;
    period:      number;         // seconds, e.g. 60
    stat:        string;         // Average | Sum | Maximum | Minimum | SampleCount
    startTime:   string;         // ISO
    endTime:     string;
    region?:     string;
}): string[] {
    const dims = Object.entries(params.dimensions).map(([Name, Value]) => ({ Name, Value }));
    const query = JSON.stringify([{
        Id:         'm1',
        MetricStat: {
            Metric: { Namespace: params.namespace, MetricName: params.metricName, Dimensions: dims },
            Period: params.period,
            Stat:   params.stat,
        },
    }]);
    const args = ['aws', 'cloudwatch', 'get-metric-data',
        '--metric-data-queries', query,
        '--start-time', params.startTime,
        '--end-time',   params.endTime,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

/** Start a CloudWatch Logs Insights query (async — returns query ID). */
export function buildCloudWatchLogsInsightsStartArgs(params: {
    logGroup:  string;
    query:     string;           // CloudWatch Logs Insights syntax
    startTime: number;           // Unix seconds
    endTime:   number;
    region?:   string;
}): string[] {
    const args = ['aws', 'logs', 'start-query',
        '--log-group-name', params.logGroup,
        '--start-time',  String(params.startTime),
        '--end-time',    String(params.endTime),
        '--query-string', params.query,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

/** Poll for results of a started CW Logs Insights query. */
export function buildCloudWatchLogsInsightsResultArgs(queryId: string, region?: string): string[] {
    const args = ['aws', 'logs', 'get-query-results', '--query-id', queryId, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parsePrometheusResult(raw: string, query = ''): MetricsQueryResult {
    try {
        const json = JSON.parse(raw) as {
            status?: string;
            data?: {
                result?: Array<{
                    metric?: Record<string, string>;
                    value?:  [number, string];
                    values?: Array<[number, string]>;
                }>;
            };
        };
        const dataPoints: MetricsDataPoint[] = (json.data?.result ?? []).flatMap((r) => {
            const labels = r.metric ?? {};
            if (r.values) {
                return r.values.map(([ts, val]) => ({
                    timestamp: new Date(ts * 1000).toISOString(),
                    value:     parseFloat(val),
                    labels,
                }));
            }
            if (r.value) {
                const [ts, val] = r.value;
                return [{ timestamp: new Date(ts * 1000).toISOString(), value: parseFloat(val), labels }];
            }
            return [];
        });
        return { provider: 'prometheus', query, dataPoints, raw: raw.slice(0, 2000) };
    } catch {
        return { provider: 'prometheus', query, dataPoints: [], raw: raw.slice(0, 500) };
    }
}

export function parseLokiResult(raw: string, query = ''): MetricsQueryResult {
    try {
        const json = JSON.parse(raw) as {
            data?: {
                result?: Array<{
                    stream?: Record<string, string>;
                    values?: Array<[string, string]>;
                }>;
            };
        };
        const dataPoints: MetricsDataPoint[] = (json.data?.result ?? []).flatMap((r) =>
            (r.values ?? []).map(([tsNano, line]) => ({
                timestamp: new Date(parseInt(tsNano, 10) / 1_000_000).toISOString(),
                value:     line,
                labels:    r.stream ?? {},
            }))
        );
        return { provider: 'loki', query, dataPoints, raw: raw.slice(0, 2000) };
    } catch {
        return { provider: 'loki', query, dataPoints: [], raw: raw.slice(0, 500) };
    }
}

export function parseCloudWatchResult(raw: string): MetricsQueryResult {
    try {
        const json = JSON.parse(raw) as {
            MetricDataResults?: Array<{
                Timestamps?: string[];
                Values?: number[];
                Label?: string;
            }>;
        };
        const result = json.MetricDataResults?.[0];
        const dataPoints: MetricsDataPoint[] = (result?.Timestamps ?? []).map((ts, i) => ({
            timestamp: ts,
            value:     result?.Values?.[i] ?? 0,
        }));
        return { provider: 'cloudwatch', query: result?.Label ?? '', dataPoints, raw: raw.slice(0, 2000) };
    } catch {
        return { provider: 'cloudwatch', query: '', dataPoints: [], raw: raw.slice(0, 500) };
    }
}

export function parseMetricsAnalysis(raw: string): MetricsAnalysis | null {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const j = JSON.parse(cleaned) as Partial<MetricsAnalysis>;
        if (!j.status) return null;
        return {
            status:     j.status,
            summary:    j.summary     ?? '',
            trend:      j.trend       ?? 'stable',
            root_cause: j.root_cause  ?? null,
            actions:    j.actions     ?? [],
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// LLM prompts
// ---------------------------------------------------------------------------

export function buildMetricsAnalysisPrompt(params: {
    query:     string;
    result:    MetricsQueryResult;
    context:   string;
    service?:  string;
    alerting?: boolean;
}): string {
    const sample = params.result.dataPoints.slice(0, 30)
        .map((d) => `  ${d.timestamp}: ${d.value}${d.labels ? '  ' + JSON.stringify(d.labels) : ''}`)
        .join('\n');
    const numericValues = params.result.dataPoints
        .map((d) => parseFloat(String(d.value))).filter((v) => !isNaN(v));
    const stats = numericValues.length
        ? `min=${Math.min(...numericValues).toFixed(3)}  max=${Math.max(...numericValues).toFixed(3)}  avg=${(numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(3)}`
        : 'n/a';

    return [
        `You are a senior SRE analyzing ${params.result.provider} metrics for service "${params.service ?? 'unknown'}".`,
        ``,
        `Query: ${params.query}`,
        `Context: ${params.context}`,
        `Data points: ${params.result.dataPoints.length} (stats: ${stats})`,
        `Sample:`,
        sample || '  (no data returned)',
        ``,
        `Analyze and return JSON:`,
        `{`,
        `  "status": "normal"|"warning"|"critical",`,
        `  "summary": "<one sentence>",`,
        `  "trend": "improving"|"stable"|"degrading",`,
        `  "root_cause": "<string or null>",`,
        `  "actions": ["<step 1>", ...]`,
        `}`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatMetricsReport(result: MetricsQueryResult, analysis?: MetricsAnalysis | null): string {
    const numericValues = result.dataPoints
        .map((d) => parseFloat(String(d.value))).filter((v) => !isNaN(v));
    const lines = [
        `Metrics Query — ${result.provider.toUpperCase()}`,
        `Query: ${result.query || '(see payload)'}`,
        `Data points: ${result.dataPoints.length}`,
    ];
    if (numericValues.length > 0) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        lines.push(`  min=${Math.min(...numericValues).toFixed(3)}  max=${Math.max(...numericValues).toFixed(3)}  avg=${avg.toFixed(3)}`);
    }
    if (analysis) {
        lines.push(`Status:  ${analysis.status.toUpperCase()}`);
        lines.push(`Trend:   ${analysis.trend}`);
        if (analysis.summary)    lines.push(`Summary: ${analysis.summary}`);
        if (analysis.root_cause) lines.push(`Root cause: ${analysis.root_cause}`);
        if (analysis.actions.length) {
            lines.push(`Actions:`);
            lines.push(...analysis.actions.map((a) => `  - ${a}`));
        }
    }
    return lines.join('\n');
}
