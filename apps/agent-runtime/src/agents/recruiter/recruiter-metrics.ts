/**
 * Recruiting Metrics — the reporting a human recruiter owns: funnel conversion,
 * time-to-fill, pipeline aging, and source effectiveness.
 *
 * Pure compute over a snapshot of candidates/applications the caller supplies
 * (from the ATS or the dashboard). Dates are passed in (incl. asOfDate) so the
 * function is deterministic and unit-testable.
 */

export interface MetricsCandidate {
    id?: string;
    stage: string;
    source?: string;
    /** ISO date the candidate entered their current stage — for aging. */
    enteredStageDate?: string;
    hired?: boolean;
    rejected?: boolean;
}

export interface RecruitingMetricsInput {
    jobTitle?: string;
    asOfDate: string;          // ISO — reference "today"
    openedDate?: string;       // ISO — requisition opened
    filledDate?: string;       // ISO — hire accepted (if filled)
    candidates: MetricsCandidate[];
    /** Days in a stage beyond which a candidate is "stale". Default 14. */
    staleThresholdDays?: number;
}

export interface FunnelStage { stage: string; reached: number; conversionFromPrevPct: number | null; }
export interface SourceStat { source: string; candidates: number; hires: number; hireRatePct: number; }

export interface RecruitingMetrics {
    jobTitle: string | null;
    totalCandidates: number;
    hires: number;
    rejections: number;
    active: number;
    funnel: FunnelStage[];
    timeToFillDays: number | null;
    daysOpen: number | null;
    aging: { staleThresholdDays: number; staleCount: number; maxDaysInStage: number | null; stalest: { id: string | null; stage: string; days: number } | null };
    sourceEffectiveness: SourceStat[];
    summary: string;
}

// Canonical recruiting funnel order. A candidate "reaches" a stage if their
// current stage ranks at or beyond it — so a candidate at 'offer' also reached
// 'screened'. Unknown stages rank at the bottom (0).
const CANONICAL_STAGES = ['sourced', 'applied', 'screened', 'phone_screen', 'interview', 'offer', 'hired'] as const;

const rankOf = (stage: string): number => {
    const i = CANONICAL_STAGES.indexOf(stage.trim().toLowerCase() as (typeof CANONICAL_STAGES)[number]);
    return i < 0 ? 0 : i;
};

const daysBetween = (fromIso: string, toIso: string): number | null => {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    return Math.max(0, Math.round((to - from) / 86_400_000));
};

const pct = (num: number, den: number): number => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

export function computeRecruitingMetrics(input: RecruitingMetricsInput): RecruitingMetrics {
    const staleThresholdDays = input.staleThresholdDays ?? 14;
    const candidates = input.candidates ?? [];
    const total = candidates.length;
    const hires = candidates.filter((c) => c.hired || c.stage?.toLowerCase() === 'hired').length;
    const rejections = candidates.filter((c) => c.rejected).length;
    const active = candidates.filter((c) => !c.hired && !c.rejected && c.stage?.toLowerCase() !== 'hired').length;

    // Funnel: only stages that appear (as reached) in the data, in canonical order.
    const maxRankPresent = candidates.reduce((m, c) => Math.max(m, rankOf(c.stage)), -1);
    const funnel: FunnelStage[] = [];
    let prevReached: number | null = null;
    for (let r = 0; r <= maxRankPresent; r += 1) {
        const stage = CANONICAL_STAGES[r]!;
        const reached = candidates.filter((c) => rankOf(c.stage) >= r).length;
        funnel.push({ stage, reached, conversionFromPrevPct: prevReached === null ? null : pct(reached, prevReached) });
        prevReached = reached;
    }

    const timeToFillDays = input.openedDate && input.filledDate ? daysBetween(input.openedDate, input.filledDate) : null;
    const daysOpen = input.openedDate ? daysBetween(input.openedDate, input.filledDate ?? input.asOfDate) : null;

    // Aging over active candidates with a known stage-entry date.
    let staleCount = 0;
    let maxDaysInStage: number | null = null;
    let stalest: RecruitingMetrics['aging']['stalest'] = null;
    for (const c of candidates) {
        if (c.hired || c.rejected || !c.enteredStageDate) continue;
        const d = daysBetween(c.enteredStageDate, input.asOfDate);
        if (d === null) continue;
        if (d >= staleThresholdDays) staleCount += 1;
        if (maxDaysInStage === null || d > maxDaysInStage) {
            maxDaysInStage = d;
            stalest = { id: c.id ?? null, stage: c.stage, days: d };
        }
    }

    // Source effectiveness.
    const bySource = new Map<string, { candidates: number; hires: number }>();
    for (const c of candidates) {
        const key = (c.source ?? 'unknown').trim() || 'unknown';
        const s = bySource.get(key) ?? { candidates: 0, hires: 0 };
        s.candidates += 1;
        if (c.hired || c.stage?.toLowerCase() === 'hired') s.hires += 1;
        bySource.set(key, s);
    }
    const sourceEffectiveness: SourceStat[] = [...bySource.entries()]
        .map(([source, s]) => ({ source, candidates: s.candidates, hires: s.hires, hireRatePct: pct(s.hires, s.candidates) }))
        .sort((a, b) => b.hires - a.hires || b.candidates - a.candidates);

    const summaryParts = [
        `${total} candidates`,
        `${hires} hired`,
        `${active} active`,
        timeToFillDays !== null ? `time-to-fill ${timeToFillDays}d` : daysOpen !== null ? `open ${daysOpen}d` : null,
        staleCount > 0 ? `${staleCount} stale (>${staleThresholdDays}d)` : null,
    ].filter(Boolean);

    return {
        jobTitle: input.jobTitle ?? null,
        totalCandidates: total,
        hires,
        rejections,
        active,
        funnel,
        timeToFillDays,
        daysOpen,
        aging: { staleThresholdDays, staleCount, maxDaysInStage, stalest },
        sourceEffectiveness,
        summary: summaryParts.join(' · '),
    };
}
