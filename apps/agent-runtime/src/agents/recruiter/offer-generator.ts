/**
 * Offer Generator
 *
 * Drafts a complete, professional employment offer letter covering
 * compensation, start date, role details, conditions, and acceptance steps.
 * Also validates that the offer is within approved budget.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayFrequency = 'annual' | 'monthly' | 'hourly';
export type OfferType = 'full_time' | 'part_time' | 'contract' | 'internship';

export interface CompensationPackage {
    baseSalary: number;
    currency: string;
    payFrequency: PayFrequency;
    signingBonus?: number;
    targetBonus?: number;            // annual target bonus %
    equityGrant?: {
        shares?: number;
        options?: number;
        vestingSchedule?: string;    // e.g. "4 years, 1-year cliff"
        strikePrice?: number;
    };
    probationPeriod?: string;        // e.g. "90 days"
}

export interface OfferInput {
    candidateName: string;
    jobTitle: string;
    department: string;
    hiringManagerName: string;
    companyName: string;
    companyAddress?: string;
    offerType: OfferType;
    startDate: string;
    workArrangement: 'remote' | 'hybrid' | 'onsite';
    officeLocation?: string;
    compensation: CompensationPackage;
    benefits?: string[];
    reportingTo?: string;
    conditions?: string[];           // e.g. ["background check", "reference checks"]
    offerExpiryDate?: string;
    hrSignatoryName?: string;
    hrSignatoryTitle?: string;
    // Budget validation
    approvedBudgetMax?: number;
    // Country / jurisdiction — determines which statutory language is included
    country?: 'us' | 'uk' | 'australia' | 'canada' | 'eu' | string;
    /** US state abbreviation (e.g. 'CA', 'MT') — activates state-specific at-will language. */
    stateOfHire?: string;
}

export interface OfferValidation {
    withinBudget: boolean;
    baseSalaryVsBudget?: string;
    totalCompVsBudget?: string;
    warnings: string[];
}

export interface OfferResult {
    candidateName: string;
    jobTitle: string;
    offerLetterText: string;
    compensationSummary: string;
    validation: OfferValidation;
    sendingChecklist: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FREQ_LABEL: Record<PayFrequency, string> = {
    annual: 'per year',
    monthly: 'per month',
    hourly: 'per hour',
};

const OFFER_TYPE_LABEL: Record<OfferType, string> = {
    full_time: 'Full-Time',
    part_time: 'Part-Time',
    contract: 'Contract',
    internship: 'Internship',
};

const DEFAULT_BENEFITS_US = [
    'Comprehensive medical, dental, and vision coverage',
    'Flexible PTO and paid public holidays',
    'Annual learning & development stipend',
    '401(k) with employer matching contribution',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_UK = [
    'Company pension via auto-enrolment (employer contribution per Pensions Act 2008)',
    '28 days annual leave including public holidays (5.6 weeks statutory minimum)',
    'Private medical insurance',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_AU = [
    'Superannuation at the legislated Superannuation Guarantee rate (currently 11%)',
    '4 weeks annual leave per the National Employment Standards (Fair Work Act 2009)',
    'Private health insurance subsidy',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_CA = [
    'Group benefits plan (medical, dental, vision)',
    'Employer RRSP matching contribution',
    'Vacation pay at minimum 4% of earnings (in accordance with applicable ESA)',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_EU = [
    'Company pension plan',
    'Annual leave per Working Time Directive (minimum 4 weeks / 20 days)',
    'Private medical supplement',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_IN = [
    'Provident Fund (EPF) employer contributions per the Employees\' Provident Funds Act 1952',
    'Gratuity entitlement per the Payment of Gratuity Act 1972 (payable after 5 years)',
    'Annual leave per applicable Shops & Establishments Act',
    'Group health insurance',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_SG = [
    'CPF (Central Provident Fund) employer contributions as required by law',
    'Minimum 7–14 days\' annual leave per the Employment Act (Cap 91A)',
    'Group medical and dental insurance',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_UAE = [
    'End-of-service gratuity per UAE Labour Law (Federal Decree-Law No. 33/2021)',
    '30 calendar days\' annual leave (after 1 year of service)',
    'Employer-provided health insurance (mandatory per UAE regulations)',
    'Annual flight allowance (home country, if applicable)',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_BR = [
    '13th month salary (Décimo Terceiro) per Brazilian law',
    '30 calendar days\' annual leave plus one-third holiday bonus',
    'FGTS contributions (8% of gross monthly salary)',
    'Vale-transporte and vale-refeição (transport and meal allowances)',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_MX = [
    'Aguinaldo (Christmas bonus) — minimum 15 days\' salary per LFT',
    'Profit sharing (PTU) per applicable statutory provisions',
    'IMSS (social security), INFONAVIT, and AFORE contributions',
    'Annual leave per LFT seniority schedule',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_JP = [
    'Shakai hoken (health + pension) and koyo hoken (employment insurance) employer contributions',
    'Annual paid leave starting at 10 days (increasing with tenure per Labour Standards Act)',
    'Performance/year-end bonus (where applicable)',
    'Commuting allowance',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_KR = [
    '4 mandatory insurances: National Pension, Health Insurance, Employment Insurance, Industrial Accident',
    'Statutory severance pay (퇴직금) — 30 days\' average wage per year of service',
    '15 days\' annual paid leave after 1 year of continuous service',
    'Annual performance bonus',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_IL = [
    'Pension fund (keren pensia) and advanced training fund (keren hishtalmut) employer contributions',
    'Annual leave per the Annual Leave Law (minimum 12 days, increasing with tenure)',
    'Group health insurance supplement',
    'Annual learning & development budget',
    'Home office setup allowance (remote/hybrid)',
];

const DEFAULT_BENEFITS_CH = [
    'BVG (occupational pension — 2nd pillar) employer contributions',
    'AHV/IV/EO and ALV (unemployment insurance) contributions',
    'Minimum 4 weeks\' annual leave',
    'Private supplementary health insurance (Zusatzversicherung)',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_PL = [
    'ZUS (social insurance) employer contributions — pension, disability, sickness, and accident',
    'Employer PPK (Employees\' Capital Plans) contributions',
    'Minimum 20–26 days\' annual leave per Labour Code',
    'Private medical and group life insurance',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_NZ = [
    'KiwiSaver employer contributions (minimum 3% of gross earnings)',
    '4 weeks\' annual leave per the Holidays Act 2003',
    'Employer ACC (Accident Compensation Corporation) levies',
    'Group health insurance',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS_SA = [
    'End-of-service award per Saudi Labour Law',
    '21–30 calendar days\' annual leave (per seniority per Saudi Labour Law)',
    'GOSI (General Organization for Social Insurance) contributions',
    'Employer-provided health insurance',
    'Annual learning & development budget',
];

const DEFAULT_BENEFITS = DEFAULT_BENEFITS_US; // backward-compat alias

function getCountryBenefits(country?: string): string[] {
    const c = (country ?? 'us').toLowerCase();
    if (c === 'uk' || c === 'gb' || c === 'england' || c === 'scotland' || c === 'wales') return DEFAULT_BENEFITS_UK;
    if (c === 'australia' || c === 'au') return DEFAULT_BENEFITS_AU;
    if (c === 'canada' || c === 'ca') return DEFAULT_BENEFITS_CA;
    if (['germany', 'france', 'netherlands', 'spain', 'sweden', 'ireland', 'eu',
         'poland', 'switzerland', 'israel'].some(eu => c.includes(eu))) return DEFAULT_BENEFITS_EU;
    if (c === 'india' || c === 'in') return DEFAULT_BENEFITS_IN;
    if (c === 'singapore' || c === 'sg') return DEFAULT_BENEFITS_SG;
    if (c === 'uae' || c === 'ae' || c === 'united arab emirates') return DEFAULT_BENEFITS_UAE;
    if (c === 'brazil' || c === 'br') return DEFAULT_BENEFITS_BR;
    if (c === 'mexico' || c === 'mx') return DEFAULT_BENEFITS_MX;
    if (c === 'japan' || c === 'jp') return DEFAULT_BENEFITS_JP;
    if (c === 'south korea' || c === 'korea' || c === 'kr') return DEFAULT_BENEFITS_KR;
    if (c === 'israel' || c === 'il') return DEFAULT_BENEFITS_IL;
    if (c === 'switzerland' || c === 'ch') return DEFAULT_BENEFITS_CH;
    if (c === 'poland' || c === 'pl') return DEFAULT_BENEFITS_PL;
    if (c === 'new zealand' || c === 'nz') return DEFAULT_BENEFITS_NZ;
    if (c === 'saudi arabia' || c === 'sa' || c === 'ksa') return DEFAULT_BENEFITS_SA;
    return DEFAULT_BENEFITS_US;
}

/** Country-specific statutory clauses appended to the offer body. */
// NOTE: second param is companyName — used in the US at-will clause. Historic param name was
// `jobTitle` (a bug); callers pass input.companyName here.
function getStatutoryClause(country?: string, companyName?: string, stateOfHire?: string): string {
    const c = (country ?? 'us').toLowerCase();

    if (c === 'uk' || c === 'gb' || c === 'england' || c === 'scotland' || c === 'wales') {
        return [
            '',
            '**Statutory Rights (UK)**',
            'This offer of employment is subject to the Employment Rights Act 1996 and subsequent legislation. ' +
            'Your statutory minimum notice entitlement under section 86 ERA 1996 will apply. ' +
            'You will be automatically enrolled into a qualifying workplace pension scheme pursuant to the ' +
            'Pensions Act 2008. Right-to-work documents must be provided and verified prior to your start date ' +
            'in accordance with the Immigration, Asylum and Nationality Act 2006. ' +
            'This role is subject to the Working Time Regulations 1998.',
        ].join('\n');
    }

    if (c === 'australia' || c === 'au') {
        return [
            '',
            '**Statutory Rights (Australia)**',
            'This offer is made subject to the Fair Work Act 2009 (Cth) and the applicable Modern Award or ' +
            'Enterprise Agreement (if any). You are entitled to the National Employment Standards (NES), ' +
            'including 4 weeks annual leave, 10 days personal/carer\'s leave, parental leave, and flexible working ' +
            'arrangements as applicable. Superannuation will be paid at the legislated Superannuation Guarantee rate ' +
            'to your nominated complying superannuation fund. Right-to-work verification is required under the ' +
            'Migration Act 1958.',
        ].join('\n');
    }

    if (c === 'canada' || c === 'ca') {
        return [
            '',
            '**Statutory Rights (Canada)**',
            'This offer is governed by the employment standards legislation applicable in the province or territory ' +
            'of employment. Minimum statutory entitlements (notice, vacation pay, public holidays, and leave ' +
            'entitlements) are set by the relevant Employment Standards Act and cannot be waived. ' +
            'Your right to work in Canada must be verified prior to commencement as required by the ' +
            'Immigration and Refugee Protection Act.',
        ].join('\n');
    }

    if (['germany', 'france', 'netherlands', 'spain', 'sweden', 'ireland',
         'poland', 'eu'].some(eu => c.includes(eu))) {
        // Derive a readable country label — avoid the "[INSERT COUNTRY]" placeholder
        const countryLabel = c === 'eu'
            ? 'the country of employment'
            : c.charAt(0).toUpperCase() + c.slice(1);
        return [
            '',
            '**Statutory Rights (European Union / EEA)**',
            `This contract is subject to the labour laws of ${countryLabel}, including protections under ` +
            'the EU Working Time Directive (2003/88/EC) which guarantees a minimum of 20 days paid annual leave. ' +
            'Your personal data will be processed in accordance with the General Data Protection Regulation ' +
            '(GDPR) (EU) 2016/679. A works council (where applicable) will be consulted as required by local law. ' +
            'Right-to-work documentation must be provided prior to your start date.',
        ].join('\n');
    }

    if (c === 'switzerland' || c === 'ch') {
        return [
            '',
            '**Statutory Rights (Switzerland)**',
            'This offer is subject to the Swiss Code of Obligations (Obligationenrecht) and the Labour Act ' +
            '(Arbeitsgesetz). You are entitled to a minimum of 4 weeks\' annual leave (5 weeks if under age 20). ' +
            'Both employer and employee contribute to AHV/IV/EO (social security) and ALV (unemployment insurance). ' +
            'Employer BVG (occupational pension — 2nd pillar) contributions are mandatory. Notice periods are ' +
            'governed by Articles 335 et seq. of the Code of Obligations. Applicable collective labour agreements ' +
            '(Gesamtarbeitsvertrag / convention collective) may also apply.',
        ].join('\n');
    }

    if (c === 'israel' || c === 'il') {
        return [
            '',
            '**Statutory Rights (Israel)**',
            'This offer is subject to Israeli employment law, including the Annual Leave Law 5711-1951, the ' +
            'Severance Pay Law 5723-1963, and the Employee\'s Prior Notice Law 5761-2001. You are entitled to ' +
            'a minimum of 12 days\' annual leave (increasing with seniority up to 28 days), severance pay of ' +
            'one month\'s salary per year of service, and employer contributions to a pension fund (keren pensia) ' +
            'and advanced training fund (keren hishtalmut). Written prior notice of termination is required by law.',
        ].join('\n');
    }

    if (c === 'india' || c === 'in') {
        return [
            '',
            '**Statutory Rights (India)**',
            'This offer is subject to applicable Indian employment legislation, including the Payment of Wages ' +
            'Act 1936, the Minimum Wages Act 1948, the Payment of Gratuity Act 1972, and the Shops and ' +
            'Establishments Act of the state of employment. You are entitled to gratuity of 15 days\' wages per ' +
            'year of service (payable after 5 years of continuous employment). Employer contributions to the ' +
            'Employees\' Provident Fund (EPF) will be made per the EPF and Miscellaneous Provisions Act 1952. ' +
            'Annual leave entitlements are governed by the applicable state Shops and Establishments Act.',
        ].join('\n');
    }

    if (c === 'singapore' || c === 'sg') {
        return [
            '',
            '**Statutory Rights (Singapore)**',
            'This offer is subject to the Employment Act (Cap 91A) and related Singapore legislation. You are ' +
            'entitled to a minimum of 7 days\' annual leave (increasing to 14 days after 8 years of service), ' +
            'sick leave, and public holiday entitlements. CPF (Central Provident Fund) contributions will be made ' +
            'as required by law for Singapore Citizens and Permanent Residents. Right-to-work documentation ' +
            '(work pass or visa) must be verified prior to commencement.',
        ].join('\n');
    }

    if (c === 'uae' || c === 'ae' || c === 'united arab emirates') {
        return [
            '',
            '**Statutory Rights (UAE)**',
            'This offer is subject to Federal Decree-Law No. 33 of 2021 (UAE Labour Law) and implementing ' +
            'regulations. You are entitled to 30 calendar days\' annual leave after 1 year of service, and an ' +
            'end-of-service gratuity (21 days\' basic wage per year for the first 5 years; 30 days per year ' +
            'thereafter). Employer-provided health insurance is mandatory. Right-to-work verification (valid ' +
            'residence visa and work permit) is required under UAE Federal Law No. 6 of 1973 and amendments.',
        ].join('\n');
    }

    if (c === 'brazil' || c === 'br') {
        return [
            '',
            '**Statutory Rights (Brazil)**',
            'This offer is subject to the Consolidação das Leis do Trabalho (CLT) and applicable federal and ' +
            'state legislation. You are entitled to 30 calendar days\' annual leave (plus one-third additional ' +
            'holiday payment), a 13th month salary (Décimo Terceiro), and FGTS contributions of 8% of gross ' +
            'monthly salary. INSS (social security) and applicable profit-sharing (PLR) obligations apply. ' +
            'Termination notice and severance are governed by the CLT and applicable collective agreements.',
        ].join('\n');
    }

    if (c === 'mexico' || c === 'mx') {
        return [
            '',
            '**Statutory Rights (Mexico)**',
            'This offer is subject to the Ley Federal del Trabajo (LFT) and applicable Mexican legislation. ' +
            'You are entitled to a minimum of 12 days\' annual leave after the first year (increasing per the ' +
            'LFT schedule updated in 2022), an Aguinaldo (Christmas bonus) of at least 15 days\' salary, and ' +
            'mandatory profit sharing (PTU — 10% of taxable profits). Employer contributions are required to ' +
            'IMSS (social security), INFONAVIT (housing fund), and AFORE (retirement fund). Seniority bonuses ' +
            '(prima de antigüedad) apply upon termination.',
        ].join('\n');
    }

    if (c === 'japan' || c === 'jp') {
        return [
            '',
            '**Statutory Rights (Japan)**',
            'This offer is subject to the Labour Standards Act (労働基準法), the Industrial Safety and Health Act, ' +
            'and related Japanese legislation. You are entitled to a minimum of 10 days\' annual paid leave after ' +
            '6 months of continuous employment (increasing to 20 days after 6.5 years). Working hours are limited ' +
            'to 40 hours per week; any overtime is governed by a 36-agreement (三六協定). Social insurance ' +
            'contributions (kenko hoken, kosei nenkin, koyo hoken) apply to both employer and employee.',
        ].join('\n');
    }

    if (c === 'south korea' || c === 'korea' || c === 'kr') {
        return [
            '',
            '**Statutory Rights (South Korea)**',
            'This offer is subject to the Labour Standards Act (근로기준법) and related Korean legislation. ' +
            'You are entitled to a minimum of 15 days\' annual paid leave after 1 year of continuous service, ' +
            'and statutory severance pay (퇴직금) of 30 days\' average wage per year of service (payable after ' +
            '1 year). Working hours are limited to 52 hours per week (40 regular + 12 overtime). Contributions ' +
            'to the National Pension, National Health Insurance, Employment Insurance, and Industrial Accident ' +
            'Compensation Insurance are mandatory.',
        ].join('\n');
    }

    if (c === 'new zealand' || c === 'nz') {
        return [
            '',
            '**Statutory Rights (New Zealand)**',
            'This offer is subject to the Employment Relations Act 2000, the Holidays Act 2003, and related ' +
            'New Zealand legislation. You are entitled to 4 weeks\' annual leave after 12 months of employment, ' +
            '10 days\' sick leave per year, bereavement leave, and public holiday entitlements. Employer ' +
            'KiwiSaver contributions (currently 3% of gross earnings for enrolled employees) and ACC levies are ' +
            'mandatory. Right-to-work verification is required under the Immigration Act 2009.',
        ].join('\n');
    }

    if (c === 'saudi arabia' || c === 'sa' || c === 'ksa') {
        return [
            '',
            '**Statutory Rights (Saudi Arabia)**',
            'This offer is subject to the Saudi Labour Law (Royal Decree No. M/51) and the regulations of the ' +
            'Ministry of Human Resources and Social Development. You are entitled to 21 calendar days\' annual ' +
            'leave (30 days after 5 years of service) and an end-of-service award upon termination (1/3 monthly ' +
            'wage per year for years 1–5; 2/3 per year for years 5–10; full month per year thereafter for ' +
            'employer-initiated termination). GOSI (General Organization for Social Insurance) contributions ' +
            'are mandatory. Saudisation (Nitaqat) requirements apply for non-Saudi employees. A valid Iqama ' +
            '(residency permit) and work permit must be in place prior to commencement.',
        ].join('\n');
    }

    // US default — at-will employment with Montana and California exceptions
    const stateUpper = (stateOfHire ?? '').toUpperCase();
    const isMontan = stateUpper === 'MT' || stateUpper === 'MONTANA';
    const isCalifornia = stateUpper === 'CA' || stateUpper === 'CALIFORNIA';

    let atWillText = `Your employment with ${companyName ?? 'the Company'} is at-will, meaning either you or ` +
        'the Company may terminate the employment relationship at any time, with or without cause or advance notice, ' +
        'except as otherwise required by applicable law.';

    if (isMontan) {
        atWillText += ' **Montana exception:** Under the Montana Wrongful Discharge from Employment Act (§ 39-2-904 MCA), ' +
            'after the completion of your probationary period, the Company may only terminate your employment for ' +
            '"good cause." This offer letter shall serve as notice that your probationary period is ' +
            `${(companyName ?? 'the Company')} standard onboarding period (typically 90 days) unless a separate ` +
            'written probation agreement specifies otherwise.';
    } else if (isCalifornia) {
        atWillText += ' **California note:** California law recognises public policy exceptions to at-will employment ' +
            '(Tameny claims), including termination for whistleblowing, jury duty, military service, and other ' +
            'protected activities. Nothing in this agreement limits those statutory protections.';
    }

    return [
        '',
        '**Employment At-Will**',
        atWillText,
    ].join('\n');
}

function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function buildCompensationSection(comp: CompensationPackage): string {
    const lines: string[] = [
        `**Base Salary:** ${formatCurrency(comp.baseSalary, comp.currency)} ${FREQ_LABEL[comp.payFrequency]}`,
    ];

    if (comp.signingBonus) {
        lines.push(`**Signing Bonus:** ${formatCurrency(comp.signingBonus, comp.currency)} (paid in first payroll)`);
    }
    if (comp.targetBonus) {
        lines.push(`**Target Annual Bonus:** ${comp.targetBonus}% of base salary (subject to performance and company results)`);
    }
    if (comp.equityGrant) {
        const eq = comp.equityGrant;
        if (eq.options) {
            lines.push(`**Equity:** ${eq.options.toLocaleString()} stock options${eq.strikePrice ? ` at a strike price of ${formatCurrency(eq.strikePrice, comp.currency)}` : ''}${eq.vestingSchedule ? `, vesting ${eq.vestingSchedule}` : ''}`);
        } else if (eq.shares) {
            lines.push(`**Equity:** ${eq.shares.toLocaleString()} RSUs${eq.vestingSchedule ? `, vesting ${eq.vestingSchedule}` : ''}`);
        }
    }

    return lines.join('\n');
}

function buildOfferLetter(input: OfferInput): string {
    const country = input.country ?? 'us';
    // Date format: non-US countries generally use DD Month YYYY
    const usStyleCountries = ['us', 'liberia', 'micronesia'];
    const usLocale = usStyleCountries.includes(country.toLowerCase());
    const today = usLocale
        ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const benefits = input.benefits ?? getCountryBenefits(country);
    const statutoryClause = getStatutoryClause(country, input.companyName, input.stateOfHire);
    const arrangement = input.workArrangement === 'remote'
        ? 'a fully remote position'
        : input.workArrangement === 'hybrid'
        ? `a hybrid position (partial remote, with regular visits to ${input.officeLocation ?? 'our office'})`
        : `an on-site position based in ${input.officeLocation ?? 'our office'}`;

    const conditionsBlock = input.conditions && input.conditions.length > 0
        ? `\nThis offer is contingent upon the successful completion of the following:\n${input.conditions.map(c => `  - ${c}`).join('\n')}\n`
        : '';

    const expiryBlock = input.offerExpiryDate
        ? `\nThis offer is open for acceptance until **${input.offerExpiryDate}**. Please sign and return the enclosed acceptance form by that date.\n`
        : '';

    const equityNote = input.compensation.equityGrant
        ? `\nEquity details are subject to the terms of the ${input.companyName} Equity Plan and your individual grant agreement, which will be provided separately.\n`
        : '';

    const signatory = input.hrSignatoryName
        ? `${input.hrSignatoryName}\n${input.hrSignatoryTitle ?? 'Head of People & Talent'}\n${input.companyName}`
        : `[HR Signatory Name]\n[Title]\n${input.companyName}`;

    return [
        input.companyAddress ?? `${input.companyName}`,
        today,
        '',
        `Dear ${input.candidateName},`,
        '',
        `**Offer of Employment — ${input.jobTitle} (${OFFER_TYPE_LABEL[input.offerType]})**`,
        '',
        `On behalf of ${input.companyName}, I am delighted to extend this offer of employment for the position of **${input.jobTitle}** within the **${input.department}** team, reporting to **${input.reportingTo ?? input.hiringManagerName}**.`,
        '',
        `We believe your background and skills are an excellent match for this role and we are excited about the value you will bring to our team.`,
        '',
        `**Start Date:** ${input.startDate}`,
        `**Work Arrangement:** This is ${arrangement}.`,
        '',
        `**Compensation & Benefits**`,
        buildCompensationSection(input.compensation),
        '',
        `**Benefits include:**`,
        ...benefits.map(b => `  - ${b}`),
        equityNote,
        conditionsBlock,
        `**Probation Period:**`,
        input.compensation.probationPeriod
            ? `Your employment will commence with a ${input.compensation.probationPeriod} probationary period, during which both parties may terminate employment with shorter notice.`
            : `Your first 90 days will serve as an introductory period.`,
        statutoryClause,
        '',
        `**Acceptance**`,
        `To confirm your acceptance of this offer, please sign and return a copy of this letter${expiryBlock ? '' : '.'} Your signature confirms that you have read, understood, and agree to the terms outlined above.`,
        expiryBlock,
        `We are truly excited about the prospect of you joining ${input.companyName}. Please don't hesitate to reach out if you have any questions.`,
        '',
        `Sincerely,`,
        '',
        signatory,
        '',
        '---',
        `**Acceptance**`,
        '',
        `I, ${input.candidateName}, accept the offer of employment for the position of ${input.jobTitle} at ${input.companyName} on the terms described above.`,
        '',
        `Signature: ________________________  Date: ____________`,
    ].join('\n');
}

function validateOffer(input: OfferInput): OfferValidation {
    const warnings: string[] = [];
    const budget = input.approvedBudgetMax;

    if (!budget) {
        return { withinBudget: true, warnings: ['No approved budget max provided — validation skipped'] };
    }

    const base = input.compensation.baseSalary;
    const withinBudget = base <= budget;

    const baseSalaryVsBudget = `${formatCurrency(base, input.compensation.currency)} vs budget max ${formatCurrency(budget, input.compensation.currency)}`;

    if (!withinBudget) {
        warnings.push(`Base salary exceeds approved budget by ${formatCurrency(base - budget, input.compensation.currency)} — requires additional approval`);
    }
    if (input.compensation.signingBonus && input.compensation.signingBonus > base * 0.2) {
        warnings.push('Signing bonus exceeds 20% of base salary — flag for finance review');
    }

    return { withinBudget, baseSalaryVsBudget, warnings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateOffer(input: OfferInput): OfferResult {
    const offerLetterText = buildOfferLetter(input);
    const validation = validateOffer(input);

    const compensationSummary = [
        `Base: ${formatCurrency(input.compensation.baseSalary, input.compensation.currency)} ${FREQ_LABEL[input.compensation.payFrequency]}`,
        input.compensation.signingBonus ? `Signing bonus: ${formatCurrency(input.compensation.signingBonus, input.compensation.currency)}` : '',
        input.compensation.targetBonus ? `Target bonus: ${input.compensation.targetBonus}%` : '',
        input.compensation.equityGrant?.options ? `Options: ${input.compensation.equityGrant.options.toLocaleString()}` : '',
        input.compensation.equityGrant?.shares ? `RSUs: ${input.compensation.equityGrant.shares.toLocaleString()}` : '',
    ].filter(Boolean).join('  |  ');

    const sendingChecklist = [
        validation.withinBudget
            ? '✓ Compensation is within approved budget'
            : '✗ Get budget exception approval BEFORE sending',
        'Get hiring manager sign-off on start date',
        'Confirm conditions (background check, references) are cleared or in progress',
        input.offerExpiryDate ? `Set calendar reminder for offer expiry: ${input.offerExpiryDate}` : 'Set a 5-day follow-up reminder for offer acceptance',
        'Send via DocuSign / Zoho Sign for audit trail',
        'Brief hiring manager to make a personal call to the candidate on the same day',
        'Update ATS status to "Offer Extended"',
        'Prepare onboarding paperwork in parallel',
    ];

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        offerLetterText,
        compensationSummary,
        validation,
        sendingChecklist,
    };
}
