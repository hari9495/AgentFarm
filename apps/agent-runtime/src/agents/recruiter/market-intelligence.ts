/**
 * Market Intelligence
 *
 * Provides salary benchmarking, talent availability estimates,
 * hiring trend analysis, and competitor intelligence to advise
 * hiring managers on competitive compensation and search strategy.
 * Pure logic — uses heuristic models when live API data is unavailable.
 */

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

// Base salary ranges (USD, mid band) by seniority
const BASE_SALARY_BY_SENIORITY: Record<SeniorityBand, { p25: number; p50: number; p75: number; p90: number }> = {
    entry:     { p25: 55_000,  p50: 70_000,  p75: 85_000,  p90: 100_000 },
    mid:       { p25: 85_000,  p50: 105_000, p75: 125_000, p90: 145_000 },
    senior:    { p25: 120_000, p50: 150_000, p75: 180_000, p90: 210_000 },
    lead:      { p25: 145_000, p50: 180_000, p75: 220_000, p90: 260_000 },
    principal: { p25: 170_000, p50: 210_000, p75: 255_000, p90: 300_000 },
    director:  { p25: 175_000, p50: 220_000, p75: 270_000, p90: 320_000 },
    vp:        { p25: 210_000, p50: 270_000, p75: 330_000, p90: 400_000 },
    c_level:   { p25: 280_000, p50: 380_000, p75: 480_000, p90: 600_000 },
};

// Location cost-of-living multipliers relative to US national average
const LOCATION_MULTIPLIER: Record<string, number> = {
    'san francisco': 1.45,
    'new york': 1.35,
    'seattle': 1.25,
    'boston': 1.20,
    'los angeles': 1.25,
    'austin': 1.05,
    'denver': 1.05,
    'chicago': 1.10,
    'remote': 1.00,
    'london': 1.20,
    'berlin': 0.85,
    'amsterdam': 0.90,
    'toronto': 0.90,
    'singapore': 1.10,
    'sydney': 1.05,
};

function getLocationMultiplier(location: string): number {
    const key = location.toLowerCase();
    for (const [city, mult] of Object.entries(LOCATION_MULTIPLIER)) {
        if (key.includes(city)) return mult;
    }
    return 1.0;
}

// Company size premium
const SIZE_PREMIUM: Record<string, number> = {
    startup: 0.85,
    scaleup: 0.95,
    mid_market: 1.00,
    enterprise: 1.12,
};

function applyMultipliers(
    base: { p25: number; p50: number; p75: number; p90: number },
    locMult: number,
    sizeMult: number,
): { p25: number; p50: number; p75: number; p90: number } {
    const m = locMult * sizeMult;
    return {
        p25: Math.round(base.p25 * m / 1000) * 1000,
        p50: Math.round(base.p50 * m / 1000) * 1000,
        p75: Math.round(base.p75 * m / 1000) * 1000,
        p90: Math.round(base.p90 * m / 1000) * 1000,
    };
}

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
    const locMult = getLocationMultiplier(input.location);
    const sizeMult = SIZE_PREMIUM[input.companySize ?? 'mid_market'] ?? 1.0;
    const baseRange = BASE_SALARY_BY_SENIORITY[input.seniorityBand];
    const range = applyMultipliers(baseRange, locMult, sizeMult);

    const salaryBenchmark: SalaryBenchmark = {
        ...range,
        currency,
        note: `Heuristic estimates for ${input.seniorityBand} ${input.jobTitle} in ${input.location}. Validate against Levels.fyi, Glassdoor, and Radford for precision.`,
    };

    const talentAvailability = estimateTalentAvailability(input);
    const hiringTrends = buildHiringTrends(input);

    const competitorInsights = (input.competitorCompanies ?? ['your key competitors']).map(company =>
        `${company}: likely competing for the same ${input.seniorityBand} ${input.jobTitle} profiles — monitor their job postings and Glassdoor reviews`,
    );

    const sourcingRecommendations = [
        `Target ${input.remoteOk ? 'global' : input.location} ${input.seniorityBand} profiles on LinkedIn with skills: ${(input.skills ?? []).slice(0, 3).join(', ')}`,
        `Use Apollo.io or Hunter.io to find emails for warm outreach to passive candidates`,
        `Post on niche job boards (e.g. ${input.department === 'Engineering' ? 'HN Who’s Hiring, Stack Overflow Jobs' : 'relevant industry boards'})`,
        `Activate employee referral programme — referral hires fill 2× faster`,
        talentAvailability.supplyLevel === 'scarce'
            ? 'Consider recruiting bootcamp graduates or adjacent-role professionals for entry paths'
            : 'Inbound applicants from job board posts should be sufficient; supplement with targeted sourcing',
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
