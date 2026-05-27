/**
 * Market Intelligence
 *
 * Provides salary benchmarking, talent availability estimates,
 * hiring trend analysis, and competitor intelligence to advise
 * hiring managers on competitive compensation and search strategy.
 * Pure logic — uses heuristic models when live API data is unavailable.
 *
 * Salary benchmarks are industry-aware and use the cross-industry
 * salary band data from industry-salary-bands.ts (17 industries ×
 * 8 seniority levels, with location and company-size modifiers).
 */

import {
    getSalaryBenchmark,
    detectIndustryFromJobTitle,
    type Industry,
} from './industry-salary-bands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeniorityBand = 'entry' | 'mid' | 'senior' | 'lead' | 'principal' | 'director' | 'vp' | 'c_level';

export interface MarketIntelInput {
    jobTitle: string;
    department: string;
    seniorityBand: SeniorityBand;
    location: string;
    remoteOk?: boolean;
    industry?: string;
    companySize?: 'startup' | 'scaleup' | 'mid_market' | 'enterprise';
    skills?: string[];
    currency?: string;
    // Optional: competitor benchmark list
    competitorCompanies?: string[];
}

export interface SalaryBenchmark {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    currency: string;
    note: string;
}

export interface TalentAvailability {
    estimatedActiveCandidates: number;
    estimatedPassiveCandidates: number;
    demandLevel: 'low' | 'moderate' | 'high' | 'very_high';
    supplyLevel: 'scarce' | 'limited' | 'adequate' | 'abundant';
    competitionLevel: 'low' | 'moderate' | 'fierce' | 'war_for_talent';
    timeToFillEstimateDays: number;
}

export interface HiringTrend {
    trend: string;
    impact: 'positive' | 'neutral' | 'negative';
    recommendation: string;
}

export interface MarketIntelReport {
    jobTitle: string;
    location: string;
    seniorityBand: SeniorityBand;
    salaryBenchmark: SalaryBenchmark;
    talentAvailability: TalentAvailability;
    hiringTrends: HiringTrend[];
    competitorInsights: string[];
    sourcingRecommendations: string[];
    compensationRecommendation: string;
    fullReport: string;
}

// ---------------------------------------------------------------------------
// Heuristic models
// ---------------------------------------------------------------------------

function estimateTalentAvailability(input: MarketIntelInput): TalentAvailability {
    const techRoles = ['engineer', 'developer', 'scientist', 'architect', 'sre', 'devops', 'ml', 'ai'];
    const isTech = techRoles.some(t => input.jobTitle.toLowerCase().includes(t));
    const isNiche = (input.skills ?? []).some(s =>
        ['rust', 'golang', 'kubernetes', 'ml', 'ai', 'llm', 'blockchain'].includes(s.toLowerCase()),
    );

    const seniorityFactor: Record<SeniorityBand, number> = {
        entry: 1.0, mid: 0.85, senior: 0.65, lead: 0.45,
        principal: 0.30, director: 0.25, vp: 0.15, c_level: 0.08,
    };

    const baseCandidates = input.remoteOk ? 5000 : 1200;
    const factor = seniorityFactor[input.seniorityBand] * (isTech ? 0.7 : 1.0) * (isNiche ? 0.5 : 1.0);
    const active = Math.round(baseCandidates * factor * 0.2);
    const passive = Math.round(baseCandidates * factor * 0.8);

    const demandScore = (isTech ? 2 : 0) + (isNiche ? 2 : 0) + (input.seniorityBand === 'senior' || input.seniorityBand === 'lead' ? 1 : 0);
    const demand: TalentAvailability['demandLevel'] = demandScore >= 4 ? 'very_high' : demandScore >= 3 ? 'high' : demandScore >= 1 ? 'moderate' : 'low';

    const supply: TalentAvailability['supplyLevel'] = factor < 0.15 ? 'scarce' : factor < 0.35 ? 'limited' : factor < 0.65 ? 'adequate' : 'abundant';
    const competition: TalentAvailability['competitionLevel'] = demand === 'very_high' && supply === 'scarce' ? 'war_for_talent' : demand === 'high' ? 'fierce' : demand === 'moderate' ? 'moderate' : 'low';

    const fillDays = supply === 'scarce' ? 90 : supply === 'limited' ? 60 : supply === 'adequate' ? 40 : 25;

    return {
        estimatedActiveCandidates: active,
        estimatedPassiveCandidates: passive,
        demandLevel: demand,
        supplyLevel: supply,
        competitionLevel: competition,
        timeToFillEstimateDays: fillDays,
    };
}

function buildHiringTrends(input: MarketIntelInput): HiringTrend[] {
    const trends: HiringTrend[] = [
        {
            trend: 'Remote-first expectations continue to grow across all seniority levels',
            impact: input.remoteOk ? 'positive' : 'negative',
            recommendation: input.remoteOk
                ? 'Highlight remote flexibility in JD and outreach — strong differentiator'
                : 'Onsite requirement will limit your pool; consider hybrid as compromise',
        },
        {
            trend: 'Compensation transparency laws (CA, NY, CO, UK) increasingly require salary ranges in JDs',
            impact: 'neutral',
            recommendation: 'Include salary range in job posting — improves applicant quality and signals trust',
        },
        {
            trend: 'Time-to-hire has increased industry-wide (avg 42 days for technical roles)',
            impact: 'negative',
            recommendation: 'Streamline your interview process to ≤3 rounds; candidates drop off with 4+ rounds',
        },
        {
            trend: 'AI skills (LLMs, prompt engineering, ML) command a 15–25% salary premium',
            impact: (input.skills ?? []).some(s => ['ai', 'ml', 'llm', 'machine learning'].includes(s.toLowerCase()))
                ? 'negative'
                : 'neutral',
            recommendation: 'Budget accordingly for AI-adjacent skills; demand far outpaces supply',
        },
        {
            trend: 'Passive candidate outreach via LinkedIn InMail has 3× the response rate of job board postings',
            impact: 'positive',
            recommendation: 'Invest in targeted InMail campaigns; allocate LinkedIn Recruiter seats',
        },
    ];

    return trends;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateMarketIntelReport(input: MarketIntelInput): MarketIntelReport {
    const currency = input.currency ?? 'USD';

    // Resolve industry: use explicit input if provided, otherwise auto-detect from job title
    const resolvedIndustry: Industry = (input.industry as Industry | undefined) ??
        detectIndustryFromJobTitle(input.jobTitle);

    // Get industry-aware, location-adjusted, company-size-adjusted salary bands
    const bandResult = getSalaryBenchmark(
        resolvedIndustry,
        input.seniorityBand,
        input.location,
        input.companySize,
        currency,
    );

    const range = { p25: bandResult.p25, p50: bandResult.p50, p75: bandResult.p75, p90: bandResult.p90 };

    const salaryBenchmark: SalaryBenchmark = {
        ...range,
        currency,
        note: `${bandResult.notes} Industry: ${resolvedIndustry.replace(/_/g, ' ')}. Location modifier: ${bandResult.locationModifier.toFixed(2)}×. ${bandResult.validationNote}`,
    };

    const talentAvailability = estimateTalentAvailability(input);
    const hiringTrends = buildHiringTrends(input);

    const competitorInsights = (input.competitorCompanies ?? ['your key competitors']).map(company =>
        `${company}: likely competing for the same ${input.seniorityBand} ${input.jobTitle} profiles — monitor their job postings and Glassdoor reviews`,
    );

    const industryJobBoards: Partial<Record<Industry, string>> = {
        technology: "HN Who's Hiring, Stack Overflow Jobs, Wellfound",
        healthcare: "Health eCareers, NurseZone, PracticeLink, Doximity",
        finance: "eFinancialCareers, CFA Institute Job Board",
        legal: "Law Crossing, BCG Attorney Search",
        education: "HigherEdJobs, SchoolSpring, EdJoin",
        government: "USAJOBS, ClearanceJobs, GovernmentJobs.com",
        creative_media: "Behance, Dribbble Jobs, Mediabistro",
        manufacturing: "ManufacturingJobs.com, IME Jobs",
        consulting: "Management Consulted, Vault",
        pharmaceutical_biotech: "BioPharma Dive Jobs, Science Careers",
    };
    const jobBoardSuggestion = industryJobBoards[resolvedIndustry] ?? 'relevant industry-specific job boards';

    const sourcingRecommendations = [
        `Target ${input.remoteOk ? 'global' : input.location} ${input.seniorityBand} profiles on LinkedIn with skills: ${(input.skills ?? []).slice(0, 3).join(', ')}`,
        `Use Apollo.io or Hunter.io to find emails for warm outreach to passive candidates`,
        `Post on niche job boards (e.g. ${jobBoardSuggestion})`,
        `Activate employee referral programme — referral hires fill 2× faster`,
        talentAvailability.supplyLevel === 'scarce'
            ? 'Consider adjacent-role professionals, apprenticeships, or bootcamp graduates for entry paths given scarce supply'
            : 'Inbound applicants from job board posts should be sufficient; supplement with targeted sourcing',
        `Industry detected: ${resolvedIndustry.replace(/_/g, ' ')} — salary benchmarks calibrated to this sector`,
    ];

    const compensationRecommendation = `To be competitive at ${input.location} for a ${input.seniorityBand} ${input.jobTitle}:\n` +
        `  - Minimum competitive: ${currency} ${range.p50.toLocaleString()} (50th percentile)\n` +
        `  - To attract top 25% of candidates: ${currency} ${range.p75.toLocaleString()}\n` +
        `  - If competing against FAANG / well-funded startups: ${currency} ${range.p90.toLocaleString()}`;

    const today = new Date().toISOString().split('T')[0];
    const fullReport = [
        `# Market Intelligence Report — ${input.seniorityBand} ${input.jobTitle}`,
        `**Location:** ${input.location}  |  **Date:** ${today}`,
        '',
        `## Salary Benchmark (${currency})`,
        `| Percentile | Salary |`,
        `|------------|--------|`,
        `| P25 (entry point) | ${currency} ${range.p25.toLocaleString()} |`,
        `| P50 (market rate) | ${currency} ${range.p50.toLocaleString()} |`,
        `| P75 (competitive) | ${currency} ${range.p75.toLocaleString()} |`,
        `| P90 (top of market) | ${currency} ${range.p90.toLocaleString()} |`,
        '',
        `*${salaryBenchmark.note}*`,
        '',
        `## Talent Availability`,
        `- **Active candidates:** ~${talentAvailability.estimatedActiveCandidates.toLocaleString()}`,
        `- **Passive candidates:** ~${talentAvailability.estimatedPassiveCandidates.toLocaleString()}`,
        `- **Demand level:** ${talentAvailability.demandLevel.replace(/_/g, ' ')}`,
        `- **Supply level:** ${talentAvailability.supplyLevel}`,
        `- **Competition:** ${talentAvailability.competitionLevel.replace(/_/g, ' ')}`,
        `- **Estimated time to fill:** ${talentAvailability.timeToFillEstimateDays} days`,
        '',
        `## Hiring Trends`,
        ...hiringTrends.map(t => `- **${t.trend}** (${t.impact})\n  → ${t.recommendation}`),
        '',
        `## Compensation Recommendation`,
        compensationRecommendation,
        '',
        `## Sourcing Strategy`,
        ...sourcingRecommendations.map(r => `- ${r}`),
    ].join('\n');

    return {
        jobTitle: input.jobTitle,
        location: input.location,
        seniorityBand: input.seniorityBand,
        salaryBenchmark,
        talentAvailability,
        hiringTrends,
        competitorInsights,
        sourcingRecommendations,
        compensationRecommendation,
        fullReport,
    };
}
