/**
 * Pipeline Tracker
 *
 * Manages the end-to-end candidate pipeline across ATS stages.
 * Produces status reports, SLA warnings, and hiring-manager sync notes.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage =
    | 'sourced'
    | 'outreached'
    | 'applied'
    | 'screening'
    | 'phone_screen'
    | 'hiring_manager_review'
    | 'technical_round'
    | 'final_panel'
    | 'offer_extended'
    | 'offer_accepted'
    | 'offer_declined'
    | 'rejected'
    | 'withdrawn';

export interface PipelineCandidate {
    id: string;
    fullName: string;
    currentStage: PipelineStage;
    jobTitle: string;
    lastActivityDate: string;        // ISO date
    nextAction?: string;
    nextActionDueDate?: string;
    salaryExpectation?: number;
    notes?: string;
    passedStages?: PipelineStage[];
}

export interface PipelineReportInput {
    jobTitle: string;
    jobId?: string;
    hiringManagerName?: string;
    recruiterName: string;
    targetStartDate?: string;
    targetHireDate?: string;
    openSince?: string;
    candidates: PipelineCandidate[];
    currency?: string;
    slaDaysPerStage?: Partial<Record<PipelineStage, number>>;
}

export interface StageCount {
    stage: PipelineStage;
    count: number;
    candidates: string[];
}

export interface SlaWarning {
    candidateName: string;
    stage: PipelineStage;
    daysInStage: number;
    slaDays: number;
    overdueDays: number;
}

export interface PipelineReport {
    jobTitle: string;
    recruiterName: string;
    reportDate: string;
    totalCandidates: number;
    activeCount: number;
    offerExtendedCount: number;
    rejectedCount: number;
    stageSummary: StageCount[];
    slaWarnings: SlaWarning[];
    hiringManagerSyncNote: string;
    pipelineHealthScore: number;     // 0–100
    bottlenecks: string[];
    recommendedActions: string[];
    fullReport: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVE_STAGES: PipelineStage[] = [
    'sourced', 'outreached', 'applied', 'screening',
    'phone_screen', 'hiring_manager_review', 'technical_round', 'final_panel',
];

const DEFAULT_SLA: Record<PipelineStage, number> = {
    sourced: 3,
    outreached: 5,
    applied: 3,
    screening: 2,
    phone_screen: 5,
    hiring_manager_review: 4,
    technical_round: 7,
    final_panel: 5,
    offer_extended: 5,
    offer_accepted: 0,
    offer_declined: 0,
    rejected: 0,
    withdrawn: 0,
};

const STAGE_LABEL: Record<PipelineStage, string> = {
    sourced: 'Sourced',
    outreached: 'Outreached',
    applied: 'Applied',
    screening: 'Screening',
    phone_screen: 'Phone Screen',
    hiring_manager_review: 'HM Review',
    technical_round: 'Technical Round',
    final_panel: 'Final Panel',
    offer_extended: 'Offer Extended',
    offer_accepted: 'Offer Accepted 🎉',
    offer_declined: 'Offer Declined',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(dateStr: string): number {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function computeHealthScore(
    total: number,
    active: number,
    slaWarnings: SlaWarning[],
    stages: StageCount[],
): number {
    if (total === 0) return 0;

    let score = 100;

    // Deduct for each SLA breach (up to -40)
    score -= Math.min(slaWarnings.length * 10, 40);

    // Deduct if pipeline is too thin (< 3 active)
    if (active < 3) score -= 20;
    if (active === 0) score -= 20;

    // Deduct for no candidates past phone screen
    const deepStages = stages.filter(s =>
        ['technical_round', 'final_panel', 'offer_extended'].includes(s.stage) && s.count > 0,
    );
    if (deepStages.length === 0) score -= 15;

    return Math.max(0, score);
}

function detectBottlenecks(stageSummary: StageCount[], slaWarnings: SlaWarning[]): string[] {
    const bottlenecks: string[] = [];

    // Stage with most candidates = potential bottleneck
    const sorted = [...stageSummary].filter(s => ACTIVE_STAGES.includes(s.stage)).sort((a, b) => b.count - a.count);
    if (sorted[0] && sorted[0].count >= 3) {
        bottlenecks.push(`${sorted[0].count} candidates stuck in ${STAGE_LABEL[sorted[0].stage]}`);
    }

    // Repeated SLA breaches at same stage
    const stageBreaches = new Map<string, number>();
    slaWarnings.forEach(w => stageBreaches.set(w.stage, (stageBreaches.get(w.stage) ?? 0) + 1));
    stageBreaches.forEach((count, stage) => {
        if (count >= 2) bottlenecks.push(`${count} SLA breaches at ${STAGE_LABEL[stage as PipelineStage]}`);
    });

    return bottlenecks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildPipelineReport(input: PipelineReportInput): PipelineReport {
    const slaDays = { ...DEFAULT_SLA, ...(input.slaDaysPerStage ?? {}) };
    const today = new Date().toISOString().split('T')[0] ?? '';
    const currency = input.currency ?? 'USD';

    // Stage summary
    const stageMap = new Map<PipelineStage, string[]>();
    input.candidates.forEach(c => {
        if (!stageMap.has(c.currentStage)) stageMap.set(c.currentStage, []);
        stageMap.get(c.currentStage)!.push(c.fullName);
    });
    const stageSummary: StageCount[] = Array.from(stageMap.entries()).map(([stage, candidates]) => ({
        stage, count: candidates.length, candidates,
    }));

    const activeCount = input.candidates.filter(c => ACTIVE_STAGES.includes(c.currentStage)).length;
    const offerExtendedCount = input.candidates.filter(c => c.currentStage === 'offer_extended' || c.currentStage === 'offer_accepted').length;
    const rejectedCount = input.candidates.filter(c => c.currentStage === 'rejected' || c.currentStage === 'withdrawn').length;

    // SLA warnings
    const slaWarnings: SlaWarning[] = input.candidates
        .filter(c => ACTIVE_STAGES.includes(c.currentStage))
        .map(c => {
            const days = daysSince(c.lastActivityDate);
            const sla = slaDays[c.currentStage] ?? 5;
            return days > sla
                ? { candidateName: c.fullName, stage: c.currentStage, daysInStage: days, slaDays: sla, overdueDays: days - sla }
                : null;
        })
        .filter((w): w is SlaWarning => w !== null)
        .sort((a, b) => b.overdueDays - a.overdueDays);

    const bottlenecks = detectBottlenecks(stageSummary, slaWarnings);
    const healthScore = computeHealthScore(input.candidates.length, activeCount, slaWarnings, stageSummary);

    const recommendedActions: string[] = [];
    if (slaWarnings.length > 0) {
        recommendedActions.push(`Chase ${slaWarnings.length} overdue candidates: ${slaWarnings.slice(0, 2).map(w => w.candidateName).join(', ')}`);
    }
    if (activeCount < 3) {
        recommendedActions.push('Pipeline is thin — run another sourcing pass via workspace_rec_source_candidates');
    }
    if (offerExtendedCount > 0) {
        recommendedActions.push(`Follow up on open offer(s) — decision expected within 5 business days`);
    }
    if (bottlenecks.length > 0) {
        recommendedActions.push(`Address bottlenecks: ${bottlenecks[0]}`);
    }

    // Hiring Manager sync note
    const hiringManagerSyncNote = [
        `**Pipeline Update — ${input.jobTitle}** (as of ${today})`,
        ``,
        `Active candidates: ${activeCount}`,
        stageSummary
            .filter(s => ACTIVE_STAGES.includes(s.stage))
            .map(s => `  - ${STAGE_LABEL[s.stage]}: ${s.count} (${s.candidates.join(', ')})`)
            .join('\n'),
        ``,
        slaWarnings.length > 0
            ? `⚠️ SLA warnings: ${slaWarnings.map(w => `${w.candidateName} (${w.overdueDays}d overdue in ${STAGE_LABEL[w.stage]})`).join(', ')}`
            : `✓ All candidates within SLA`,
        ``,
        input.targetHireDate ? `Target hire date: ${input.targetHireDate}` : '',
        recommendedActions.length > 0 ? `Next steps:\n${recommendedActions.map(a => `  • ${a}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    // Full report text
    const fullReport = [
        `# Pipeline Report — ${input.jobTitle}`,
        `**Recruiter:** ${input.recruiterName}  |  **Date:** ${today}  |  **Health Score:** ${healthScore}/100`,
        input.openSince ? `**Open since:** ${input.openSince}` : '',
        input.targetHireDate ? `**Target hire date:** ${input.targetHireDate}` : '',
        '',
        `## Pipeline Summary`,
        `| Stage | Count | Candidates |`,
        `|-------|-------|------------|`,
        ...stageSummary.map(s => `| ${STAGE_LABEL[s.stage]} | ${s.count} | ${s.candidates.join(', ')} |`),
        '',
        `**Active:** ${activeCount}  |  **Offers:** ${offerExtendedCount}  |  **Rejected/Withdrawn:** ${rejectedCount}`,
        '',
        slaWarnings.length > 0
            ? ['## ⚠️ SLA Warnings', ...slaWarnings.map(w => `- **${w.candidateName}** — ${STAGE_LABEL[w.stage]} for ${w.daysInStage} days (SLA: ${w.slaDays}d, overdue by ${w.overdueDays}d)`)].join('\n')
            : '## ✓ SLA Status\nAll candidates within SLA.',
        '',
        bottlenecks.length > 0 ? `## Bottlenecks\n${bottlenecks.map(b => `- ${b}`).join('\n')}` : '',
        '',
        `## Recommended Actions`,
        recommendedActions.length > 0
            ? recommendedActions.map(a => `- ${a}`).join('\n')
            : '- No immediate actions required.',
    ].filter(Boolean).join('\n');

    return {
        jobTitle: input.jobTitle,
        recruiterName: input.recruiterName,
        reportDate: today,
        totalCandidates: input.candidates.length,
        activeCount,
        offerExtendedCount,
        rejectedCount,
        stageSummary,
        slaWarnings,
        hiringManagerSyncNote,
        pipelineHealthScore: healthScore,
        bottlenecks,
        recommendedActions,
        fullReport,
    };
}
