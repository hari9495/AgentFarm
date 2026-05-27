/**
 * Talent Pool (Silver-Medal CRM)
 *
 * Manages the post-rejection relationship lifecycle:
 *   - Add candidate to talent pool with skills, seniority, domain tags
 *   - Search pool by open requisition criteria
 *   - Build re-engagement nurture sequences (30/90/180-day cadences)
 *   - Generate personalised re-engagement outreach
 *   - Pool health analytics (size, coverage, staleness, re-hire rate)
 *
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TalentPoolSource =
    | 'silver_medal'          // Final-round or near-miss candidates
    | 'pipeline_reject'       // Earlier-stage but promising
    | 'inbound_referral'      // Referred by employee/network
    | 'direct_inbound'        // Applied but no current opening
    | 'event_sourced'         // Met at career fair / conference
    | 'passive_outreach'      // Responded to sourcing but not ready
    | 'boomerang'             // Former employee eligible for rehire
    | 'declined_offer';       // Declined our offer, willing to stay in touch

export type TalentPoolStatus =
    | 'active'                // Engaged, open to outreach
    | 'passive'               // Not actively looking; light-touch cadence
    | 'do_not_contact'        // Opted out
    | 'placed_elsewhere'      // Hired by a competitor — no further outreach
    | 'hired_us'              // Converted — moved to employee record
    | 'stale';                // No engagement after 12+ months; needs refresh

export type ReEngagementTrigger =
    | 'new_opening_match'     // New req matches their profile
    | 'scheduled_nurture'     // Calendar-based cadence touch
    | 'market_event'          // Layoffs at their employer, funding news, etc.
    | 'referral_request'      // Asking them to refer someone
    | 'content_share'         // Share a relevant article, podcast, etc.
    | 'annual_check_in';      // Annual relationship touch

export interface TalentPoolCandidate {
    id: string;
    name: string;
    email: string;
    linkedinUrl?: string;
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    primarySkills: string[];
    industryDomains: string[];       // e.g. ['healthcare', 'clinical']
    seniorityLevel: 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | 'vp' | 'c_suite';
    source: TalentPoolSource;
    status: TalentPoolStatus;
    addedDate: string;               // ISO date
    lastContactDate?: string;        // ISO date
    nextContactDate?: string;        // ISO date
    rolesPreviouslyConsidered: string[];
    recruiterNotes?: string;
    salaryExpectation?: number;
    currency?: string;
    noticePeriodWeeks?: number;
    willingToRelocate?: boolean;
    preferredWorkArrangement?: 'remote' | 'hybrid' | 'onsite' | 'flexible';
    gdprConsent?: boolean;           // Explicit consent to retain data
    gdprConsentDate?: string;
}

export interface TalentPoolSearchCriteria {
    requiredSkills?: string[];
    niceToHaveSkills?: string[];
    industryDomains?: string[];
    seniorityLevels?: TalentPoolCandidate['seniorityLevel'][];
    location?: string;
    willingToRelocate?: boolean;
    preferredWorkArrangement?: TalentPoolCandidate['preferredWorkArrangement'];
    maxSalary?: number;
    currency?: string;
    statusFilter?: TalentPoolStatus[];
    addedAfter?: string;             // ISO date — filter by recency
    lastContactedBefore?: string;    // ISO date — find candidates due for outreach
}

export interface TalentPoolSearchResult {
    matches: Array<{
        candidate: TalentPoolCandidate;
        matchScore: number;         // 0–100
        matchRationale: string;
        suggestedTrigger: ReEngagementTrigger;
    }>;
    totalPoolSize: number;
    searchCriteria: TalentPoolSearchCriteria;
    summary: string;
}

export interface NurtureSequenceInput {
    candidate: TalentPoolCandidate;
    recruiterName: string;
    companyName: string;
    triggerType: ReEngagementTrigger;
    openRoleTitle?: string;          // For new_opening_match
    openRoleUrl?: string;
    contentShareUrl?: string;        // For content_share trigger
    contentShareTitle?: string;
    referralRoleTitle?: string;      // For referral_request
    marketEventContext?: string;     // For market_event trigger
}

export interface NurtureMessage {
    touchNumber: number;
    daysFromNow: number;
    subject: string;
    body: string;
    channel: 'email' | 'linkedin' | 'phone';
    note: string;
}

export interface NurtureSequence {
    candidate: TalentPoolCandidate;
    trigger: ReEngagementTrigger;
    messages: NurtureMessage[];
    sequenceSummary: string;
}

export interface TalentPoolAnalyticsInput {
    pool: TalentPoolCandidate[];
    companyName: string;
    openRequisitionCount?: number;
}

export interface TalentPoolAnalytics {
    totalSize: number;
    byStatus: Record<TalentPoolStatus, number>;
    bySource: Record<TalentPoolSource, number>;
    bySeniority: Record<string, number>;
    byDomain: Record<string, number>;
    staleCount: number;              // No contact in 6+ months
    dueForOutreach: number;          // nextContactDate in past
    conversionRate: number;          // hired_us / (hired_us + placed_elsewhere)
    gdprRiskCount: number;           // No consent recorded
    coverageScore: number;           // 0–100: how well pool covers open roles
    healthSummary: string;
    recommendations: string[];
}

// ---------------------------------------------------------------------------
// Add candidate to talent pool
// ---------------------------------------------------------------------------

export function addToTalentPool(
    candidate: Omit<TalentPoolCandidate, 'id' | 'addedDate' | 'status'> & { status?: TalentPoolStatus },
): TalentPoolCandidate {
    const id = `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const addedDate = new Date().toISOString().split('T')[0]!;

    // ── GDPR / CCPA enforcement ───────────────────────────────────────────────
    // A candidate MUST give explicit consent before they can be stored and
    // subsequently contacted. Without consent:
    //   • status is forced to 'do_not_contact' — searchTalentPool() will skip them
    //   • nextContactDate is left undefined — no nurture cadence is scheduled
    //   • gdprConsent is stored as false so analytics surfaces the compliance risk
    //
    // Callers must obtain consent (opt-in form, email confirmation, or verbal
    // consent documented in recruiterNotes) before setting gdprConsent: true.
    // See GDPR Art. 6(1)(a) and CCPA Cal. Civ. Code § 1798.100.
    const hasConsent = candidate.gdprConsent === true;
    const effectiveStatus: TalentPoolStatus = !hasConsent ? 'do_not_contact' : (candidate.status ?? 'active');

    // Default next contact to 30 days out for nurture cadence (only when consented)
    const nextContactDate = hasConsent
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
        : undefined;

    return {
        ...candidate,
        id,
        addedDate,
        status: effectiveStatus,
        nextContactDate,
        gdprConsent: hasConsent,
        gdprConsentDate: hasConsent ? (candidate.gdprConsentDate ?? addedDate) : undefined,
    };
}

// ---------------------------------------------------------------------------
// Search talent pool
// ---------------------------------------------------------------------------

export function searchTalentPool(
    pool: TalentPoolCandidate[],
    criteria: TalentPoolSearchCriteria,
): TalentPoolSearchResult {
    const statusFilter = criteria.statusFilter ?? ['active', 'passive'];
    const today = new Date().toISOString().split('T')[0]!;

    const eligible = pool.filter(c => {
        if (!statusFilter.includes(c.status)) return false;
        if (!c.gdprConsent) return false; // Never contact without consent
        if (criteria.addedAfter && c.addedDate < criteria.addedAfter) return false;
        if (criteria.lastContactedBefore) {
            const lastContact = c.lastContactDate ?? c.addedDate;
            if (lastContact > criteria.lastContactedBefore) return false;
        }
        return true;
    });

    const scored = eligible.map(candidate => {
        let score = 0;
        const reasons: string[] = [];

        // Required skills match (50 pts)
        if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
            const candSkillsLower = candidate.primarySkills.map(s => s.toLowerCase());
            const matchCount = criteria.requiredSkills.filter(s =>
                candSkillsLower.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)),
            ).length;
            const skillScore = Math.round((matchCount / criteria.requiredSkills.length) * 50);
            score += skillScore;
            if (skillScore > 0) reasons.push(`${matchCount}/${criteria.requiredSkills.length} required skills matched`);
        } else {
            score += 25; // No skill requirement — give baseline
        }

        // Nice-to-have skills (15 pts)
        if (criteria.niceToHaveSkills && criteria.niceToHaveSkills.length > 0) {
            const candSkillsLower = candidate.primarySkills.map(s => s.toLowerCase());
            const matchCount = criteria.niceToHaveSkills.filter(s =>
                candSkillsLower.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)),
            ).length;
            const nthScore = Math.min(15, Math.round((matchCount / criteria.niceToHaveSkills.length) * 15));
            score += nthScore;
            if (nthScore > 0) reasons.push(`${matchCount} nice-to-have skills matched`);
        }

        // Industry domain (15 pts)
        if (criteria.industryDomains && criteria.industryDomains.length > 0) {
            const domainMatch = criteria.industryDomains.some(d =>
                candidate.industryDomains.map(cd => cd.toLowerCase()).includes(d.toLowerCase()),
            );
            if (domainMatch) { score += 15; reasons.push('industry domain aligned'); }
        } else {
            score += 8;
        }

        // Seniority (10 pts)
        if (criteria.seniorityLevels && criteria.seniorityLevels.length > 0) {
            if (criteria.seniorityLevels.includes(candidate.seniorityLevel)) {
                score += 10; reasons.push('seniority level match');
            }
        } else {
            score += 5;
        }

        // Source bonus — silver medals are warmer (5 pts)
        if (candidate.source === 'silver_medal' || candidate.source === 'boomerang') {
            score += 5; reasons.push(`${candidate.source.replace('_', ' ')} (high-trust source)`);
        }

        // Recency — candidates added or contacted recently (5 pts)
        const daysSinceContact = Math.floor(
            (Date.now() - new Date(candidate.lastContactDate ?? candidate.addedDate).getTime()) / 86400000,
        );
        if (daysSinceContact < 90) { score += 5; reasons.push('recently engaged'); }

        // Work arrangement (bonus)
        if (criteria.preferredWorkArrangement && candidate.preferredWorkArrangement) {
            if (candidate.preferredWorkArrangement === criteria.preferredWorkArrangement ||
                candidate.preferredWorkArrangement === 'flexible') {
                score += 3;
            }
        }

        // Salary filter (hard cutoff, not a score)
        if (criteria.maxSalary && candidate.salaryExpectation) {
            if (candidate.salaryExpectation > criteria.maxSalary) {
                score = Math.max(0, score - 20); // Heavy penalty but don't exclude — may be negotiable
                reasons.push('⚠️ salary expectation exceeds budget');
            }
        }

        // Determine best trigger
        const dueForContact = candidate.nextContactDate && candidate.nextContactDate <= today;
        const suggestedTrigger: ReEngagementTrigger = dueForContact
            ? 'scheduled_nurture'
            : 'new_opening_match';

        return {
            candidate,
            matchScore: Math.min(100, score),
            matchRationale: reasons.length > 0 ? reasons.join('; ') : 'General profile match',
            suggestedTrigger,
        };
    });

    const matches = scored
        .filter(s => s.matchScore >= 30) // Minimum threshold
        .sort((a, b) => b.matchScore - a.matchScore);

    const summary = [
        `Found ${matches.length} candidates matching search criteria (from pool of ${pool.length}).`,
        matches.length > 0
            ? `Top match: ${matches[0]!.candidate.name} (${matches[0]!.matchScore}/100 — ${matches[0]!.matchRationale}).`
            : 'No candidates met the 30-point threshold — consider broadening criteria.',
    ].join(' ');

    return {
        matches,
        totalPoolSize: pool.length,
        searchCriteria: criteria,
        summary,
    };
}

// ---------------------------------------------------------------------------
// Nurture sequence builder
// ---------------------------------------------------------------------------

export function buildNurtureSequence(input: NurtureSequenceInput): NurtureSequence {
    const { candidate, recruiterName, companyName, triggerType } = input;
    const messages: NurtureMessage[] = [];

    switch (triggerType) {

        case 'new_opening_match': {
            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'email',
                subject: `${input.openRoleTitle ?? 'A role'} at ${companyName} — thought of you`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `I hope you're doing well! I've been thinking about you since we last spoke and wanted to reach out directly.`,
                    ``,
                    `We have an opening for a **${input.openRoleTitle ?? 'new role'}** that I think is a strong match for your background in ${candidate.primarySkills.slice(0, 2).join(' and ')}.`,
                    ``,
                    input.openRoleUrl
                        ? `Here's the full role description: ${input.openRoleUrl}`
                        : "I'd love to share more details if you're open to a quick chat.",
                    ``,
                    `Is this worth a 15-minute call this week? No pressure at all — I just wanted you to know before we opened it publicly.`,
                    ``,
                    `Best,`,
                    `${recruiterName}`,
                    `${companyName}`,
                ].join('\n'),
                note: 'Send as soon as req is approved — candidates in pool should hear before job boards',
            });
            messages.push({
                touchNumber: 2,
                daysFromNow: 5,
                channel: 'linkedin',
                subject: '',
                body: `Hi ${candidate.name} — just wanted to make sure my email didn't get lost. I have a role that seems really well-suited for you. Would love to share more details if you have 15 min this week.`,
                note: 'Short LinkedIn follow-up if no email response',
            });
            messages.push({
                touchNumber: 3,
                daysFromNow: 10,
                channel: 'email',
                subject: `Last note — ${input.openRoleTitle ?? 'opportunity'} at ${companyName}`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `I wanted to send one final note about the ${input.openRoleTitle ?? 'role'} at ${companyName}. We're moving quickly and I didn't want you to miss the window.`,
                    ``,
                    `If timing isn't right or you're happy where you are, completely understood — I'll keep you updated when other relevant opportunities come up.`,
                    ``,
                    `Either way, it's great to stay in touch.`,
                    ``,
                    `${recruiterName}`,
                ].join('\n'),
                note: 'Final touch — if no reply, move to passive cadence',
            });
            break;
        }

        case 'scheduled_nurture': {
            const daysSinceAdded = Math.floor(
                (Date.now() - new Date(candidate.addedDate).getTime()) / 86400000,
            );
            const touchContext = daysSinceAdded < 45 ? '30-day' : daysSinceAdded < 100 ? '90-day' : '6-month';

            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'email',
                subject: `Checking in — ${recruiterName} at ${companyName}`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `I wanted to check in and see how things are going for you. It's been a little while since we spoke and I've been thinking about you.`,
                    ``,
                    `Are you still happy in your current role, or has anything shifted? I ask because we have some interesting things brewing at ${companyName} and I want to make sure I reach out to the right people at the right time.`,
                    ``,
                    `Even if the timing isn't right, I'd love a quick catch-up when you have 10 minutes.`,
                    ``,
                    `Hope you're doing well!`,
                    ``,
                    `${recruiterName}`,
                    `${companyName}`,
                ].join('\n'),
                note: `${touchContext} check-in — keep it warm and low pressure`,
            });
            break;
        }

        case 'market_event': {
            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'email',
                subject: `Reaching out — wanted to connect`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `I hope you're doing well. ${input.marketEventContext ? `I've been following the recent news ${input.marketEventContext} and wanted to reach out personally.` : `I wanted to check in given some recent market changes.`}`,
                    ``,
                    `I know this can be an unsettling time and I want you to know that ${companyName} is actively hiring. Given your background, I think you'd be a strong fit for several roles we're working on.`,
                    ``,
                    `Would you be open to a call this week? No pitch — just a conversation about where you are and what you're looking for next.`,
                    ``,
                    `${recruiterName}`,
                    `${companyName}`,
                ].join('\n'),
                note: 'Reach out within 24-48h of market event for maximum relevance. Tone must be empathetic, not opportunistic.',
            });
            break;
        }

        case 'referral_request': {
            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'email',
                subject: `Quick question — know anyone great for a ${input.referralRoleTitle ?? 'role'}?`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `I hope things are going well! I have a slightly different reason for reaching out today.`,
                    ``,
                    `We're hiring for a ${input.referralRoleTitle ?? 'new position'} at ${companyName} and given your experience in this space, I thought you might know someone who could be a great fit.`,
                    ``,
                    `If anyone comes to mind, I"d really appreciate an introduction — and if your own situation has changed and you're open to exploring, I"d love to catch up about that too.`,
                    ``,
                    `Either way, thanks for thinking of me!`,
                    ``,
                    `${recruiterName}`,
                ].join('\n'),
                note: "Referral requests often re-ignite candidate\'s own interest — frame it as a favour ask, not recruitment",
            });
            break;
        }

        case 'content_share': {
            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'linkedin',
                subject: '',
                body: `Hi ${candidate.name} — ${input.contentShareTitle ? `saw this piece on "${input.contentShareTitle}" and thought of you` : 'thought you might find this relevant'}: ${input.contentShareUrl ?? '[article link]'}. Hope things are going well!`,
                note: 'Content shares build relationship capital without pressure. Use LinkedIn for informality. Share max once a quarter.',
            });
            break;
        }

        case 'annual_check_in': {
            messages.push({
                touchNumber: 1,
                daysFromNow: 0,
                channel: 'email',
                subject: `Annual check-in — ${recruiterName} from ${companyName}`,
                body: [
                    `Hi ${candidate.name},`,
                    ``,
                    `Can you believe another year has gone by? I wanted to reach out to stay connected and hear how you're doing.`,
                    ``,
                    `I remember our conversation about [role you discussed] and have kept an eye out for the right opportunity since then. Depending on where you are now, I may have something relevant — or this might just be a good excuse to catch up.`,
                    ``,
                    `Would love to reconnect for 15 minutes if you're open to it. How's your schedule looking?`,
                    ``,
                    `Best,`,
                    `${recruiterName}`,
                    `${companyName}`,
                ].join('\n'),
                note: 'Annual check-ins maintain long-term relationships — high conversion over 2-3 year window for top candidates',
            });
            break;
        }
    }

    const sequenceSummary = `${messages.length}-touch ${triggerType.replace(/_/g, '-')} sequence for ${candidate.name} (${candidate.seniorityLevel} ${candidate.primarySkills[0] ?? 'professional'}).`;

    return {
        candidate,
        trigger: triggerType,
        messages,
        sequenceSummary,
    };
}

// ---------------------------------------------------------------------------
// Talent pool analytics
// ---------------------------------------------------------------------------

export function buildTalentPoolAnalytics(input: TalentPoolAnalyticsInput): TalentPoolAnalytics {
    const { pool, companyName, openRequisitionCount = 0 } = input;
    const today = new Date().toISOString().split('T')[0]!;
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]!;

    // Status counts
    const byStatus = pool.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1;
        return acc;
    }, {} as Record<TalentPoolStatus, number>);

    // Source counts
    const bySource = pool.reduce((acc, c) => {
        acc[c.source] = (acc[c.source] ?? 0) + 1;
        return acc;
    }, {} as Record<TalentPoolSource, number>);

    // Seniority counts
    const bySeniority = pool.reduce((acc, c) => {
        acc[c.seniorityLevel] = (acc[c.seniorityLevel] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Domain counts (flatten multi-domain candidates)
    const byDomain = pool.reduce((acc, c) => {
        for (const d of c.industryDomains) {
            acc[d] = (acc[d] ?? 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const staleCount = pool.filter(c => {
        const lastContact = c.lastContactDate ?? c.addedDate;
        return lastContact < sixMonthsAgo && c.status === 'active';
    }).length;

    const dueForOutreach = pool.filter(c =>
        c.nextContactDate &&
        c.nextContactDate <= today &&
        (c.status === 'active' || c.status === 'passive') &&
        c.gdprConsent,
    ).length;

    const hiredUs = byStatus['hired_us'] ?? 0;
    const placedElsewhere = byStatus['placed_elsewhere'] ?? 0;
    const conversionRate = hiredUs + placedElsewhere > 0
        ? Math.round((hiredUs / (hiredUs + placedElsewhere)) * 100)
        : 0;

    const gdprRiskCount = pool.filter(c => !c.gdprConsent).length;

    // Coverage score: active + passive candidates with consent vs open requisitions
    const contactable = pool.filter(c =>
        (c.status === 'active' || c.status === 'passive') && c.gdprConsent,
    ).length;
    const coverageScore = openRequisitionCount > 0
        ? Math.min(100, Math.round((contactable / (openRequisitionCount * 5)) * 100)) // 5 candidates/req is healthy
        : contactable > 10 ? 80 : Math.min(80, contactable * 5);

    const recommendations: string[] = [];
    if (staleCount > 5) recommendations.push(`${staleCount} active candidates haven't been contacted in 6+ months — run a re-engagement campaign.`);
    if (gdprRiskCount > 0) recommendations.push(`${gdprRiskCount} candidates have no GDPR consent on record — remove or obtain consent immediately (GDPR/CCPA risk).`);
    if (dueForOutreach > 0) recommendations.push(`${dueForOutreach} candidates are due for outreach today — review and send nurture messages.`);
    if (conversionRate < 10 && hiredUs + placedElsewhere > 5) recommendations.push(`Pool-to-hire conversion rate is ${conversionRate}% — review whether pool candidates are being surfaced for new reqs.`);
    if (coverageScore < 50 && openRequisitionCount > 0) recommendations.push(`Pool coverage is low (${coverageScore}/100) for ${openRequisitionCount} open reqs — increase sourcing and silver-medal candidate capture.`);
    if ((bySource['silver_medal'] ?? 0) < pool.length * 0.3) recommendations.push(`Silver-medal candidates represent only ${Math.round(((bySource['silver_medal'] ?? 0) / Math.max(1, pool.length)) * 100)}% of the pool — ensure all final-round candidates are added.`);

    const healthSummary = [
        `**${companyName} Talent Pool Health Report**`,
        `Pool Size: ${pool.length} | Active: ${byStatus['active'] ?? 0} | Passive: ${byStatus['passive'] ?? 0}`,
        `Due for Outreach: ${dueForOutreach} | Stale: ${staleCount} | GDPR Risk: ${gdprRiskCount}`,
        `Pool-to-Hire Conversion: ${conversionRate}% | Coverage Score: ${coverageScore}/100`,
        recommendations.length > 0
            ? `\n**Actions Required:**\n${recommendations.map(r => `- ${r}`).join('\n')}`
            : '\n✅ Pool health is good — no immediate actions required.',
    ].join('\n');

    return {
        totalSize: pool.length,
        byStatus,
        bySource,
        bySeniority,
        byDomain,
        staleCount,
        dueForOutreach,
        conversionRate,
        gdprRiskCount,
        coverageScore,
        healthSummary,
        recommendations,
    };
}
