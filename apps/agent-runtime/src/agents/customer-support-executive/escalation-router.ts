/**
 * Escalation Router — classifies the escalation tier and produces a
 * structured handoff note for the receiving team.
 *
 * Tier 1 → Tier 2: Complex technical or account issues beyond standard playbooks.
 * Tier 2 → Tier 3: Engineering bugs, data-corruption, or security incidents.
 * Any tier → Legal / Compliance: Regulatory, GDPR, fraud, or litigation signals.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationTier =
    | 'tier2_support'
    | 'tier3_engineering'
    | 'legal_compliance'
    | 'billing_dispute'
    | 'security_incident'
    | 'executive_escalation'
    | 'partner_operations';

export type EscalationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationClassification {
    tier: EscalationTier;
    severity: EscalationSeverity;
    reason: string;
    ownerTeam: string;
    slaHours: number;
}

export interface EscalationNote {
    escalationId: string;
    tier: EscalationTier;
    severity: EscalationSeverity;
    handoffNote: string;
    ownerTeam: string;
    slaHours: number;
    tags: string[];
    requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Tier classifier
// ---------------------------------------------------------------------------

const ESCALATION_SIGNALS: Array<{ keywords: string[]; tier: EscalationTier; severity: EscalationSeverity; slaHours: number; ownerTeam: string }> = [
    {
        keywords: ['gdpr', 'data breach', 'privacy violation', 'right to erasure', 'personal data leak', 'regulatory'],
        tier: 'legal_compliance', severity: 'critical', slaHours: 2, ownerTeam: 'Legal & Compliance',
    },
    {
        keywords: ['fraud', 'unauthorized access', 'account hacked', 'security breach', 'stolen credentials', 'phishing'],
        tier: 'security_incident', severity: 'critical', slaHours: 1, ownerTeam: 'Security Operations',
    },
    {
        keywords: ['lawsuit', 'legal action', 'attorney', 'court', 'sue', 'litigation'],
        tier: 'legal_compliance', severity: 'critical', slaHours: 2, ownerTeam: 'Legal & Compliance',
    },
    {
        keywords: ['ceo', 'executive', 'vip', 'enterprise client', 'board', 'investor', 'c-suite'],
        tier: 'executive_escalation', severity: 'high', slaHours: 4, ownerTeam: 'Customer Success Leadership',
    },
    {
        keywords: ['data loss', 'corruption', 'production down', 'system error', 'critical bug', 'outage', 'all users affected'],
        tier: 'tier3_engineering', severity: 'critical', slaHours: 2, ownerTeam: 'Engineering On-Call',
    },
    {
        keywords: ['dispute', 'chargeback', 'bank dispute', 'unauthorised charge', 'fraudulent charge'],
        tier: 'billing_dispute', severity: 'high', slaHours: 4, ownerTeam: 'Finance & Billing',
    },
    {
        keywords: ['partner', 'reseller', 'integration broken', 'api down', 'webhook failure', 'third-party'],
        tier: 'partner_operations', severity: 'medium', slaHours: 8, ownerTeam: 'Partner Operations',
    },
    {
        keywords: ['recurring bug', 'cannot reproduce', 'stack trace', 'database error', '500 error', 'api error', 'internal server error'],
        tier: 'tier3_engineering', severity: 'high', slaHours: 4, ownerTeam: 'Engineering',
    },
];

export function classifyEscalation(description: string): EscalationClassification {
    const text = description.toLowerCase();
    for (const signal of ESCALATION_SIGNALS) {
        if (signal.keywords.some((k) => text.includes(k))) {
            return {
                tier: signal.tier,
                severity: signal.severity,
                reason: signal.keywords.find((k) => text.includes(k)) ?? signal.keywords[0]!,
                ownerTeam: signal.ownerTeam,
                slaHours: signal.slaHours,
            };
        }
    }
    // Default: Tier 2 general support
    return {
        tier: 'tier2_support',
        severity: 'medium',
        reason: 'Issue exceeds Tier 1 resolution scope',
        ownerTeam: 'Senior Support',
        slaHours: 8,
    };
}

// ---------------------------------------------------------------------------
// Handoff note builder
// ---------------------------------------------------------------------------

let escalationCounter = 0;

function nextEscalationId(taskId: string): string {
    escalationCounter = (escalationCounter + 1) % 100_000;
    return `ESC-${taskId.slice(-6).toUpperCase()}-${String(escalationCounter).padStart(5, '0')}`;
}

export function buildEscalationNote(params: {
    taskId: string;
    ticketId?: string;
    customerId?: string;
    customerEmail?: string;
    description: string;
    stepsAlreadyTried?: string[];
    agentName?: string;
    urgency?: string;
}): EscalationNote {
    const classification = classifyEscalation(params.description);
    const escalationId = nextEscalationId(params.taskId);
    const requiresApproval = classification.severity === 'critical' || classification.tier === 'legal_compliance';

    const tried = params.stepsAlreadyTried?.length
        ? `Steps already attempted:\n${params.stepsAlreadyTried.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
        : 'No resolution steps attempted prior to escalation.';

    const handoffNote = [
        `ESCALATION NOTICE — ${escalationId}`,
        `Tier: ${classification.tier.replace(/_/g, ' ').toUpperCase()}`,
        `Severity: ${classification.severity.toUpperCase()}`,
        `SLA: Respond within ${classification.slaHours} hour(s)`,
        `Owner Team: ${classification.ownerTeam}`,
        '',
        `Escalated by: ${params.agentName ?? 'CSE Agent'} (Task: ${params.taskId})`,
        params.ticketId ? `Ticket: #${params.ticketId}` : '',
        params.customerId ? `Customer ID: ${params.customerId}` : '',
        params.customerEmail ? `Customer Email: ${params.customerEmail}` : '',
        '',
        `Issue Description:`,
        params.description,
        '',
        tried,
        '',
        `Trigger signal: "${classification.reason}"`,
        requiresApproval ? '\n⚠ This escalation requires manager approval before action.' : '',
    ].filter((line) => line !== undefined).join('\n').trim();

    return {
        escalationId,
        tier: classification.tier,
        severity: classification.severity,
        handoffNote,
        ownerTeam: classification.ownerTeam,
        slaHours: classification.slaHours,
        tags: [classification.tier, classification.severity, 'escalated'],
        requiresApproval,
    };
}
