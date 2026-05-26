/**
 * Campaign Monitor
 *
 * Fetches and aggregates real-time performance metrics from:
 *   - Google Analytics 4 (GA4)
 *   - Google Ads API
 *   - Meta Ads (Marketing API)
 *   - LinkedIn Campaign Manager API
 *
 * Falls back to partial data when a platform token is absent.
 */

export type MonitorFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface PlatformMetrics {
    platform: string;
    impressions: number;
    clicks: number;
    ctr: number;
    spend: number;
    conversions: number;
    cpa: number | null;
    roas: number | null;
    currency: string;
    dateRange: { from: string; to: string };
    error?: string;
}

export interface CampaignMonitorQuery {
    dateFrom: string;
    dateTo: string;
    // GA4
    ga4PropertyId?: string;
    ga4AccessToken?: string;
    // Google Ads
    googleAdsCampaignIds?: string[];
    googleAdsCustomerId?: string;
    googleAdsAccessToken?: string;
    // Meta Ads
    metaAdAccountId?: string;
    metaAdCampaignIds?: string[];
    metaAccessToken?: string;
    // LinkedIn
    linkedInAccountId?: string;
    linkedInCampaignIds?: string[];
    linkedInAccessToken?: string;
    currency?: string;
}

export interface CampaignMonitorResult {
    ok: boolean;
    platforms: PlatformMetrics[];
    aggregate: {
        totalImpressions: number;
        totalClicks: number;
        blendedCtr: number;
        totalSpend: number;
        totalConversions: number;
        blendedCpa: number | null;
        currency: string;
    };
    errorMessage?: string;
}

// ---------------------------------------------------------------------------
// GA4 fetch
// ---------------------------------------------------------------------------

async function fetchGa4Metrics(
    propertyId: string,
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    fetchFn: MonitorFetchFn,
): Promise<PlatformMetrics> {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = JSON.stringify({
        dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
        metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'conversions' },
        ],
    });
    try {
        const resp = await fetchFn(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body,
        });
        if (!resp.ok) throw new Error(`GA4 HTTP ${resp.status}`);
        const data = await resp.json() as Record<string, unknown>;
        const rows = (data['rows'] as unknown[]) ?? [];
        let sessions = 0, conversions = 0;
        for (const row of rows) {
            const r = row as Record<string, unknown>;
            const vals = (r['metricValues'] as { value: string }[]) ?? [];
            sessions += parseInt(vals[0]?.value ?? '0', 10);
            conversions += parseInt(vals[2]?.value ?? '0', 10);
        }
        return {
            platform: 'google_analytics',
            impressions: sessions,
            clicks: sessions,
            ctr: 100,
            spend: 0,
            conversions,
            cpa: null,
            roas: null,
            currency: 'N/A',
            dateRange: { from: dateFrom, to: dateTo },
        };
    } catch (err) {
        return {
            platform: 'google_analytics',
            impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpa: null, roas: null, currency: 'N/A',
            dateRange: { from: dateFrom, to: dateTo },
            error: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Google Ads fetch
// ---------------------------------------------------------------------------

async function fetchGoogleAdsMetrics(
    customerId: string,
    campaignIds: string[],
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    currency: string,
    fetchFn: MonitorFetchFn,
): Promise<PlatformMetrics> {
    const idFilter = campaignIds.length > 0
        ? ` AND campaign.id IN (${campaignIds.join(',')})`
        : '';
    const query = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'${idFilter}`;
    const url = `https://googleads.googleapis.com/v14/customers/${customerId}/googleAds:searchStream`;
    try {
        const resp = await fetchFn(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'developer-token': process.env['GOOGLE_ADS_DEV_TOKEN'] ?? '' },
            body: JSON.stringify({ query }),
        });
        if (!resp.ok) throw new Error(`Google Ads HTTP ${resp.status}`);
        const data = await resp.json() as unknown[];
        let impressions = 0, clicks = 0, costMicros = 0, conversions = 0;
        for (const batch of data) {
            const b = batch as Record<string, unknown>;
            for (const result of (b['results'] as unknown[]) ?? []) {
                const r = result as Record<string, { impressions?: number; clicks?: number; cost_micros?: number; conversions?: number }>;
                const m = r['metrics'] ?? {};
                impressions += m.impressions ?? 0;
                clicks += m.clicks ?? 0;
                costMicros += m.cost_micros ?? 0;
                conversions += m.conversions ?? 0;
            }
        }
        const spend = costMicros / 1_000_000;
        return {
            platform: 'google_ads',
            impressions,
            clicks,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            spend,
            conversions,
            cpa: conversions > 0 ? spend / conversions : null,
            roas: null,
            currency,
            dateRange: { from: dateFrom, to: dateTo },
        };
    } catch (err) {
        return {
            platform: 'google_ads',
            impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpa: null, roas: null, currency,
            dateRange: { from: dateFrom, to: dateTo },
            error: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Meta Ads fetch
// ---------------------------------------------------------------------------

async function fetchMetaAdsMetrics(
    adAccountId: string,
    campaignIds: string[],
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    currency: string,
    fetchFn: MonitorFetchFn,
): Promise<PlatformMetrics> {
    const filtering = campaignIds.length > 0
        ? `&filtering=[{"field":"campaign.id","operator":"IN","value":[${campaignIds.map((id) => `"${id}"`).join(',')}]}]`
        : '';
    const url = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?fields=impressions,clicks,spend,actions&time_range={"since":"${dateFrom}","until":"${dateTo}"}&access_token=${accessToken}${filtering}`;
    try {
        const resp = await fetchFn(url, { method: 'GET', headers: {} });
        if (!resp.ok) throw new Error(`Meta Ads HTTP ${resp.status}`);
        const data = await resp.json() as Record<string, unknown>;
        const items = (data['data'] as unknown[]) ?? [];
        let impressions = 0, clicks = 0, spend = 0, conversions = 0;
        for (const item of items) {
            const i = item as Record<string, unknown>;
            impressions += parseInt(String(i['impressions'] ?? '0'), 10);
            clicks += parseInt(String(i['clicks'] ?? '0'), 10);
            spend += parseFloat(String(i['spend'] ?? '0'));
            const actions = (i['actions'] as { action_type: string; value: string }[]) ?? [];
            const conv = actions.find((a) => a.action_type === 'offsite_conversion');
            if (conv) conversions += parseInt(conv.value, 10);
        }
        return {
            platform: 'meta_ads',
            impressions,
            clicks,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            spend,
            conversions,
            cpa: conversions > 0 ? spend / conversions : null,
            roas: null,
            currency,
            dateRange: { from: dateFrom, to: dateTo },
        };
    } catch (err) {
        return {
            platform: 'meta_ads',
            impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpa: null, roas: null, currency,
            dateRange: { from: dateFrom, to: dateTo },
            error: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// LinkedIn Ads fetch
// ---------------------------------------------------------------------------

async function fetchLinkedInMetrics(
    accountId: string,
    campaignIds: string[],
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    currency: string,
    fetchFn: MonitorFetchFn,
): Promise<PlatformMetrics> {
    const campaignFilter = campaignIds.length > 0
        ? `&campaigns=List(${campaignIds.map((id) => `urn:li:sponsoredCampaign:${id}`).join(',')})`
        : '';
    const url = `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&dateRange.start.day=${dateFrom.split('-')[2]}&dateRange.start.month=${dateFrom.split('-')[1]}&dateRange.start.year=${dateFrom.split('-')[0]}&dateRange.end.day=${dateTo.split('-')[2]}&dateRange.end.month=${dateTo.split('-')[1]}&dateRange.end.year=${dateTo.split('-')[0]}&accounts=urn:li:sponsoredAccount:${accountId}${campaignFilter}&fields=impressions,clicks,costInLocalCurrency,externalWebsiteConversions`;
    try {
        const resp = await fetchFn(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) throw new Error(`LinkedIn Ads HTTP ${resp.status}`);
        const data = await resp.json() as Record<string, unknown>;
        const elements = (data['elements'] as unknown[]) ?? [];
        let impressions = 0, clicks = 0, spend = 0, conversions = 0;
        for (const el of elements) {
            const e = el as Record<string, number>;
            impressions += e['impressions'] ?? 0;
            clicks += e['clicks'] ?? 0;
            spend += e['costInLocalCurrency'] ?? 0;
            conversions += e['externalWebsiteConversions'] ?? 0;
        }
        return {
            platform: 'linkedin_ads',
            impressions,
            clicks,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            spend,
            conversions,
            cpa: conversions > 0 ? spend / conversions : null,
            roas: null,
            currency,
            dateRange: { from: dateFrom, to: dateTo },
        };
    } catch (err) {
        return {
            platform: 'linkedin_ads',
            impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpa: null, roas: null, currency,
            dateRange: { from: dateFrom, to: dateTo },
            error: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchCampaignMetrics(
    query: CampaignMonitorQuery,
    fetchFn?: MonitorFetchFn,
): Promise<CampaignMonitorResult> {
    const fetch: MonitorFetchFn = fetchFn ?? (async (url, init) => {
        const resp = await globalThis.fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
        });
        return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
    });

    const currency = query.currency ?? 'USD';
    const fetches: Promise<PlatformMetrics>[] = [];

    if (query.ga4PropertyId && query.ga4AccessToken) {
        fetches.push(fetchGa4Metrics(query.ga4PropertyId, query.ga4AccessToken, query.dateFrom, query.dateTo, fetch));
    }
    if (query.googleAdsCustomerId && query.googleAdsAccessToken) {
        fetches.push(fetchGoogleAdsMetrics(
            query.googleAdsCustomerId,
            query.googleAdsCampaignIds ?? [],
            query.googleAdsAccessToken,
            query.dateFrom,
            query.dateTo,
            currency,
            fetch,
        ));
    }
    if (query.metaAdAccountId && query.metaAccessToken) {
        fetches.push(fetchMetaAdsMetrics(
            query.metaAdAccountId,
            query.metaAdCampaignIds ?? [],
            query.metaAccessToken,
            query.dateFrom,
            query.dateTo,
            currency,
            fetch,
        ));
    }
    if (query.linkedInAccountId && query.linkedInAccessToken) {
        fetches.push(fetchLinkedInMetrics(
            query.linkedInAccountId,
            query.linkedInCampaignIds ?? [],
            query.linkedInAccessToken,
            query.dateFrom,
            query.dateTo,
            currency,
            fetch,
        ));
    }

    if (fetches.length === 0) {
        return {
            ok: false,
            platforms: [],
            aggregate: { totalImpressions: 0, totalClicks: 0, blendedCtr: 0, totalSpend: 0, totalConversions: 0, blendedCpa: null, currency },
            errorMessage: 'No platform credentials provided. Supply at least one of: ga4, googleAds, metaAds, linkedIn tokens.',
        };
    }

    const platforms = await Promise.all(fetches);

    let totalImpressions = 0, totalClicks = 0, totalSpend = 0, totalConversions = 0;
    for (const p of platforms) {
        totalImpressions += p.impressions;
        totalClicks += p.clicks;
        totalSpend += p.spend;
        totalConversions += p.conversions;
    }

    return {
        ok: true,
        platforms,
        aggregate: {
            totalImpressions,
            totalClicks,
            blendedCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            totalSpend,
            totalConversions,
            blendedCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
            currency,
        },
    };
}
