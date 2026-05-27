/**
 * Human Gate Requests — Recruiter
 *
 * Routes high-risk or high-stakes recruiter actions to human approval
 * before execution. Produces a structured approval request record with
 * risk level, approval summary, and impact scope.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecruiterGateType =
    | 'send_offer'
    | 'reject_candidate'
    | 'post_job_externally'
    | 'close_requisition'
    | 'extend_offer_above_budget'
    | 'disqualify_at_sourcing'
    | 'bulk_outreach'
    | 'share_candidate_data';

export interface RecruiterGateInput {
    gateType: RecruiterGateType;
    candidateName?: string;
    jobTitle: string;
    detail?: string;
    offerAmount?: number;
    currency?: string;
    approvedBudgetMax?: number;
    candidateCount?: number;   // for bulk outreach
    targetPlatform?: string;   // for job posting
}

export type GateRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RecruiterGateRecord {
    gateType: RecruiterGateType;
    jobTitle: string;
    candidateName?: string;
    riskLevel: GateRiskLevel;
    label: string;
    question: string;
    detail?: string;
    requiresApproverRole: string;
}

// ---------------------------------------------------------------------------
// Gate definitions
// ---------------------------------------------------------------------------

const GATE_DEFINITIONS: Record<
    RecruiterGateType,
    {
        riskLevel: GateRiskLevel;
        label: string;
        question: (input: RecruiterGateInput) => string;
        approverRole: string;
    }
> = {
    send_offer: {
        riskLevel: 'critical',
        label: 'Send Employment Offer',
        question: i =>
            `You are about to send a formal employment offer to **${i.candidateName ?? 'candidate'}** for **${i.jobTitle}**${i.offerAmount ? ` at ${i.currency ?? 'USD'} ${i.offerAmount.toLocaleString()}` : ''}. This is a legally binding commitment. Confirm approval to proceed.`,
        approverRole: 'Hiring Manager + HR Lead',
    },
    reject_candidate: {
        riskLevel: 'medium',
        label: 'Send Candidate Rejection',
        question: i =>
            `You are about to send a rejection email to **${i.candidateName ?? 'candidate'}** for the **${i.jobTitle}** role. This action is not easily reversible. Confirm to proceed.`,
        approverRole: 'Recruiter',
    },
    post_job_externally: {
        riskLevel: 'high',
        label: 'Post Job Publicly',
        question: i =>
            `You are about to post the **${i.jobTitle}** role publicly${i.targetPlatform ? ` on ${i.targetPlatform}` : ''}. ${i.detail ? i.detail : 'This will make the vacancy visible to all applicants and may receive high application volume.'}. Confirm approval.`,
        approverRole: 'Hiring Manager',
    },
    close_requisition: {
        riskLevel: 'high',
        label: 'Close Open Requisition',
        question: i =>
            `You are about to close the open **${i.jobTitle}** requisition. All active candidates in pipeline will receive rejection notices. Confirm to proceed.`,
        approverRole: 'Hiring Manager + HR Lead',
    },
    extend_offer_above_budget: {
        riskLevel: 'critical',
        label: 'Offer Above Approved Budget',
        question: i =>
            `The proposed offer of ${i.currency ?? 'USD'} ${i.offerAmount?.toLocaleString() ?? 'N/A'} exceeds the approved budget of ${i.currency ?? 'USD'} ${i.approvedBudgetMax?.toLocaleString() ?? 'N/A'} for **${i.jobTitle}**. Budget exception approval is required before proceeding.`,
        approverRole: 'Finance + CHRO',
    },
    disqualify_at_sourcing: {
        riskLevel: 'low',
        label: 'Disqualify Before Interview',
        question: i =>
            `You are about to disqualify **${i.candidateName ?? 'candidate'}** from the **${i.jobTitle}** pipeline before they have had any interview. ${i.detail ? `Reason: ${i.detail}. ` : ''}Confirm this is intentional.`,
        approverRole: 'Recruiter',
    },
    bulk_outreach: {
        riskLevel: 'medium',
        label: 'Bulk Candidate Outreach',
        question: i =>
            `You are about to send outreach messages to **${i.candidateCount ?? 'multiple'} candidates** for the **${i.jobTitle}** role. This will use email/InMail credits and represent your company externally. Confirm approval.`,
        approverRole: 'Recruiter',
    },
    share_candidate_data: {
        riskLevel: 'high',
        label: 'Share Candidate Personal Data',
        question: i =>
            `You are about to share personal data for **${i.candidateName ?? 'a candidate'}** externally${i.targetPlatform ? ` (to ${i.targetPlatform})` : ''}. Ensure GDPR/CCPA compliance and explicit candidate consent before proceeding.`,
        approverRole: 'HR Lead + Legal',
    },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const RECRUITER_GATE_TYPES = new Set<RecruiterGateType>([
    'send_offer',
    'reject_candidate',
    'post_job_externally',
    'close_requisition',
    'extend_offer_above_budget',
    'disqualify_at_sourcing',
    'bulk_outreach',
    'share_candidate_data',
]);

export function isRecruiterGateType(value: string): value is RecruiterGateType {
    return RECRUITER_GATE_TYPES.has(value as RecruiterGateType);
}

export function buildRecruiterGateRecord(input: RecruiterGateInput): RecruiterGateRecord {
    const def = GATE_DEFINITIONS[input.gateType];
    return {
        gateType: input.gateType,
        jobTitle: input.jobTitle,
        candidateName: input.candidateName,
        riskLevel: def.riskLevel,
        label: def.label,
        question: def.question(input),
        detail: input.detail,
        requiresApproverRole: def.approverRole,
    };
}

export function buildRecruiterGateApprovalSummary(gate: RecruiterGateRecord): string {
    return [
        `**Action:** ${gate.label}`,
        `**Risk Level:** ${gate.riskLevel.toUpperCase()}`,
        `**Approver Required:** ${gate.requiresApproverRole}`,
        gate.candidateName ? `**Candidate:** ${gate.candidateName}` : '',
        `**Role:** ${gate.jobTitle}`,
        gate.detail ? `**Detail:** ${gate.detail}` : '',
    ].filter(Boolean).join('\n');
}

export function buildRecruiterGateImpactScope(gate: RecruiterGateRecord): string {
    const scopeMap: Record<RecruiterGateType, string> = {
        send_offer: 'Legal commitment, compensation budget, headcount',
        reject_candidate: 'Candidate relationship, employer brand',
        post_job_externally: 'Public employer brand, applicant volume, job board credits',
        close_requisition: 'All active pipeline candidates, headcount plan',
        extend_offer_above_budget: 'Finance budget, compensation band equity, team morale',
        disqualify_at_sourcing: 'Individual candidate only',
        bulk_outreach: 'Company brand, email/InMail reputation, multiple candidate relationships',
        share_candidate_data: 'GDPR/CCPA compliance, candidate trust, legal exposure',
    };
    return scopeMap[gate.gateType];
}

export function buildRecruiterGateRiskReason(gate: RecruiterGateRecord): string {
    const reasonMap: Record<RecruiterGateType, string> = {
        send_offer: 'Creates a binding employment contract; errors are costly and reputationally damaging',
        reject_candidate: 'Permanent decision that affects candidate experience and potential future pipeline',
        post_job_externally: 'Public-facing; cannot be fully retracted once indexed by aggregators',
        close_requisition: 'Irreversible pipeline action; notifies all active candidates simultaneously',
        extend_offer_above_budget: 'Creates compensation band exceptions that set precedents across the team',
        disqualify_at_sourcing: 'Pre-screen exclusion; ensure no discriminatory criteria are applied',
        bulk_outreach: 'Mass communication represents the company; errors reach many people at once',
        share_candidate_data: 'Data protection legislation applies; breach can carry regulatory penalties',
    };
    return reasonMap[gate.gateType];
}
