/**
 * Offer Negotiation
 *
 * Handles all post-offer dynamics:
 *   - Verbal offer call script
 *   - Counter-offer evaluation (can we meet it? impact on band equity?)
 *   - Counter-offer response composer
 *   - Total compensation modeller (base + bonus + equity + benefits value)
 *   - Offer decline save-attempt script
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerbalOfferInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    baseSalary: number;
    currency: string;
    targetBonus?: number;            // as % of base
    signingBonus?: number;
    equitySummary?: string;          // e.g. "50,000 RSUs vesting over 4 years"
    startDate: string;
    workArrangement: 'remote' | 'hybrid' | 'onsite';
    offerExpiryDate?: string;
    keyBenefits?: string[];
}

export interface CounterOfferInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    currentOfferBase: number;
    candidateCounterBase: number;
    currency: string;
    approvedBudgetMax: number;
    currentBandMax: number;          // Max of approved comp band for this level
    peersAtSameLevel?: number;       // How many peers at same band; equity concern
    currentBonusTarget?: number;     // % of base
    currentSigningBonus?: number;
    currentEquitySummary?: string;
    canIncreaseSigningBonus?: boolean;
    signingBonusHeadroom?: number;
    canIncreaseBonus?: boolean;
    bonusTargetHeadroom?: number;    // Additional % points of base possible
}

export interface TotalCompInput {
    baseSalary: number;
    currency: string;
    targetBonusPct?: number;         // e.g. 15 = 15%
    signingBonus?: number;
    equityValue?: number;            // Total grant value
    equityVestingYears?: number;     // Default 4
    annualBenefitsValue?: number;    // Health, dental, 401k match etc.
    ptoWeeks?: number;               // For illustrative value
    employerLabel: string;
}

export interface NegotiationResponse {
    recommendation: 'accept_counter' | 'partial_meet' | 'hold_firm' | 'withdraw';
    rationale: string;
    counterScript?: string;
    totalCompComparison?: string;
    approvalRequired: boolean;
    approvalNote?: string;
}

// ---------------------------------------------------------------------------
// Verbal offer script
// ---------------------------------------------------------------------------

export function buildVerbalOfferScript(input: VerbalOfferInput): string {
    const arr = { remote: 'fully remote', hybrid: 'hybrid', onsite: 'on-site' }[input.workArrangement];
    const bonus = input.targetBonus ? `\n  - Target annual bonus: ${input.targetBonus}% of base (approximately ${input.currency} ${Math.round(input.baseSalary * input.targetBonus / 100).toLocaleString()})` : '';
    const signing = input.signingBonus ? `\n  - Signing bonus: ${input.currency} ${input.signingBonus.toLocaleString()} (paid in first payroll)` : '';
    const equity = input.equitySummary ? `\n  - Equity: ${input.equitySummary}` : '';
    const expiry = input.offerExpiryDate ? `\n\n"The formal offer letter will be sent today/tomorrow and will be open for acceptance until ${input.offerExpiryDate}. That gives you time to review it fully — please don't feel rushed, and call me with any questions."` : '';
    const benefits = input.keyBenefits && input.keyBenefits.length > 0
        ? `\n  - Benefits: ${input.keyBenefits.slice(0, 3).join(', ')}, and more`
        : '';

    return [
        `# Verbal Offer Call Script`,
        `**${input.candidateName} — ${input.jobTitle} at ${input.companyName}**`,
        ``,
        `---`,
        ``,
        `## OPENING (30 sec)`,
        `"Hi ${input.candidateName}, it's ${input.recruiterName} from ${input.companyName}. Do you have a few minutes? I have some exciting news."`,
        ``,
        `[Wait for confirmation]`,
        ``,
        `## THE OFFER (2 min)`,
        `"I'm delighted to tell you that we'd like to extend you a formal offer for the **${input.jobTitle}** role at ${input.companyName}!"`,
        ``,
        `"Before the formal letter lands, I wanted to walk you through the key details:"`,
        `  - Start date: ${input.startDate}`,
        `  - Base salary: ${input.currency} ${input.baseSalary.toLocaleString()} per year`,
        `  - Work arrangement: ${arr}`,
        `${bonus}${signing}${equity}${benefits}`,
        ``,
        `## GAUGE REACTION (1 min)`,
        `"How does that sound? Do you have any initial questions?"`,
        ``,
        `→ If excited: "Fantastic — we're equally excited to have you join the team."`,
        `→ If hesitant: "I completely understand — this is a big decision. What's on your mind?"`,
        `→ If counter on salary: "I appreciate your transparency. Can I ask what number would make this a clear yes for you?"`,
        `→ If needs time: "Of course — take the time you need. The written offer will land shortly."`,
        ``,
        `## CLOSE`,
        `"The formal offer letter will follow by email. Please read through it carefully and reach out with any questions at any time — I'm here to help."`,
        `${expiry}`,
        ``,
        `"Congratulations again, ${input.candidateName} — we're really looking forward to having you with us!"`,
        ``,
        `---`,
        ``,
        `**Post-call:** Log call notes in ATS. If candidate asked to negotiate, initiate workspace_rec_negotiate_offer.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Total comp modeller
// ---------------------------------------------------------------------------

export function modelTotalComp(input: TotalCompInput): {
    breakdown: Record<string, number>;
    totalFirstYear: number;
    totalAnnualised: number;
    narrative: string;
} {
    const cur = input.currency;
    const base = input.baseSalary;
    const bonusVal = input.targetBonusPct ? Math.round(base * input.targetBonusPct / 100) : 0;
    const signingVal = input.signingBonus ?? 0;
    const equityPerYear = input.equityValue
        ? Math.round(input.equityValue / (input.equityVestingYears ?? 4))
        : 0;
    const benefitsVal = input.annualBenefitsValue ?? 0;
    const ptoVal = input.ptoWeeks ? input.ptoWeeks * Math.round(base / 52) : 0;

    const breakdown: Record<string, number> = {
        'Base Salary': base,
        ...(bonusVal ? { 'Target Annual Bonus': bonusVal } : {}),
        ...(signingVal ? { 'Signing Bonus (Year 1 only)': signingVal } : {}),
        ...(equityPerYear ? { 'Equity (annualised over vesting period)': equityPerYear } : {}),
        ...(benefitsVal ? { 'Benefits Value (health, dental, 401k match, etc.)': benefitsVal } : {}),
        ...(ptoVal ? { [`PTO Value (${input.ptoWeeks} weeks @ imputed hourly rate)`]: ptoVal } : {}),
    };

    const totalFirstYear = base + bonusVal + signingVal + equityPerYear + benefitsVal;
    const totalAnnualised = base + bonusVal + equityPerYear + benefitsVal;

    const narrative = [
        `**Total Compensation Summary — ${input.employerLabel}**`,
        ``,
        Object.entries(breakdown).map(([k, v]) => `- ${k}: ${cur} ${v.toLocaleString()}`).join('\n'),
        ``,
        `**Year 1 Total (incl. signing bonus):** ${cur} ${totalFirstYear.toLocaleString()}`,
        `**Annualised Total (excl. signing):** ${cur} ${totalAnnualised.toLocaleString()}`,
        ``,
        `*Note: Bonus and equity are estimates. Benefits value uses typical market cost-of-coverage. Not a guarantee of future earnings.*`,
    ].join('\n');

    return { breakdown, totalFirstYear, totalAnnualised, narrative };
}

// ---------------------------------------------------------------------------
// Counter-offer evaluator
// ---------------------------------------------------------------------------

export function evaluateCounterOffer(input: CounterOfferInput): NegotiationResponse {
    const gap = input.candidateCounterBase - input.currentOfferBase;
    const gapPct = (gap / input.currentOfferBase) * 100;
    const cur = input.currency;

    // Case 1: Counter is within budget and band
    if (input.candidateCounterBase <= input.approvedBudgetMax &&
        input.candidateCounterBase <= input.currentBandMax) {
        return {
            recommendation: 'accept_counter',
            rationale: `Counter of ${cur} ${input.candidateCounterBase.toLocaleString()} is within approved budget and comp band. Recommend accepting — avoids risk of losing candidate for a ${gapPct.toFixed(0)}% gap.`,
            counterScript: buildCounterScript(input, 'accept'),
            approvalRequired: false,
        };
    }

    // Case 2: Counter exceeds band but within budget — equity issue
    if (input.candidateCounterBase <= input.approvedBudgetMax &&
        input.candidateCounterBase > input.currentBandMax) {
        const altOptions: string[] = [];
        if (input.canIncreaseSigningBonus && input.signingBonusHeadroom) {
            altOptions.push(`increase signing bonus by ${cur} ${input.signingBonusHeadroom.toLocaleString()} (one-time, doesn\'t affect band)`);
        }
        if (input.canIncreaseBonus && input.bonusTargetHeadroom) {
            altOptions.push(`increase bonus target by ${input.bonusTargetHeadroom}pp (${cur} ${Math.round(input.currentOfferBase * input.bonusTargetHeadroom / 100).toLocaleString()} annualised)`);
        }

        return {
            recommendation: altOptions.length > 0 ? 'partial_meet' : 'hold_firm',
            rationale: `Counter exceeds comp band max (${cur} ${input.currentBandMax.toLocaleString()}). Accepting would create equity issues with ${input.peersAtSameLevel ?? 'existing'} peers at the same level.`,
            counterScript: buildCounterScript(input, altOptions.length > 0 ? 'partial' : 'hold', altOptions),
            approvalRequired: true,
            approvalNote: `Requires HR/Comp team approval to exceed band max of ${cur} ${input.currentBandMax.toLocaleString()}`,
        };
    }

    // Case 3: Counter exceeds approved budget
    return {
        recommendation: 'hold_firm',
        rationale: `Counter of ${cur} ${input.candidateCounterBase.toLocaleString()} exceeds approved budget of ${cur} ${input.approvedBudgetMax.toLocaleString()}. Holding at current offer.`,
        counterScript: buildCounterScript(input, 'hold'),
        approvalRequired: true,
        approvalNote: `Would need Finance + CHRO approval for budget exception — not recommended without strong business case`,
    };
}

function buildCounterScript(
    input: CounterOfferInput,
    mode: 'accept' | 'partial' | 'hold',
    altOptions: string[] = [],
): string {
    const cur = input.currency;

    if (mode === 'accept') {
        return [
            `"${input.candidateName}, I went back to the team and I'm pleased to say we can meet your number."`,
            `"We'll update the offer letter to reflect ${cur} ${input.candidateCounterBase.toLocaleString()} and resend it today. Does that work for you?"`,
        ].join('\n');
    }

    if (mode === 'partial' && altOptions.length > 0) {
        return [
            `"${input.candidateName}, I appreciate you being transparent about your expectations. I've gone back to the team."`,
            `"We're not able to move the base salary beyond ${cur} ${input.currentOfferBase.toLocaleString()} right now due to our internal compensation bands — it's important to us to maintain equity across the team."`,
            `"What I can offer is: we can ${altOptions.join(' and ')}, which would bring your total Year 1 compensation meaningfully closer to what you're looking for."`,
            `"I want this to work for both of us. Would that help close the gap?"`,
        ].join('\n');
    }

    // hold firm
    return [
        `"${input.candidateName}, I pushed as hard as I could and I want to be fully transparent with you."`,
        `"${cur} ${input.currentOfferBase.toLocaleString()} represents the best we can do for this role at this level. I know that's not the number you were hoping for."`,
        `"What I can say is that we have a track record of rewarding performance quickly — many people in similar roles have moved to the next band within 12–18 months."`,
        `"Is there anything else about the role or package that I can address to help you make this decision?"`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Decline save-attempt
// ---------------------------------------------------------------------------

export function buildDeclineSaveScript(candidateName: string, jobTitle: string, declineReason?: string): string {
    const reasonBlock = declineReason
        ? `"Thank you for sharing that — I really appreciate your honesty. When you say ${declineReason}, help me understand what would need to be different for this to work?"`
        : `"Can I ask — is there one specific thing that's making you hesitate? I want to make sure I fully understand before we close the door."`;

    return [
        `# Offer Decline Save-Attempt Script`,
        `**${candidateName} — ${jobTitle}**`,
        ``,
        `---`,
        ``,
        `## ACKNOWLEDGE (don't panic or pressure)`,
        `"${candidateName}, I really appreciate you telling me directly. This is a big decision and I respect that."`,
        ``,
        `## UNDERSTAND THE REAL REASON`,
        reasonBlock,
        ``,
        `→ **If compensation:** "Let me take this back to the team — I want to exhaust every option before we close this."`,
        `→ **If competing offer:** "Would you be comfortable sharing what they're offering? I want to see if there's a way to get you there."`,
        `→ **If role concerns:** "I hear you. Let me connect you with [hiring manager] directly — I think hearing from them on day-to-day reality might change your perspective."`,
        `→ **If timing/personal:** "Is this a 'not now' or a 'not ever"? If it's the former, I"d love to stay in touch for when the timing is right."`,
        ``,
        `## IF COUNTER IS POSSIBLE`,
        `"Give me 24 hours — I'm going to do everything I can. Can I come back to you tomorrow?"`,
        ``,
        `## IF FINAL DECLINE`,
        `"I understand, and I completely respect your decision. I think you're going to do great things — and whoever lands you is very lucky."`,
        `"Would it be okay if I stayed in touch? I'd love to reconnect if the timing ever changes."`,
        ``,
        `---`,
        `**Post-call:** Log outcome in ATS. If counter possible — initiate workspace_rec_negotiate_offer. Add to talent pool regardless of outcome.`,
    ].join('\n');
}
