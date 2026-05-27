/**
 * Candidate Sourcer
 *
 * Searches LinkedIn, Apollo, job boards, and internal ATS databases for
 * passive and active candidates matching a role's requirements.
 * Returns a ranked list of profiles with contact hints and match rationale.
 */

import {
    buildSourcingSetupRequests,
    type DashboardRequestResult,
} from './dashboard-requests.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourcingCriteria {
    jobTitle: string;
    department: string;
    requiredSkills: string[];
    niceToHaveSkills?: string[];
    minYearsExperience?: number;
    maxYearsExperience?: number;
    location?: string;
    remoteOk?: boolean;
    industries?: string[];
    excludeCompanies?: string[];
    limit?: number;
    // External API keys (optional — falls back to heuristic profile generation)
    apolloApiKey?: string;
    hunterApiKey?: string;
    linkedInAccessToken?: string;
}

export interface CandidateProfile {
    id: string;
    fullName: string;
    currentTitle: string;
    currentCompany: string;
    location: string;
    yearsExperience: number;
    skills: string[];
    linkedInUrl?: string;
    email?: string;
    matchScore: number;          // 0–100
    matchRationale: string[];
    source: 'linkedin' | 'apollo' | 'hunter' | 'internal' | 'heuristic';
    passiveCandidate: boolean;
}

export interface SourcingResult {
    ok: boolean;
    criteria: SourcingCriteria;
    totalFound: number;
    candidates: CandidateProfile[];
    searchStrategy: string[];
    nextSteps: string[];
    errorMessage?: string;
    dashboardRequest?: DashboardRequestResult;  // Populated when API keys are missing
    isHeuristic: boolean;                        // True when results are illustrative only
}

// Injected fetch function for testing / connector integration
export type SourcingFetchFn = (
    endpoint: string,
    params: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: unknown; errorMessage?: string }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreCandidate(
    profile: Omit<CandidateProfile, 'matchScore' | 'matchRationale'>,
    criteria: SourcingCriteria,
): { score: number; rationale: string[] } {
    let score = 0;
    const rationale: string[] = [];

    // Skill overlap (up to 60 pts)
    const skillsLower = profile.skills.map(s => s.toLowerCase());
    const requiredMatched = criteria.requiredSkills.filter(rs =>
        skillsLower.some(s => s.includes(rs.toLowerCase())),
    );
    const requiredPct = criteria.requiredSkills.length > 0
        ? requiredMatched.length / criteria.requiredSkills.length
        : 1;
    score += Math.round(requiredPct * 60);
    if (requiredMatched.length > 0) {
        rationale.push(`Matches ${requiredMatched.length}/${criteria.requiredSkills.length} required skills: ${requiredMatched.join(', ')}`);
    }

    const niceMatched = (criteria.niceToHaveSkills ?? []).filter(ns =>
        skillsLower.some(s => s.includes(ns.toLowerCase())),
    );
    score += Math.min(niceMatched.length * 5, 20);
    if (niceMatched.length > 0) {
        rationale.push(`Bonus: ${niceMatched.join(', ')}`);
    }

    // Experience range (up to 15 pts)
    const min = criteria.minYearsExperience ?? 0;
    const max = criteria.maxYearsExperience ?? 30;
    if (profile.yearsExperience >= min && profile.yearsExperience <= max) {
        score += 15;
        rationale.push(`${profile.yearsExperience} yrs experience — within range`);
    } else if (profile.yearsExperience < min) {
        rationale.push(`${profile.yearsExperience} yrs experience — below minimum (${min})`);
    } else {
        score += 8; // Over-qualified still relevant
        rationale.push(`${profile.yearsExperience} yrs experience — above range, may be over-qualified`);
    }

    // Location (up to 5 pts)
    if (!criteria.location || criteria.remoteOk) {
        score += 5;
    } else if (profile.location.toLowerCase().includes(criteria.location.toLowerCase())) {
        score += 5;
        rationale.push(`Located in ${criteria.location}`);
    }

    return { score: Math.min(score, 100), rationale };
}

// ---------------------------------------------------------------------------
// Industry-aware company pools
// ---------------------------------------------------------------------------

const INDUSTRY_COMPANIES: Record<string, string[]> = {
    technology:          ['Stripe', 'Shopify', 'Figma', 'Notion', 'Vercel', 'Databricks', 'Twilio', 'HashiCorp'],
    healthcare:          ['HCA Healthcare', 'CommonSpirit Health', 'Kaiser Permanente', 'Ascension', 'Mayo Clinic', 'Cleveland Clinic', 'Tenet Healthcare', 'Dignity Health'],
    finance:             ['JPMorgan Chase', 'Goldman Sachs', 'BlackRock', 'Fidelity Investments', 'Vanguard', 'Citadel', 'Bridgewater Associates', 'Wells Fargo'],
    legal:               ['Skadden', 'Latham & Watkins', 'Baker McKenzie', 'Jones Day', 'Kirkland & Ellis', 'Sidley Austin', 'Cooley', 'WilmerHale'],
    manufacturing:       ['GE', 'Honeywell', '3M', 'Caterpillar', 'Parker Hannifin', 'Emerson Electric', 'Rockwell Automation', 'Illinois Tool Works'],
    engineering_non_software: ['AECOM', 'Jacobs', 'Parsons', 'Bechtel', 'Fluor', 'Stantec', 'WSP', 'Gannett Fleming'],
    retail:              ['Walmart', 'Target', 'Home Depot', 'Costco', 'Nordstrom', 'TJX Companies', 'Dollar General', 'Kroger'],
    hospitality:         ['Marriott International', 'Hilton', 'Hyatt Hotels', 'IHG', 'Wyndham Hotels', 'Four Seasons', 'Accor', 'MGM Resorts'],
    education:           ['KIPP Foundation', 'Teach For America', 'Khan Academy', 'Coursera', 'Chegg', 'Grand Canyon University', 'Naviance', '2U Inc.'],
    government:          ['Booz Allen Hamilton', 'Leidos', 'SAIC', 'ManTech International', 'General Dynamics IT', 'Peraton', 'CACI International', 'Maximus'],
    nonprofit:           ['American Red Cross', 'United Way', 'Feeding America', 'Habitat for Humanity', 'CARE', 'Save the Children', 'WWF', 'The Nature Conservancy'],
    creative_media:      ['Wieden+Kennedy', 'BBDO', 'Ogilvy', 'R/GA', 'Pentagram', 'Droga5', 'Grey Group', 'DDB Worldwide'],
    consulting:          ['McKinsey & Company', 'Boston Consulting Group', 'Bain & Company', 'Deloitte Consulting', 'Accenture', 'Oliver Wyman', 'PwC', 'Kearney'],
    sales_bizdev:        ['Salesforce', 'HubSpot', 'Gartner', 'ZoomInfo', 'Qualtrics', 'Veeva Systems', 'Outreach', 'Seismic'],
    logistics_supply_chain: ['FedEx', 'UPS', 'XPO Logistics', 'J.B. Hunt', 'Schneider National', 'Werner Enterprises', 'CH Robinson', 'Coyote Logistics'],
    real_estate:         ['CBRE', 'JLL', 'Cushman & Wakefield', 'Brookfield Asset Management', 'Prologis', 'Equity Residential', 'AvalonBay Communities', 'Blackstone Real Estate'],
    pharmaceutical_biotech: ['Pfizer', 'Johnson & Johnson', 'Merck', 'AbbVie', 'Moderna', 'Amgen', 'Genentech', 'Bristol Myers Squibb'],
    agriculture:         ['Cargill', 'Archer Daniels Midland', 'Bunge', 'John Deere', 'AGCO', 'Corteva Agriscience', 'Syngenta', 'Nutrien'],
    aviation:            ['American Airlines', 'United Airlines', 'Delta Air Lines', 'Southwest Airlines', 'Boeing', 'Airbus Americas', 'NetJets', 'Flexjet'],
    utilities_energy:    ['NextEra Energy', 'Duke Energy', 'Dominion Energy', 'ExxonMobil', 'Chevron', 'Schlumberger', 'Halliburton', 'Baker Hughes'],
    telecommunications:  ['AT&T', 'Verizon', 'T-Mobile', 'Comcast', 'Charter Communications', 'Lumen Technologies', 'Crown Castle', 'American Tower'],
    insurance:           ['Berkshire Hathaway', 'State Farm', 'Allstate', 'Progressive', 'Prudential', 'MetLife', 'Aetna', 'Cigna'],
    mining_extractive:   ['Freeport-McMoRan', 'Barrick Gold', 'Mosaic Company', 'Nucor', 'Alpha Natural Resources', 'Walter Energy', 'CONSOL Energy', 'Arch Coal'],
};

// Industry-specific job board recommendations
const INDUSTRY_JOB_BOARDS: Record<string, string[]> = {
    technology:          ['LinkedIn', 'Greenhouse/Lever integrations', 'HackerNews Who\'s Hiring', 'Stack Overflow Jobs'],
    healthcare:          ['Health eCareers', 'Doximity Talent Finder', 'NurseFly', 'PracticeLink', 'CompHealth'],
    legal:               ['LawCrossing', 'LegalJobs.io', 'BCG Attorney Search', 'Leopard Solutions'],
    finance:             ['eFinancialCareers', 'LinkedIn', 'Wall Street Oasis', 'Selby Jennings'],
    education:           ['K12JobSpot', 'Teach.com', 'HigherEdJobs', 'Chronicle Vitae', 'SchoolSpring'],
    government:          ['USAJOBS', 'ClearanceJobs', 'GovernmentJobs.com', 'LinkedIn'],
    logistics_supply_chain: ['DAT Freight & Analytics', 'Trucker Path', 'Indeed', 'LinkedIn'],
    real_estate:         ['CoStar', 'CREW Network', 'LinkedIn', 'BuildOut'],
    pharmaceutical_biotech: ['BioSpace', 'MedReps', 'ClinicalTrials Jobs', 'EuroSciCon'],
    manufacturing:       ['GlobalSpec', 'EngineeringJobs.com', 'Indeed', 'LinkedIn'],
    hospitality:         ['Hcareers', 'Culinary Agents', 'Hospitality Online', 'TalentAcquisition.com'],
    nonprofit:           ['Idealist', 'NonProfit Jobs', 'Commongood Careers', 'LinkedIn'],
    creative_media:      ['Behance Jobs', 'Dribbble Jobs', 'Vitamin T', 'Creative Circle'],
    // Previously missing industries — now covered
    engineering_non_software: ['GlobalSpec', 'ASCE Career Connections', 'ASME Career Center', 'LinkedIn'],
    retail:              ['RetailCrossing', 'AllRetailJobs.com', 'LinkedIn', 'Indeed'],
    agriculture:         ['AgCareers.com', 'CropLife Jobs', 'Farm Bureau Jobs', 'Indeed'],
    aviation:            ['AviationCrossing', 'NBAA Career Center', 'Avjobs.com', 'LinkedIn'],
    utilities_energy:    ['Energy Jobline', 'Rigzone', 'OilCareers.com', 'LinkedIn'],
    telecommunications:  ['TelecomCareers.net', 'IEEE Job Site', 'LinkedIn', 'Indeed'],
    insurance:           ['InsuranceJobs.com', 'Insurance Journal Jobs', 'LinkedIn', 'Indeed'],
    mining_extractive:   ['MineListings', 'Mining Job Search', 'LinkedIn', 'Indeed'],
    sales_bizdev:        ['LinkedIn', 'RepVue', 'Sales Hacker Jobs', 'Indeed'],
    consulting:          ['Management Consulted', 'Vault.com', 'LinkedIn', 'Indeed'],
};

function getIndustryCompanies(industries: string[]): string[] {
    for (const ind of industries) {
        const pool = INDUSTRY_COMPANIES[ind];
        if (pool && pool.length > 0) return pool;
    }
    return INDUSTRY_COMPANIES['technology']!;
}

function buildHeuristicCandidates(criteria: SourcingCriteria): CandidateProfile[] {
    const limit = criteria.limit ?? 10;
    const titles = [
        `Senior ${criteria.jobTitle}`,
        criteria.jobTitle,
        `Lead ${criteria.jobTitle}`,
        `${criteria.jobTitle} II`,
        `Principal ${criteria.jobTitle}`,
    ];
    const companies = getIndustryCompanies(criteria.industries ?? []);
    const locations = criteria.location
        ? [criteria.location, `${criteria.location} Area`, 'Remote']
        : ['San Francisco, CA', 'New York, NY', 'London, UK', 'Remote'];

    // Skill pools used to vary coverage across candidates so scoreCandidate()
    // produces genuinely differentiated match scores (not a uniform 100%).
    const required = criteria.requiredSkills;
    const optional = criteria.niceToHaveSkills ?? [];

    return Array.from({ length: Math.min(limit, 8) }, (_, i) => {
        // Vary how many required/optional skills each heuristic candidate has:
        //   i=0: all req + 2 optional  → strongest fit (~90–100)
        //   i=1: 75% req + 1 optional  → good fit    (~65–80)
        //   i=2: 50% req + 0 optional  → partial fit (~40–60)
        //   i=3: 100% req + 0 optional → solid but no bonuses (~70–80)
        //   i=4: 25% req + 1 optional  → weak fit    (~20–40)
        //   etc.
        const reqCoverage  = Math.max(1, required.length - Math.floor(i * required.length / 5));
        const niceCoverage = i % 3 === 0
            ? Math.min(2, optional.length)
            : i % 3 === 1
                ? Math.min(1, optional.length)
                : 0;

        const base: Omit<CandidateProfile, 'matchScore' | 'matchRationale'> = {
            id: `heuristic-${i + 1}`,
            fullName: `Candidate ${String.fromCharCode(65 + i)}. [Sourced via ${criteria.jobTitle} search]`,
            currentTitle: titles[i % titles.length] ?? criteria.jobTitle,
            currentCompany: companies[i % companies.length] ?? 'Unknown',
            location: locations[i % locations.length] ?? 'Unknown',
            yearsExperience: 2 + (i * 2),
            skills: [
                ...required.slice(0, reqCoverage),
                ...optional.slice(0, niceCoverage),
            ],
            linkedInUrl: `https://linkedin.com/in/candidate-${i + 1}-placeholder`,
            source: 'heuristic',
            passiveCandidate: i % 2 === 0,
        };
        const { score, rationale } = scoreCandidate(base, criteria);
        return { ...base, matchScore: score, matchRationale: rationale };
    }).sort((a, b) => b.matchScore - a.matchScore);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sourceCandidates(
    criteria: SourcingCriteria,
    fetchFn?: SourcingFetchFn,
): Promise<SourcingResult> {
    const limit = criteria.limit ?? 10;

    const searchStrategy = [
        `LinkedIn search: "${criteria.jobTitle}" + ${criteria.requiredSkills.slice(0, 3).join(' + ')}`,
        `Apollo people search: title="${criteria.jobTitle}", skills=[${criteria.requiredSkills.slice(0, 3).join(', ')}]`,
        criteria.location
            ? `Geo-filter: ${criteria.location}${criteria.remoteOk ? ' or Remote' : ''}`
            : 'No location filter — global search',
        ...(criteria.excludeCompanies && criteria.excludeCompanies.length > 0
            ? [`Excluding: ${criteria.excludeCompanies.join(', ')}`]
            : []),
        'Boolean search: ("open to work" OR passive) to surface both active & passive talent',
    ];

    let candidates: CandidateProfile[] = [];
    let usedLive = false;
    let dashboardRequest: DashboardRequestResult | undefined;

    // Apollo integration
    if (criteria.apolloApiKey && fetchFn) {
        const res = await fetchFn('apollo_people_search', {
            title: criteria.jobTitle,
            skills: criteria.requiredSkills,
            location: criteria.location,
            limit,
            apiKey: criteria.apolloApiKey,
        });
        if (res.ok && Array.isArray(res.data)) {
            candidates = (res.data as CandidateProfile[]).slice(0, limit);
            usedLive = true;
        }
    }

    // LinkedIn integration
    if (!usedLive && criteria.linkedInAccessToken && fetchFn) {
        const res = await fetchFn('linkedin_people_search', {
            title: criteria.jobTitle,
            skills: criteria.requiredSkills,
            location: criteria.location,
            limit,
            accessToken: criteria.linkedInAccessToken,
        });
        if (res.ok && Array.isArray(res.data)) {
            candidates = (res.data as CandidateProfile[]).slice(0, limit);
            usedLive = true;
        }
    }

    // Fallback: heuristic profiles (illustrative — real sourcing requires API keys)
    if (!usedLive) {
        candidates = buildHeuristicCandidates(criteria);
        // Surface a dashboard request so the customer knows to configure credentials
        dashboardRequest = buildSourcingSetupRequests();
    }

    // Add industry-specific job boards to search strategy
    const targetIndustries = criteria.industries ?? [];
    const boards: string[] = [];
    for (const ind of targetIndustries) {
        const b = INDUSTRY_JOB_BOARDS[ind];
        if (b) boards.push(...b);
    }
    if (boards.length > 0) {
        const unique = [...new Set(boards)];
        searchStrategy.push(`Recommended job boards for ${targetIndustries.join('/')} roles: ${unique.slice(0, 4).join(', ')}`);
    }

    const nextSteps = [
        usedLive
            ? `Review the ${candidates.length} live profiles and mark top picks in your ATS`
            : `⚠️ Results are ILLUSTRATIVE ONLY (no API keys configured). Configure credentials via the dashboard to get real candidates.`,
        'Craft personalised outreach using workspace_rec_send_outreach for each top candidate',
        'For passive candidates: lead with value proposition, not the job description',
        `Set a follow-up reminder if no reply within 5 business days`,
        ...(dashboardRequest ? ['Action the dashboard API setup requests to enable live candidate sourcing'] : []),
    ];

    return {
        ok: true,
        criteria,
        totalFound: candidates.length,
        candidates,
        searchStrategy,
        nextSteps,
        dashboardRequest,
        isHeuristic: !usedLive,
    };
}
