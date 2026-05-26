/**
 * KPI Report Builder
 *
 * Compiles a structured KPI report from multi-channel marketing data.
 * Computes period-over-period trends and generates stakeholder-ready narratives.
 * Pure logic — no external API calls.
 */

export interface ChannelMetrics {
    channel: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    revenue?: number;
}

export interface KpiReportInput {
    reportName: string;
    brand: string;
    currentPeriod: { from: string; to: string };
    previousPeriod?: { from: string; to: string };
    currentMetrics: ChannelMetrics[];
    previousMetrics?: ChannelMetrics[];
    targets?: {
        leads?: number;
        revenue?: number;
        cpa?: number;
        roas?: number;
    };
    currency?: string;
}

export interface KpiMetric {
    name: string;
    value: number;
    unit: string;
    previousValue?: number;
    changePercent?: number;
    changeDirection?: 'up' | 'down' | 'flat';
    targetValue?: number;
    targetStatus?: 'on_track' | 'behind' | 'exceeded';
}

export interface KpiReport {
    reportName: string;
    brand: string;
    generatedAt: string;
    currentPeriod: { from: string; to: string };
    previousPeriod?: { from: string; to: string };
    currency: string;
    toplineKpis: KpiMetric[];
    channelBreakdown: Array<ChannelMetrics & { ctr: number; cpa: number | null; roas: number | null }>;
    executiveSummary: string;
    highlights: string[];
    recommendations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumMetrics(channels: ChannelMetrics[]): {
    impressions: number; clicks: number; spend: number; conversions: number; revenue: number;
} {
    return channels.reduce(
        (acc, c) => ({
            impressions: acc.impressions + c.impressions,
            clicks: acc.clicks + c.clicks,
            spend: acc.spend + c.spend,
            conversions: acc.conversions + c.conversions,
            revenue: acc.revenue + (c.revenue ?? 0),
        }),
        { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
    );
}

function changePercent(current: number, previous: number): number | undefined {
    if (previous === 0) return undefined;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

function changeDirection(pct: number | undefined): 'up' | 'down' | 'flat' | undefined {
    if (pct === undefined) return undefined;
    if (pct > 1) return 'up';
    if (pct < -1) return 'down';
    return 'flat';
}

function targetStatus(value: number, target: number, lowerIsBetter = false): KpiMetric['targetStatus'] {
    if (lowerIsBetter) {
        if (value <= target * 0.95) return 'exceeded';
        if (value <= target * 1.1) return 'on_track';
        return 'behind';
    }
    if (value >= target * 1.05) return 'exceeded';
    if (value >= target * 0.9) return 'on_track';
    return 'behind';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildKpiReport(input: KpiReportInput): KpiReport {
    const currency = input.currency ?? 'USD';
    const current = sumMetrics(input.currentMetrics);
    const previous = input.previousMetrics ? sumMetrics(input.previousMetrics) : null;

    const cpa = current.conversions > 0 ? current.spend / current.conversions : null;
    const roas = current.revenue > 0 && current.spend > 0 ? current.revenue / current.spend : null;
    const ctr = current.impressions > 0 ? (current.clicks / current.impressions) * 100 : 0;

    const prevCpa = previous && previous.conversions > 0 ? previous.spend / previous.conversions : null;
    const prevRoas = previous && previous.revenue > 0 && previous.spend > 0 ? previous.revenue / previous.spend : null;
    const prevCtr = previous && previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : null;

    const toplineKpis: KpiMetric[] = [
        {
            name: 'Impressions',
            value: current.impressions,
            unit: 'impressions',
            previousValue: previous?.impressions,
            changePercent: previous ? changePercent(current.impressions, previous.impressions) : undefined,
            changeDirection: previous ? changeDirection(changePercent(current.impressions, previous.impressions)) : undefined,
        },
        {
            name: 'Clicks',
            value: current.clicks,
            unit: 'clicks',
            previousValue: previous?.clicks,
            changePercent: previous ? changePercent(current.clicks, previous.clicks) : undefined,
            changeDirection: previous ? changeDirection(changePercent(current.clicks, previous.clicks)) : undefined,
        },
        {
            name: 'CTR',
            value: Math.round(ctr * 100) / 100,
            unit: '%',
            previousValue: prevCtr !== null ? Math.round(prevCtr * 100) / 100 : undefined,
            changePercent: prevCtr !== null ? changePercent(ctr, prevCtr) : undefined,
            changeDirection: prevCtr !== null ? changeDirection(changePercent(ctr, prevCtr)) : undefined,
        },
        {
            name: 'Total Spend',
            value: Math.round(current.spend * 100) / 100,
            unit: currency,
            previousValue: previous ? Math.round(previous.spend * 100) / 100 : undefined,
            changePercent: previous ? changePercent(current.spend, previous.spend) : undefined,
            changeDirection: previous ? changeDirection(changePercent(current.spend, previous.spend)) : undefined,
        },
        {
            name: 'Conversions / Leads',
            value: current.conversions,
            unit: 'conversions',
            previousValue: previous?.conversions,
            changePercent: previous ? changePercent(current.conversions, previous.conversions) : undefined,
            changeDirection: previous ? changeDirection(changePercent(current.conversions, previous.conversions)) : undefined,
            targetValue: input.targets?.leads,
            targetStatus: input.targets?.leads ? targetStatus(current.conversions, input.targets.leads) : undefined,
        },
        ...(cpa !== null ? [{
            name: 'Cost Per Acquisition (CPA)',
            value: Math.round(cpa * 100) / 100,
            unit: currency,
            previousValue: prevCpa !== null ? Math.round(prevCpa * 100) / 100 : undefined,
            changePercent: prevCpa !== null ? changePercent(cpa, prevCpa) : undefined,
            changeDirection: prevCpa !== null ? changeDirection(changePercent(cpa, prevCpa)) : undefined,
            targetValue: input.targets?.cpa,
            targetStatus: input.targets?.cpa ? targetStatus(cpa, input.targets.cpa, true) : undefined,
        }] : []),
        ...(roas !== null ? [{
            name: 'ROAS',
            value: Math.round(roas * 100) / 100,
            unit: 'x',
            previousValue: prevRoas !== null ? Math.round(prevRoas * 100) / 100 : undefined,
            changePercent: prevRoas !== null ? changePercent(roas, prevRoas) : undefined,
            changeDirection: prevRoas !== null ? changeDirection(changePercent(roas, prevRoas)) : undefined,
            targetValue: input.targets?.roas,
            targetStatus: input.targets?.roas ? targetStatus(roas, input.targets.roas) : undefined,
        }] : []),
    ];

    const channelBreakdown = input.currentMetrics.map((c) => ({
        ...c,
        ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        cpa: c.conversions > 0 ? Math.round((c.spend / c.conversions) * 100) / 100 : null,
        roas: c.revenue != null && c.spend > 0 ? Math.round((c.revenue / c.spend) * 100) / 100 : null,
    }));

    // Highlights
    const highlights: string[] = [];
    const bestChannel = [...channelBreakdown].sort((a, b) => (b.conversions ?? 0) - (a.conversions ?? 0))[0];
    if (bestChannel) {
        highlights.push(`Top-converting channel: ${bestChannel.channel} (${bestChannel.conversions} conversions)`);
    }
    const convChange = previous ? changePercent(current.conversions, previous.conversions) : null;
    if (convChange !== null && convChange !== undefined) {
        highlights.push(`Conversions ${convChange >= 0 ? 'up' : 'down'} ${Math.abs(convChange)}% vs previous period`);
    }
    if (cpa !== null) highlights.push(`Blended CPA: ${currency}${cpa.toFixed(2)}`);
    if (roas !== null) highlights.push(`Overall ROAS: ${roas.toFixed(2)}x`);

    // Recommendations
    const recommendations: string[] = [];
    const worstChannel = [...channelBreakdown]
        .filter((c) => c.cpa !== null)
        .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))[0];
    if (worstChannel) {
        recommendations.push(`Review ${worstChannel.channel} performance — highest CPA at ${currency}${worstChannel.cpa?.toFixed(2)}`);
    }
    if (ctr < 1) {
        recommendations.push('Blended CTR is below 1% — consider creative refresh or audience narrowing');
    }
    const onTrack = toplineKpis.filter((k) => k.targetStatus === 'on_track').length;
    const behind = toplineKpis.filter((k) => k.targetStatus === 'behind').length;
    if (behind > 0) recommendations.push(`${behind} KPI(s) are behind target — prioritize budget reallocation to top-performing channels`);
    if (onTrack === toplineKpis.filter((k) => k.targetStatus !== undefined).length && onTrack > 0) {
        recommendations.push('All KPIs on track — consider testing new audience segments to expand reach');
    }

    const executiveSummary =
        `${input.brand} marketing performance: ${current.conversions.toLocaleString()} conversions on ${currency}${current.spend.toFixed(0)} spend` +
        (cpa !== null ? ` (CPA: ${currency}${cpa.toFixed(2)})` : '') +
        (roas !== null ? `, ROAS: ${roas.toFixed(2)}x` : '') +
        (convChange !== null && convChange !== undefined ? `, conversions ${convChange >= 0 ? '+' : ''}${convChange}% vs prior period` : '') +
        '.';

    return {
        reportName: input.reportName,
        brand: input.brand,
        generatedAt: new Date().toISOString(),
        currentPeriod: input.currentPeriod,
        previousPeriod: input.previousPeriod,
        currency,
        toplineKpis,
        channelBreakdown,
        executiveSummary,
        highlights,
        recommendations,
    };
}
