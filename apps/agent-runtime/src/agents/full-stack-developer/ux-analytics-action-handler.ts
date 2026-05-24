// ============================================================================
// UX ANALYTICS ACTION HANDLER — Gap: UX Intuition from Real User Feedback
//
// Connects the FSD agent to real user behaviour data so UX decisions are
// driven by evidence, not guesswork.
//
// Actions:
//   workspace_fsd_analytics_snapshot   — pull page/feature metrics from
//     Mixpanel | Amplitude | GA4 via connector; identify worst performers
//   workspace_fsd_session_replay_analyze — analyse Hotjar/FullStory heatmap
//     + rage-click / dead-click / scroll-depth data
//   workspace_fsd_ab_test_read         — read A/B test results, compute
//     statistical significance, recommend winning variant
//
// Architecture:
//   Pure builder helpers → formatted data for LLM synthesis.
//   I/O only via executeAction (connector calls) and callLlm.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UxAnalyticsActionType =
    | 'workspace_fsd_analytics_snapshot'
    | 'workspace_fsd_session_replay_analyze'
    | 'workspace_fsd_ab_test_read';

export const UX_ANALYTICS_ACTION_TYPES = new Set<UxAnalyticsActionType>([
    'workspace_fsd_analytics_snapshot',
    'workspace_fsd_session_replay_analyze',
    'workspace_fsd_ab_test_read',
]);

export function isUxAnalyticsActionType(at: string): at is UxAnalyticsActionType {
    return UX_ANALYTICS_ACTION_TYPES.has(at as UxAnalyticsActionType);
}

export type UxAnalyticsActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type ExecuteActionFn = (
    actionType: string,
    payload:    Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface UxAnalyticsActionParams {
    actionType:    UxAnalyticsActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function safeJson(obj: Record<string, unknown>): UxAnalyticsActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); }
    catch { return ''; }
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/** Normalise raw connector metric payload into a flat PageMetric array. */
export interface PageMetric {
    page:            string;
    sessions:        number;
    bounceRate:      number;   // 0–1
    avgSessionSec:   number;
    conversionRate:  number;   // 0–1
    errorRate:       number;   // 0–1
    p75LoadMs:       number;
}

export function parseAnalyticsPayload(raw: unknown): PageMetric[] {
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[])
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
            page:           str(r['page'] ?? r['url'] ?? r['path']),
            sessions:       Number(r['sessions']       ?? r['users']           ?? 0),
            bounceRate:     Number(r['bounce_rate']     ?? r['bounceRate']      ?? 0),
            avgSessionSec:  Number(r['avg_session_sec'] ?? r['avgSessionSec']   ?? 0),
            conversionRate: Number(r['conversion_rate'] ?? r['conversionRate']  ?? 0),
            errorRate:      Number(r['error_rate']      ?? r['errorRate']       ?? 0),
            p75LoadMs:      Number(r['p75_load_ms']     ?? r['p75LoadMs']       ?? 0),
        }))
        .filter((m) => m.page.length > 0);
}

/** Score a page 0–100. Lower is worse (more UX attention needed). */
export function scorePageUx(m: PageMetric): number {
    let score = 100;
    if (m.bounceRate    > 0.7)  score -= 30;
    else if (m.bounceRate > 0.5) score -= 15;
    if (m.avgSessionSec < 30)   score -= 20;
    else if (m.avgSessionSec < 60) score -= 10;
    if (m.conversionRate < 0.01) score -= 20;
    else if (m.conversionRate < 0.03) score -= 10;
    if (m.p75LoadMs > 3000) score -= 20;
    else if (m.p75LoadMs > 1500) score -= 10;
    if (m.errorRate > 0.05) score -= 15;
    return Math.max(0, score);
}

/** Build the LLM prompt for analytics insights. */
export function buildAnalyticsInsightPrompt(metrics: PageMetric[], context: string): string {
    const sorted = [...metrics].sort((a, b) => scorePageUx(a) - scorePageUx(b));
    const topWorst = sorted.slice(0, 5);

    return [
        `You are a senior UX engineer analysing real user behaviour data.`,
        context ? `Context: ${context}` : '',
        ``,
        `Worst-performing pages (by UX score):`,
        ...topWorst.map((m, i) =>
            `  ${i + 1}. ${m.page} — bounce:${(m.bounceRate * 100).toFixed(0)}%  ` +
            `session:${m.avgSessionSec}s  conv:${(m.conversionRate * 100).toFixed(1)}%  ` +
            `load:${m.p75LoadMs}ms  errors:${(m.errorRate * 100).toFixed(1)}%`
        ),
        ``,
        `Return JSON:`,
        `{`,
        `  "insights": [{ "page": string, "problem": string, "root_cause": string, "fix": string, "priority": "critical"|"high"|"medium" }],`,
        `  "quick_wins": string[],`,
        `  "summary": string`,
        `}`,
        `No markdown fences. Valid JSON only.`,
    ].filter(Boolean).join('\n');
}

export interface AnalyticsInsight {
    page:      string;
    problem:   string;
    rootCause: string;
    fix:       string;
    priority:  'critical' | 'high' | 'medium';
}

export function parseAnalyticsInsights(raw: string): {
    insights:   AnalyticsInsight[];
    quickWins:  string[];
    summary:    string;
} {
    const fallback = { insights: [], quickWins: [], summary: 'No insights generated' };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            insights:  (Array.isArray(p['insights']) ? p['insights'] : []) as AnalyticsInsight[],
            quickWins: Array.isArray(p['quick_wins']) ? (p['quick_wins'] as string[]) : [],
            summary:   typeof p['summary'] === 'string' ? p['summary'] : '',
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Session replay builders
// ---------------------------------------------------------------------------

export interface SessionEvent {
    type:       'rage_click' | 'dead_click' | 'scroll_depth' | 'exit' | 'error';
    selector?:  string;
    url:        string;
    count:      number;
    pctUsers?:  number;   // % of users who hit this
}

export function parseSessionEvents(raw: unknown): SessionEvent[] {
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[])
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
            type:     (r['type'] ?? 'dead_click') as SessionEvent['type'],
            selector: str(r['selector'] ?? r['element']),
            url:      str(r['url'] ?? r['page']),
            count:    Number(r['count'] ?? r['occurrences'] ?? 0),
            pctUsers: typeof r['pct_users'] === 'number' ? r['pct_users'] : undefined,
        }));
}

export function buildSessionReplayPrompt(events: SessionEvent[], context: string): string {
    const rageClicks  = events.filter((e) => e.type === 'rage_click').slice(0, 5);
    const deadClicks  = events.filter((e) => e.type === 'dead_click').slice(0, 5);
    const scrollDepth = events.filter((e) => e.type === 'scroll_depth').slice(0, 3);

    return [
        `You are a UX engineer reviewing session replay data.`,
        context ? `Context: ${context}` : '',
        ``,
        rageClicks.length > 0 ? `Rage clicks (users clicking rapidly in frustration):` : '',
        ...rageClicks.map((e) => `  • ${e.selector || e.url} — ${e.count} events${e.pctUsers ? `, ${e.pctUsers}% users` : ''}`),
        deadClicks.length > 0 ? `Dead clicks (users clicking non-interactive elements):` : '',
        ...deadClicks.map((e) => `  • ${e.selector || e.url} — ${e.count} events`),
        scrollDepth.length > 0 ? `Scroll depth issues:` : '',
        ...scrollDepth.map((e) => `  • ${e.url} — ${e.count} users drop off here`),
        ``,
        `Return JSON:`,
        `{ "issues": [{ "element": string, "type": string, "impact": string, "fix": string }], "summary": string }`,
        `Valid JSON only.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// A/B test builders
// ---------------------------------------------------------------------------

export interface AbVariant {
    name:        string;
    sessions:    number;
    conversions: number;
}

export function computeAbSignificance(control: AbVariant, treatment: AbVariant): {
    controlRate:   number;
    treatmentRate: number;
    lift:          number;
    zScore:        number;
    significant:   boolean;
    winner:        'control' | 'treatment' | 'inconclusive';
} {
    const cr = control.conversions   / Math.max(1, control.sessions);
    const tr = treatment.conversions / Math.max(1, treatment.sessions);
    const lift = cr > 0 ? (tr - cr) / cr : 0;

    // Two-proportion z-test
    const pooled = (control.conversions + treatment.conversions) /
                   (control.sessions + treatment.sessions);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.sessions + 1 / treatment.sessions));
    const z  = se > 0 ? Math.abs(tr - cr) / se : 0;
    const significant = z > 1.96;   // 95% confidence

    return {
        controlRate:   cr,
        treatmentRate: tr,
        lift,
        zScore:        z,
        significant,
        winner: !significant ? 'inconclusive' : (tr > cr ? 'treatment' : 'control'),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleUxAnalyticsAction(
    params: UxAnalyticsActionParams,
): Promise<UxAnalyticsActionResult> {
    const { actionType, payload, executeAction, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_fsd_analytics_snapshot
        // Pulls page/feature metrics from an analytics connector.
        //
        // payload:
        //   connector?        — mixpanel | amplitude | ga4 | custom
        //                       (default: ga4)
        //   date_range?       — last_7d | last_30d | last_90d (default: last_30d)
        //   pages?            — string[] filter to specific pages
        //   metrics_json?     — pre-fetched raw metrics JSON string (bypass connector)
        //   context?          — feature/product context for LLM
        // ====================================================================
        case 'workspace_fsd_analytics_snapshot': {
            const connector   = str(payload['connector'], 'ga4');
            const dateRange   = str(payload['date_range'], 'last_30d');
            const pagesFilter = Array.isArray(payload['pages']) ? (payload['pages'] as string[]) : [];
            const context     = str(payload['context']);

            let rawMetrics: unknown = null;

            // Try to fetch from connector first
            if (!payload['metrics_json']) {
                const connResult = await executeAction('workspace_connector_test', {
                    connector_type: connector,
                    action:         'get_page_metrics',
                    date_range:     dateRange,
                    pages:          pagesFilter,
                });
                if (connResult.ok && connResult.output) {
                    try { rawMetrics = JSON.parse(connResult.output); } catch { /* ignore */ }
                }
            } else {
                try { rawMetrics = JSON.parse(str(payload['metrics_json'])); } catch { /* ignore */ }
            }

            // Parse and score pages
            const metrics = parseAnalyticsPayload(rawMetrics ?? []);
            const scored  = metrics.map((m) => ({ ...m, ux_score: scorePageUx(m) }))
                .sort((a, b) => a.ux_score - b.ux_score);

            let insights = { insights: [] as AnalyticsInsight[], quickWins: [] as string[], summary: '' };
            if (callLlm && scored.length > 0) {
                const prompt = buildAnalyticsInsightPrompt(scored, context);
                const llmRaw = await callLlmSafe(
                    callLlm, prompt,
                    'You are a senior UX engineer. Be specific, actionable, and data-driven.',
                );
                insights = parseAnalyticsInsights(llmRaw);
            }

            // Save snapshot to workspace
            await executeAction('workspace_write_file', {
                file_path: '.agentfarm/ux-analytics-snapshot.json',
                content:   JSON.stringify({ connector, dateRange, metrics: scored, insights, snapshotAt: new Date().toISOString() }, null, 2),
            });

            return safeJson({
                connector,
                date_range:       dateRange,
                pages_analysed:   scored.length,
                worst_pages:      scored.slice(0, 5),
                insights:         insights.insights,
                quick_wins:       insights.quickWins,
                summary:          insights.summary || `Analytics snapshot: ${scored.length} page(s) analysed`,
            });
        }

        // ====================================================================
        // workspace_fsd_session_replay_analyze
        // Analyses Hotjar / FullStory session data: rage clicks, dead clicks,
        // scroll-depth drop-offs.
        //
        // payload:
        //   connector?        — hotjar | fullstory | custom (default: hotjar)
        //   url_filter?       — filter events to specific pages
        //   events_json?      — pre-fetched session events JSON
        //   context?          — feature context for LLM
        // ====================================================================
        case 'workspace_fsd_session_replay_analyze': {
            const connector  = str(payload['connector'], 'hotjar');
            const urlFilter  = str(payload['url_filter']);
            const context    = str(payload['context']);

            let rawEvents: unknown = null;

            if (!payload['events_json']) {
                const connResult = await executeAction('workspace_connector_test', {
                    connector_type: connector,
                    action:         'get_heatmap_events',
                    url_filter:     urlFilter,
                });
                if (connResult.ok) {
                    try { rawEvents = JSON.parse(connResult.output); } catch { /* ignore */ }
                }
            } else {
                try { rawEvents = JSON.parse(str(payload['events_json'])); } catch { /* ignore */ }
            }

            const events = parseSessionEvents(rawEvents ?? []);
            const rageCount = events.filter((e) => e.type === 'rage_click').length;
            const deadCount = events.filter((e) => e.type === 'dead_click').length;

            let issuesSummary = '';
            if (callLlm && events.length > 0) {
                const prompt = buildSessionReplayPrompt(events, context);
                issuesSummary = await callLlmSafe(
                    callLlm, prompt,
                    'You are a UX engineer reviewing session recordings. Be specific and actionable.',
                );
            }

            // Parse LLM output
            let issues: unknown[] = [];
            try {
                const s = issuesSummary.indexOf('{'); const e = issuesSummary.lastIndexOf('}');
                if (s !== -1 && e !== -1) {
                    const p = JSON.parse(issuesSummary.slice(s, e + 1)) as Record<string, unknown>;
                    issues = Array.isArray(p['issues']) ? p['issues'] : [];
                    issuesSummary = typeof p['summary'] === 'string' ? p['summary'] : '';
                }
            } catch { /* ignore */ }

            return safeJson({
                connector,
                total_events:  events.length,
                rage_clicks:   rageCount,
                dead_clicks:   deadCount,
                issues,
                summary:       issuesSummary || `Session replay: ${rageCount} rage click(s), ${deadCount} dead click(s)`,
            });
        }

        // ====================================================================
        // workspace_fsd_ab_test_read
        // Reads A/B test variant data, computes statistical significance,
        // and recommends the winner.
        //
        // payload:
        //   test_name         — name/ID of the A/B test (required)
        //   connector?        — optimizely | launchdarkly | custom (default: custom)
        //   control           — { name, sessions, conversions }
        //   treatment         — { name, sessions, conversions }
        //   context?          — what the test is measuring
        // ====================================================================
        case 'workspace_fsd_ab_test_read': {
            const testName = str(payload['test_name'], 'A/B Test');
            const context  = str(payload['context']);

            // Parse variant data from payload or fetch from connector
            let control:   AbVariant | null = null;
            let treatment: AbVariant | null = null;

            const parseVariant = (v: unknown): AbVariant | null => {
                if (typeof v !== 'object' || v === null) return null;
                const r = v as Record<string, unknown>;
                return {
                    name:        str(r['name'], 'variant'),
                    sessions:    Number(r['sessions']    ?? 0),
                    conversions: Number(r['conversions'] ?? 0),
                };
            };

            control   = parseVariant(payload['control']);
            treatment = parseVariant(payload['treatment']);

            // Try connector if not provided
            if (!control || !treatment) {
                const connResult = await executeAction('workspace_connector_test', {
                    connector_type: str(payload['connector'], 'custom'),
                    action:         'get_ab_test',
                    test_name:      testName,
                });
                if (connResult.ok && connResult.output) {
                    try {
                        const p = JSON.parse(connResult.output) as Record<string, unknown>;
                        control   = control   ?? parseVariant(p['control']);
                        treatment = treatment ?? parseVariant(p['treatment']);
                    } catch { /* ignore */ }
                }
            }

            if (!control || !treatment) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_ab_test_read: control and treatment variant data required' };
            }

            const stats = computeAbSignificance(control, treatment);

            // LLM recommendation
            let recommendation = '';
            if (callLlm) {
                const prompt = [
                    `You are a UX data analyst reviewing an A/B test.`,
                    context ? `Test context: ${context}` : '',
                    `Test: "${testName}"`,
                    `Control   (${control.name}):   ${control.sessions} sessions, ${control.conversions} conversions (${(stats.controlRate * 100).toFixed(2)}%)`,
                    `Treatment (${treatment.name}): ${treatment.sessions} sessions, ${treatment.conversions} conversions (${(stats.treatmentRate * 100).toFixed(2)}%)`,
                    `Lift: ${(stats.lift * 100).toFixed(1)}%  |  Z-score: ${stats.zScore.toFixed(2)}  |  Statistically significant: ${stats.significant}  |  Winner: ${stats.winner}`,
                    ``,
                    `Provide a 2–3 sentence recommendation. Be direct about what to ship and why.`,
                ].filter(Boolean).join('\n');
                recommendation = await callLlmSafe(
                    callLlm, prompt,
                    'You are a product data analyst. Be concise and data-driven.',
                );
            }

            return safeJson({
                test_name:       testName,
                control:         { ...control, rate: stats.controlRate },
                treatment:       { ...treatment, rate: stats.treatmentRate },
                lift_pct:        stats.lift * 100,
                z_score:         stats.zScore,
                significant:     stats.significant,
                winner:          stats.winner,
                recommendation:  recommendation || `Winner: ${stats.winner} (lift: ${(stats.lift * 100).toFixed(1)}%, z=${stats.zScore.toFixed(2)})`,
                summary:         `A/B test "${testName}": ${stats.winner} wins${stats.significant ? ' (95% confidence)' : ' (not significant yet)'}`,
            });
        }
    }
}
