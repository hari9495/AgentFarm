/**
 * Feedback Collector
 *
 * Aggregates structured interviewer feedback from an ATS or manual input,
 * summarises it into a debrief report, detects consensus/disagreement,
 * and produces a hiring recommendation with action items.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackRating = 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';

export interface InterviewerFeedback {
    interviewerName: string;
    interviewerTitle: string;
    interviewStage: string;
    rating: FeedbackRating;
    competencyScores?: Record<string, number>;   // competency → 1–4 score
    strengths: string[];
    concerns: string[];
    additionalNotes?: string;
    submittedAt?: string;
}

export interface FeedbackCollectorInput {
    candidateName: string;
    jobTitle: string;
    feedbacks: InterviewerFeedback[];
    hiringManagerName?: string;
    salaryExpectation?: number;
    salaryBudgetMax?: number;
    targetStartDate?: string;
}

export type ConsensusLevel = 'strong_consensus' | 'consensus' | 'split' | 'no_consensus';
export type HiringRecommendation = 'extend_offer' | 'advance_to_next_round' | 'hold_for_debrief' | 'reject';

export interface DebriefReport {
    candidateName: string;
    jobTitle: string;
    totalInterviewers: number;
    ratingBreakdown: Record<FeedbackRating, number>;
    consensusLevel: ConsensusLevel;
    aggregatedStrengths: string[];
    aggregatedConcerns: string[];
    averageCompetencyScores: Record<string, number>;
    hiringRecommendation: HiringRecommendation;
    recommendationRationale: string;
    debriefAgenda: string[];
    actionItems: string[];
    debriefSummary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RATING_WEIGHT: Record<FeedbackRating, number> = {
    strong_yes: 5,
    yes: 4,
    neutral: 3,
    no: 2,
    strong_no: 1,
};

function computeConsensus(ratings: FeedbackRating[]): ConsensusLevel {
    const yes = ratings.filter(r => r === 'yes' || r === 'strong_yes').length;
    const no = ratings.filter(r => r === 'no' || r === 'strong_no').length;
    const total = ratings.length;

    if (total === 0) return 'no_consensus';
    const yesPct = yes / total;
    const noPct = no / total;

    if (yesPct >= 0.8) return 'strong_consensus';
    if (yesPct >= 0.6) return 'consensus';
    if (noPct >= 0.6) return 'consensus'; // consensus to reject
    return yesPct > 0 && noPct > 0 ? 'split' : 'no_consensus';
}

function deriveRecommendation(
    consensus: ConsensusLevel,
    averageWeight: number,
    feedbacks: InterviewerFeedback[],
): HiringRecommendation {
    const hasStrongNo = feedbacks.some(f => f.rating === 'strong_no');
    if (hasStrongNo && consensus !== 'strong_consensus') return 'reject';
    if (averageWeight >= 4.2 && consensus === 'strong_consensus') return 'extend_offer';
    if (averageWeight >= 3.5 && (consensus === 'consensus' || consensus === 'strong_consensus')) return 'advance_to_next_round';
    if (consensus === 'split') return 'hold_for_debrief';
    return 'reject';
}

function aggregateStrings(items: string[][]): string[] {
    const freq = new Map<string, number>();
    items.flat().forEach(item => {
        const key = item.trim().toLowerCase();
        freq.set(key, (freq.get(key) ?? 0) + 1);
    });
    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([item]) => item.charAt(0).toUpperCase() + item.slice(1));
}

function buildDebriefAgenda(input: FeedbackCollectorInput, recommendation: HiringRecommendation): string[] {
    return [
        `1. **Quick round-robin (5 min)** — Each interviewer shares their rating and top reason`,
        `2. **Strengths discussion (5 min)** — What stood out positively about ${input.candidateName}?`,
        `3. **Concerns discussion (5 min)** — What risks or gaps were observed?`,
        recommendation === 'hold_for_debrief'
            ? `4. **Resolve disagreement (5 min)** — Align on what matters most for this role`
            : `4. **Alignment check (3 min)** — Confirm consensus before recruiter takes next step`,
        `5. **Decision (2 min)** — ${input.hiringManagerName ?? 'Hiring Manager'} makes the call`,
    ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function collectAndSummariseFeedback(input: FeedbackCollectorInput): DebriefReport {
    const { feedbacks } = input;

    if (feedbacks.length === 0) {
        return {
            candidateName: input.candidateName,
            jobTitle: input.jobTitle,
            totalInterviewers: 0,
            ratingBreakdown: { strong_yes: 0, yes: 0, neutral: 0, no: 0, strong_no: 0 },
            consensusLevel: 'no_consensus',
            aggregatedStrengths: [],
            aggregatedConcerns: [],
            averageCompetencyScores: {},
            hiringRecommendation: 'hold_for_debrief',
            recommendationRationale: 'No feedback submitted yet. Follow up with interviewers.',
            debriefAgenda: [],
            actionItems: ['Chase outstanding feedback from all interviewers'],
            debriefSummary: 'Awaiting feedback.',
        };
    }

    // Rating breakdown
    const ratingBreakdown: Record<FeedbackRating, number> = {
        strong_yes: 0, yes: 0, neutral: 0, no: 0, strong_no: 0,
    };
    feedbacks.forEach(f => { ratingBreakdown[f.rating]++; });

    const ratings = feedbacks.map(f => f.rating);
    const avgWeight = ratings.reduce((s, r) => s + RATING_WEIGHT[r], 0) / ratings.length;
    const consensusLevel = computeConsensus(ratings);

    // Aggregate competency scores
    const competencyAccum: Record<string, { total: number; count: number }> = {};
    feedbacks.forEach(f => {
        Object.entries(f.competencyScores ?? {}).forEach(([comp, score]) => {
            if (!competencyAccum[comp]) competencyAccum[comp] = { total: 0, count: 0 };
            competencyAccum[comp]!.total += score;
            competencyAccum[comp]!.count++;
        });
    });
    const averageCompetencyScores: Record<string, number> = {};
    Object.entries(competencyAccum).forEach(([comp, { total, count }]) => {
        averageCompetencyScores[comp] = Math.round((total / count) * 10) / 10;
    });

    const aggregatedStrengths = aggregateStrings(feedbacks.map(f => f.strengths));
    const aggregatedConcerns = aggregateStrings(feedbacks.map(f => f.concerns));

    const hiringRecommendation = deriveRecommendation(consensusLevel, avgWeight, feedbacks);

    const recommendationMap: Record<HiringRecommendation, string> = {
        extend_offer: `Strong consensus (avg score ${avgWeight.toFixed(1)}/5) — proceed to offer`,
        advance_to_next_round: `Positive feedback overall — advance to next interview round`,
        hold_for_debrief: `Panel is split — convene debrief before deciding`,
        reject: `Majority concerns or strong no — do not advance`,
    };

    const actionItems: string[] = [];
    if (hiringRecommendation === 'extend_offer') {
        actionItems.push(
            `Prepare offer letter via workspace_rec_generate_offer`,
            input.salaryExpectation
                ? `Confirm compensation: candidate expects ${input.salaryExpectation}, budget max ${input.salaryBudgetMax ?? 'TBD'}`
                : `Confirm compensation expectations with candidate`,
            `Request formal approval from hiring manager before sending offer`,
        );
    } else if (hiringRecommendation === 'advance_to_next_round') {
        actionItems.push(
            `Schedule next interview stage via workspace_rec_schedule_interview`,
            `Brief next round interviewers on concerns to probe: ${aggregatedConcerns.slice(0, 2).join(', ')}`,
        );
    } else if (hiringRecommendation === 'hold_for_debrief') {
        actionItems.push(
            `Schedule debrief call with hiring panel`,
            `Share this report with all interviewers before the call`,
            `Identify key disagreement areas: ${aggregatedConcerns.slice(0, 2).join(', ')}`,
        );
    } else {
        actionItems.push(
            `Send personalised, respectful rejection email to ${input.candidateName}`,
            `Add to talent pool for future consideration (if appropriate)`,
            `Update ATS status to Rejected`,
        );
    }

    const debriefSummary = [
        `**${input.candidateName}** — ${input.jobTitle}`,
        `Interviewers: ${feedbacks.length} | Average rating: ${avgWeight.toFixed(1)}/5 | Consensus: ${consensusLevel.replace(/_/g, ' ')}`,
        `Recommendation: **${hiringRecommendation.replace(/_/g, ' ').toUpperCase()}**`,
        `Top strengths: ${aggregatedStrengths.slice(0, 3).join(', ')}`,
        `Top concerns: ${aggregatedConcerns.slice(0, 3).join(', ')}`,
    ].join('\n');

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        totalInterviewers: feedbacks.length,
        ratingBreakdown,
        consensusLevel,
        aggregatedStrengths,
        aggregatedConcerns,
        averageCompetencyScores,
        hiringRecommendation,
        recommendationRationale: recommendationMap[hiringRecommendation],
        debriefAgenda: buildDebriefAgenda(input, hiringRecommendation),
        actionItems,
        debriefSummary,
    };
}
