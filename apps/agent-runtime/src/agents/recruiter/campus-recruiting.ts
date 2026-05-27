/**
 * Campus & High-Volume Recruiting
 *
 * Four sub-workflows in one module:
 *
 *   career_fair    — Pre-event checklist, booth setup, 60-sec pitch, candidate eval sheet,
 *                    follow-up email templates, post-fair ROI tracking
 *
 *   bulk_screen    — Process N resumes in one call; uses the same credential-aware
 *                    scoring engine as screenResume(); returns ranked shortlist,
 *                    auto-rejections, maybes, and cohort-level insights
 *
 *   intern_tracker — Cohort dashboard: milestone health, overdue alerts, midterm/final
 *                    ratings, return-offer pipeline, university and team breakdowns
 *
 *   seasonal_batch — Holiday / summer / back-to-school wave planner: 8-week hiring
 *                    calendar, bulk JD templates, group interview guide, compliance
 *                    reminders for fixed-term and casual workers
 *
 * Pure logic — no external API calls.
 */

import { screenResume } from './resume-screener.js';
import type { ResumeScreenInput, ScreeningVerdict } from './resume-screener.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pct(n: number, d: number): number {
    return d === 0 ? 0 : Math.round((n / d) * 100);
}

// ===========================================================================
// 1. CAREER FAIR COORDINATOR
// ===========================================================================

export type FairType = 'university' | 'industry' | 'diversity' | 'virtual' | 'hybrid';
export type InternOrFullTime = 'intern' | 'full_time' | 'both';

export interface CareerFairInput {
    fairName: string;
    organizer: string;              // university name or professional body
    fairType: FairType;
    date: string;                   // ISO date
    location?: string;
    virtualPlatform?: string;       // Handshake Virtual, Brazen, Hopin, etc.
    targetRoles: string[];
    targetDisciplines?: string[];   // CS, EE, Finance, Nursing, etc.
    attendees: string[];            // recruiter / employee names at the booth
    boothNumber?: string;
    headcountTarget: number;        // expected hires from this fair
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    internOrFullTime: InternOrFullTime;
    targetStartDate?: string;
    swag?: string[];                // branded items to bring
}

export interface CandidateEvalEntry {
    name: string;
    university: string;
    major: string;
    gradYear: string;
    rating: '1-strong' | '2-good' | '3-maybe' | '4-no';
    notes: string;
    resumeCollected: boolean;
    followUpAction: 'fast_track' | 'standard_process' | 'nurture' | 'no_action';
}

export interface CareerFairPackage {
    fairName: string;
    date: string;
    companyName: string;
    organizer: string;
    preEventChecklist: { section: string; items: string[] }[];
    boothSetupChecklist: string[];
    elevatorPitchScript: string;
    candidateEvalSheetTemplate: CandidateEvalEntry;
    followUpEmailTemplates: {
        fastTrack: string;
        standard: string;
        nurture: string;
    };
    postFairDebriefQuestions: string[];
    roiMetricsToTrack: string[];
    hiringTimeline: string;
    complianceNotes: string[];
}

function buildElevatorPitch(input: CareerFairInput): string {
    const rolesSummary = input.targetRoles.length <= 3
        ? input.targetRoles.join(', ')
        : `${input.targetRoles.slice(0, 3).join(', ')}, and more`;

    const opportunityType = input.internOrFullTime === 'intern'
        ? `internship${input.headcountTarget > 1 ? 's' : ''}`
        : input.internOrFullTime === 'full_time'
        ? `full-time role${input.headcountTarget > 1 ? 's' : ''}`
        : 'internship and full-time opportunities';

    return [
        `[OPENING — grab attention in the first 5 seconds]`,
        `"Hi, I'm ${input.attendees[0] ?? '[Your Name]'} from ${input.companyName}. We're here today looking for ${opportunityType} in ${rolesSummary}."`,
        ``,
        `[VALUE PROPOSITION — what makes you different, 15 seconds]`,
        `"At ${input.companyName}, [insert 1–2 compelling differentiators: mission, growth stage, tech, impact, culture]. We're the kind of place where [specific thing that resonates with this audience — e.g. 'new grads own real projects from week one' or 'you can see your work used by millions of people']."`,
        ``,
        `[BRIDGE TO THEM — make it about the candidate, 10 seconds]`,
        `"What are you studying / working on? [Listen, then connect their background to a specific role or project.]"`,
        ``,
        `[CLOSE — clear next step, 5 seconds]`,
        `"I'd love to tell you more — can I grab your resume / Handshake profile? We're moving quickly on ${input.internOrFullTime === 'intern' ? `our ${input.targetStartDate ? new Date(input.targetStartDate).getFullYear() : 'upcoming'} intern cohort` : 'these roles'} so I'll follow up with you directly by [date]."`,
        ``,
        `[TIP] Adapt the pitch for each candidate — reference their major, a project they mention, or their target company type. Generic pitches lose candidates in 10 seconds at a busy fair.`,
    ].join('\n');
}

function buildFollowUpEmails(input: CareerFairInput): CareerFairPackage['followUpEmailTemplates'] {
    const within = '48 hours';
    const rolesSummary = input.targetRoles.slice(0, 2).join(' / ');

    const fastTrack = [
        `Subject: Great meeting you at ${input.fairName} — next steps for ${rolesSummary} at ${input.companyName}`,
        ``,
        `Hi [Candidate Name],`,
        ``,
        `It was genuinely great meeting you at ${input.fairName} today. Your background in [specific detail from conversation] stood out, and I'd love to move quickly.`,
        ``,
        `I'd like to invite you to a ${input.internOrFullTime === 'intern' ? '20-minute recruiter screen' : '30-minute intro call'} this week. Here are a few times that work for me — please pick one:`,
        ``,
        `- [TIME SLOT 1]`,
        `- [TIME SLOT 2]`,
        `- [TIME SLOT 3]`,
        ``,
        `Or book directly here: [CALENDLY / SCHEDULING LINK]`,
        ``,
        `I look forward to chatting!`,
        ``,
        `${input.recruiterName}`,
        `${input.companyName} | ${input.recruiterEmail}`,
    ].join('\n');

    const standard = [
        `Subject: Following up from ${input.fairName} — ${input.companyName}`,
        ``,
        `Hi [Candidate Name],`,
        ``,
        `Thanks for stopping by the ${input.companyName} booth at ${input.fairName}! It was great learning about your background.`,
        ``,
        `We have open ${input.internOrFullTime === 'intern' ? 'internship' : 'full-time'} roles in ${rolesSummary} that I think could be a great fit. I'd love to tell you more about what we're building.`,
        ``,
        `Please apply here: [APPLICATION LINK] — mention you met us at ${input.fairName} in your application so I can prioritise your resume.`,
        ``,
        `Feel free to reach out with any questions!`,
        ``,
        `${input.recruiterName}`,
        `${input.companyName} | ${input.recruiterEmail}`,
    ].join('\n');

    const nurture = [
        `Subject: Great to meet you at ${input.fairName}`,
        ``,
        `Hi [Candidate Name],`,
        ``,
        `It was a pleasure meeting you at ${input.fairName}. We don't have a perfect opening for your background right now, but I've added your details to our talent community.`,
        ``,
        `We regularly post new roles at [CAREERS PAGE URL] — I'd encourage you to keep an eye out, and don't hesitate to reach back out when you're closer to your graduation / next move.`,
        ``,
        `Best of luck with [specific thing mentioned — e.g. "your final year project / upcoming internship search"]!`,
        ``,
        `${input.recruiterName}`,
        `${input.companyName} | ${input.recruiterEmail}`,
    ].join('\n');

    return { fastTrack, standard, nurture };
}

export function buildCareerFairPackage(input: CareerFairInput): CareerFairPackage {
    const isVirtual = input.fairType === 'virtual';
    const isUniversity = input.fairType === 'university';

    const preEventChecklist: { section: string; items: string[] }[] = [
        {
            section: 'Logistics (T-14 days)',
            items: [
                `Confirm registration and booth/slot: #${input.boothNumber ?? '[TBC]'} at ${input.fairName}`,
                `Book travel and accommodation for attendees: ${input.attendees.join(', ')}`,
                `Confirm virtual platform access (if applicable): ${input.virtualPlatform ?? 'N/A'}`,
                'Order branded swag and collateral (allow 10 business days for shipping)',
                `Print ${input.headcountTarget * 5} copies of role one-pagers for: ${input.targetRoles.join(', ')}`,
                'Create a QR code linking to the application portal / Handshake page',
                isUniversity ? 'Contact university careers office to confirm room map and setup time' : 'Confirm exhibitor pack from organiser',
            ],
        },
        {
            section: 'Content & Materials (T-7 days)',
            items: [
                'Finalise elevator pitch script (practice until it feels natural, not scripted)',
                'Build or refresh the company slide deck (5 slides max: mission, product, culture, roles, benefits)',
                'Prepare role-specific one-pagers with QR codes linking to each JD',
                'Set up Handshake / fair platform profile with current open roles',
                'Brief all booth attendees on: talking points, roles available, and what a "strong" candidate looks like',
                'Prepare candidate eval sheets (paper or digital form) — one per candidate met',
                'Set up a shared folder / ATS tag for "Fair: ' + input.fairName + '" to track contacts',
            ],
        },
        {
            section: 'Day Before',
            items: [
                'Pack: eval sheets, role one-pagers, swag, laptop/tablet, business cards, QR code cards',
                isVirtual ? 'Test virtual booth: video, audio, screen share, chat' : 'Confirm booth setup time and load-in logistics',
                'Brief team on the day schedule and role split (who pitches, who screens, who collects resumes)',
                'Prepare a backup contact capture method (paper sign-up sheet, personal Handshake messages)',
                `Review target headcount: ${input.headcountTarget} hires from this fair`,
            ],
        },
    ];

    const boothSetupChecklist = isVirtual
        ? [
            'Log in 30 minutes early to test booth video/audio/chat',
            'Share screen with company slide deck ready',
            'Have application link and Handshake profile URL in clipboard for instant pasting',
            'Open a fresh eval sheet (digital) for each conversation',
            'Set a timer for conversations — aim for 5–7 min per candidate to maximise reach',
          ]
        : [
            'Arrive at setup time — leave nothing to the last 30 minutes',
            `Booth number: ${input.boothNumber ?? '[TBC]'} — confirm location on floor plan`,
            'Set up banner / pop-up display at eye level',
            'Place role one-pagers and QR code cards at front of table (within grabbing distance)',
            'Arrange swag visibly — draws candidates over even when you are mid-conversation',
            'Test any tech (laptop, tablet, QR codes) before the fair opens',
            'Designate one person to always be "free" to greet — never leave the booth unmanned',
            'Keep water and snacks on hand — career fairs are long',
          ];

    const candidateEvalSheetTemplate: CandidateEvalEntry = {
        name: '',
        university: '',
        major: '',
        gradYear: '',
        rating: '3-maybe',
        notes: '',
        resumeCollected: false,
        followUpAction: 'standard_process',
    };

    const postFairDebriefQuestions = [
        'How many candidates did we speak with in total?',
        'How many rated "1-strong" or "2-good"? How does this compare to our target?',
        'Which roles had the most interest? Which had the least?',
        'Which universities / disciplines produced the strongest candidates?',
        'What questions did candidates ask most often? Do we need better answers ready?',
        'What did competing employers say or offer that generated buzz?',
        'What swag / collateral performed best (what did candidates actually take)?',
        'What would we do differently next time?',
        'Should we sponsor / attend this fair again? ROI verdict?',
    ];

    const roiMetricsToTrack = [
        `Candidates met: [track in eval sheet]`,
        `Resumes / profiles collected: [count]`,
        `"Strong" rated candidates: [count] / target ${input.headcountTarget}`,
        `Applications submitted within 7 days of fair: [count from ATS, tag "Fair: ${input.fairName}"]`,
        `Phone screens booked within 14 days: [count]`,
        `Offers extended from this pipeline: [count]`,
        `Hires from this fair: [count] / cost-per-hire = total event cost ÷ hires`,
        `Time-to-fill for fair-sourced candidates vs. other channels: [compare in ATS]`,
    ];

    const hiringTimeline = [
        `**${input.fairName} — Hiring Timeline**`,
        ``,
        `| Milestone | Target Date |`,
        `|-----------|-------------|`,
        `| Career fair date | ${input.date} |`,
        `| Follow-up emails sent | Within 48 hours of fair |`,
        `| Fast-track screens complete | ${input.date} + 7 days |`,
        `| Standard applicant review | ${input.date} + 14 days |`,
        `| Technical / final round interviews | ${input.date} + 21–35 days |`,
        `| Offers extended | ${input.date} + 42 days |`,
        `| Offer deadline | ${input.date} + 56 days |`,
        input.targetStartDate ? `| Target start date | ${input.targetStartDate} |` : `| Start date | [TBC] |`,
    ].join('\n');

    const complianceNotes = [
        'Collect resumes / data only from candidates who voluntarily provide them — do not scrape event attendee lists.',
        'Retain candidate data in your ATS only — do not store in personal spreadsheets or email (GDPR/CCPA risk).',
        isUniversity ? 'Honour any university recruiting guidelines or recruiting timelines (e.g. NACE principles for on-campus recruiting).' : null,
        'Do not ask candidates about graduation year in a way that could reveal age — focus on graduation date, not birth year.',
        'If recording virtual sessions, obtain explicit consent before recording.',
        'Equal opportunity: engage with all candidates equitably — bias in fair engagement is covered by EEOC guidelines.',
    ].filter(Boolean) as string[];

    return {
        fairName: input.fairName,
        date: input.date,
        companyName: input.companyName,
        organizer: input.organizer,
        preEventChecklist,
        boothSetupChecklist,
        elevatorPitchScript: buildElevatorPitch(input),
        candidateEvalSheetTemplate,
        followUpEmailTemplates: buildFollowUpEmails(input),
        postFairDebriefQuestions,
        roiMetricsToTrack,
        hiringTimeline,
        complianceNotes,
    };
}

// ===========================================================================
// 2. BULK PIPELINE PROCESSOR
// ===========================================================================

export interface BulkCandidateInput {
    id?: string;
    name: string;
    email: string;
    resumeText: string;
    source?: string;            // 'handshake' | 'linkedin' | 'direct' | 'referral' | 'fair'
    university?: string;
    gpa?: number;
    graduationDate?: string;    // ISO date
    salaryExpectation?: number;
}

export interface BulkScreenInput {
    candidates: BulkCandidateInput[];
    jobTitle: string;
    industry?: string;
    requiredQualifications: string[];
    niceToHaveQualifications?: string[];
    minYearsExperience?: number;
    salaryBudgetMax?: number;
    dealBreakerKeywords?: string[];
    bonusCredentialIds?: string[];
    blindScreen?: boolean;
    maxShortlist?: number;          // cap shortlist; default 20
    autoRejectThreshold?: number;   // score below this → auto-reject; default 30
}

export interface BulkScreenedCandidate {
    rank: number;
    id: string;
    name: string;
    email: string;
    university?: string;
    source?: string;
    score: number;
    verdict: ScreeningVerdict;
    strengths: string[];
    gaps: string[];
    credentialGaps: string[];
    recommendedAction: string;
    wasAnonymized: boolean;
}

export interface BulkScreenResult {
    jobTitle: string;
    totalReceived: number;
    totalProcessed: number;
    processingErrors: number;
    verdictBreakdown: Record<ScreeningVerdict, number>;
    shortlist: BulkScreenedCandidate[];
    maybes: BulkScreenedCandidate[];
    autoRejected: { name: string; email: string; reason: string }[];
    cohortInsights: string[];
    sourceBreakdown: Record<string, number>;
    universityBreakdown: Record<string, number>;
    nextSteps: string[];
    processingNotes: string[];
}

export function bulkScreenCandidates(input: BulkScreenInput): BulkScreenResult {
    const autoRejectThreshold = input.autoRejectThreshold ?? 30;
    const maxShortlist        = input.maxShortlist ?? 20;

    const verdictBreakdown: Record<ScreeningVerdict, number> = {
        strong_yes: 0, yes: 0, maybe: 0, no: 0, hard_no: 0,
    };

    const shortlistRaw: BulkScreenedCandidate[] = [];
    const maybesRaw:    BulkScreenedCandidate[] = [];
    const autoRejected: BulkScreenResult['autoRejected'] = [];
    const sourceBreakdown:     Record<string, number> = {};
    const universityBreakdown: Record<string, number> = {};
    const processingNotes: string[] = [];
    let processingErrors = 0;

    for (let i = 0; i < input.candidates.length; i++) {
        const c = input.candidates[i];
        if (!c) continue;

        // Track source and university
        const src = c.source ?? 'unknown';
        sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
        if (c.university) {
            universityBreakdown[c.university] = (universityBreakdown[c.university] ?? 0) + 1;
        }

        let result;
        try {
            const screenInput: ResumeScreenInput = {
                candidateName:           c.name,
                resumeText:              c.resumeText,
                jobTitle:                input.jobTitle,
                industry:                input.industry,
                requiredQualifications:  input.requiredQualifications,
                niceToHaveQualifications: input.niceToHaveQualifications,
                minYearsExperience:      input.minYearsExperience,
                salaryExpectation:       c.salaryExpectation,
                salaryBudgetMax:         input.salaryBudgetMax,
                dealBreakerKeywords:     input.dealBreakerKeywords,
                bonusCredentialIds:      input.bonusCredentialIds,
                blindScreen:             input.blindScreen,
            };
            result = screenResume(screenInput);
        } catch (err) {
            processingErrors++;
            processingNotes.push(`Error processing candidate ${c.name}: ${String(err)}`);
            continue;
        }

        verdictBreakdown[result.verdict]++;

        const screened: BulkScreenedCandidate = {
            rank:             0, // assigned after sort
            id:               c.id ?? `bulk-${i + 1}`,
            name:             c.name,
            email:            c.email,
            university:       c.university,
            source:           c.source,
            score:            result.overallScore,
            verdict:          result.verdict,
            strengths:        result.strengths,
            gaps:             result.gaps,
            credentialGaps:   result.credentialGaps,
            recommendedAction: result.recommendedAction,
            wasAnonymized:    result.wasAnonymized,
        };

        if (result.overallScore < autoRejectThreshold || result.verdict === 'hard_no') {
            autoRejected.push({
                name:  c.name,
                email: c.email,
                reason: result.verdict === 'hard_no'
                    ? result.gaps[0] ?? 'Hard no — deal-breaker or credential block'
                    : `Score ${result.overallScore}/100 — below auto-reject threshold of ${autoRejectThreshold}`,
            });
        } else if (result.verdict === 'maybe' || result.verdict === 'no') {
            maybesRaw.push(screened);
        } else {
            shortlistRaw.push(screened);
        }
    }

    // Sort and rank
    shortlistRaw.sort((a, b) => b.score - a.score);
    maybesRaw.sort((a, b) => b.score - a.score);

    const shortlist = shortlistRaw.slice(0, maxShortlist).map((c, i) => ({ ...c, rank: i + 1 }));
    const maybes    = maybesRaw.map((c, i) => ({ ...c, rank: i + 1 }));

    // Cohort insights
    const cohortInsights: string[] = [];
    const total = input.candidates.length;
    const qualifiedPct = pct(shortlistRaw.length, total);
    const avgScore = total > 0
        ? Math.round([...shortlistRaw, ...maybesRaw].reduce((s, c) => s + c.score, 0) / Math.max(1, shortlistRaw.length + maybesRaw.length))
        : 0;

    cohortInsights.push(`${qualifiedPct}% of candidates (${shortlistRaw.length}/${total}) meet the threshold for shortlisting.`);
    cohortInsights.push(`Average score among non-rejected candidates: ${avgScore}/100.`);

    if (qualifiedPct < 20) {
        cohortInsights.push('Low qualification rate — consider broadening the sourcing pool or revisiting minimum requirements.');
    }
    if (qualifiedPct > 60) {
        cohortInsights.push('High qualification rate — consider raising the bar or adding a more discriminating screening question.');
    }

    const topSource = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1])[0];
    if (topSource) {
        cohortInsights.push(`Largest candidate source: "${topSource[0]}" (${topSource[1]} candidates).`);
    }

    const topUniversity = Object.entries(universityBreakdown).sort((a, b) => b[1] - a[1])[0];
    if (topUniversity) {
        cohortInsights.push(`Most represented university: ${topUniversity[0]} (${topUniversity[1]} candidates).`);
    }

    if (verdictBreakdown['strong_yes'] === 0) {
        cohortInsights.push('No "strong yes" candidates in this batch — review if job requirements are set too high, or expand sourcing.');
    }

    if (input.blindScreen) {
        cohortInsights.push('Blind screening was active — PII was stripped before scoring. Reveal candidate identities only after shortlist is finalised to minimise unconscious bias.');
    }

    const nextSteps = [
        `Review the ${shortlist.length} shortlisted candidates and confirm top ${Math.min(shortlist.length, 10)} with the hiring manager.`,
        `Send bulk acknowledgement email to all ${total} applicants within 5 business days (legal requirement in some jurisdictions).`,
        `For the ${autoRejected.length} auto-rejected candidates — queue rejection emails via workspace_rec_compose_rejection.`,
        maybes.length > 0 ? `Review ${maybes.length} "maybe" candidates manually — some may be worth a phone screen.` : null,
        'Log all screening decisions in the ATS for EEOC/adverse impact record-keeping.',
        input.blindScreen ? 'Unblind candidate names only after shortlist is confirmed to preserve bias reduction.' : null,
    ].filter(Boolean) as string[];

    return {
        jobTitle:         input.jobTitle,
        totalReceived:    total,
        totalProcessed:   total - processingErrors,
        processingErrors,
        verdictBreakdown,
        shortlist,
        maybes,
        autoRejected,
        cohortInsights,
        sourceBreakdown,
        universityBreakdown,
        nextSteps,
        processingNotes,
    };
}

// ===========================================================================
// 3. INTERN PROGRAMME TRACKER
// ===========================================================================

export type InternSeason = 'summer' | 'fall' | 'spring' | 'winter' | 'year_round';
export type InternStatus =
    | 'offer_extended' | 'offer_accepted' | 'pre_start'
    | 'active' | 'completed' | 'withdrew' | 'no_show' | 'terminated';
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface InternMilestone {
    id: string;
    name: string;
    dueWeek: number;            // weeks from programme start date
    owner: 'intern' | 'manager' | 'hr' | 'recruiter';
    status: MilestoneStatus;
    notes?: string;
}

export interface Intern {
    id: string;
    name: string;
    email: string;
    university: string;
    major: string;
    graduationYear: number;
    team: string;
    managerName: string;
    status: InternStatus;
    startDate: string;          // ISO date
    endDate: string;            // ISO date
    milestones: InternMilestone[];
    midtermRating?: number;     // 1–5
    finalRating?: number;       // 1–5
    returnOfferExtended?: boolean;
    returnOfferAccepted?: boolean;
    returnOfferRole?: string;
    returnOfferStartDate?: string;
    notes?: string;
}

export interface InternCohortInput {
    companyName: string;
    season: InternSeason;
    year: number;
    programName?: string;
    programmeManagerName?: string;
    interns: Intern[];
    returnOfferTargetPct?: number;   // % of completing interns to receive return offer; default 70
    currentDate?: string;            // ISO date; defaults to today for milestone calculations
}

export interface OverdueMilestoneAlert {
    internName: string;
    internId: string;
    milestoneName: string;
    dueWeek: number;
    owner: InternMilestone['owner'];
}

export interface UpcomingMilestone {
    internName: string;
    internId: string;
    milestoneName: string;
    dueWeek: number;
    daysUntilDue: number;
    owner: InternMilestone['owner'];
}

export interface ReturnOfferCandidate {
    internId: string;
    internName: string;
    university: string;
    major: string;
    team: string;
    managerName: string;
    finalRating?: number;
    midtermRating?: number;
    returnOfferExtended: boolean;
    returnOfferAccepted?: boolean;
    suggestedRole?: string;
}

export interface InternCohortReport {
    companyName: string;
    programName: string;
    season: InternSeason;
    year: number;
    generatedDate: string;
    cohortSize: number;
    statusBreakdown: Record<InternStatus, number>;
    activeCount: number;
    completedCount: number;
    attritionCount: number;
    attritionRate: number;          // %
    overdueAlerts: OverdueMilestoneAlert[];
    upcomingMilestones: UpcomingMilestone[];
    returnOfferStats: {
        eligible: number;
        extended: number;
        accepted: number;
        declined: number;
        pending: number;
        conversionRate: number;     // % of eligible who accepted
        offerRate: number;          // % of eligible who received offer
        targetPct: number;
        onTarget: boolean;
    };
    avgMidtermRating: number;
    avgFinalRating: number;
    universityBreakdown: Record<string, number>;
    teamBreakdown: Record<string, number>;
    topUniversities: string[];
    returnOfferCandidates: ReturnOfferCandidate[];
    programHealthScore: number;     // 0–100
    healthSummary: string;
    recommendations: string[];
}

// Default milestone template for a 12-week internship
function defaultMilestones(startDate: string): InternMilestone[] {
    return [
        { id: 'm1',  name: 'Day 1 onboarding complete',            dueWeek: 1,  owner: 'hr',      status: 'not_started' },
        { id: 'm2',  name: 'System access & tools provisioned',    dueWeek: 1,  owner: 'hr',      status: 'not_started' },
        { id: 'm3',  name: 'Project brief received and agreed',    dueWeek: 2,  owner: 'manager', status: 'not_started' },
        { id: 'm4',  name: '30-day check-in with recruiter',       dueWeek: 4,  owner: 'recruiter', status: 'not_started' },
        { id: 'm5',  name: 'Midterm self-assessment submitted',    dueWeek: 6,  owner: 'intern',  status: 'not_started' },
        { id: 'm6',  name: 'Midterm manager rating completed',     dueWeek: 6,  owner: 'manager', status: 'not_started' },
        { id: 'm7',  name: 'Midterm feedback session held',        dueWeek: 7,  owner: 'manager', status: 'not_started' },
        { id: 'm8',  name: 'Return offer decision made by manager', dueWeek: 10, owner: 'manager', status: 'not_started' },
        { id: 'm9',  name: 'Final project presentation delivered', dueWeek: 11, owner: 'intern',  status: 'not_started' },
        { id: 'm10', name: 'Final manager rating completed',       dueWeek: 12, owner: 'manager', status: 'not_started' },
        { id: 'm11', name: 'Return offer extended (if applicable)', dueWeek: 12, owner: 'recruiter', status: 'not_started' },
        { id: 'm12', name: 'Exit survey submitted',                dueWeek: 12, owner: 'intern',  status: 'not_started' },
    ];
}

export { defaultMilestones as buildDefaultInternMilestones };

export function buildInternCohortReport(input: InternCohortInput): InternCohortReport {
    const today = input.currentDate ? new Date(input.currentDate) : new Date();
    const programName = input.programName ?? `${input.companyName} ${input.season.charAt(0).toUpperCase() + input.season.slice(1)} ${input.year} Internship Programme`;
    const returnOfferTargetPct = input.returnOfferTargetPct ?? 70;

    // Status breakdown
    const statusBreakdown: Record<InternStatus, number> = {
        offer_extended: 0, offer_accepted: 0, pre_start: 0,
        active: 0, completed: 0, withdrew: 0, no_show: 0, terminated: 0,
    };
    for (const intern of input.interns) {
        statusBreakdown[intern.status] = (statusBreakdown[intern.status] ?? 0) + 1;
    }

    const activeCount    = statusBreakdown['active'] ?? 0;
    const completedCount = statusBreakdown['completed'] ?? 0;
    const attritionCount = (statusBreakdown['withdrew'] ?? 0) + (statusBreakdown['no_show'] ?? 0) + (statusBreakdown['terminated'] ?? 0);
    const startedCount   = activeCount + completedCount + attritionCount;
    const attritionRate  = pct(attritionCount, startedCount);

    // University and team breakdowns
    const universityBreakdown: Record<string, number> = {};
    const teamBreakdown:       Record<string, number> = {};
    for (const intern of input.interns) {
        universityBreakdown[intern.university] = (universityBreakdown[intern.university] ?? 0) + 1;
        teamBreakdown[intern.team] = (teamBreakdown[intern.team] ?? 0) + 1;
    }
    const topUniversities = Object.entries(universityBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([u]) => u);

    // Milestone health
    const overdueAlerts:    OverdueMilestoneAlert[] = [];
    const upcomingMilestones: UpcomingMilestone[] = [];

    for (const intern of input.interns) {
        if (intern.status !== 'active') continue;
        const internStart = new Date(intern.startDate);

        for (const ms of intern.milestones) {
            const msDueDate = new Date(internStart);
            msDueDate.setDate(msDueDate.getDate() + ms.dueWeek * 7);
            const daysUntilDue = Math.round((msDueDate.getTime() - today.getTime()) / 86400000);

            if (ms.status !== 'completed') {
                if (daysUntilDue < 0) {
                    overdueAlerts.push({
                        internName:    intern.name,
                        internId:      intern.id,
                        milestoneName: ms.name,
                        dueWeek:       ms.dueWeek,
                        owner:         ms.owner,
                    });
                } else if (daysUntilDue <= 14) {
                    upcomingMilestones.push({
                        internName:    intern.name,
                        internId:      intern.id,
                        milestoneName: ms.name,
                        dueWeek:       ms.dueWeek,
                        daysUntilDue,
                        owner:         ms.owner,
                    });
                }
            }
        }
    }

    upcomingMilestones.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    // Ratings
    const midtermRatings = input.interns.map(i => i.midtermRating).filter((r): r is number => r !== undefined);
    const finalRatings   = input.interns.map(i => i.finalRating).filter((r): r is number => r !== undefined);
    const avgMidtermRating = midtermRatings.length > 0
        ? Math.round((midtermRatings.reduce((s, r) => s + r, 0) / midtermRatings.length) * 10) / 10
        : 0;
    const avgFinalRating = finalRatings.length > 0
        ? Math.round((finalRatings.reduce((s, r) => s + r, 0) / finalRatings.length) * 10) / 10
        : 0;

    // Return offer stats
    const eligible  = input.interns.filter(i => i.status === 'completed' || i.status === 'active').length;
    const extended  = input.interns.filter(i => i.returnOfferExtended === true).length;
    const accepted  = input.interns.filter(i => i.returnOfferAccepted === true).length;
    const declined  = input.interns.filter(i => i.returnOfferExtended === true && i.returnOfferAccepted === false).length;
    const pending   = extended - accepted - declined;
    const conversionRate = pct(accepted, extended);
    const offerRate      = pct(extended, eligible);

    const returnOfferStats = {
        eligible, extended, accepted, declined, pending,
        conversionRate, offerRate,
        targetPct: returnOfferTargetPct,
        onTarget:  offerRate >= returnOfferTargetPct,
    };

    // Return offer candidate list (for action tracking)
    const returnOfferCandidates: ReturnOfferCandidate[] = input.interns
        .filter(i => (i.status === 'active' || i.status === 'completed') && !i.returnOfferExtended)
        .map(i => ({
            internId:             i.id,
            internName:           i.name,
            university:           i.university,
            major:                i.major,
            team:                 i.team,
            managerName:          i.managerName,
            finalRating:          i.finalRating,
            midtermRating:        i.midtermRating,
            returnOfferExtended:  false,
            returnOfferAccepted:  undefined,
            suggestedRole:        i.returnOfferRole,
        }))
        .sort((a, b) => (b.finalRating ?? 0) - (a.finalRating ?? 0));

    // Programme health score (0–100)
    let healthScore = 100;
    if (attritionRate > 10) healthScore -= 15;
    if (attritionRate > 20) healthScore -= 15;
    if (overdueAlerts.length > 0) healthScore -= Math.min(overdueAlerts.length * 5, 25);
    if (avgFinalRating > 0 && avgFinalRating < 3) healthScore -= 20;
    if (!returnOfferStats.onTarget && eligible > 0) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Recommendations
    const recommendations: string[] = [];
    if (overdueAlerts.length > 0) {
        const byOwner = overdueAlerts.reduce((acc, a) => { acc[a.owner] = (acc[a.owner] ?? 0) + 1; return acc; }, {} as Record<string, number>);
        const worstOwner = Object.entries(byOwner).sort((a, b) => b[1] - a[1])[0];
        recommendations.push(`${overdueAlerts.length} overdue milestone${overdueAlerts.length > 1 ? 's' : ''} — chase ${worstOwner?.[0] ?? 'owners'} immediately (${worstOwner?.[1]} overdue).`);
    }
    if (attritionRate > 10) recommendations.push(`Attrition rate is ${attritionRate}% — debrief withdrew/terminated interns to identify programme gaps.`);
    if (!returnOfferStats.onTarget && eligible > 0) {
        recommendations.push(`Return offer rate (${offerRate}%) is below target (${returnOfferTargetPct}%) — coordinate with managers on outstanding return-offer decisions.`);
    }
    if (avgFinalRating > 0 && avgFinalRating < 3.5) {
        recommendations.push(`Average final rating is ${avgFinalRating}/5 — review project quality and manager engagement for under-performing interns.`);
    }
    if (upcomingMilestones.filter(m => m.daysUntilDue <= 7).length > 0) {
        recommendations.push(`${upcomingMilestones.filter(m => m.daysUntilDue <= 7).length} milestone(s) due within 7 days — send reminders to owners today.`);
    }
    if (recommendations.length === 0) recommendations.push('Programme is on track — no critical actions required at this time.');

    const healthLabel = healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Needs attention' : 'At risk';
    const healthSummary = [
        `**Programme Health: ${healthScore}/100 — ${healthLabel}**`,
        `Cohort: ${input.interns.length} interns | Active: ${activeCount} | Completed: ${completedCount} | Attrition: ${attritionCount} (${attritionRate}%)`,
        `Return offers: ${extended} extended / ${accepted} accepted (${conversionRate}% conversion) | Target: ${returnOfferTargetPct}% ${returnOfferStats.onTarget ? '✓' : '⚠️ below target'}`,
        `Avg ratings: Midterm ${avgMidtermRating || 'N/A'}/5 | Final ${avgFinalRating || 'N/A'}/5`,
        overdueAlerts.length > 0 ? `🔴 ${overdueAlerts.length} overdue milestone(s) require immediate action` : '✓ No overdue milestones',
    ].join('\n');

    return {
        companyName:       input.companyName,
        programName,
        season:            input.season,
        year:              input.year,
        generatedDate:     today.toISOString().split('T')[0]!,
        cohortSize:        input.interns.length,
        statusBreakdown,
        activeCount,
        completedCount,
        attritionCount,
        attritionRate,
        overdueAlerts,
        upcomingMilestones,
        returnOfferStats,
        avgMidtermRating,
        avgFinalRating,
        universityBreakdown,
        teamBreakdown,
        topUniversities,
        returnOfferCandidates,
        programHealthScore: healthScore,
        healthSummary,
        recommendations,
    };
}

// ===========================================================================
// 4. SEASONAL BATCH PROCESSOR
// ===========================================================================

export type HiringSeason = 'summer' | 'holiday' | 'back_to_school' | 'spring' | 'year_round';
export type SeasonalIndustry =
    | 'retail' | 'hospitality' | 'logistics_warehousing' | 'agriculture'
    | 'tourism_leisure' | 'education' | 'healthcare' | 'manufacturing' | 'general';

export interface SeasonalRole {
    title: string;
    headcount: number;
    location: string;
    minAge?: number;
    payRate?: number;
    payCurrency?: string;
    payFrequency?: 'hourly' | 'daily' | 'weekly';
    shiftPattern?: string;       // e.g. "5-day rotating", "weekend only", "nights"
    fixedTermWeeks?: number;     // null = casual / ongoing
}

export interface SeasonalBatchInput {
    companyName: string;
    season: HiringSeason;
    industry: SeasonalIndustry;
    rolesToFill: SeasonalRole[];
    targetStartDate: string;        // ISO date
    targetEndDate?: string;         // for fixed-term seasonal roles
    hiringManagerName: string;
    recruiterName: string;
    recruiterEmail: string;
    screeningCriteria?: string[];
    prevYearHireCount?: number;     // to benchmark
    prevYearAttrition?: number;     // % for buffer calculation
    useAgencyStaffing?: boolean;
}

export interface HiringWeekMilestone {
    label: string;          // e.g. "Week -8"
    weekOffset: number;     // negative = before start date
    activities: string[];
}

export interface SeasonalBatchResult {
    companyName: string;
    season: HiringSeason;
    industry: SeasonalIndustry;
    totalHeadcount: number;
    recommendedPostingHeadcount: number;    // inflated by attrition buffer
    hiringCalendar: HiringWeekMilestone[];
    jobPostingTemplates: { role: string; body: string }[];
    bulkScreeningCriteria: string[];
    groupInterviewGuide: string;
    bulkOfferProcess: string[];
    onboardingBatchPlan: string[];
    complianceReminders: string[];
    costEstimateNotes: string[];
    agencyNotes?: string;
}

const SEASON_LABELS: Record<HiringSeason, string> = {
    summer:          'Summer',
    holiday:         'Holiday / Peak Season',
    back_to_school:  'Back-to-School',
    spring:          'Spring',
    year_round:      'Year-Round Rolling',
};

const INDUSTRY_SCREENING: Record<SeasonalIndustry, string[]> = {
    retail: [
        'Availability to work weekends, evenings, and peak trading days (Black Friday, Christmas Eve)',
        'Customer-facing experience preferred',
        'Comfortable standing for extended periods',
        'Cash handling or POS experience (preferred)',
    ],
    hospitality: [
        'Food safety / hygiene certificate (or willingness to obtain within 2 weeks of start)',
        'Availability including split shifts, weekends, and public holidays',
        'Customer service experience preferred',
        'Physical fitness for kitchen or front-of-house roles',
    ],
    logistics_warehousing: [
        'Ability to lift up to [X] kg unassisted',
        'Forklift licence (if applicable — specify class)',
        'Availability for night shifts and weekend working',
        'Steel-toe boots and high-vis PPE (employer-supplied or candidate-owned)',
    ],
    agriculture: [
        'Physical fitness for outdoor manual work in all weather conditions',
        'Driving licence and own transport (rural locations)',
        'Pesticide handling certificate (if applicable)',
        'Available for early morning starts',
    ],
    tourism_leisure: [
        'First Aid / CPR certification (lifeguards, activity instructors)',
        'Customer-facing experience',
        'Flexibility for shift work during school holidays and bank holidays',
        'Language skills (where relevant for tourist-facing roles)',
    ],
    education: [
        'Enhanced DBS check / fingerprint clearance (UK/US)',
        'Relevant teaching, tutoring, or care qualification',
        'Safeguarding awareness training (or willingness to complete before start)',
        'Patience and communication skills for student-facing roles',
    ],
    healthcare: [
        'Active clinical registration / licence in state/country of hire',
        'BLS / CPR certification current',
        'Availability for 12-hour shifts, nights, and holiday working',
        'Enhanced background check including OIG exclusion screen',
    ],
    manufacturing: [
        'Health and safety induction completion within first week',
        'Ability to stand and operate machinery for extended periods',
        'Quality control awareness (ISO / GMP depending on sector)',
        'Availability for rotating shifts',
    ],
    general: [
        'Flexibility to work additional hours during peak periods',
        'Basic competency in role-relevant tools or equipment',
        'References from two previous employers or academic referees',
    ],
};

function buildJobPostingTemplate(role: SeasonalRole, input: SeasonalBatchInput): string {
    const pay = role.payRate
        ? `${role.payCurrency ?? '$'}${role.payRate} per ${role.payFrequency ?? 'hour'}`
        : '[COMPETITIVE PAY — specify rate]';
    const duration = role.fixedTermWeeks
        ? `Fixed-term contract: ${role.fixedTermWeeks} weeks (${input.targetStartDate} to ${input.targetEndDate ?? '[END DATE]'})`
        : 'Casual / ongoing position';

    return [
        `**${role.title} — ${SEASON_LABELS[input.season]}**`,
        `**Location:** ${role.location}`,
        `**Company:** ${input.companyName}`,
        `**Pay:** ${pay}${role.shiftPattern ? ` | Shift: ${role.shiftPattern}` : ''}`,
        `**Contract:** ${duration}`,
        role.minAge ? `**Minimum age:** ${role.minAge}` : null,
        ``,
        `**About the role:**`,
        `We're hiring ${role.headcount} ${role.title}${role.headcount > 1 ? 's' : ''} to join our ${SEASON_LABELS[input.season].toLowerCase()} team at ${role.location}. ${input.season === 'holiday' ? 'This is a fast-paced, high-energy role over our busiest trading period.' : input.season === 'summer' ? 'This is a great opportunity to gain valuable work experience over the summer.' : 'This is a great opportunity to join our team.'}`,
        ``,
        `**What you'll do:**`,
        `- [List 3–5 key responsibilities specific to the role]`,
        ``,
        `**What we're looking for:**`,
        ...(INDUSTRY_SCREENING[input.industry] ?? INDUSTRY_SCREENING['general']).map(c => `- ${c}`),
        ...(input.screeningCriteria ?? []).map(c => `- ${c}`),
        ``,
        `**What we offer:**`,
        `- ${pay}`,
        `- [Any additional benefits: meal allowance, travel, staff discount, etc.]`,
        `- A great team environment and a reference for strong performers`,
        ``,
        `**How to apply:**`,
        `Apply online at [APPLICATION LINK] or contact ${input.recruiterName} at ${input.recruiterEmail}.`,
        `We review applications on a rolling basis — apply early as positions fill quickly.`,
        ``,
        `*${input.companyName} is an equal opportunity employer. We welcome applications from all backgrounds.*`,
    ].filter(l => l !== null).join('\n');
}

function buildGroupInterviewGuide(input: SeasonalBatchInput): string {
    const totalHC = input.rolesToFill.reduce((s, r) => s + r.headcount, 0);

    return [
        `## Group Interview Guide — ${SEASON_LABELS[input.season]} Hiring | ${input.companyName}`,
        ``,
        `### Format`,
        `Group interviews allow you to assess ${Math.min(totalHC * 3, 30)} candidates simultaneously in a structured 60–90 minute session. Ideal when hiring ${totalHC}+ people in a short window.`,
        ``,
        `**Recommended group size:** 8–15 candidates per session`,
        `**Duration:** 75 minutes`,
        `**Assessors:** ${Math.ceil(totalHC / 10) + 1} (1 lead interviewer + 1 observer per 8–10 candidates)`,
        ``,
        `### Agenda`,
        `| Time | Activity |`,
        `|------|----------|`,
        `| 0:00 | Welcome, housekeeping, company overview (10 min) |`,
        `| 0:10 | Group icebreaker activity (5 min) |`,
        `| 0:15 | Team challenge / role-play exercise (20 min) |`,
        `| 0:35 | Small group discussion — role-specific scenario (15 min) |`,
        `| 0:50 | Individual 1-to-1 mini-interviews (3 min per candidate) |`,
        `| 1:10 | Q&A — candidates ask questions (10 min) |`,
        `| 1:20 | Close and next steps |`,
        ``,
        `### Group exercises (pick one per session)`,
        `**Option A — Customer scenario:** Present a difficult customer situation relevant to the role. Observe who takes initiative, listens to others, and stays calm under pressure.`,
        `**Option B — Task prioritisation:** Give each group a list of 10 tasks. Ask them to rank by priority in 10 minutes. Observe reasoning, collaboration, and communication.`,
        `**Option C — Sales/service pitch:** Ask pairs to pitch a product/service to each other. Observe enthusiasm, confidence, and adaptability.`,
        ``,
        `### Scoring guide`,
        `Rate each candidate 1–3 on:`,
        `- **Communication:** Clear, confident, listens as well as speaks`,
        `- **Teamwork:** Collaborates well; not dominating or withdrawn`,
        `- **Role aptitude:** Shows understanding of / enthusiasm for what the job involves`,
        `- **Overall impression:** Would you want them representing the company to customers/colleagues?`,
        ``,
        `**Score 9–12 → Offer | 6–8 → Waitlist | <6 → Decline**`,
        ``,
        `### Legal reminders`,
        `- Do not ask about age, family status, disability, nationality, or religion during group sessions.`,
        `- Score based only on observable behaviours — not appearance, accent, or likeability.`,
        `- Keep scoring sheets for a minimum of 12 months (adverse impact defence).`,
        `- Provide reasonable adjustments on request (ADA / Equality Act).`,
    ].join('\n');
}

export function buildSeasonalBatchPlan(input: SeasonalBatchInput): SeasonalBatchResult {
    const totalHeadcount = input.rolesToFill.reduce((s, r) => s + r.headcount, 0);

    // Buffer for expected attrition before and during the season
    const attritionBuffer = input.prevYearAttrition
        ? Math.ceil(totalHeadcount * (1 + input.prevYearAttrition / 100))
        : Math.ceil(totalHeadcount * 1.20); // default 20% buffer
    const recommendedPostingHeadcount = attritionBuffer;

    // 8-week hiring calendar (weeks before start date)
    const hiringCalendar: HiringWeekMilestone[] = [
        {
            label: 'Week -8',
            weekOffset: -8,
            activities: [
                `Raise requisitions for ${totalHeadcount} headcount (+ ${recommendedPostingHeadcount - totalHeadcount} buffer) — approve through requisition-approver`,
                'Confirm budget, pay rates, and employment terms with finance and HR',
                'Brief hiring managers on timeline, role requirements, and group interview dates',
                input.useAgencyStaffing ? 'Engage staffing agency — send order with role specs, start date, and dress code' : 'Decide if any overflow roles will use agency staffing',
            ],
        },
        {
            label: 'Week -7',
            weekOffset: -7,
            activities: [
                'Post all roles on: ' + [
                    input.industry === 'retail' ? 'Indeed, LinkedIn, Snagajob, local community boards' :
                    input.industry === 'hospitality' ? 'Indeed, Caterer.com, Hosco, LinkedIn' :
                    input.industry === 'logistics_warehousing' ? 'Indeed, LinkedIn, Instawork, staffing agencies' :
                    'Indeed, LinkedIn, local job boards'
                ].join('; '),
                'Enable "Easy Apply" / quick application to maximise volume',
                'Set up ATS folder tagged "' + SEASON_LABELS[input.season] + ' ' + new Date(input.targetStartDate).getFullYear() + '"',
                'Schedule group interview slots: aim for 3–5 sessions over 2 weeks',
            ],
        },
        {
            label: 'Week -6',
            weekOffset: -6,
            activities: [
                'Begin application review — target same-day acknowledgement',
                'Auto-screen for deal-breakers: minimum age, right to work, availability',
                'Phone screen top candidates (target 5-minute availability / enthusiasm check)',
                'Invite first cohort to group interview sessions',
            ],
        },
        {
            label: 'Week -5',
            weekOffset: -5,
            activities: [
                'Run Group Interview Sessions 1 & 2',
                'Score candidates within 24 hours of each session',
                'Extend rolling offers to strong candidates — do not wait for all sessions to complete',
                'Begin right-to-work / eligibility document collection for accepted candidates',
            ],
        },
        {
            label: 'Week -4',
            weekOffset: -4,
            activities: [
                'Run Group Interview Sessions 3 & 4 (if needed)',
                'Track acceptance rate — if below 70%, re-advertise or increase pay rate',
                input.useAgencyStaffing ? 'Confirm agency headcount top-up for any shortfall' : 'Identify any shortfall and re-advertise or raise pay',
                'Collect and verify right-to-work documents for all accepted candidates',
                'Trigger background checks for roles that require them (healthcare, education)',
            ],
        },
        {
            label: 'Week -3',
            weekOffset: -3,
            activities: [
                'Close applications (or continue rolling if headcount not met)',
                'Issue offer letters / contracts — use fixed-term contract template for seasonal roles',
                'Begin bulk onboarding communications: welcome email, dress code, parking, schedule',
                'Book venue / arrange facilities for bulk Day-1 induction',
            ],
        },
        {
            label: 'Week -2',
            weekOffset: -2,
            activities: [
                'Confirm headcount: who has signed and returned contracts?',
                'Chase unsigned contracts — 48-hour deadline before removing from cohort',
                'Complete bulk uniform / equipment orders',
                'Prepare induction packs, health & safety briefing, and system access requests',
                'Brief team leaders and supervisors on new starter cohort and buddy assignments',
            ],
        },
        {
            label: 'Week -1',
            weekOffset: -1,
            activities: [
                'Send Day-1 logistics email to all confirmed starters',
                'Final headcount check — fill any last-minute drops with waitlist candidates',
                'Prepare group induction schedule and trainer roster',
                'Set up name badges, locker assignments, and system logins',
            ],
        },
        {
            label: 'Week 0 — Start Week',
            weekOffset: 0,
            activities: [
                'Run bulk Day-1 induction (health & safety, systems, culture, role overview)',
                'Deploy new starters to teams with supervisors or buddies',
                'Conduct a 48-hour check-in: flag any issues early',
                'Track Day-1 attendance — replace no-shows from waitlist immediately',
            ],
        },
    ];

    const jobPostingTemplates = input.rolesToFill.map(role => ({
        role: role.title,
        body: buildJobPostingTemplate(role, input),
    }));

    const bulkScreeningCriteria = [
        'Right to work in the country of hire — verify at offer stage',
        `Minimum age: ${input.rolesToFill.some(r => r.minAge) ? input.rolesToFill.filter(r => r.minAge).map(r => `${r.minAge}+ for ${r.title}`).join(', ') : 'no minimum specified'}`,
        `Availability for full ${SEASON_LABELS[input.season].toLowerCase()} period (${input.targetStartDate}${input.targetEndDate ? ' to ' + input.targetEndDate : ''})`,
        ...INDUSTRY_SCREENING[input.industry],
        ...(input.screeningCriteria ?? []),
    ];

    const bulkOfferProcess = [
        'Use a fixed-term offer letter template — do NOT use the permanent employment template',
        'State the start date, end date (if fixed-term), pay rate, and shift pattern explicitly',
        'Include a "right to work" condition precedent in all offer letters',
        'Set a 48-hour acceptance deadline — seasonal roles have high candidate drop-off after 72h',
        'Collect signed contracts BEFORE adding to the induction list',
        'Use DocuSign / e-signature for bulk contracts — send to all on same day',
        'Maintain a waitlist of "reserve" candidates to fill drop-outs without re-advertising',
        'Track: offers extended, offers accepted, offers declined, no-responses (per role, per location)',
    ];

    const onboardingBatchPlan = [
        `Run a group induction on the morning of ${input.targetStartDate} — do not drip individuals into teams without induction`,
        'Cover in Day-1 session: Health & Safety, Fire evacuation, Code of conduct, Role overview, System login, First-day buddy introduction',
        `Assign one team leader / buddy per ${Math.ceil(totalHeadcount / 5)} new starters`,
        'Provide a printed or digital first-week schedule to every starter',
        'Complete right-to-work document verification on Day 1 (I-9 Section 2 / UK RTW check)',
        'Run a Day-3 pulse check: flag anyone who looks at risk of leaving early',
        'Log all start data in the ATS / HRIS within 24 hours of start date',
    ];

    const complianceReminders = [
        'Fixed-term contracts: clearly state the end date and reason for being fixed-term (seasonal peak) — do not call it "temporary" if the fixed term is over 2 years (unfair dismissal risk in UK).',
        'Minimum wage: confirm all pay rates meet or exceed the national/regional minimum wage including for under-18s where applicable.',
        'Working time: seasonal workers are covered by Working Time Regulations / FLSA — maximum hours, mandatory rest breaks, and overtime rates apply.',
        'Child labour laws: if hiring under-18s, check jurisdiction-specific restrictions on hours, late-night working, and hazardous roles.',
        'Right to work: seasonal workers are just as subject to right-to-work checks as permanent staff — conduct checks on or before Day 1.',
        input.industry === 'healthcare' ? 'Healthcare workers: licence verification and OIG exclusion check must be completed BEFORE first patient contact — no exceptions.' : null,
        input.industry === 'education' ? 'Education workers: DBS / fingerprint clearance must be in place BEFORE first unsupervised contact with children — this is a legal requirement.' : null,
        'Redundancy / end of fixed term: provide the contractually required notice before the end of the season — do not simply stop scheduling a fixed-term worker without following the end-of-contract process.',
        'GDPR / data retention: retain seasonal worker records for the legally required period (typically 6 years in UK; varies by jurisdiction for US states).',
    ].filter(Boolean) as string[];

    const costEstimateNotes = [
        `Headcount to fill: ${totalHeadcount} (posting ${recommendedPostingHeadcount} to account for ~${Math.round(((recommendedPostingHeadcount - totalHeadcount) / totalHeadcount) * 100)}% expected pre-start attrition)`,
        `Job board costs: ${recommendedPostingHeadcount <= 20 ? 'budget £0–500 / $0–700 for sponsored posts on Indeed/LinkedIn' : 'budget £500–2,000 / $700–3,000 for sponsored multi-role campaigns'}`,
        input.useAgencyStaffing ? 'Agency staffing: typically 15–25% of annual equivalent salary per placed worker — negotiate a capped total-cost contract for seasonal volume' : null,
        'Group interview facilitation: ~2–3 recruiter-days per 50 candidates processed',
        'Bulk DBS / background checks (if applicable): budget £30–60 / candidate (UK DBS); $25–75 / candidate (US criminal check)',
        'Induction / training cost: typically 2–5 hours per starter — factor in trainer time and lost productive capacity on Day 1',
    ].filter(Boolean) as string[];

    return {
        companyName:                  input.companyName,
        season:                       input.season,
        industry:                     input.industry,
        totalHeadcount,
        recommendedPostingHeadcount,
        hiringCalendar,
        jobPostingTemplates,
        bulkScreeningCriteria,
        groupInterviewGuide:          buildGroupInterviewGuide(input),
        bulkOfferProcess,
        onboardingBatchPlan,
        complianceReminders,
        costEstimateNotes,
        agencyNotes: input.useAgencyStaffing
            ? [
                'Brief the agency on your exact role specs, start date, and deal-breakers before placing the order.',
                'Request weekly fill-rate updates from the agency — do not wait until Week -2 to find out they are short.',
                'Ensure the agency conducts right-to-work and reference checks — you are still liable as the hirer.',
                'Agree a replacement SLA (e.g. replace any no-show within 24 hours at no extra charge).',
                'Require agency workers to attend your Day-1 induction — do not allow them to be deployed without it.',
              ].join('\n')
            : undefined,
    };
}
