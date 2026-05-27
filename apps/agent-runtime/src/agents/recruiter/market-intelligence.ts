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

// ---------------------------------------------------------------------------
// Industry-aware demand / supply profiles
// ---------------------------------------------------------------------------

/**
 * Each entry encodes the typical talent market dynamics for that industry:
 *   demandMultiplier  — how aggressively employers compete (>1 = high demand)
 *   supplyMultiplier  — relative talent pool size (>1 = larger pool)
 *   baseCandidatesLocal — estimated active+passive pool for a non-remote search
 *
 * Sources: industry hiring index data, BLS occupational projections, LinkedIn
 * Talent Insights benchmarks (calibrated to mid-2020s trends).
 */
const INDUSTRY_TALENT_PROFILE: Record<string, {
    demandMultiplier: number;
    supplyMultiplier: number;
    baseCandidatesLocal: number;
    nicheSkillKeywords: string[];
}> = {
    technology:          { demandMultiplier: 1.9, supplyMultiplier: 0.6, baseCandidatesLocal: 3500, nicheSkillKeywords: ['rust', 'golang', 'kubernetes', 'llm', 'ml', 'ai', 'blockchain', 'web3'] },
    healthcare:          { demandMultiplier: 1.7, supplyMultiplier: 0.7, baseCandidatesLocal: 2800, nicheSkillKeywords: ['crnp', 'crna', 'np', 'pa', 'subspecialty', 'fellowship', 'oig'] },
    finance:             { demandMultiplier: 1.4, supplyMultiplier: 0.9, baseCandidatesLocal: 2000, nicheSkillKeywords: ['quant', 'derivatives', 'aml', 'structured products', 'actuarial'] },
    legal:               { demandMultiplier: 1.2, supplyMultiplier: 1.0, baseCandidatesLocal: 1200, nicheSkillKeywords: ['itar', 'fcpa', 'antitrust', 'm&a', 'patent prosecution', 'securities'] },
    pharmaceutical_biotech: { demandMultiplier: 1.6, supplyMultiplier: 0.65, baseCandidatesLocal: 1800, nicheSkillKeywords: ['cmc', 'ich', 'clinical development', 'regulatory affairs', 'mab'] },
    manufacturing:       { demandMultiplier: 1.3, supplyMultiplier: 0.85, baseCandidatesLocal: 2200, nicheSkillKeywords: ['as9100', 'iso 13485', 'lean', 'six sigma black belt', 'automation'] },
    engineering_non_software: { demandMultiplier: 1.4, supplyMultiplier: 0.8, baseCandidatesLocal: 1900, nicheSkillKeywords: ['pe license', 'structural', 'civil 3d', 'env impact', 'seismic'] },
    aviation:            { demandMultiplier: 1.7, supplyMultiplier: 0.55, baseCandidatesLocal: 900, nicheSkillKeywords: ['atp', 'type rating', 'part 135', 'faa a&p', 'avionics'] },
    utilities_energy:    { demandMultiplier: 1.4, supplyMultiplier: 0.75, baseCandidatesLocal: 1500, nicheSkillKeywords: ['nerc', 'scada', 'power systems', 'substation', 'high voltage'] },
    telecommunications:  { demandMultiplier: 1.3, supplyMultiplier: 0.85, baseCandidatesLocal: 2000, nicheSkillKeywords: ['5g', 'rf engineering', 'oran', 'carrier ethernet', 'ims'] },
    insurance:           { demandMultiplier: 1.2, supplyMultiplier: 0.95, baseCandidatesLocal: 2200, nicheSkillKeywords: ['fellow of the soa', 'fcas', 'lloyds market', 'specialty lines', 'actuarial'] },
    mining_extractive:   { demandMultiplier: 1.3, supplyMultiplier: 0.7, baseCandidatesLocal: 800, nicheSkillKeywords: ['underground mining', 'msha', 'geotechnical', 'tailings', 'metallurgy'] },
    consulting:          { demandMultiplier: 1.3, supplyMultiplier: 1.0, baseCandidatesLocal: 2500, nicheSkillKeywords: ['strategy consulting', 'management consulting', 'mbb', 'transformation'] },
    sales_bizdev:        { demandMultiplier: 1.3, supplyMultiplier: 1.1, baseCandidatesLocal: 3000, nicheSkillKeywords: ['enterprise sales', 'abm', 'saas quota', 'channel sales', 'partner management'] },
    education:           { demandMultiplier: 1.2, supplyMultiplier: 1.0, baseCandidatesLocal: 2500, nicheSkillKeywords: ['sped', 'bilingual', 'stem', 'higher ed admin', 'accreditation'] },
    government:          { demandMultiplier: 1.1, supplyMultiplier: 1.0, baseCandidatesLocal: 2000, nicheSkillKeywords: ['ts/sci', 'poly', 'federal acquisition', 'dod', 'security clearance'] },
    retail:              { demandMultiplier: 1.1, supplyMultiplier: 1.3, baseCandidatesLocal: 3500, nicheSkillKeywords: ['merchandise planning', 'category management', 'omnichannel', 'loss prevention'] },
    hospitality:         { demandMultiplier: 1.2, supplyMultiplier: 1.2, baseCandidatesLocal: 3000, nicheSkillKeywords: ['revenue management', 'front office ops', 'f&b director', 'property management system'] },
    agriculture:         { demandMultiplier: 1.2, supplyMultiplier: 0.9, baseCandidatesLocal: 1200, nicheSkillKeywords: ['precision ag', 'crop science', 'pes license', 'agronomist cca', 'gis mapping'] },
    logistics_supply_chain: { demandMultiplier: 1.4, supplyMultiplier: 0.9, baseCandidatesLocal: 2500, nicheSkillKeywords: ['s&oe', 'ibp', 'sap apo', 'ocean freight', '3pl management'] },
    real_estate:         { demandMultiplier: 1.1, supplyMultiplier: 1.1, baseCandidatesLocal: 2000, nicheSkillKeywords: ['argus enterprise', 'cre finance', 'ground lease', 'mezzanine debt', 'reits'] },
    nonprofit:           { demandMultiplier: 0.9, supplyMultiplier: 1.2, baseCandidatesLocal: 1800, nicheSkillKeywords: ['major gifts', 'planned giving', 'federal grants', 'cfre', 'advocacy'] },
    creative_media:      { demandMultiplier: 1.2, supplyMultiplier: 1.1, baseCandidatesLocal: 2200, nicheSkillKeywords: ['motion design', 'brand strategy', 'cd', 'ecd', 'campaign concept'] },
};

const DEFAULT_TALENT_PROFILE = { demandMultiplier: 1.2, supplyMultiplier: 1.0, baseCandidatesLocal: 2000, nicheSkillKeywords: [] as string[] };

function estimateTalentAvailability(input: MarketIntelInput, resolvedIndustry: string): TalentAvailability {
    const profile = INDUSTRY_TALENT_PROFILE[resolvedIndustry] ?? DEFAULT_TALENT_PROFILE;

    const isNiche = (input.skills ?? []).some(s =>
        profile.nicheSkillKeywords.some(kw => s.toLowerCase().includes(kw.toLowerCase())),
    );

    const seniorityFactor: Record<SeniorityBand, number> = {
        entry: 1.0, mid: 0.85, senior: 0.65, lead: 0.45,
        principal: 0.30, director: 0.25, vp: 0.15, c_level: 0.08,
    };

    const baseCandidates = input.remoteOk
        ? profile.baseCandidatesLocal * 3.5   // Remote expands pool ~3.5×
        : profile.baseCandidatesLocal;

    const supplyFactor = seniorityFactor[input.seniorityBand]
        * profile.supplyMultiplier
        * (isNiche ? 0.45 : 1.0);

    const active  = Math.round(baseCandidates * supplyFactor * 0.2);
    const passive = Math.round(baseCandidates * supplyFactor * 0.8);

    // Demand: driven by industry profile + seniority + niche skills
    const demandScore =
        (profile.demandMultiplier >= 1.7 ? 3 : profile.demandMultiplier >= 1.4 ? 2 : profile.demandMultiplier >= 1.2 ? 1 : 0) +
        (isNiche ? 2 : 0) +
        (input.seniorityBand === 'senior' || input.seniorityBand === 'lead' ? 1 : 0) +
        (input.seniorityBand === 'principal' || input.seniorityBand === 'director' ? 2 : 0);

    const demand: TalentAvailability['demandLevel'] =
        demandScore >= 5 ? 'very_high' : demandScore >= 3 ? 'high' : demandScore >= 1 ? 'moderate' : 'low';

    const supply: TalentAvailability['supplyLevel'] =
        supplyFactor < 0.12 ? 'scarce' : supplyFactor < 0.30 ? 'limited' : supplyFactor < 0.60 ? 'adequate' : 'abundant';

    const competition: TalentAvailability['competitionLevel'] =
        demand === 'very_high' && supply === 'scarce' ? 'war_for_talent' :
        demand === 'high' ? 'fierce' :
        demand === 'moderate' ? 'moderate' : 'low';

    const fillDays = supply === 'scarce' ? 95 : supply === 'limited' ? 60 : supply === 'adequate' ? 40 : 22;

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

    const talentAvailability = estimateTalentAvailability(input, resolvedIndustry);
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
