/**
 * International Recruiting
 *
 * Handles cross-border talent acquisition compliance:
 *   - Right-to-work assessment per country (US, UK, EU, Canada, Australia, Singapore)
 *   - IR35 determination for UK contractors (inside / outside / uncertain)
 *   - GDPR candidate data handling workflow (EU/UK)
 *   - Visa & work permit guidance per country
 *   - Market JD adaptation (currency, date format, local terminology)
 *
 * Pure logic — no external API calls or live government API lookups.
 * Output is advisory only — always verify with legal counsel before acting.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HiringCountry =
    | 'us' | 'uk' | 'ireland' | 'germany' | 'france' | 'netherlands'
    | 'spain' | 'sweden' | 'australia' | 'canada' | 'singapore' | 'india'
    | 'uae' | 'saudi_arabia' | 'japan' | 'south_korea' | 'brazil' | 'mexico'
    | 'switzerland' | 'italy' | 'poland' | 'new_zealand' | 'israel'
    | 'other';

export type EngagementType = 'permanent' | 'fixed_term' | 'contractor' | 'consultant' | 'intern';

export type CandidateStatus =
    | 'citizen'
    | 'permanent_resident'
    | 'eu_eea_citizen'          // EU/EEA right to work in EU
    | 'settled_status'          // UK post-Brexit EU settled/pre-settled
    | 'existing_work_visa'
    | 'student_work_rights'
    | 'requires_sponsorship'
    | 'unknown';

// ── Right to Work ────────────────────────────────────────────────────────────

export interface RightToWorkInput {
    country: HiringCountry;
    candidateStatus: CandidateStatus;
    visaType?: string;              // e.g. 'H-1B', 'Tier 2', 'Blue Card', 'TSS 482'
    visaExpiryDate?: string;        // ISO date — to flag expiry risk
    sponsorshipAvailable?: boolean;
    engagementType?: EngagementType;
    roleIsSpecialty?: boolean;      // H-1B: role must meet "specialty occupation"
    salaryAboveThreshold?: boolean; // H-1B / Skilled Worker: salary ≥ prevailing wage
}

export interface RightToWorkResult {
    country: HiringCountry;
    eligible: boolean;
    requiresSponsorship: boolean;
    canProceedWithoutSponsorship: boolean;
    documentCheckRequired: boolean;
    documentsToCheck: string[];
    sponsorshipOptions: SponsorshipOption[];
    sponsorshipTimeline?: string;
    expiryRisk?: string;
    notes: string[];
    recruitingGuidance: string;
    legalWarning: string;
}

export interface SponsorshipOption {
    visaType: string;
    country: HiringCountry;
    description: string;
    annualCap?: number;
    typicalProcessingWeeks?: string;
    employerCostEstimate?: string;
    requirements: string[];
}

// ── IR35 ─────────────────────────────────────────────────────────────────────

export interface Ir35Input {
    // The three "status" tests from the HMRC CEST tool / Ready Mixed Concrete case
    workerControlledByEngager: boolean | null;     // Can engager tell worker WHEN, WHERE, HOW to work?
    substitutionAllowed: boolean | null;           // Can worker send a suitably qualified substitute?
    mutualityOfObligation: boolean | null;         // Is engager obliged to offer work; worker obliged to accept?
    // Additional indicators
    workerProvidesOwnEquipment: boolean | null;
    workerBearesFinancialRisk: boolean | null;     // e.g. fixes own mistakes at own cost
    workerHasMultipleClients: boolean | null;
    integrationIntoOrganisation: boolean | null;   // Part of org chart, same processes as employees?
    engagementLengthMonths: number;
    hasPscOrLimitedCompany: boolean;               // IR35 applies to PSC / Ltd Co contractors
    roleTitle: string;
    engagerName?: string;
}

export interface Ir35Result {
    determination: 'inside_ir35' | 'outside_ir35' | 'uncertain';
    riskLevel: 'high' | 'medium' | 'low';
    insideFactors: string[];
    outsideFactors: string[];
    keyRisks: string[];
    practicalGuidance: string[];
    statusDetermination: string;  // Text for the SDS (Status Determination Statement)
    nextSteps: string[];
    legalWarning: string;
}

// ── GDPR ─────────────────────────────────────────────────────────────────────

export interface GdprRecruitmentInput {
    companyName: string;
    companyCountry: HiringCountry;
    candidateCountry: HiringCountry;
    processingPurpose: 'active_application' | 'talent_pool' | 'speculative_application';
    thirdPartySharing?: string[];  // e.g. ['Sterling BGC', 'LinkedIn', 'ATS vendor']
    retentionMonths?: number;
}

export interface GdprRecruitmentResult {
    lawfulBasis: string;
    retentionPeriodGuidance: string;
    candidateRights: string[];
    requiredPrivacyNoticeElements: string[];
    crossBorderTransferNotes?: string;
    thirdPartySharingNotes?: string;
    consentLanguage: string;
    privacyNoticeDraft: string;
    checklist: string[];
}

// ── Market Adaptation ────────────────────────────────────────────────────────

export interface MarketAdaptationInput {
    country: HiringCountry;
    jobTitle?: string;
    salaryMin?: number;
    salaryMax?: number;
    sourceCurrency?: string;
}

export interface MarketAdaptation {
    country: HiringCountry;
    localCurrency: string;
    salaryTerminology: string;   // e.g. "package", "OTE", "base + super"
    dateFormat: string;
    localJobBoardRecommendations: string[];
    localTerminologyNotes: string[];
    mandatoryBenefitNotes: string[];
    publicHolidayNote: string;
    probationPeriodNote: string;
    noticePeriodNorm: string;
}

// ---------------------------------------------------------------------------
// Right to Work data by country
// ---------------------------------------------------------------------------

const SPONSORED_VISA_OPTIONS: Partial<Record<HiringCountry, SponsorshipOption[]>> = {
    us: [
        {
            visaType: 'H-1B',
            country: 'us',
            description: 'Specialty Occupation — most common path for professional roles',
            annualCap: 85000,
            typicalProcessingWeeks: '3–6 months (standard); 1–3 weeks (premium processing)',
            employerCostEstimate: '$4,000–$8,000 in attorney and filing fees',
            requirements: [
                'Role must be a "specialty occupation" (requires at least a bachelor\'s degree in a specific field)',
                'Employer must be registered with USCIS and selected in the H-1B lottery (April each year)',
                'Salary must meet or exceed the prevailing wage for the role/location (LCA required)',
                'Employer must pay transportation home if employment is terminated before visa expiry',
            ],
        },
        {
            visaType: 'O-1A',
            country: 'us',
            description: 'Extraordinary ability — no annual cap, no lottery',
            typicalProcessingWeeks: '2–6 months',
            employerCostEstimate: '$5,000–$12,000',
            requirements: [
                'Candidate must demonstrate extraordinary ability in their field (high salary, awards, publications, media coverage)',
                'No degree requirement but very high evidentiary bar',
                'Employer files petition on candidate\'s behalf',
            ],
        },
        {
            visaType: 'TN',
            country: 'us',
            description: 'CUSMA/USMCA — for Canadian and Mexican nationals only',
            typicalProcessingWeeks: 'Days to weeks',
            employerCostEstimate: '$500–$2,000',
            requirements: [
                'Candidate must be a Canadian or Mexican national',
                'Role must be on the approved TN profession list (engineers, accountants, scientists, etc.)',
                'No annual cap and no lottery; can apply at port of entry (Canadian nationals)',
            ],
        },
        {
            visaType: 'L-1',
            country: 'us',
            description: 'Intracompany transferee — for employees transferring from overseas entity',
            typicalProcessingWeeks: '3–5 months',
            employerCostEstimate: '$5,000–$10,000',
            requirements: [
                'Candidate must have worked for a related foreign entity for at least 1 year in the past 3 years',
                'L-1A for managers/executives; L-1B for specialised knowledge workers',
            ],
        },
    ],
    uk: [
        {
            visaType: 'Skilled Worker Visa',
            country: 'uk',
            description: 'Main route for overseas hires; replaced Tier 2 General in 2021',
            typicalProcessingWeeks: '3–8 weeks',
            employerCostEstimate: '£1,500–£3,000 in sponsor licence + CoS fees (plus candidate visa fees)',
            requirements: [
                'Employer must hold a valid Sponsor Licence (UKVI)',
                'Role must be on the eligible occupation list (most professional roles qualify)',
                'Salary must meet the higher of: general threshold (£38,700 as of April 2024) or the "going rate" for the SOC code',
                'Candidate must achieve 70 points (job offer 20 + salary 20 + English 10 + sponsor 20)',
                'English language requirement (B1 level)',
            ],
        },
        {
            visaType: 'Global Talent Visa',
            country: 'uk',
            description: 'No employer sponsorship needed; candidate must be endorsed by a recognised body',
            typicalProcessingWeeks: '5–8 weeks (endorsement) + 3 weeks (visa)',
            employerCostEstimate: 'Minimal — candidate bears most cost',
            requirements: [
                'Candidate must obtain endorsement from UKRI, Royal Academy of Engineering, British Academy, Royal Society, Tech Nation, or Arts Council',
                'No job offer or salary requirement once endorsed',
                'Recognised as "leader or potential leader" in their field',
            ],
        },
    ],
    australia: [
        {
            visaType: '482 TSS Visa (Temporary Skill Shortage)',
            country: 'australia',
            description: 'Temporary sponsored work visa; most common route for skilled hires',
            typicalProcessingWeeks: '4–12 weeks',
            employerCostEstimate: 'AUD $3,000–$7,000 (nomination + SAF levy)',
            requirements: [
                'Employer must be an approved sponsor',
                'Role must be on MLTSSL (medium-to-long term) or STSOL (short-term) occupation list',
                'Salary must meet TSMIT (Temporary Skilled Migration Income Threshold — AUD $73,150 in 2024) and market salary rate',
                'Skills assessment may be required for certain occupations',
            ],
        },
        {
            visaType: '186 Employer Nomination Scheme (ENS)',
            country: 'australia',
            description: 'Permanent residency pathway via employer nomination',
            typicalProcessingWeeks: '6–24 months',
            employerCostEstimate: 'AUD $4,000–$10,000',
            requirements: [
                'Candidate must typically have held a 482 visa for 3 years with the nominating employer',
                'Occupation must be on the MLTSSL',
                'Age under 45 at time of application',
            ],
        },
    ],
    canada: [
        {
            visaType: 'Labour Market Impact Assessment (LMIA)',
            country: 'canada',
            description: 'Standard route; employer must prove no Canadian can fill the role',
            typicalProcessingWeeks: '2–6 months',
            employerCostEstimate: 'CAD $1,000 application fee + legal costs',
            requirements: [
                'Employer must advertise the role for at least 4 weeks across multiple channels',
                'Must demonstrate no qualified Canadian citizen / PR applied',
                'Positive LMIA enables candidate to apply for a work permit',
            ],
        },
        {
            visaType: 'CUSMA (formerly NAFTA) TN',
            country: 'canada',
            description: 'For US and Mexican nationals in approved professions — no LMIA needed',
            typicalProcessingWeeks: 'Days to weeks',
            employerCostEstimate: 'Minimal',
            requirements: [
                'Candidate must be a US or Mexican national',
                'Role must be on the approved CUSMA profession list',
            ],
        },
        {
            visaType: 'Intra-Company Transfer (ICT)',
            country: 'canada',
            description: 'For employees of multinational companies transferring to Canadian entity',
            typicalProcessingWeeks: '2–4 weeks (LMIA-exempt)',
            employerCostEstimate: 'CAD $500–$2,000',
            requirements: [
                'Candidate must have worked for the company for 1 year in last 3 years',
                'Must be an executive, senior manager, or specialised knowledge worker',
            ],
        },
    ],
    singapore: [
        {
            visaType: 'Employment Pass (EP)',
            country: 'singapore',
            description: 'Primary work pass for professionals; no quota but Fair Consideration Framework applies',
            typicalProcessingWeeks: '3–8 weeks',
            employerCostEstimate: 'SGD $200–$500 in government fees',
            requirements: [
                'Salary must meet MOM minimum (SGD $5,000/month for most sectors; SGD $5,500 for financial services in 2024)',
                'Candidate must have acceptable qualifications and professional background',
                'Job must be posted on MyCareersFuture for 14 days before EP application (Fair Consideration Framework)',
                'Employer must be registered in Singapore',
            ],
        },
    ],
    uae: [
        {
            visaType: 'UAE Work Permit / Employment Visa',
            country: 'uae',
            description: 'Employer-sponsored work permit issued through the Ministry of Human Resources & Emiratisation (MOHRE)',
            typicalProcessingWeeks: '2–4 weeks',
            employerCostEstimate: 'AED 5,000–15,000 in government fees + medical testing',
            requirements: [
                'Employer must have a valid trade licence in the UAE',
                'Candidate\'s qualifications must be attested (UAE embassy + Ministry of Foreign Affairs)',
                'Medical fitness test required in-country',
                'Emiratisation quotas apply in private sector (Nafis programme) — check if role qualifies',
                'UAE Golden Visa available for highly skilled professionals (no employer sponsor required)',
            ],
        },
    ],
    japan: [
        {
            visaType: 'Engineer/Specialist in Humanities/International Services Visa',
            country: 'japan',
            description: 'Most common work visa for professional roles in Japan',
            typicalProcessingWeeks: '4–12 weeks',
            employerCostEstimate: '¥4,000 in government fees; legal costs vary',
            requirements: [
                'Employer must be a legal entity in Japan (or a branch)',
                'Role must match the visa category (engineering, humanities, international services)',
                'Candidate must have a relevant bachelor\'s degree or 10 years of professional experience',
                'Certificate of Eligibility issued by Immigration Services Agency — employer applies on behalf of candidate',
                'Japan has strict labour laws; permanent employment is assumed — fixed-term contracts have restrictions',
            ],
        },
    ],
    brazil: [
        {
            visaType: 'VITEM V Work Visa (Temporary Work)',
            country: 'brazil',
            description: 'Temporary work authorisation issued by Brazil\'s Ministry of Labour (MTE)',
            typicalProcessingWeeks: '6–12 weeks',
            employerCostEstimate: 'BRL 2,000–5,000 in fees; legal costs vary',
            requirements: [
                'Brazilian employer must file a request with the Ministry of Labour (MTE)',
                'Two-thirds rule: most companies must maintain at least 2/3 Brazilian nationals in their workforce',
                'Candidate must have minimum 2 years of professional experience',
                'Salary must be competitive with market rates (reviewed by MTE)',
            ],
        },
    ],
    mexico: [
        {
            visaType: 'FM3 / Temporal Residency with Work Rights',
            country: 'mexico',
            description: 'Temporary residency with permission to work in Mexico',
            typicalProcessingWeeks: '4–8 weeks',
            employerCostEstimate: 'MXN 5,000–15,000 in fees + legal costs',
            requirements: [
                'Mexican employer must obtain a work permit from INM (National Immigration Institute)',
                'Candidate must apply for residency visa at Mexican consulate in their home country',
                'Proportionality rule: companies must have a ratio of 90% Mexican workers to 10% foreign workers (some exceptions apply)',
            ],
        },
    ],
    switzerland: [
        {
            visaType: 'Swiss Work Permit (B/L Permit)',
            country: 'switzerland',
            description: 'EU/EFTA nationals have priority; non-EU/EFTA nationals subject to annual quota',
            typicalProcessingWeeks: '4–10 weeks',
            employerCostEstimate: 'CHF 1,000–3,000 in cantonal fees',
            requirements: [
                'EU/EFTA nationals: simplified process under Freedom of Movement Agreement',
                'Non-EU/EFTA: annual quota applies — only senior specialists and managers typically qualify',
                'Employer must demonstrate no qualified EU/EFTA candidate was available (labour market test)',
                'Salary must be in line with Swiss market rates (significant — Switzerland has one of the highest cost-of-living adjustments globally)',
            ],
        },
    ],
    new_zealand: [
        {
            visaType: 'Accredited Employer Work Visa (AEWV)',
            country: 'new_zealand',
            description: 'Standard employer-sponsored work visa for skilled workers',
            typicalProcessingWeeks: '4–10 weeks',
            employerCostEstimate: 'NZD $700–$2,500 in government fees',
            requirements: [
                'Employer must be accredited with Immigration New Zealand',
                'Job check must be approved — confirms role pays at or above median wage (NZD $29.66/hr in 2024) or meets sector-specific criteria',
                'Evidence of advertising the role (labour market test) unless exempt',
                'Candidate must meet English language requirements and health/character criteria',
            ],
        },
    ],
};

const RTW_DOCUMENTS: Partial<Record<HiringCountry, Record<CandidateStatus, string[]>>> = {
    uk: {
        citizen:               ['UK passport (valid or expired)', 'OR: UK birth certificate + proof of NI number (P45, payslip, HMRC letter)'],
        permanent_resident:    ['Biometric Residence Permit (BRP)', 'OR: UKVI Share Code for online right to work check'],
        eu_eea_citizen:        ['UKVI Share Code confirming Settled or Pre-Settled Status — check via home.affairs.gov.uk', 'Note: EU national IDs alone are NOT valid after 30 June 2021'],
        settled_status:        ['UKVI Share Code confirming Settled or Pre-Settled Status'],
        existing_work_visa:    ['Biometric Residence Permit (BRP) showing visa category, conditions, and expiry', 'UKVI Share Code for online right to work check'],
        student_work_rights:   ['BRP showing student visa with permitted hours of work', 'Confirm term-time hours restriction (usually 20h/week)'],
        requires_sponsorship:  ['N/A — sponsorship must be granted before candidate can start'],
        unknown:               ['Request UKVI Share Code — allows online check that confirms all entitlements'],
    },
    us: {
        citizen:               ['US passport', 'OR: US birth certificate + government-issued ID', 'OR: US Passport Card'],
        permanent_resident:    ['Permanent Resident Card (Green Card)', 'OR: Arrival-Departure Record (I-94) + foreign passport with immigrant visa'],
        eu_eea_citizen:        ['Note: EU citizenship alone does not grant US work authorisation — treat as requires_sponsorship'],
        settled_status:        ['Not applicable in the US'],
        existing_work_visa:    ['I-94 Arrival/Departure Record (shows visa type and expiry)', 'Foreign passport with valid visa stamp', 'EAD card if on OPT/CPT or other EAD-eligible category'],
        student_work_rights:   ['I-20 + EAD (for OPT/CPT)', 'Confirm OPT/CPT hours restrictions and expiry date', 'STEM OPT requires E-Verify enrollment'],
        requires_sponsorship:  ['N/A — sponsorship must be granted before candidate can start'],
        unknown:               ['Complete I-9 Section 1 — candidate self-certifies; employer must verify documents in Section 2'],
    },
    australia: {
        citizen:               ['Australian passport', 'OR: Australian citizenship certificate + government-issued photo ID'],
        permanent_resident:    ['Australian Permanent Resident visa label in passport', 'OR: VEVO check (Visa Entitlement Verification Online)'],
        eu_eea_citizen:        ['Not applicable — check via VEVO for specific visa conditions'],
        settled_status:        ['Not applicable in Australia'],
        existing_work_visa:    ['VEVO check confirming visa type, conditions, and expiry', 'Foreign passport with visa label (if applicable)'],
        student_work_rights:   ['VEVO check confirming student visa with work rights', 'Note: typically limited to 48 hours per fortnight during studies'],
        requires_sponsorship:  ['N/A — 482 nomination must be lodged and approved before candidate starts'],
        unknown:               ['Conduct VEVO check — requires passport number or visa grant number'],
    },
};

function getRtwDocuments(country: HiringCountry, status: CandidateStatus): string[] {
    const countryDocs = RTW_DOCUMENTS[country];
    if (!countryDocs) {
        return ['Contact legal counsel for right-to-work document requirements in this jurisdiction.'];
    }
    return countryDocs[status] ?? ['Contact legal counsel — status combination not mapped.'];
}

// ---------------------------------------------------------------------------
// Right to Work assessment
// ---------------------------------------------------------------------------

export function assessRightToWork(input: RightToWorkInput): RightToWorkResult {
    const requiresSponsorship = input.candidateStatus === 'requires_sponsorship';
    const canProceedWithoutSponsorship = [
        'citizen', 'permanent_resident', 'eu_eea_citizen', 'settled_status',
        'existing_work_visa', 'student_work_rights',
    ].includes(input.candidateStatus);

    const eligible = canProceedWithoutSponsorship || (requiresSponsorship && (input.sponsorshipAvailable ?? false));
    const documentsToCheck = getRtwDocuments(input.country, input.candidateStatus);

    const sponsorshipOptions = requiresSponsorship
        ? (SPONSORED_VISA_OPTIONS[input.country] ?? [])
        : [];

    const notes: string[] = [];

    if (input.candidateStatus === 'existing_work_visa' && input.visaExpiryDate) {
        const expiry = new Date(input.visaExpiryDate);
        const now    = new Date();
        const daysLeft = Math.round((expiry.getTime() - now.getTime()) / 86400000);
        if (daysLeft < 90) {
            notes.push(`⚠️ Visa expires in ${daysLeft} days (${input.visaExpiryDate}) — factor into offer timeline.`);
        }
        if (daysLeft < 0) {
            notes.push(`🔴 Visa has EXPIRED — candidate is not eligible to work. Do not proceed without legal advice.`);
        }
    }

    if (input.candidateStatus === 'student_work_rights') {
        notes.push('Student work rights are typically time-limited and may restrict hours — confirm OPT/CPT/student visa conditions before extending offer.');
    }

    if (input.country === 'uk' && input.candidateStatus === 'eu_eea_citizen') {
        notes.push('EU/EEA nationals in UK must have EUSS Settled or Pre-Settled Status to work legally post-Brexit. Accept Share Code — not physical EU ID.');
    }

    if (requiresSponsorship && !input.sponsorshipAvailable) {
        notes.push('Sponsorship is not available — this candidate cannot legally work in this role. Consider informing candidate early to avoid wasted time.');
    }

    const sponsorshipTimeline = requiresSponsorship && sponsorshipOptions.length > 0
        ? `Typical timeline: ${sponsorshipOptions[0]?.typicalProcessingWeeks ?? 'varies by visa type'}. Factor this into the offer and start date.`
        : undefined;

    const recruitingGuidance = requiresSponsorship && !input.sponsorshipAvailable
        ? 'STOP: This candidate requires sponsorship and none is available. Do not advance or make offer without legal review.'
        : requiresSponsorship
        ? `Proceed with caution: sponsorship required. Engage immigration counsel before extending offer. Sponsor the correct visa type: ${sponsorshipOptions.map(o => o.visaType).join(' / ')}.`
        : 'Proceed: candidate appears eligible to work. Complete document verification per your RTW policy before start date.';

    const expiryRisk = input.visaExpiryDate
        ? (() => {
            const expiry = new Date(input.visaExpiryDate);
            const now    = new Date();
            const daysLeft = Math.round((expiry.getTime() - now.getTime()) / 86400000);
            if (daysLeft < 0)  return `EXPIRED ${Math.abs(daysLeft)} days ago`;
            if (daysLeft < 30) return `Expires in ${daysLeft} days — URGENT`;
            if (daysLeft < 90) return `Expires in ${daysLeft} days — plan extension`;
            return `Expires in ${daysLeft} days — OK`;
        })()
        : undefined;

    return {
        country: input.country,
        eligible,
        requiresSponsorship,
        canProceedWithoutSponsorship,
        documentCheckRequired: true,
        documentsToCheck,
        sponsorshipOptions,
        sponsorshipTimeline,
        expiryRisk,
        notes,
        recruitingGuidance,
        legalWarning: 'This assessment is advisory only. Right-to-work requirements change frequently. Always verify with qualified immigration counsel before making an employment offer to a foreign national.',
    };
}

// ---------------------------------------------------------------------------
// IR35 assessment (UK only)
// ---------------------------------------------------------------------------

export function assessIr35Status(input: Ir35Input): Ir35Result {
    if (!input.hasPscOrLimitedCompany) {
        return {
            determination: 'outside_ir35',
            riskLevel: 'low',
            insideFactors: [],
            outsideFactors: ['Contractor does not operate through a PSC/Ltd Co — IR35 does not apply. Treat as a sole trader engagement.'],
            keyRisks: [],
            practicalGuidance: ['Confirm the contractor is genuinely self-employed (not a disguised employee) using employment status tests.'],
            statusDetermination: `IR35 does not apply: ${input.roleTitle} contractor does not operate through an intermediary.`,
            nextSteps: ['Issue a Contract for Services (not an employment contract)', 'Confirm contractor is registered for Self Assessment and responsible for own tax/NI'],
            legalWarning: 'IR35 assessment is advisory. Use HMRC\'s CEST tool for a definitive check and retain the output as evidence of reasonable care.',
        };
    }

    const insideFactors: string[] = [];
    const outsideFactors: string[] = [];

    if (input.workerControlledByEngager === true)   insideFactors.push('Control: Engager dictates when, where, and how the work is done.');
    if (input.workerControlledByEngager === false)  outsideFactors.push('Control: Worker has autonomy over how and when work is delivered.');
    if (input.workerControlledByEngager === null)   insideFactors.push('Control: Not assessed — this is the most important test; must be determined.');

    if (input.substitutionAllowed === false)         insideFactors.push('Substitution: Worker cannot send a substitute — personal service required.');
    if (input.substitutionAllowed === true)          outsideFactors.push('Substitution: Worker can send a qualified substitute — strong outside indicator.');
    if (input.substitutionAllowed === null)          insideFactors.push('Substitution: Not assessed — substitution right should be documented in the contract.');

    if (input.mutualityOfObligation === true)        insideFactors.push('Mutuality of Obligation (MOO): Engager is obliged to offer work and worker is obliged to accept — employee-like relationship.');
    if (input.mutualityOfObligation === false)       outsideFactors.push('Mutuality of Obligation: No obligation on either side beyond the specific project — outside indicator.');
    if (input.mutualityOfObligation === null)        insideFactors.push('Mutuality of Obligation: Not assessed — review contract and working practices.');

    if (input.workerProvidesOwnEquipment === true)   outsideFactors.push('Equipment: Worker uses own tools/equipment — business-in-own-right indicator.');
    if (input.workerProvidesOwnEquipment === false)  insideFactors.push('Equipment: Engager provides equipment — employee-like indicator.');

    if (input.workerBearesFinancialRisk === true)    outsideFactors.push('Financial risk: Worker corrects defects at own cost / bears financial risk — outside indicator.');
    if (input.workerBearesFinancialRisk === false)   insideFactors.push('Financial risk: Worker bears no financial risk — employee-like indicator.');

    if (input.workerHasMultipleClients === true)     outsideFactors.push('Multiple clients: Worker operates with multiple clients — genuine business indicator.');
    if (input.workerHasMultipleClients === false)    insideFactors.push('Multiple clients: Worker works exclusively for this engager — inside indicator.');

    if (input.integrationIntoOrganisation === true)  insideFactors.push('Integration: Worker is part of org chart, uses company email, attends all-hands — employee-like.');
    if (input.integrationIntoOrganisation === false) outsideFactors.push('Integration: Worker operates distinctly from employees — outside indicator.');

    if (input.engagementLengthMonths > 24)           insideFactors.push(`Duration: Engagement is ${input.engagementLengthMonths} months — long duration increases MOO and control risk.`);

    const insideScore  = insideFactors.length;
    const outsideScore = outsideFactors.length;
    const total        = insideScore + outsideScore;

    let determination: Ir35Result['determination'];
    let riskLevel: Ir35Result['riskLevel'];

    if (total === 0) {
        determination = 'uncertain';
        riskLevel = 'high';
    } else if (insideScore / total >= 0.65) {
        determination = 'inside_ir35';
        riskLevel = 'high';
    } else if (outsideScore / total >= 0.65) {
        determination = 'outside_ir35';
        riskLevel = 'low';
    } else {
        determination = 'uncertain';
        riskLevel = 'medium';
    }

    const keyRisks: string[] = [];
    if (determination === 'inside_ir35' || determination === 'uncertain') {
        keyRisks.push('If inside IR35, the engager must operate PAYE/NI deductions via an "off-payroll" payroll process.');
        keyRisks.push('Failure to comply can result in HMRC investigation and liability for unpaid PAYE, NI, and interest + penalties.');
        if (input.engagementLengthMonths > 24) {
            keyRisks.push('Long engagement length significantly increases HMRC audit risk — consider converting to employment.');
        }
    }
    if (determination === 'uncertain') {
        keyRisks.push('Uncertain determination — do NOT proceed without specialist IR35 legal advice and a full contract review.');
    }

    const statusDetermination = [
        `IR35 Status Determination Statement (SDS) — ${input.roleTitle}`,
        `Engager: ${input.engagerName ?? '[Engager Name]'}`,
        `Date: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        ``,
        `Determination: ${determination === 'inside_ir35' ? 'INSIDE IR35' : determination === 'outside_ir35' ? 'OUTSIDE IR35' : 'UNCERTAIN — FURTHER REVIEW REQUIRED'}`,
        ``,
        `Factors considered:`,
        `Inside factors: ${insideFactors.length > 0 ? insideFactors.join('; ') : 'None identified'}`,
        `Outside factors: ${outsideFactors.length > 0 ? outsideFactors.join('; ') : 'None identified'}`,
        ``,
        `Engager signature: _________________________  Date: __________`,
    ].join('\n');

    const practicalGuidance: string[] = [];
    if (determination === 'inside_ir35') {
        practicalGuidance.push('Operate PAYE/NI deductions on payments to the contractor\'s PSC (off-payroll working rules).');
        practicalGuidance.push('Provide the contractor with a copy of this SDS — they have the right to appeal within 45 days.');
        practicalGuidance.push('Consider renegotiating day rate to account for the contractor\'s increased tax burden (or converting to employment).');
    }
    if (determination === 'outside_ir35') {
        practicalGuidance.push('Document the evidence supporting this determination and retain it for 6 years (HMRC audit risk).');
        practicalGuidance.push('Review working practices regularly — if actual working arrangements change (e.g. engager starts directing work), reassess.');
        practicalGuidance.push('Include IR35-friendly clauses in the contract: right of substitution, no obligation of exclusivity, project-based scope.');
    }
    if (determination === 'uncertain') {
        practicalGuidance.push('Engage a specialist IR35 adviser or employment law barrister before any engagement starts.');
        practicalGuidance.push('Run the HMRC CEST tool (check-employment-status-for-tax.service.gov.uk) and retain the output.');
        practicalGuidance.push('Consider restructuring the engagement terms to establish a clearer outside-IR35 position.');
    }

    return {
        determination,
        riskLevel,
        insideFactors,
        outsideFactors,
        keyRisks,
        practicalGuidance,
        statusDetermination,
        nextSteps: [
            determination !== 'outside_ir35' ? 'Seek specialist IR35 legal / tax advice before engagement starts' : null,
            'Issue a Status Determination Statement (SDS) to the contractor before work begins — legally required for medium/large engagers',
            'Retain all evidence (CEST output, contract, working practices documentation) for 6 years',
            determination === 'inside_ir35' ? 'Configure payroll to deduct PAYE/NI from contractor payments' : null,
            'Set a review date — reassess if engagement extends beyond 12 months or working practices change',
        ].filter(Boolean) as string[],
        legalWarning: 'This IR35 assessment is advisory only. IR35 determinations depend on the full facts of the engagement. Always use the HMRC CEST tool and consult a qualified IR35 adviser before making a determination.',
    };
}

// ---------------------------------------------------------------------------
// GDPR candidate data handling
// ---------------------------------------------------------------------------

/** Countries / regions with data privacy laws and their framework name */
const DATA_PRIVACY_FRAMEWORKS: Partial<Record<HiringCountry, string>> = {
    uk:          'UK GDPR (retained EU law post-Brexit) / DPA 2018',
    germany:     'GDPR (EU) 2016/679 + BDSG (Bundesdatenschutzgesetz)',
    france:      'GDPR (EU) 2016/679 + Loi Informatique et Libertés',
    netherlands: 'GDPR (EU) 2016/679 + UAVG',
    spain:       'GDPR (EU) 2016/679 + LOPDGDD',
    sweden:      'GDPR (EU) 2016/679 + Dataskyddslagen',
    ireland:     'GDPR (EU) 2016/679 + Data Protection Acts 1988–2018',
    canada:      'PIPEDA (federal) + provincial laws (PIPA AB/BC, Law 25 QC)',
    australia:   'Privacy Act 1988 (Cth) + Australian Privacy Principles (APPs)',
    brazil:      'LGPD — Lei Geral de Proteção de Dados (Law 13.709/2018)',
    india:       'Digital Personal Data Protection Act 2023 (DPDPA)',
    singapore:   'Personal Data Protection Act 2012 (PDPA)',
    south_korea: 'Personal Information Protection Act (PIPA)',
    japan:       'Act on Protection of Personal Information (APPI)',
    israel:      'Protection of Privacy Law 1981 + Regulations 2017',
    new_zealand: 'Privacy Act 2020',
    uae:         'UAE Personal Data Protection Law (PDPL, Federal Decree-Law No. 45 of 2021)',
};

const EU_GDPR_COUNTRIES: HiringCountry[] = ['uk', 'germany', 'france', 'netherlands', 'spain', 'sweden', 'ireland'];

export function buildGdprRecruitmentWorkflow(input: GdprRecruitmentInput): GdprRecruitmentResult {
    const isSubjectToGdpr = EU_GDPR_COUNTRIES.includes(input.companyCountry)
        || EU_GDPR_COUNTRIES.includes(input.candidateCountry);
    const candidateFramework = DATA_PRIVACY_FRAMEWORKS[input.candidateCountry];
    const companyFramework = DATA_PRIVACY_FRAMEWORKS[input.companyCountry];

    const defaultRetention = input.processingPurpose === 'active_application' ? 6 :
                             input.processingPurpose === 'talent_pool'        ? 24 : 12;
    const retentionMonths  = input.retentionMonths ?? defaultRetention;

    const lawfulBasis = input.processingPurpose === 'active_application'
        ? 'Legitimate interests (Art. 6(1)(f) GDPR) — processing is necessary to assess the candidate\'s suitability for employment. The balance test favours processing as the candidate submitted their application voluntarily and the processing is limited to recruitment purposes.'
        : input.processingPurpose === 'talent_pool'
        ? 'Consent (Art. 6(1)(a) GDPR) — explicit, freely given, informed, and unambiguous consent must be obtained before adding a candidate to a talent pool. Candidates who did not actively apply must consent before their data is retained.'
        : 'Legitimate interests (Art. 6(1)(f) GDPR) — processing speculative applications for recruitment purposes.';

    const candidateRights = [
        'Right of access (Art. 15) — candidates can request a copy of all personal data held',
        'Right to erasure / right to be forgotten (Art. 17) — candidates can request deletion of their data; honour within 30 days unless legal hold applies',
        'Right to rectification (Art. 16) — candidates can correct inaccurate data',
        'Right to object (Art. 21) — candidates can object to processing based on legitimate interests',
        'Right to data portability (Art. 20) — candidates can request data in machine-readable format (where processing is consent-based)',
        'Right not to be subject to solely automated decision-making (Art. 22) — if ATS screening is fully automated, candidates must be notified and able to request human review',
    ];

    const requiredPrivacyNoticeElements = [
        'Identity and contact details of the data controller (your company)',
        'Contact details of the Data Protection Officer (if applicable)',
        'Purpose(s) of processing and legal basis for each',
        'Legitimate interests pursued (if applicable)',
        'Categories of personal data collected',
        'Recipients or categories of recipients (e.g. ATS vendor, background check provider)',
        'Details of any transfers outside the UK/EEA and safeguards in place',
        'Retention periods (or criteria used to determine them)',
        'All data subject rights and how to exercise them',
        'Right to lodge a complaint with the supervisory authority (ICO in UK; relevant DPA in EU)',
        'Whether providing data is a statutory/contractual requirement and consequences of not providing it',
    ];

    const crossBorderTransferNotes = isSubjectToGdpr
        ? [
            'If personal data is transferred outside the UK/EEA (e.g. to a US-based ATS, LinkedIn, or background check provider), ensure an appropriate transfer mechanism is in place:',
            '  — UK: International Data Transfer Agreement (IDTA) or UK Addendum to EU SCCs',
            '  — EU: Standard Contractual Clauses (SCCs, 2021 version)',
            '  — US–EU: EU-US Data Privacy Framework (if US provider is certified)',
            'Conduct a Transfer Impact Assessment (TIA) for transfers to higher-risk jurisdictions.',
        ].join('\n')
        : undefined;

    const thirdPartySharingNotes = input.thirdPartySharing && input.thirdPartySharing.length > 0
        ? `Candidate data will be shared with: ${input.thirdPartySharing.join(', ')}. Each vendor must have a Data Processing Agreement (DPA) in place (Art. 28 GDPR). Review each vendor\'s privacy practices and sub-processor list.`
        : undefined;

    const consentLanguage = input.processingPurpose === 'talent_pool'
        ? `[For talent pool opt-in]\n\n"We would like to keep your details on file so we can contact you about future opportunities at ${input.companyName} that may be a good match for your skills and experience.\n\nYour data will be held securely for up to ${retentionMonths} months. You can withdraw your consent and request deletion of your data at any time by contacting [HR email].\n\n☐ Yes, I consent to ${input.companyName} retaining my personal data for recruitment purposes for up to ${retentionMonths} months."`
        : '';

    const privacyNoticeDraft = [
        `## Recruitment Privacy Notice — ${input.companyName}`,
        ``,
        `**Who we are:** ${input.companyName} is the data controller for personal data collected during our recruitment process.`,
        `**What data we collect:** Name, contact details, employment and education history, right-to-work documents, and any other information you provide in your application.`,
        `**Why we collect it:** To assess your suitability for the role(s) you applied for and to manage our recruitment process.`,
        `**Legal basis:** ${lawfulBasis.split('—')[0]?.trim() ?? 'Legitimate interests'}.`,
        `**How long we keep it:** We retain unsuccessful candidate data for up to **${retentionMonths} months** from the date of application, after which it is securely deleted.`,
        `**Who we share it with:** ${input.thirdPartySharing && input.thirdPartySharing.length > 0 ? input.thirdPartySharing.join(', ') + '. All processors have signed a Data Processing Agreement.' : 'We do not share your data with third parties except where required by law.'}`,
        crossBorderTransferNotes ? `**International transfers:** ${crossBorderTransferNotes.split('\n')[0]}` : null,
        `**Your rights:** You have the right to access, rectify, erase, and object to processing of your data. To exercise your rights, contact: [HR email / DPO email].`,
        `**Complaints:** You have the right to lodge a complaint with the ${input.companyCountry === 'uk' ? 'Information Commissioner\'s Office (ICO) at ico.org.uk' : 'relevant data protection authority in your country'}.`,
    ].filter(Boolean).join('\n');

    const checklist = [
        'Insert company name, HR email, and DPO contact into this notice before using',
        'Publish privacy notice on your careers page and link to it from the application form',
        'Set up automated deletion for unsuccessful candidate data at the retention period',
        input.processingPurpose === 'talent_pool' ? 'Obtain explicit consent before adding any candidate to talent pool — do not assume consent from a job application' : null,
        input.thirdPartySharing && input.thirdPartySharing.length > 0 ? `Sign Data Processing Agreements with: ${input.thirdPartySharing.join(', ')}` : null,
        isSubjectToGdpr ? 'Review ATS and background check vendor for GDPR compliance and cross-border transfer mechanisms' : null,
        'Train all recruiters on data subject rights response process (30-day deadline for access/erasure requests)',
        'Document your Transfer Impact Assessment if sending data outside UK/EEA',
        // Non-EU data privacy law reminders
        candidateFramework && !isSubjectToGdpr ? `⚠️ Candidate data is subject to ${candidateFramework} — ensure consent and retention policies comply.` : null,
        companyFramework && !isSubjectToGdpr && companyFramework !== candidateFramework ? `⚠️ Your company operations are subject to ${companyFramework} — ensure recruitment data handling is compliant.` : null,
        input.candidateCountry === 'brazil' ? 'LGPD (Brazil): obtain valid consent or legitimate interest basis before processing; data subject rights apply — erasure, access, portability.' : null,
        input.candidateCountry === 'india' ? 'DPDPA (India): obtain explicit consent; appoint Data Fiduciary; provide privacy notice in candidate\'s language if reasonably possible.' : null,
        input.candidateCountry === 'canada' ? 'PIPEDA (Canada): meaningful consent required; Quebec Law 25 adds stricter requirements — privacy impact assessment may be needed for new tech use.' : null,
        input.candidateCountry === 'australia' ? 'Australian Privacy Act: ensure APPs compliance; candidates have right of access and correction; cross-border disclosure rules apply.' : null,
    ].filter(Boolean) as string[];

    return {
        lawfulBasis,
        retentionPeriodGuidance: `Retain for ${retentionMonths} months from end of recruitment process, then securely delete. UK/EU requirement.`,
        candidateRights,
        requiredPrivacyNoticeElements,
        crossBorderTransferNotes,
        thirdPartySharingNotes,
        consentLanguage,
        privacyNoticeDraft,
        checklist,
    };
}

// ---------------------------------------------------------------------------
// Market JD adaptation
// ---------------------------------------------------------------------------

const MARKET_ADAPTATIONS: Record<HiringCountry, Omit<MarketAdaptation, 'country'>> = {
    us: {
        localCurrency: 'USD',
        salaryTerminology: 'Base salary + bonus + equity (RSUs/options). Quote annual figures.',
        dateFormat: 'MM/DD/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Glassdoor', 'ZipRecruiter', 'Dice (tech)', 'Handshake (campus)'],
        localTerminologyNotes: ['Use "PTO" not "annual leave"', 'Use "benefits" not "perks"', '"At-will" employment — state in offer letter', 'Avoid "overqualified" — age discrimination risk'],
        mandatoryBenefitNotes: ['Health insurance (ACA compliance for 50+ employees)', 'FMLA leave (50+ employees)', 'State-specific paid sick leave varies — check state law', 'No federally mandated paid vacation — but competitive market standard is 15–20 days'],
        publicHolidayNote: '11 federal public holidays; many states add state holidays. Practice varies by employer.',
        probationPeriodNote: 'Not legally required in most US states; if used, state clearly in offer letter. "At-will" employment already allows termination without cause.',
        noticePeriodNorm: 'Typically 2 weeks (at-will); senior roles may negotiate 4–8 weeks.',
    },
    uk: {
        localCurrency: 'GBP',
        salaryTerminology: 'Annual salary + bonus (if applicable). Quote gross annual figure. Include pension contribution separately.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Reed', 'Totaljobs', 'CV-Library', 'CWJobs (tech)', 'Guardian Jobs (public sector / education)'],
        localTerminologyNotes: ['Use "holiday" not "vacation/PTO"', 'Use "CV" not "resume"', '"Notice period" is the standard term (not "two weeks notice")', 'Avoid "aggressive" in job descriptions — UK audiences respond negatively'],
        mandatoryBenefitNotes: ['Minimum 28 days annual leave (including public holidays) — statutory minimum', 'Auto-enrolment pension (3% employer minimum contribution)', 'Statutory Sick Pay (SSP)', 'Maternity/Paternity/Shared Parental Leave per statutory minimum', 'National Living Wage compliance (£11.44/hr in 2024)'],
        publicHolidayNote: '8 public holidays in England & Wales; 9 in Scotland; 10 in Northern Ireland. Many employers give these on top of annual leave.',
        probationPeriodNote: 'Typically 3–6 months. Shorter notice period applies during probation. Must be specified in contract. Employees gain unfair dismissal rights after 2 years.',
        noticePeriodNorm: 'Legally: 1 week per year of service (min 1 week, max 12 weeks statutory). Market norm: 1 month for professional roles; 3–6 months for senior/exec.',
    },
    ireland: {
        localCurrency: 'EUR',
        salaryTerminology: 'Annual gross salary. Quote "OTE" (On Target Earnings) for sales roles. Pension is a key differentiator.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'IrishJobs.ie', 'Jobs.ie', 'Glassdoor'],
        localTerminologyNotes: ['Use "holiday" not "vacation"', '"Public holidays" (there are 10 in Ireland)', 'Reference role currency in EUR'],
        mandatoryBenefitNotes: ['Minimum 4 weeks + public holidays annual leave', 'Statutory sick pay (SSP): up to 5 days/year (2024)', 'Parental leave, maternity/paternity leave per statute', 'Minimum wage: €12.70/hr (2024)'],
        publicHolidayNote: '10 public holidays per year in Ireland.',
        probationPeriodNote: 'Max 6 months (extendable to 12 months in exceptional circumstances per 2023 Transparent Terms Act). Must be in contract.',
        noticePeriodNorm: '1 week statutory minimum; market norm 1–3 months for professional roles.',
    },
    germany: {
        localCurrency: 'EUR',
        salaryTerminology: 'Bruttogehalt (gross annual salary). Include Urlaub (vacation days). 13th month salary ("Weihnachtsgeld") is common but not mandatory.',
        dateFormat: 'DD.MM.YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'XING (Germany-specific)', 'StepStone', 'Indeed', 'Glassdoor', 'Monster.de'],
        localTerminologyNotes: ['JDs must be gender-neutral in German (use * or : e.g. "Entwickler*in")', 'Works Council (Betriebsrat) must be consulted for new hires in companies with 5+ employees', '"Probezeit" = probationary period (max 6 months)', 'Avoid "flexible hours" without defining what this means — German employees expect clear working time agreements'],
        mandatoryBenefitNotes: ['Minimum 20 days annual leave (Bundesurlaubsgesetz); market norm 25–30 days', 'Social security contributions (~20% each employer/employee)', 'Minimum wage: €12.41/hr (2024)', 'Works council approval may be needed before certain hiring decisions'],
        publicHolidayNote: '9–13 public holidays depending on German state (Bundesland). All state-specific holidays are legally observed.',
        probationPeriodNote: 'Max 6 months Probezeit. During Probezeit, 2-week notice period applies. After Probezeit, statutory notice is 4 weeks to 7 months depending on tenure.',
        noticePeriodNorm: 'Statutory: 4 weeks to 7 months (tenure-dependent). Senior roles often contractually extend to 3–6 months.',
    },
    france: {
        localCurrency: 'EUR',
        salaryTerminology: 'Salaire brut annuel (gross annual). RTT days (extra leave) are common for executives. Mutuelle (health top-up) is mandatory for employees.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Glassdoor', 'APEC (cadres/managers)', 'Pôle Emploi', 'Welcome to the Jungle'],
        localTerminologyNotes: ['French language JD strongly preferred (may be legally required in some contexts)', '"Cadre" vs "non-cadre" classification has significant legal implications', 'Avoid "competitive salary" — French candidates expect a specific range or figure', 'RTT (réduction du temps de travail) leave is a key differentiator for senior hires'],
        mandatoryBenefitNotes: ['25 days annual leave minimum (statutory)', 'RTT days for executives under 35-hour week agreements', 'Mandatory employer health insurance top-up (mutuelle)', 'Meal vouchers (Tickets Restaurant) are a common benefit', 'Profit-sharing (participation, intéressement) for companies with 50+ employees', 'Minimum wage: SMIC €11.65/hr (2024)'],
        publicHolidayNote: '11 national public holidays. Alsace-Moselle region has 2 additional holidays.',
        probationPeriodNote: 'Période d\'essai: 2 months (non-cadre) or 4 months (cadre), renewable once. Special rules for termination during period.',
        noticePeriodNorm: '1–3 months depending on collective agreement (convention collective) and seniority. Collective agreements govern most employment terms in France.',
    },
    netherlands: {
        localCurrency: 'EUR',
        salaryTerminology: 'Bruto maandsalaris (gross monthly) + holiday allowance (8% of annual gross — vakantiegeld, paid in May). State total annual gross.',
        dateFormat: 'DD-MM-YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Glassdoor', 'Werkzoeken.nl', 'Nationale Vacaturebank'],
        localTerminologyNotes: ['Dutch JD strongly preferred for local candidates', '30% ruling (tax ruling for skilled migrants) is a significant incentive — mention if applicable', 'Work-life balance emphasis is critical in NL market', '"Reiskostenvergoeding" (commuting allowance) is standard and must be offered'],
        mandatoryBenefitNotes: ['Minimum 20 days leave (4 × weekly hours); market norm 25 days', 'Holiday allowance: 8% of gross annual salary (vakantiegeld)', 'Pension: many sectors have mandatory sectoral pension schemes', 'Commuting allowance (reiskostenvergoeding) — €0.23/km tax-free or public transport reimbursement', 'Minimum wage: €13.27/hr (2024)'],
        publicHolidayNote: '11 national public holidays. Good Friday and Easter Monday are widely observed but not statutory.',
        probationPeriodNote: 'Max 1 month for contracts < 2 years; max 2 months for permanent contracts. Must be in writing.',
        noticePeriodNorm: '1–4 months (tenure-dependent statutory minimum). Collective agreements often set longer periods.',
    },
    spain: {
        localCurrency: 'EUR',
        salaryTerminology: 'Salario bruto anual. Spanish salaries are typically split into 12 or 14 monthly payments (some include Christmas and summer bonuses). Quote annual gross.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'InfoJobs (dominant in Spain)', 'Glassdoor', 'Tecnoempleo (tech)'],
        localTerminologyNotes: ['Spanish-language JD strongly preferred', 'Collective agreements (convenio colectivo) govern most employment conditions — identify the applicable one', '14 salary payments (pagas) is common — specify in offer'],
        mandatoryBenefitNotes: ['30 days annual leave (22 working days)', 'Social security ~30% employer contribution', 'Minimum wage: SMI €1,134/month (2024)', 'Sick pay: first 3 days at employer cost; days 4–20 at 60% salary (social security); 75% from day 21'],
        publicHolidayNote: '12 national public holidays + regional holidays (vary by Autonomous Community).',
        probationPeriodNote: 'Regulated by collective agreement: typically 6 months for qualified technicians, 2 months for others.',
        noticePeriodNorm: '15 days statutory minimum; collective agreement and individual contract may extend this.',
    },
    sweden: {
        localCurrency: 'SEK',
        salaryTerminology: 'Månadslön (monthly gross). Quote monthly. Bonus and equity should be quoted separately.',
        dateFormat: 'YYYY-MM-DD',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Arbetsförmedlingen', 'Jobbsafari', 'Glassdoor'],
        localTerminologyNotes: ['Swedish JD preferred for local market', 'Equality and inclusion language is very important in Sweden', 'Kollektivavtal (collective agreement) governs most employment — identify applicable agreement', 'Mention "friskvårdsbidrag" (wellness allowance) — very valued in Sweden'],
        mandatoryBenefitNotes: ['25 days annual leave (minimum statutory)', 'Employer pays 31.42% social security contributions', 'Swedish Parental Leave Insurance: 480 days per child — highly valued, mention dad/second parent leave support', 'Collective agreement benefits (healthcare, extra pension) vary by sector', 'Minimum wage set by collective agreement (no statutory minimum wage)'],
        publicHolidayNote: '13 public holidays. Midsummer, Easter, and Christmas are major breaks affecting hiring timelines.',
        probationPeriodNote: 'Max 6 months (provanställning) per Swedish Employment Protection Act (LAS). Must be agreed in writing.',
        noticePeriodNorm: 'LAS statutory: 1–6 months based on tenure. Collective agreements typically add longer notice for senior roles.',
    },
    australia: {
        localCurrency: 'AUD',
        salaryTerminology: '"Package" in AU includes base + superannuation (11% employer super in 2024). Quote "base + super" or "total package" — be explicit.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Seek (dominant)', 'Indeed', 'Glassdoor', 'CareerOne'],
        localTerminologyNotes: ['Superannuation ("super") is mandatory and a key part of total comp — always quote', '"Annual leave" not "vacation/PTO"', '"Redundancy" not "layoff"', 'Fair Work Act governs all employment — reference Modern Awards if applicable'],
        mandatoryBenefitNotes: ['4 weeks annual leave (National Employment Standards)', 'Superannuation: 11% employer contribution (increasing to 12% by 2025)', 'Personal/carer\'s leave: 10 days paid', 'Parental leave: 18 weeks government-funded at minimum wage; additional employer-paid is a differentiator', 'Long service leave after 7–10 years (varies by state)', 'Fair Work minimum wage: AUD $23.23/hr (2024)'],
        publicHolidayNote: '8 national public holidays + state-specific holidays (Australia Day, Queen\'s Birthday dates vary by state).',
        probationPeriodNote: 'Typically 3–6 months. Unfair dismissal protections only apply after 6 months (small business: 12 months). Must be specified in contract.',
        noticePeriodNorm: 'Minimum 1–4 weeks statutory (tenure-dependent per NES). Market norm: 4 weeks for professional roles; 3 months for senior/exec.',
    },
    canada: {
        localCurrency: 'CAD',
        salaryTerminology: 'Annual base salary. Quote CAD. Bonus and equity quoted separately.',
        dateFormat: 'DD/MM/YYYY or MM/DD/YYYY (varies by province — use "Month DD, YYYY" to avoid ambiguity)',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed', 'Glassdoor', 'Workopolis', 'Job Bank (government)'],
        localTerminologyNotes: ['Employment standards vary significantly by province — check provincial law (ON, BC, AB, QC most populous)', 'Quebec requires French-language JD for QC-based roles (Charter of the French Language)', 'CPP (Canada Pension Plan) / QPP (Quebec) and EI employer contributions required', '"Statutory holiday" not "public holiday" in Canadian context'],
        mandatoryBenefitNotes: ['Minimum vacation: 2 weeks (10 days) after 1 year; 3 weeks after 5 years (federal standards; provincial minimums vary)', 'CPP/QPP employer contribution (~5.95% of insurable earnings)', 'Employment Insurance (EI) employer premium (~1.66× employee premium)', 'Maternity/Parental leave: up to 18 months EI-funded (employer top-up is a differentiator)', 'Provincial minimum wages vary: from $15.65 (SK) to $17.40 (BC) in 2024'],
        publicHolidayNote: '9–12 public holidays depending on province. Quebec has distinct statutory holidays.',
        probationPeriodNote: 'Probation period rules vary by province. Not a true "at-will" jurisdiction — even probationary terminations require notice in most provinces after short tenure.',
        noticePeriodNorm: 'Common law entitlement (often much longer than statutory minimum) applies — seek legal advice before any termination. Market norm: 2–4 weeks for entry/mid; 1–3 months for senior.',
    },
    singapore: {
        localCurrency: 'SGD',
        salaryTerminology: 'Monthly gross salary. CPF (Central Provident Fund) contributions are on top (employer: 17%, employee: 20% for <55s). Quote base monthly.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'MyCareersFuture (government)', 'JobStreet', 'Indeed', 'Glassdoor'],
        localTerminologyNotes: ['Fair Consideration Framework: advertise on MyCareersFuture for 14 days before applying for EP', '"Variable bonus" (AWS — 13th month) is standard; mention if included', 'Annual wage supplement (AWS) is a market norm'],
        mandatoryBenefitNotes: ['CPF: employer 17% + employee 20% (for salaries ≤ SGD $6,000/month)', '14 days annual leave after 1 year; increases with tenure', 'Annual Wage Supplement (AWS / 13th month): not statutory but market standard', 'Childcare and maternity/paternity leave per Government-Paid Leave schemes'],
        publicHolidayNote: '11 gazetted public holidays. Many employers give a replacement day if a public holiday falls on Sunday.',
        probationPeriodNote: 'Typically 3–6 months. Notice during probation is usually 1 week. Employment Act applies to most employees.',
        noticePeriodNorm: '1 week statutory (first 26 weeks); 1 month thereafter (or as per contract). Senior roles often specify 1–3 months.',
    },
    india: {
        localCurrency: 'INR',
        salaryTerminology: 'CTC (Cost to Company) is the standard in India — includes base salary, PF contributions, gratuity, allowances, and benefits. Quote annual CTC.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Naukri.com (dominant)', 'Indeed', 'Monster India', 'Glassdoor', 'Internshala (campus)'],
        localTerminologyNotes: ['"CTC" not "annual salary"', 'Variable pay / performance bonus is typically 15–30% of CTC', 'HRA (House Rent Allowance) is a common tax-efficient component', 'Quote in INR Lakhs (e.g. "₹18–24 LPA")'],
        mandatoryBenefitNotes: ['EPF (Employees\' Provident Fund): 12% employer + 12% employee of basic salary', 'ESI (health insurance) for employees earning ≤ ₹21,000/month', 'Gratuity: 4.81% of basic salary (payable after 5 years of service)', 'Paid leave: typically 15–21 days annual leave + national/state public holidays', 'Maternity leave: 26 weeks paid (50+ employees)'],
        publicHolidayNote: '3 national holidays (Republic Day, Independence Day, Gandhi Jayanti) + 5–10 state/regional holidays. Many employers offer a floating holiday allowance.',
        probationPeriodNote: 'Typically 3–6 months. Notice during probation is usually as per contract (often 30 days). Termination rules vary by state.',
        noticePeriodNorm: 'Market norm: 30–90 days. Senior roles and tech companies often have 60–90 day notice periods. "Garden leave" is uncommon.',
    },
    uae: {
        localCurrency: 'AED',
        salaryTerminology: 'Monthly gross salary (AED). UAE has no income tax — this is a major selling point. Include housing allowance separately if applicable.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Bayt.com', 'GulfTalent', 'Naukrigulf', 'Indeed'],
        localTerminologyNotes: ['No income tax is a key recruitment incentive — emphasise it', 'Housing allowance is a standard component of UAE packages', 'Medical insurance for employee is mandatory', 'Emiratisation (Nafis) quotas may apply to certain roles in private sector'],
        mandatoryBenefitNotes: ['Medical insurance: mandatory for all employees in most Emirates', 'End-of-Service Gratuity: 21 days\' basic salary per year of service for first 5 years, then 30 days per year', 'Annual leave: 30 calendar days after 1 year of service', 'Minimum wage: no statutory minimum, but immigration requires "adequate" salary'],
        publicHolidayNote: '~14 public holidays per year (Islamic calendar holidays vary annually based on moon sighting).',
        probationPeriodNote: 'Max 6 months. Employee can be terminated with 14 days\' notice during probation.',
        noticePeriodNorm: 'Minimum 30 days (up to 90 days for some roles) as per UAE Labour Law. Must be specified in contract.',
    },
    saudi_arabia: {
        localCurrency: 'SAR',
        salaryTerminology: 'Monthly gross salary (SAR). No personal income tax in Saudi Arabia. Housing and transport allowances are common.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Bayt.com', 'GulfTalent', 'Naukrigulf', 'Taqat (government portal)'],
        localTerminologyNotes: ['Saudisation (Nitaqat) quotas are strictly enforced — verify headcount eligibility before hiring expat', 'No income tax for employees — major incentive', 'Iqama (residency permit) tied to employer', 'GOSI (social insurance) is mandatory for Saudi nationals'],
        mandatoryBenefitNotes: ['End-of-Service Gratuity: 0.5 months\' salary per year for first 5 years; 1 month per year thereafter', 'Annual leave: 21 days (< 5 years); 30 days (5+ years)', 'Medical insurance: mandatory for all employees', 'Annual flight home: standard market benefit for expats'],
        publicHolidayNote: '~12 public holidays (Islamic calendar; varies annually). Eid al-Fitr and Eid al-Adha are major breaks.',
        probationPeriodNote: 'Max 90 days. May be extended to 180 days by mutual agreement.',
        noticePeriodNorm: 'Minimum 30 days for unlimited contracts. Notice obligations governed by Saudi Labour Law Article 75.',
    },
    japan: {
        localCurrency: 'JPY',
        salaryTerminology: 'Annual salary (nenshu) in JPY. Monthly breakdown common. Bonus (sōbu) paid twice yearly (June and December) is standard — up to 4–6 months of base salary.',
        dateFormat: 'YYYY/MM/DD',
        localJobBoardRecommendations: ['LinkedIn', 'Daijob (bilingual)', 'Indeed Japan', 'GaijinPot Jobs (English-speaking)', 'Wantedly (startup-friendly)'],
        localTerminologyNotes: ['Lifetime employment culture is changing but still influences candidate expectations', '"Sōbu" (bonus) is a key factor — always specify', 'Japanese candidates value stability — emphasise company longevity and benefits', 'English-language JD is acceptable for international roles; Japanese preferred for local market'],
        mandatoryBenefitNotes: ['Social insurance (shakai hoken): health + pension + employment insurance — ~15% employer contribution', 'Paid leave: 10 days after 6 months, increasing to 20 days after 6.5 years', 'Annual bonus is market standard (not statutory but expected)', 'Commuting allowance (kōtsūhi) is standard and tax-exempt up to certain limit'],
        publicHolidayNote: '16 national holidays per year (including Golden Week in late April/early May — significant hiring slowdown).',
        probationPeriodNote: 'Typically 3–6 months (shiyō-kikan). Termination during probation still requires valid reason under Japanese labour law.',
        noticePeriodNorm: 'Civil Code: 2 weeks minimum. Market norm: 1–3 months. Senior roles often 3 months. Japanese employees rarely leave without serving full notice.',
    },
    south_korea: {
        localCurrency: 'KRW',
        salaryTerminology: 'Annual salary (yŏnbong) in KRW. Year-end bonus (performance pay) is standard.',
        dateFormat: 'YYYY-MM-DD',
        localJobBoardRecommendations: ['LinkedIn', 'JobKorea', 'Saramin', 'Wanted (startup-focused)', 'Indeed Korea'],
        localTerminologyNotes: ['Chaebol (Samsung, LG, Hyundai etc.) dominate and set market salary benchmarks', 'Hierarchical culture — job title and seniority are very important', 'English proficiency (TOEIC/OPIC) often required for international roles', 'Hagwon (private tutoring) experience relevant for education-sector roles'],
        mandatoryBenefitNotes: ['4 major insurances: national pension, health insurance, employment insurance, industrial accident insurance (mandatory employer contributions)', 'Annual leave: 15 days after 1 year, increasing with tenure', 'Severance pay: mandatory 1 month per year of service (for 1+ year employees)', 'Retirement pension plan: required — choose between DB/DC plan'],
        publicHolidayNote: '15 national holidays. Chuseok and Seollal (Lunar New Year) are major multi-day holidays affecting hiring.',
        probationPeriodNote: 'Typically 3–6 months. Labour Standards Act applies — termination requires just cause even during probation.',
        noticePeriodNorm: '1 month statutory; market norm 1–3 months. Many Korean employees give longer notice in practice.',
    },
    brazil: {
        localCurrency: 'BRL',
        salaryTerminology: 'Monthly gross salary (salário bruto) in BRL. CLT (Brazilian Labour Law) governs most formal employment. 13th salary (décimo terceiro) is mandatory.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Catho', 'InfoJobs Brasil', 'Vagas.com.br', 'Empregos.com.br'],
        localTerminologyNotes: ['CLT (Consolidação das Leis do Trabalho) governs employment — very employee-protective', '"PJ" (Pessoa Jurídica) contracting is common for flexibility but subject to enforcement risks', '13th salary is mandatory — include in total package calculation', 'LGPD (Lei Geral de Proteção de Dados) is Brazil\'s GDPR equivalent — applies to candidate data'],
        mandatoryBenefitNotes: ['13th salary: mandatory additional monthly salary paid in December (or split June/November)', 'FGTS: 8% of monthly salary deposited by employer (severance fund)', 'Transportation voucher (Vale-Transporte): employer must provide or reimburse commuting costs', 'Meal/food voucher (Vale-Refeição): market norm; PAT programme gives tax benefits', 'INSS social security: ~20–22% employer contribution', 'Annual leave: 30 calendar days after 12 months + paid 1/3 additional vacation bonus'],
        publicHolidayNote: '12–15 national + municipal public holidays. Carnival (variable dates) significantly affects business activity.',
        probationPeriodNote: 'Max 90 days (prorated: typically 45 + 45 days). During probation, termination requires only "aviso prévio" (notice) — no severance.',
        noticePeriodNorm: '30 days statutory; increases by 3 days per year of service up to 90 days.',
    },
    mexico: {
        localCurrency: 'MXN',
        salaryTerminology: 'Monthly gross salary (salario bruto) in MXN. Christmas bonus (aguinaldo — 15 days minimum) and vacation premium are statutory.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'OCC Mundial', 'Indeed México', 'Computrabajo', 'Glassdoor'],
        localTerminologyNotes: ['Aguinaldo (Christmas bonus) is mandatory — at least 15 days\' salary', 'PTU (profit sharing) is mandatory for companies with profit — typically 10% of profits distributed to employees', 'IMSS (social security) and INFONAVIT (housing fund) employer contributions are mandatory', 'Nearshore boom has driven up salaries for tech roles significantly'],
        mandatoryBenefitNotes: ['Aguinaldo: 15 days\' salary (paid by 20 December)', 'PTU (Participación de los Trabajadores en las Utilidades): profit-sharing — typically 10% of pre-tax profits', 'Vacation: 12 days after first year, increasing by 2 days per year up to 20', 'Vacation premium: 25% of vacation salary (prima vacacional)', 'IMSS: ~20–25% employer contribution', 'INFONAVIT: 5% of salary for housing fund'],
        publicHolidayNote: '7 mandatory public holidays + 2 optional (Decree holidays). Day of the Dead (Nov 2) affects operations in some regions.',
        probationPeriodNote: 'Max 30 days (180 days for management roles). Must be specified in writing.',
        noticePeriodNorm: 'Mexico Federal Labour Law provides for "justificable termination" only. Notice periods are contractual; 30 days is market standard.',
    },
    switzerland: {
        localCurrency: 'CHF',
        salaryTerminology: 'Annual gross salary (Jahresgehalt / salaire annuel brut) in CHF. Switzerland has some of the highest salaries globally — validate against market data carefully.',
        dateFormat: 'DD.MM.YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Jobs.ch', 'Indeed Switzerland', 'Jobscout24', 'Glassdoor'],
        localTerminologyNotes: ['No statutory minimum wage (nationally) — some cantonal minimums exist (Geneva highest at CHF 24.32/hr in 2024)', 'AHV/IV/ALV (social insurance) mandatory contributions ~11% employer', 'Work permit quotas for non-EU/EFTA nationals are very restrictive', 'Four official languages (German, French, Italian, Romansh) — match JD language to region'],
        mandatoryBenefitNotes: ['AHV (old age insurance): ~5.3% employer contribution', 'BVG (occupational pension): mandatory 2nd pillar — contribution varies by age and salary', 'Minimum 4 weeks annual leave; 5 weeks for under-20s', 'Accident insurance (UVG/SUVA): mandatory', 'No statutory sick pay period but insurance (Taggeldversicherung) is market standard'],
        publicHolidayNote: '8 national public holidays + cantonal holidays (Zurich has 5 extra; Ticino up to 15 extra). Verify cantonal holidays for office location.',
        probationPeriodNote: 'Typically 1–3 months (Code of Obligations Art. 335b). During probation: 7-day notice. After probation: 1–3 months (depending on years of service).',
        noticePeriodNorm: 'Statutory: 1 month (year 1), 2 months (years 2–9), 3 months (10+ years). Senior roles often contractually specify 3–6 months.',
    },
    italy: {
        localCurrency: 'EUR',
        salaryTerminology: 'RAL (Reddito Annuo Lordo — annual gross salary) in EUR. 13th month salary (tredicesima) is standard and often mandatory via collective agreement.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed Italy', 'Infojobs.it', 'Monster Italy', 'Glassdoor'],
        localTerminologyNotes: ['National Collective Labour Agreements (CCNL) govern most employment terms by sector', 'Tredicesima (13th month) is effectively mandatory', '"RAL" is the standard salary term — use it', 'Works council (RSU/RSA) must be consulted for significant workforce changes'],
        mandatoryBenefitNotes: ['Tredicesima (13th salary) and often quattordicesima (14th) per CCNL', 'Minimum 4 weeks annual leave + 12 public holidays', 'TFR (Trattamento di Fine Rapporto): 6.91% of gross annual salary accrued as a severance fund', 'INPS social security: ~23–33% employer contribution', 'Maternity: 5 months paid at 80% (INPS-funded)'],
        publicHolidayNote: '12 national public holidays + local patron saint day (varies by city).',
        probationPeriodNote: 'Duration set by CCNL — typically 3–6 months. Must be in writing. Termination during probation is simplified.',
        noticePeriodNorm: 'Set by applicable CCNL — typically 1–3 months for professionals. Longer for senior/management roles.',
    },
    poland: {
        localCurrency: 'PLN',
        salaryTerminology: 'Monthly gross salary (brutto) in PLN. Growing tech hub — Warsaw, Kraków, Wrocław, Poznań have strong talent pools.',
        dateFormat: 'DD.MM.YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Pracuj.pl (dominant)', 'Indeed Poland', 'Nofluffjobs.com (tech)', 'Glassdoor'],
        localTerminologyNotes: ['"Brutto" vs "netto" distinction is crucial — Polish candidates discuss salaries in netto terms; always clarify brutto', 'B2B (self-employment via sole proprietorship) is very common in tech — many candidates prefer it for tax efficiency', 'ZUS social security contributions: ~21% employer; detail in offer', 'GDPR strictly enforced in Poland — ensure candidate data handling is compliant'],
        mandatoryBenefitNotes: ['20 days annual leave (< 10 years service); 26 days (10+ years)', 'ZUS (social security): ~21% employer contribution', 'PPK (Employee Capital Plan): employer contributes 1.5% of gross salary', 'Sick pay: employer pays first 33 days/year; ZUS pays thereafter', 'Minimum wage: PLN 4,242/month (2024)'],
        publicHolidayNote: '13 public holidays. All Saints\' Day (1 Nov) and Independence Day (11 Nov) affect late-year hiring.',
        probationPeriodNote: 'Max 3 months. Fixed-term contracts capped at 3 contracts or 33 months total before permanent status required.',
        noticePeriodNorm: 'Statutory: 2 weeks (< 6 months), 1 month (6 months–3 years), 3 months (3+ years). B2B contracts vary.',
    },
    new_zealand: {
        localCurrency: 'NZD',
        salaryTerminology: 'Annual salary in NZD. Includes KiwiSaver employer contribution (3% minimum). Quote base salary separately.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Seek NZ (dominant)', 'Trade Me Jobs', 'Indeed NZ', 'Glassdoor'],
        localTerminologyNotes: ['KiwiSaver: 3% mandatory employer contribution to retirement savings scheme', 'Employment Relations Act 2000 governs — highly employee-protective', 'Annual leave is "4 weeks" per statute — emphasise this vs fewer-weeks markets', 'Work-life balance is highly valued in NZ — emphasise flexibility'],
        mandatoryBenefitNotes: ['KiwiSaver: 3% employer contribution (mandatory where employee is enrolled)', '4 weeks annual leave (Holidays Act 2003)', '10 sick days per year after 6 months', 'Bereavement leave: 3 days for close family; 1 day for others', 'Parental leave: up to 26 weeks government-funded; plus employer top-up as a differentiator', 'Minimum wage: NZD $22.70/hr (2024)'],
        publicHolidayNote: '12 public holidays. Auckland Anniversary Day (late January) is regional. Waitangi Day (6 Feb) and ANZAC Day (25 Apr) are key.',
        probationPeriodNote: 'No statutory probation period under the Employment Relations Act; any trial period must be agreed in writing and is limited to 90 days. Specific rules apply.',
        noticePeriodNorm: 'No statutory minimum; must be specified in employment agreement. Market norm: 2–4 weeks for junior/mid; 4–12 weeks for senior.',
    },
    israel: {
        localCurrency: 'ILS',
        salaryTerminology: 'Monthly gross salary (ILS). Strong tech ecosystem (Start-Up Nation) — equity (options in startups) is a key part of total comp.',
        dateFormat: 'DD/MM/YYYY',
        localJobBoardRecommendations: ['LinkedIn', 'Drushim', 'AllJobs', 'Jobmaster', 'Start-Up Nation Central (for startups)'],
        localTerminologyNotes: ['Equity/options are expected in tech roles — specify vesting schedule', 'Severance pay (Pitzuyim) is mandatory', 'Pension fund (Kupat Gemel) is mandatory for employees', 'Shabbat and Jewish holidays significantly affect scheduling — be culturally aware'],
        mandatoryBenefitNotes: ['Pension: mandatory employer contribution of 6.5% + 6% disability (totalling 12.5%)', 'Severance pay: 1 month per year of service (often via Pikudei Pitzuyim arrangement funded through pension)', 'Annual leave: 12 days (first 5 years); increasing to 20 days', 'Recuperation pay (Dmei Havra\'ah): 379 ILS/day for 5–10 days per year', 'Sick leave: 18 days/year (paid from day 2)'],
        publicHolidayNote: '~16 public holidays (Jewish calendar — dates vary annually). High Holiday season (Rosh Hashana, Yom Kippur, Sukkot) in Sept–Oct significantly affects business.',
        probationPeriodNote: 'Typically 6–12 months. Severance obligations begin accruing from day one.',
        noticePeriodNorm: 'Statutory: 1 day per month for first year; 14.5 days for year 2; 21.67 days for year 3; 1 month from year 4+. Market norm: 1–3 months.',
    },
    other: {
        localCurrency: '[Local Currency]',
        salaryTerminology: 'Consult local HR or legal counsel for appropriate salary terminology and structure.',
        dateFormat: 'YYYY-MM-DD (ISO — unambiguous)',
        localJobBoardRecommendations: ['LinkedIn', 'Indeed'],
        localTerminologyNotes: ['Consult local labour law and HR norms for this market.'],
        mandatoryBenefitNotes: ['Consult local legal counsel for mandatory benefits and employer contributions.'],
        publicHolidayNote: 'Consult local HR for public holiday schedule.',
        probationPeriodNote: 'Consult local labour law for probation period limits and notice requirements.',
        noticePeriodNorm: 'Consult local labour law for statutory notice periods.',
    },
};

export function getMarketAdaptation(input: MarketAdaptationInput): MarketAdaptation {
    const base = MARKET_ADAPTATIONS[input.country] ?? MARKET_ADAPTATIONS['other'];
    return { country: input.country, ...base };
}
