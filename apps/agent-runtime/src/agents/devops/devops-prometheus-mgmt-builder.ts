// ============================================================================
// DEVOPS PROMETHEUS MANAGEMENT BUILDER
//
// Builders for the Prometheus HTTP Management API and related operations
// used by the workspace_devops_prometheus_mgmt action.
//
// Sub-actions:
//   reload          — POST /-/reload (hot-reload config + rules)
//   quit            — POST /-/quit (graceful shutdown)
//   healthy         — GET  /-/healthy
//   ready           — GET  /-/ready
//   targets         — GET  /api/v1/targets
//   rules           — GET  /api/v1/rules
//   alerts          — GET  /api/v1/alerts
//   config          — GET  /api/v1/status/config
//   runtime         — GET  /api/v1/status/runtimeinfo
//   tsdb            — GET  /api/v1/status/tsdb
//   flags           — GET  /api/v1/status/flags
//   delete_series   — POST /api/v1/admin/tsdb/delete_series (requires --web.enable-admin-api)
//   clean_tombstones — POST /api/v1/admin/tsdb/clean_tombstones
//   snapshot        — POST /api/v1/admin/tsdb/snapshot
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrometheusTarget {
    scrapePool:  string;
    scrapeUrl:   string;
    health:      'up' | 'down' | 'unknown';
    labels:      Record<string, string>;
    lastError?:  string;
    lastScrape:  string;
    scrapeMs:    number;
}

export interface PrometheusRuleGroup {
    name:     string;
    file:     string;
    rules:    PrometheusRule[];
    interval: number;
}

export interface PrometheusRule {
    name:     string;
    type:     'alerting' | 'recording';
    query:    string;
    state?:   'inactive' | 'pending' | 'firing';
    health:   'ok' | 'err' | 'unknown';
    lastEval: string;
}

export interface PrometheusAlert {
    labels:      Record<string, string>;
    annotations: Record<string, string>;
    state:       'inactive' | 'pending' | 'firing';
    activeAt:    string;
    value:       string;
}

// ---------------------------------------------------------------------------
// Management API builders (all use curl)
// ---------------------------------------------------------------------------

function curlBase(url: string, token?: string): string[] {
    const cmd = ['curl', '-s'];
    if (token) { cmd.push('-H', `Authorization: Bearer ${token}`); }
    return cmd;
}

export function buildPrometheusReloadArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), '-X', 'POST', `${params.url.replace(/\/$/, '')}/-/reload`];
}

export function buildPrometheusQuitArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), '-X', 'POST', `${params.url.replace(/\/$/, '')}/-/quit`];
}

export function buildPrometheusHealthyArgs(params: { url: string }): string[] {
    return ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', `${params.url.replace(/\/$/, '')}/-/healthy`];
}

export function buildPrometheusReadyArgs(params: { url: string }): string[] {
    return ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', `${params.url.replace(/\/$/, '')}/-/ready`];
}

export function buildPrometheusTargetsArgs(params: { url: string; token?: string; state?: 'active' | 'dropped' | 'any' }): string[] {
    const base = `${params.url.replace(/\/$/, '')}/api/v1/targets`;
    const qs   = params.state && params.state !== 'any' ? `?state=${params.state}` : '';
    return [...curlBase(params.url, params.token), `${base}${qs}`];
}

export function buildPrometheusRulesApiArgs(params: { url: string; token?: string; type?: 'alert' | 'record' }): string[] {
    const base = `${params.url.replace(/\/$/, '')}/api/v1/rules`;
    const qs   = params.type ? `?type=${params.type}` : '';
    return [...curlBase(params.url, params.token), `${base}${qs}`];
}

export function buildPrometheusAlertsApiArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), `${params.url.replace(/\/$/, '')}/api/v1/alerts`];
}

export function buildPrometheusConfigApiArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), `${params.url.replace(/\/$/, '')}/api/v1/status/config`];
}

export function buildPrometheusRuntimeApiArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), `${params.url.replace(/\/$/, '')}/api/v1/status/runtimeinfo`];
}

export function buildPrometheusTsdbArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), `${params.url.replace(/\/$/, '')}/api/v1/status/tsdb`];
}

export function buildPrometheusFlagsApiArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), `${params.url.replace(/\/$/, '')}/api/v1/status/flags`];
}

export function buildPrometheusDeleteSeriesArgs(params: {
    url:        string;
    token?:     string;
    matchers:   string[];   // e.g. ['job="node_exporter"', 'instance="host1"']
    start?:     string;
    end?:       string;
}): string[] {
    const qs = [
        ...params.matchers.map((m) => `match[]=${encodeURIComponent(m)}`),
        ...(params.start ? [`start=${params.start}`] : []),
        ...(params.end   ? [`end=${params.end}`]     : []),
    ].join('&');
    return [...curlBase(params.url, params.token), '-X', 'POST',
        `${params.url.replace(/\/$/, '')}/api/v1/admin/tsdb/delete_series?${qs}`];
}

export function buildPrometheusCleanTombstonesArgs(params: { url: string; token?: string }): string[] {
    return [...curlBase(params.url, params.token), '-X', 'POST',
        `${params.url.replace(/\/$/, '')}/api/v1/admin/tsdb/clean_tombstones`];
}

export function buildPrometheusSnapshotArgs(params: { url: string; token?: string; skipHead?: boolean }): string[] {
    const qs = params.skipHead ? '?skip_head=true' : '';
    return [...curlBase(params.url, params.token), '-X', 'POST',
        `${params.url.replace(/\/$/, '')}/api/v1/admin/tsdb/snapshot${qs}`];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parsePrometheusTargets(raw: string): { active: PrometheusTarget[]; dropped: number } {
    try {
        const j    = JSON.parse(raw);
        const data = j?.data ?? j;
        const activeRaw: unknown[] = data?.activeTargets ?? [];
        const active: PrometheusTarget[] = activeRaw.map((t: any) => ({
            scrapePool: t.scrapePool ?? '',
            scrapeUrl:  t.scrapeUrl ?? '',
            health:     t.health ?? 'unknown',
            labels:     t.labels ?? {},
            lastError:  t.lastError || undefined,
            lastScrape: t.lastScrape ?? '',
            scrapeMs:   t.lastScrapeDuration ? Math.round(t.lastScrapeDuration * 1000) : 0,
        }));
        return { active, dropped: (data?.droppedTargets ?? []).length };
    } catch {
        return { active: [], dropped: 0 };
    }
}

export function parsePrometheusRulesApi(raw: string): PrometheusRuleGroup[] {
    try {
        const j      = JSON.parse(raw);
        const groups: unknown[] = j?.data?.groups ?? [];
        return groups.map((g: any) => ({
            name:     g.name     ?? '',
            file:     g.file     ?? '',
            interval: g.interval ?? 0,
            rules: (g.rules ?? []).map((r: any) => ({
                name:     r.name ?? r.labels?.alertname ?? '',
                type:     r.type ?? 'alerting',
                query:    r.query ?? r.expr ?? '',
                state:    r.state,
                health:   r.health ?? 'unknown',
                lastEval: r.lastEvaluation ?? '',
            })),
        }));
    } catch {
        return [];
    }
}

export function parsePrometheusAlerts(raw: string): PrometheusAlert[] {
    try {
        const j    = JSON.parse(raw);
        const data: unknown[] = j?.data?.alerts ?? [];
        return data.map((a: any) => ({
            labels:      a.labels      ?? {},
            annotations: a.annotations ?? {},
            state:       a.state       ?? 'inactive',
            activeAt:    a.activeAt    ?? '',
            value:       String(a.value ?? ''),
        }));
    } catch {
        return [];
    }
}

export function formatPrometheusTargetReport(targets: PrometheusTarget[]): string {
    const up   = targets.filter((t) => t.health === 'up').length;
    const down = targets.filter((t) => t.health === 'down').length;
    const lines = [
        `# Prometheus Targets`,
        `**Total:** ${targets.length} | **Up:** ${up} | **Down:** ${down}`,
        '',
    ];
    for (const t of targets.filter((t) => t.health === 'down')) {
        lines.push(`❌ **${t.scrapePool}** — ${t.scrapeUrl}`);
        if (t.lastError) { lines.push(`   Error: ${t.lastError}`); }
    }
    return lines.join('\n');
}

export function formatPrometheusAlertReport(alerts: PrometheusAlert[]): string {
    const firing  = alerts.filter((a) => a.state === 'firing');
    const pending = alerts.filter((a) => a.state === 'pending');
    const lines   = [`# Prometheus Alerts`, `**Firing:** ${firing.length} | **Pending:** ${pending.length}`, ''];
    for (const a of firing) {
        lines.push(`🔴 **${a.labels['alertname'] ?? 'unknown'}** (${a.labels['severity'] ?? '?'})`);
        if (a.annotations['summary']) { lines.push(`   ${a.annotations['summary']}`); }
    }
    return lines.join('\n');
}
