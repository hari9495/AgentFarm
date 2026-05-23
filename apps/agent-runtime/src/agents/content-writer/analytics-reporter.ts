/**
 * Content Analytics Reporter
 *
 * Fetches and summarises content performance metrics from a Google Analytics
 * (GA4) Data API endpoint via an injectable HTTP fetch function.
 *
 * The module intentionally has no hard dependency on the GA4 SDK — it uses
 * a plain fetch so the runtime can inject either the real GA4 REST endpoint
 * or a stub in tests.
 *
 * Returned AnalyticsReport drives the dashboard summary widget and can be
 * stored to workspace memory for ongoing performance tracking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsQuery {
    /** GA4 Property ID, e.g. "properties/123456789". */
    propertyId: string;
    /** ISO date string — start of reporting window (inclusive). */
    startDate: string;
    /** ISO date string — end of reporting window (inclusive). */
    endDate: string;
    /**
     * Optional URL path prefix to filter results, e.g. "/blog/". Omit for
     * sitewide metrics.
     */
    pagePath?: string;
    /**
     * Bearer token for the GA4 Data API.  Injected by the connector layer —
     * never hardcoded or logged.
     */
    accessToken: string;
}

export interface PageMetrics {
    /** URL path as reported by GA4. */
    pagePath: string;
    /** Total sessions that included this page. */
    sessions: number;
    /** Unique page views (screenPageViews). */
    pageViews: number;
    /** Average engagement time per session in seconds. */
    avgEngagementTimeSec: number;
    /** Bounce rate as a decimal, e.g. 0.42 = 42 %. */
    bounceRate: number;
}

export interface AnalyticsReport {
    propertyId: string;
    startDate: string;
    endDate: string;
    /** Metrics for each page returned by GA4 (up to top 25). */
    pages: PageMetrics[];
    /** Aggregate totals across all returned pages. */
    totals: {
        sessions: number;
        pageViews: number;
        avgEngagementTimeSec: number;
        avgBounceRate: number;
    };
    /**
     * Human-readable performance summary — the agent uses this as the
     * narrative in reports and emails.
     */
    summary: string;
    fetchedAt: string;
    /** False when the GA4 API returned an error (report is empty). */
    ok: boolean;
    errorMessage: string | null;
}

/**
 * Injectable HTTP fetch signature.  Matches the subset of the Fetch API used
 * by the module; tests inject a stub; production uses globalThis.fetch.
 */
export type AnalyticsFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// ---------------------------------------------------------------------------
// Mixpanel types
// ---------------------------------------------------------------------------

export interface MixpanelQuery {
    /** Mixpanel project ID. */
    projectId: string;
    /** ISO date string — start date inclusive, e.g. "2026-01-01". */
    fromDate: string;
    /** ISO date string — end date inclusive. */
    toDate: string;
    /**
     * Mixpanel service account username (email).
     * Never hardcoded — injected from connector config at runtime.
     */
    serviceAccountUsername: string;
    /**
     * Mixpanel service account secret.
     * Never hardcoded — injected from connector config at runtime.
     */
    serviceAccountSecret: string;
    /** Optional list of event names to filter. Omit for all events. */
    events?: string[];
}

export interface MixpanelEventMetrics {
    /** Event name as reported by Mixpanel. */
    event: string;
    /** Total occurrences within the date range. */
    count: number;
}

export interface MixpanelReport {
    projectId: string;
    fromDate: string;
    toDate: string;
    events: MixpanelEventMetrics[];
    totals: {
        totalEvents: number;
        uniqueEventTypes: number;
    };
    summary: string;
    fetchedAt: string;
    ok: boolean;
    errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// GA4 Data API response shapes (minimal — only what we read)
// ---------------------------------------------------------------------------

interface Ga4DimensionValue { value: string }
interface Ga4MetricValue { value: string }

interface Ga4Row {
    dimensionValues: Ga4DimensionValue[];
    metricValues: Ga4MetricValue[];
}

interface Ga4RunReportResponse {
    rows?: Ga4Row[];
    rowCount?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GA4_ENDPOINT = 'https://analyticsdata.googleapis.com/v1beta';

function safeNum(v: string | undefined): number {
    const n = parseFloat(v ?? '0');
    return isNaN(n) ? 0 : n;
}

function buildSummary(pages: PageMetrics[], startDate: string, endDate: string): string {
    if (pages.length === 0) {
        return `No page data returned for the period ${startDate} – ${endDate}.`;
    }

    const totalSessions = pages.reduce((s, p) => s + p.sessions, 0);
    const totalViews = pages.reduce((s, p) => s + p.pageViews, 0);
    const avgBounce = pages.reduce((s, p) => s + p.bounceRate, 0) / pages.length;
    const avgEngagement = pages.reduce((s, p) => s + p.avgEngagementTimeSec, 0) / pages.length;

    const topPage = [...pages].sort((a, b) => b.pageViews - a.pageViews)[0]!;
    const topBounce = [...pages].sort((a, b) => b.bounceRate - a.bounceRate)[0]!;
    const topEngagement = [...pages].sort((a, b) => b.avgEngagementTimeSec - a.avgEngagementTimeSec)[0]!;

    const bounceLabel = `${(avgBounce * 100).toFixed(1)}%`;
    const engLabel = `${avgEngagement.toFixed(0)}s`;

    return (
        `Period: ${startDate} – ${endDate}. ` +
        `${totalSessions.toLocaleString()} sessions, ${totalViews.toLocaleString()} page views across ${pages.length} pages. ` +
        `Average bounce rate: ${bounceLabel}. Average engagement time: ${engLabel}. ` +
        `Top page by views: "${topPage.pagePath}" (${topPage.pageViews.toLocaleString()} views). ` +
        `Highest bounce rate: "${topBounce.pagePath}" (${(topBounce.bounceRate * 100).toFixed(1)}%). ` +
        `Best engagement: "${topEngagement.pagePath}" (${topEngagement.avgEngagementTimeSec.toFixed(0)}s avg).`
    );
}

function buildEmptyReport(
    propertyId: string,
    startDate: string,
    endDate: string,
    errorMessage: string,
): AnalyticsReport {
    return {
        propertyId,
        startDate,
        endDate,
        pages: [],
        totals: { sessions: 0, pageViews: 0, avgEngagementTimeSec: 0, avgBounceRate: 0 },
        summary: `Analytics fetch failed: ${errorMessage}`,
        fetchedAt: new Date().toISOString(),
        ok: false,
        errorMessage,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a GA4 runReport for the given query and return a structured
 * AnalyticsReport.
 *
 * @param query   - Property, date range, optional path filter, and bearer token.
 * @param fetchFn - Injectable fetch; defaults to globalThis.fetch.
 */
export async function fetchAnalyticsReport(
    query: AnalyticsQuery,
    fetchFn: AnalyticsFetchFn = async (url, init) => {
        const resp = await fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
        });
        return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
    },
): Promise<AnalyticsReport> {
    const { propertyId, startDate, endDate, pagePath, accessToken } = query;

    // Build GA4 runReport request body
    const dimensionFilters = pagePath
        ? {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'BEGINS_WITH', value: pagePath },
            },
        }
        : undefined;

    const requestBody = JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
        ],
        limit: 25,
        ...(dimensionFilters ? { dimensionFilter: dimensionFilters } : {}),
    });

    let raw: unknown;
    try {
        const resp = await fetchFn(
            `${GA4_ENDPOINT}/${propertyId}:runReport`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: requestBody,
            },
        );

        if (!resp.ok) {
            return buildEmptyReport(
                propertyId, startDate, endDate,
                `GA4 API returned HTTP ${resp.status}`,
            );
        }

        raw = await resp.json();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return buildEmptyReport(propertyId, startDate, endDate, msg);
    }

    // Parse GA4 response rows
    const data = raw as Ga4RunReportResponse;
    const rows: Ga4Row[] = data.rows ?? [];

    const pages: PageMetrics[] = rows.map((row) => ({
        pagePath: row.dimensionValues[0]?.value ?? '/',
        sessions: Math.round(safeNum(row.metricValues[0]?.value)),
        pageViews: Math.round(safeNum(row.metricValues[1]?.value)),
        avgEngagementTimeSec: safeNum(row.metricValues[2]?.value),
        bounceRate: safeNum(row.metricValues[3]?.value),
    }));

    const totalSessions = pages.reduce((s, p) => s + p.sessions, 0);
    const totalViews = pages.reduce((s, p) => s + p.pageViews, 0);
    const avgEngagement = pages.length > 0
        ? pages.reduce((s, p) => s + p.avgEngagementTimeSec, 0) / pages.length
        : 0;
    const avgBounce = pages.length > 0
        ? pages.reduce((s, p) => s + p.bounceRate, 0) / pages.length
        : 0;

    return {
        propertyId,
        startDate,
        endDate,
        pages,
        totals: {
            sessions: totalSessions,
            pageViews: totalViews,
            avgEngagementTimeSec: avgEngagement,
            avgBounceRate: avgBounce,
        },
        summary: buildSummary(pages, startDate, endDate),
        fetchedAt: new Date().toISOString(),
        ok: true,
        errorMessage: null,
    };
}

// ---------------------------------------------------------------------------
// Mixpanel — Events API adapter
// ---------------------------------------------------------------------------

const MIXPANEL_EVENTS_URL = 'https://data.mixpanel.com/api/2.0/events';

function buildMixpanelSummary(events: MixpanelEventMetrics[], fromDate: string, toDate: string): string {
    if (events.length === 0) {
        return `No event data returned for ${fromDate} – ${toDate}.`;
    }
    const total = events.reduce((s, e) => s + e.count, 0);
    const top = [...events].sort((a, b) => b.count - a.count)[0]!;
    return (
        `Period: ${fromDate} – ${toDate}. ` +
        `${total.toLocaleString()} total event occurrences across ${events.length} event type(s). ` +
        `Top event: "${top.event}" (${top.count.toLocaleString()} occurrences).`
    );
}

function buildEmptyMixpanelReport(
    projectId: string,
    fromDate: string,
    toDate: string,
    errorMessage: string,
): MixpanelReport {
    return {
        projectId,
        fromDate,
        toDate,
        events: [],
        totals: { totalEvents: 0, uniqueEventTypes: 0 },
        summary: `Mixpanel fetch failed: ${errorMessage}`,
        fetchedAt: new Date().toISOString(),
        ok: false,
        errorMessage,
    };
}

interface MixpanelEventsResponse {
    data?: {
        series?: string[];
        values?: Record<string, Record<string, number>>;
    };
    error?: string;
}

/**
 * Fetch event counts from the Mixpanel Events API.
 *
 * @param query   Mixpanel project config, date range, and credentials.
 * @param fetchFn Injectable fetch function — defaults to globalThis.fetch.
 */
export async function fetchMixpanelReport(
    query: MixpanelQuery,
    fetchFn: AnalyticsFetchFn = async (url, init) => {
        const resp = await fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body || undefined,
        });
        return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
    },
): Promise<MixpanelReport> {
    const { projectId, fromDate, toDate, serviceAccountUsername, serviceAccountSecret, events } = query;

    // Basic auth header — credentials injected at runtime, never hardcoded.
    const credentials = Buffer.from(`${serviceAccountUsername}:${serviceAccountSecret}`).toString('base64');

    const params = new URLSearchParams({
        project_id: projectId,
        from_date: fromDate,
        to_date: toDate,
        unit: 'month',
        type: 'general',
    });
    if (events && events.length > 0) {
        params.set('event', JSON.stringify(events));
    }

    let raw: unknown;
    try {
        const resp = await fetchFn(
            `${MIXPANEL_EVENTS_URL}?${params.toString()}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Basic ${credentials}`,
                },
                body: '',
            },
        );
        if (!resp.ok) {
            return buildEmptyMixpanelReport(
                projectId, fromDate, toDate,
                `Mixpanel API returned HTTP ${resp.status}`,
            );
        }
        raw = await resp.json();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return buildEmptyMixpanelReport(projectId, fromDate, toDate, msg);
    }

    const data = raw as MixpanelEventsResponse;
    if (data.error) {
        return buildEmptyMixpanelReport(projectId, fromDate, toDate, data.error);
    }

    // Sum counts across all date buckets for each event type.
    const values = data.data?.values ?? {};
    const eventMetrics: MixpanelEventMetrics[] = Object.entries(values).map(([eventName, dateBuckets]) => ({
        event: eventName,
        count: Object.values(dateBuckets).reduce((s, n) => s + n, 0),
    }));

    const totalEvents = eventMetrics.reduce((s, e) => s + e.count, 0);

    return {
        projectId,
        fromDate,
        toDate,
        events: eventMetrics,
        totals: { totalEvents, uniqueEventTypes: eventMetrics.length },
        summary: buildMixpanelSummary(eventMetrics, fromDate, toDate),
        fetchedAt: new Date().toISOString(),
        ok: true,
        errorMessage: null,
    };
}
