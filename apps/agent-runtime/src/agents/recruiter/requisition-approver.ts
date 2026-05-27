/**
 * Requisition Approver
 *
 * Multi-level headcount / budget approval workflow:
 *   - Builds a structured requisition record from a job brief
 *   - Determines approval chain based on headcount type, budget, and seniority
 *   - Generates approval request packages for each approver tier
 *   - Tracks approval status and produces a requisition summary
 *   - Raises a human-gate block when CHRO/Finance sign-off is needed
 *
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequisitionType =
    | 'backfill'              // Replacing a departing employee
    | 'new_headcount'         // Net new position — needs budget approval
    | 'contractor_to_fte'     // Converting existing contractor
    | 'internal_transfer'     // Internal move — may not need headcount budget
    | 'temp_seasonal'         // Fixed-term / seasonal hire
    | 'executive'             // VP and above — always escalates to CHRO/CEO
    | 'confidential';         // Succession planning / sensitive replacement

export type ApprovalStatus =
    | 'draft'
    | 'pending_hiring_manager'
    | 'pending_finance'
    | 'pending_hr'
    | 'pending_chro'
    | 'pending_ceo'
    | 'approved'
    | 'approved_with_conditions'
    | 'rejected'
    | 'on_hold';

export type BudgetImpact =
    | 'within_plan'           // Already budgeted in annual headcount plan
    | 'unplanned_minor'       // <$50k annualised cost delta
    | 'unplanned_major'       // >$50k annualised cost delta
    | 'requires_board';       // Exec hire or restructure — board visibility

export interface RequisitionInput {
    jobTitle: string;
    department: string;
    hiringManagerName: string;
    hiringManagerEmail: string;
    requisitionType: RequisitionType;
    headcountPlanApproved: boolean;   // Is this in the approved headcount plan?
    targetStartDate: string;          // ISO date
    employmentType: 'full_time' | 'part_time' | 'contract' | 'temp';
    workArrangement: 'remote' | 'hybrid' | 'onsite';
    seniorityLevel: 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | 'vp' | 'c_suite';
    baseSalaryBudget: number;
    currency: string;
    totalCompBudget?: number;         // Including bonus + equity
    headcount: number;                // Number of people being hired for this req
    businessJustification: string;
    backfillForEmployee?: string;     // Name of departing employee (if backfill)
    replacingContractor?: boolean;
    contractorCost?: number;          // Annual contractor cost (if converting)
    openToInternalCandidates?: boolean;
    urgencyLevel: 'critical' | 'high' | 'standard' | 'low';
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    financeBpName?: string;           // Finance business partner
    hrBpName?: string;                // HR business partner
    chroName?: string;
    ceoName?: string;
}

export interface ApprovalTier {
    approverRole: string;
    approverName?: string;
    approverEmail?: string;
    requiredFor: string;             // Why this tier is required
    slaBusinessDays: number;
    optional: boolean;
}

export interface RequisitionRecord {
    requisitionId: string;
    createdDate: string;             // ISO date
    status: ApprovalStatus;
    input: RequisitionInput;
    budgetImpact: BudgetImpact;
    annualisedCost: number;
    approvalChain: ApprovalTier[];
    currentApprovalTier: number;     // Index into approvalChain
    blockers: string[];              // Issues that must be resolved before approval
    warnings: string[];
}

export interface ApprovalRequestPackage {
    requisitionId: string;
    targetApprover: ApprovalTier;
    subject: string;
    body: string;
    summaryTable: string;
    urgencyNote?: string;
}

export interface RequisitionSummary {
    record: RequisitionRecord;
    approvalRequestPackages: ApprovalRequestPackage[];
    nextAction: string;
    humanGateRequired: boolean;
    humanGateReason?: string;
    fullSummary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateReqId(): string {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `REQ-${year}-${rand}`;
}

function determineBudgetImpact(input: RequisitionInput): BudgetImpact {
    if (input.seniorityLevel === 'vp' || input.seniorityLevel === 'c_suite' || input.requisitionType === 'executive') {
        return 'requires_board';
    }
    if (input.headcountPlanApproved) return 'within_plan';
    const totalCost = input.totalCompBudget ?? input.baseSalaryBudget;
    return totalCost > 50000 ? 'unplanned_major' : 'unplanned_minor';
}

function calculateAnnualisedCost(input: RequisitionInput): number {
    const base = input.baseSalaryBudget * input.headcount;
    const overhead = 1.25; // Typical 25% employer cost overhead (taxes, benefits)
    return Math.round(base * overhead);
}

function buildApprovalChain(input: RequisitionInput, budgetImpact: BudgetImpact): ApprovalTier[] {
    const chain: ApprovalTier[] = [];

    // Tier 1: Hiring manager always first
    chain.push({
        approverRole: 'Hiring Manager',
        approverName: input.hiringManagerName,
        approverEmail: input.hiringManagerEmail,
        requiredFor: 'Confirms business need, role scope, and target start date',
        slaBusinessDays: 2,
        optional: false,
    });

    // Tier 2: HR Business Partner — always required
    chain.push({
        approverRole: 'HR Business Partner',
        approverName: input.hrBpName,
        requiredFor: 'Validates comp band, job level, employment classification, and equity',
        slaBusinessDays: 2,
        optional: false,
    });

    // Tier 3: Finance BP — required for unplanned or high-value
    if (budgetImpact !== 'within_plan' || input.totalCompBudget && input.totalCompBudget > 150000) {
        chain.push({
            approverRole: 'Finance Business Partner',
            approverName: input.financeBpName,
            requiredFor: 'Budget availability confirmation and P&L impact sign-off',
            slaBusinessDays: 3,
            optional: budgetImpact === 'unplanned_minor',
        });
    }

    // Tier 4: CHRO — required for director+, unplanned major, or executive
    if (
        budgetImpact === 'unplanned_major' ||
        budgetImpact === 'requires_board' ||
        ['director', 'vp', 'c_suite'].includes(input.seniorityLevel) ||
        input.requisitionType === 'executive' ||
        input.headcount >= 5
    ) {
        chain.push({
            approverRole: 'CHRO',
            approverName: input.chroName,
            requiredFor: 'Senior hire or unplanned headcount requires People leadership sign-off',
            slaBusinessDays: 3,
            optional: false,
        });
    }

    // Tier 5: CEO — only for board-level or confidential executive searches
    if (budgetImpact === 'requires_board' || input.requisitionType === 'confidential') {
        chain.push({
            approverRole: 'CEO',
            approverName: input.ceoName,
            requiredFor: 'Executive hire or sensitive replacement requires CEO awareness',
            slaBusinessDays: 5,
            optional: false,
        });
    }

    return chain;
}

// ---------------------------------------------------------------------------
// Build requisition record
// ---------------------------------------------------------------------------

export function buildRequisitionRecord(input: RequisitionInput): RequisitionRecord {
    const requisitionId = generateReqId();
    const createdDate = new Date().toISOString().split('T')[0]!;
    const budgetImpact = determineBudgetImpact(input);
    const annualisedCost = calculateAnnualisedCost(input);
    const approvalChain = buildApprovalChain(input, budgetImpact);

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!input.businessJustification || input.businessJustification.length < 20) {
        blockers.push('Business justification is too brief — must clearly articulate the business case');
    }
    if (input.requisitionType === 'backfill' && !input.backfillForEmployee) {
        blockers.push('Backfill requisitions require the name of the departing employee');
    }
    if (input.headcount > 1 && budgetImpact === 'within_plan') {
        warnings.push('Multiple headcount on a single req — confirm all positions are individually approved in the headcount plan');
    }
    if (input.urgencyLevel === 'critical') {
        warnings.push('Critical urgency flag: approvers will be notified of expedited SLA. Document business reason for urgency in justification.');
    }
    if (input.requisitionType === 'contractor_to_fte' && !input.replacingContractor) {
        warnings.push('Contractor-to-FTE conversion: confirm contractor is notified per contractual terms before req is opened');
    }
    if (!input.hrBpName) {
        warnings.push('HR Business Partner not specified — HR approval step will have no named recipient');
    }

    return {
        requisitionId,
        createdDate,
        status: 'pending_hiring_manager',
        input,
        budgetImpact,
        annualisedCost,
        approvalChain,
        currentApprovalTier: 0,
        blockers,
        warnings,
    };
}

// ---------------------------------------------------------------------------
// Build approval request packages
// ---------------------------------------------------------------------------

export function buildApprovalRequestPackages(record: RequisitionRecord): ApprovalRequestPackage[] {
    const { input } = record;
    const cur = input.currency;

    const summaryTable = [
        `| Field | Value |`,
        `|---|---|`,
        `| Req ID | ${record.requisitionId} |`,
        `| Role | ${input.jobTitle} |`,
        `| Department | ${input.department} |`,
        `| Hiring Manager | ${input.hiringManagerName} |`,
        `| Type | ${input.requisitionType.replace(/_/g, ' ')} |`,
        `| Headcount | ${input.headcount} |`,
        `| Seniority | ${input.seniorityLevel} |`,
        `| Employment | ${input.employmentType.replace(/_/g, ' ')} |`,
        `| Work Arrangement | ${input.workArrangement} |`,
        `| Target Start Date | ${input.targetStartDate} |`,
        `| Base Salary Budget | ${cur} ${input.baseSalaryBudget.toLocaleString()} per year |`,
        `| Annualised Total Cost (est.) | ${cur} ${record.annualisedCost.toLocaleString()} (incl. ~25% employer overhead) |`,
        `| Budget Impact | ${record.budgetImpact.replace(/_/g, ' ')} |`,
        `| Urgency | ${input.urgencyLevel} |`,
        `| Business Justification | ${input.businessJustification} |`,
        input.backfillForEmployee ? `| Backfill For | ${input.backfillForEmployee} |` : '',
    ].filter(Boolean).join('\n');

    return record.approvalChain.map((tier, idx) => {
        const isFirst = idx === 0;
        const urgencyNote = input.urgencyLevel === 'critical'
            ? `⚠️ **CRITICAL URGENCY**: This requisition requires expedited approval within 24 hours (standard SLA: ${tier.slaBusinessDays} business days). Please escalate to ${input.recruiterName} immediately if you need additional information.`
            : undefined;

        const body = [
            `Dear ${tier.approverName ?? tier.approverRole},`,
            ``,
            `${isFirst
                ? `I'd like to formally initiate a ${input.requisitionType.replace(/_/g, ' ')} requisition for the **${input.jobTitle}** role in ${input.department}.`
                : `I'm writing to request your approval for the **${input.jobTitle}** requisition (${record.requisitionId}), which has completed prior approval tiers.`
            }`,
            ``,
            urgencyNote ?? '',
            ``,
            `**Why your approval is required:** ${tier.requiredFor}`,
            ``,
            `**SLA:** Please review and approve/reject within **${tier.slaBusinessDays} business day${tier.slaBusinessDays > 1 ? 's' : ''}**.`,
            ``,
            `## Requisition Summary`,
            summaryTable,
            ``,
            record.warnings.length > 0
                ? `## Notes for Approver\n${record.warnings.map(w => `- ⚠️ ${w}`).join('\n')}\n`
                : '',
            `To approve, reply "APPROVED — ${record.requisitionId}" or route via your ATS.`,
            `To reject or request changes, reply with your feedback and ${input.recruiterName} will respond promptly.`,
            ``,
            `Thank you for your time.`,
            ``,
            `${input.recruiterName}`,
            `${input.recruiterEmail}`,
            `${input.companyName} Talent Acquisition`,
        ].filter(l => l !== undefined).join('\n');

        return {
            requisitionId: record.requisitionId,
            targetApprover: tier,
            subject: `[Action Required] Headcount Approval — ${input.jobTitle} (${record.requisitionId})`,
            body,
            summaryTable,
            urgencyNote,
        };
    });
}

// ---------------------------------------------------------------------------
// Full requisition summary
// ---------------------------------------------------------------------------

export function buildRequisitionSummary(input: RequisitionInput): RequisitionSummary {
    const record = buildRequisitionRecord(input);
    const approvalRequestPackages = buildApprovalRequestPackages(record);

    const humanGateRequired =
        record.budgetImpact === 'unplanned_major' ||
        record.budgetImpact === 'requires_board' ||
        input.seniorityLevel === 'vp' ||
        input.seniorityLevel === 'c_suite' ||
        input.requisitionType === 'executive' ||
        input.requisitionType === 'confidential';

    const humanGateReason = humanGateRequired
        ? [
            record.budgetImpact === 'unplanned_major' ? 'Unplanned budget impact exceeds $50k annualised' : '',
            record.budgetImpact === 'requires_board' ? 'Executive hire requires board-level visibility' : '',
            ['vp', 'c_suite'].includes(input.seniorityLevel) ? `${input.seniorityLevel.toUpperCase()} hire requires CHRO/CEO sign-off` : '',
            input.requisitionType === 'confidential' ? 'Confidential requisition — handle with restricted distribution' : '',
        ].filter(Boolean).join('; ')
        : undefined;

    const nextAction = record.blockers.length > 0
        ? `BLOCKED: Resolve ${record.blockers.length} issue(s) before routing for approval: ${record.blockers.join('; ')}`
        : `Route approval request to ${record.approvalChain[0]?.approverName ?? record.approvalChain[0]?.approverRole} (Tier 1 of ${record.approvalChain.length}). SLA: ${record.approvalChain[0]?.slaBusinessDays} business days.`;

    const fullSummary = [
        `# Requisition ${record.requisitionId}: ${input.jobTitle}`,
        `**Status:** ${record.status.replace(/_/g, ' ')} | **Created:** ${record.createdDate}`,
        `**Budget Impact:** ${record.budgetImpact.replace(/_/g, ' ')} | **Annualised Cost:** ${input.currency} ${record.annualisedCost.toLocaleString()}`,
        `**Approval Chain:** ${record.approvalChain.length} tiers — ${record.approvalChain.map(t => t.approverRole).join(' → ')}`,
        ``,
        record.blockers.length > 0
            ? `## ⛔ Blockers\n${record.blockers.map(b => `- ${b}`).join('\n')}\n`
            : '',
        record.warnings.length > 0
            ? `## ⚠️ Warnings\n${record.warnings.map(w => `- ${w}`).join('\n')}\n`
            : '',
        humanGateRequired ? `## 🔐 Human Gate Required\n${humanGateReason}\n` : '',
        `## Next Action\n${nextAction}`,
    ].filter(Boolean).join('\n');

    return {
        record,
        approvalRequestPackages,
        nextAction,
        humanGateRequired,
        humanGateReason,
        fullSummary,
    };
}
