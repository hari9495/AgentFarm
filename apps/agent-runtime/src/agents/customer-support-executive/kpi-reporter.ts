/**
 * KPI Reporter — computes CSAT, FCR, AHT, and trend analytics.
 *
 * All computations are pure (no network) when raw data is supplied.
 * When a connector is wired, it fetches the dataset from the helpdesk API.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketDataPoint {
    ticketId: string;
    openedAt: string;           // ISO-8601
    closedAt?: string;          // ISO-8601 — absent if still open
    firstResponseAt?: string;   // ISO-8601
    csatScore?: number;         // 1–5
    npsScore?: number;          // 0–10
    wasEscalated: boolean;
    wasReopened: boolean;
    channel: string;
    category: string;
    tags?: string[];
    industry?: string;
}

export interface KpiReport {
    period: { from: string; to: string };
    totalTickets: number;
    csatScore: number | null;         // 1–5 avg; null when no CSAT data
    csatResponseRate: number;          // 0–1
    npsScore: number | null;           // -100 to 100; null when no NPS data
    fcrRate: number;                   // 0–1
    ahtSeconds: number | null;         // avg handling time; null when no closed tickets
    escalationRate: number;            // 0–1
    channelBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    trendInsights: string[];
}

export interface TrendAnalysisResult {
    topComplaints: Array<{ category: string; count: number; pct: number }>;
    risingIssues: string[];
    seasonalSignals: string[];
    upsellOpportunities: string[];
    recommendations: string[];
}

// ---------------------------------------------------------------------------
// Pure KPI computation
// ---------------------------------------------------------------------------

export function computeKpiReport(tickets: TicketDataPoint[], period: { from: string; to: string }): KpiReport {
    const closed = tickets.filter((t) => t.closedAt);

    // CSAT
    const csatTickets = tickets.filter((t) => t.csatScore != null);
    const csatScore = csatTickets.length > 0
        ? csatTickets.reduce((s, t) => s + t.csatScore!, 0) / csatTickets.length
        : null;
    const csatResponseRate = tickets.length > 0 ? csatTickets.length / tickets.length : 0;

    // NPS
    const npsTickets = tickets.filter((t) => t.npsScore != null);
    const npsScore = npsTickets.length >= 10
        ? (() => {
            const promoters = npsTickets.filter((t) => t.npsScore! >= 9).length;
            const detractors = npsTickets.filter((t) => t.npsScore! <= 6).length;
            return Math.round(((promoters - detractors) / npsTickets.length) * 100);
        })()
        : null;

    // FCR — tickets that were not reopened or escalated
    const fcrTickets = closed.filter((t) => !t.wasReopened && !t.wasEscalated);
    const fcrRate = closed.length > 0 ? fcrTickets.length / closed.length : 0;

    // AHT — average time from open to close in seconds
    let ahtSeconds: number | null = null;
    if (closed.length > 0) {
        const durations = closed
            .map((t) => (new Date(t.closedAt!).getTime() - new Date(t.openedAt).getTime()) / 1000)
            .filter((d) => d > 0 && d < 86_400 * 30); // sanity-cap at 30 days
        if (durations.length > 0) {
            ahtSeconds = durations.reduce((s, d) => s + d, 0) / durations.length;
        }
    }

    // Escalation rate
    const escalationRate = tickets.length > 0
        ? tickets.filter((t) => t.wasEscalated).length / tickets.length
        : 0;

    // Channel breakdown
    const channelBreakdown: Record<string, number> = {};
    for (const t of tickets) {
        channelBreakdown[t.channel] = (channelBreakdown[t.channel] ?? 0) + 1;
    }

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const t of tickets) {
        categoryBreakdown[t.category] = (categoryBreakdown[t.category] ?? 0) + 1;
    }

    // Insights
    const trendInsights: string[] = [];
    if (csatScore !== null && csatScore < 3.5) {
        trendInsights.push(`CSAT is below target (${csatScore.toFixed(2)}/5.00). Review top complaint categories.`);
    }
    if (fcrRate < 0.7) {
        trendInsights.push(`FCR is ${(fcrRate * 100).toFixed(1)}% — below the 70% benchmark. Consider expanding Tier 1 playbooks.`);
    }
    if (ahtSeconds !== null && ahtSeconds > 600) {
        trendInsights.push(`AHT is ${(ahtSeconds / 60).toFixed(1)} minutes — above the 10-minute target. Review complex ticket categories.`);
    }
    if (escalationRate > 0.2) {
        trendInsights.push(`Escalation rate is ${(escalationRate * 100).toFixed(1)}%. High escalations may indicate a knowledge base gap.`);
    }

    return {
        period,
        totalTickets: tickets.length,
        csatScore: csatScore !== null ? Math.round(csatScore * 100) / 100 : null,
        csatResponseRate: Math.round(csatResponseRate * 1000) / 1000,
        npsScore,
        fcrRate: Math.round(fcrRate * 1000) / 1000,
        ahtSeconds: ahtSeconds !== null ? Math.round(ahtSeconds) : null,
        escalationRate: Math.round(escalationRate * 1000) / 1000,
        channelBreakdown,
        categoryBreakdown,
        trendInsights,
    };
}

// ---------------------------------------------------------------------------
// Trend analysis
// ---------------------------------------------------------------------------

export function analyseTrends(tickets: TicketDataPoint[]): TrendAnalysisResult {
    // Top complaints by category
    const counts: Record<string, number> = {};
    for (const t of tickets) {
        counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    const total = tickets.length || 1;
    const topComplaints = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([category, count]) => ({ category, count, pct: Math.round((count / total) * 1000) / 10 }));

    // Rising issues — categories with disproportionate escalation rates
    const escalatedCategories: Record<string, { total: number; escalated: number }> = {};
    for (const t of tickets) {
        if (!escalatedCategories[t.category]) escalatedCategories[t.category] = { total: 0, escalated: 0 };
        escalatedCategories[t.category]!.total++;
        if (t.wasEscalated) escalatedCategories[t.category]!.escalated++;
    }
    const risingIssues = Object.entries(escalatedCategories)
        .filter(([, v]) => v.total >= 3 && v.escalated / v.total > 0.4)
        .map(([cat]) => `High escalation in "${cat}" — consider enriching the playbook`);

    // Seasonal / channel signals
    const channelCounts: Record<string, number> = {};
    for (const t of tickets) {
        channelCounts[t.channel] = (channelCounts[t.channel] ?? 0) + 1;
    }
    const topChannel = Object.entries(channelCounts).sort(([, a], [, b]) => b - a)[0];
    const seasonalSignals = topChannel
        ? [`Highest volume channel: "${topChannel[0]}" (${topChannel[1]} tickets)`]
        : [];

    // Upsell opportunities — customers with resolved billing/subscription tickets without escalations
    const upsellCategories = new Set(['billing', 'subscription', 'product_info', 'onboarding']);
    const upsellCount = tickets.filter(
        (t) => upsellCategories.has(t.category) && !t.wasEscalated && t.csatScore != null && t.csatScore >= 4,
    ).length;
    const upsellOpportunities = upsellCount > 0
        ? [`${upsellCount} resolved high-satisfaction tickets in billing/subscription — strong upsell opportunity`]
        : [];

    // Recommendations
    const recommendations: string[] = [];
    if (topComplaints[0]?.pct && topComplaints[0].pct > 30) {
        recommendations.push(`"${topComplaints[0].category}" represents ${topComplaints[0].pct}% of volume — prioritise KB articles for this category.`);
    }
    if (risingIssues.length > 0) {
        recommendations.push('Review escalation playbooks for rising-issue categories before next sprint.');
    }
    recommendations.push('Schedule monthly CSAT review to catch satisfaction dips before they compound.');

    return { topComplaints, risingIssues, seasonalSignals, upsellOpportunities, recommendations };
}

// ---------------------------------------------------------------------------
// SLA tracker (pure, no network)
// ---------------------------------------------------------------------------

export interface SlaCheckResult {
    ticketId: string;
    openedAt: string;
    elapsedSeconds: number;
    slaTargetSeconds: number;
    status: 'within_sla' | 'approaching_breach' | 'breached';
    warningThresholdPct: number;
}

const SLA_TARGETS_BY_PRIORITY: Record<string, number> = {
    urgent: 3600,       // 1 hour
    high: 14400,        // 4 hours
    medium: 28800,      // 8 hours
    low: 86400,         // 24 hours
};

export function checkSla(ticket: { ticketId: string; openedAt: string; priority?: string }): SlaCheckResult {
    const target = SLA_TARGETS_BY_PRIORITY[ticket.priority ?? 'medium'] ?? 28800;
    const elapsed = Math.floor((Date.now() - new Date(ticket.openedAt).getTime()) / 1000);
    const pct = elapsed / target;

    let status: SlaCheckResult['status'];
    if (pct >= 1) status = 'breached';
    else if (pct >= 0.8) status = 'approaching_breach';
    else status = 'within_sla';

    return {
        ticketId: ticket.ticketId,
        openedAt: ticket.openedAt,
        elapsedSeconds: elapsed,
        slaTargetSeconds: target,
        status,
        warningThresholdPct: Math.round(pct * 100),
    };
}
