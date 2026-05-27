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

const DEFAULT_BENEFITS = [
    'Comprehensive medical, dental, and vision coverage',
    'Flexible PTO and paid public holidays',
    'Annual learning & development stipend',
    '401(k) / pension with employer contribution',
    'Home office setup allowance (remote/hybrid)',
];

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
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const benefits = input.benefits ?? DEFAULT_BENEFITS;
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
