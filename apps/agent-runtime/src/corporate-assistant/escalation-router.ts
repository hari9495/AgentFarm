/**
 * Corporate Assistant — Escalation Router
 *
 * Classifies whether a corporate assistant task needs to be escalated and,
 * if so, to which domain (legal, finance, hr, it). Both functions are pure
 * keyword heuristics — no LLM call, keeping latency and cost near zero.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationDomain = 'legal' | 'finance' | 'hr' | 'it' | 'none';

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

const LEGAL_KEYWORDS = [
    'contract', 'legal', 'lawsuit', 'litigation', 'attorney', 'counsel',
    'nda', 'non-disclosure', 'ip dispute', 'intellectual property',
    'gdpr', 'compliance violation', 'regulatory', 'liability',
    'terms of service', 'privacy policy', 'subpoena',
];

const FINANCE_KEYWORDS = [
    'invoice', 'budget', 'expense', 'refund', 'payment', 'billing',
    'payroll', 'purchase order', 'p.o.', 'finance', 'accounting',
    'accounts payable', 'accounts receivable', 'tax', 'audit',
    'financial forecast', 'revenue', 'cost centre', 'cost center',
];

const HR_KEYWORDS = [
    'harassment', 'discrimination', 'disciplinary', 'termination',
    'performance review', 'grievance', 'onboarding', 'offboarding',
    'leave request', 'sick leave', 'resignation', 'hr', 'human resources',
    'benefits', 'compensation', 'promotion', 'employee relations',
];

const IT_KEYWORDS = [
    'security incident', 'data breach', 'access request', 'vpn',
    'it support', 'password reset', 'account locked', 'outage',
    'server down', 'firewall', 'it ticket', 'infrastructure',
    'system failure', 'malware', 'phishing', 'siem', 'soc ticket',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the escalation domain for a task description.
 *
 * Returns the first matching domain or 'none' if no keywords match.
 * Domain precedence: legal → finance → hr → it → none.
 *
 * Pure function — no side effects.
 */
export function classifyEscalationDomain(taskDescription: string): EscalationDomain {
    const lower = taskDescription.toLowerCase();

    if (LEGAL_KEYWORDS.some((kw) => lower.includes(kw))) return 'legal';
    if (FINANCE_KEYWORDS.some((kw) => lower.includes(kw))) return 'finance';
    if (HR_KEYWORDS.some((kw) => lower.includes(kw))) return 'hr';
    if (IT_KEYWORDS.some((kw) => lower.includes(kw))) return 'it';

    return 'none';
}

/**
 * Build a structured escalation handoff note.
 *
 * Includes: task summary, requester context (tenantId / botId inferred from
 * persona), urgency signal derived from keyword scan, domain, and agent
 * identity (so the receiving team knows who escalated).
 *
 * Pure function — no side effects.
 */
export function buildEscalationNote(
    task: {
        taskId?: string;
        description?: string;
        objective?: string;
        urgency?: string;
        requestedBy?: string;
    },
    domain: EscalationDomain,
    persona: Pick<AgentPersonaRecord, 'displayName' | 'emailAddress'>,
): string {
    const summary =
        task.description?.trim() ||
        task.objective?.trim() ||
        '(No task description provided.)';

    const requester = task.requestedBy?.trim() || 'Unknown requester';
    const urgency = task.urgency?.trim() || deriveUrgency(summary);
    const taskRef = task.taskId ? `Task ID: ${task.taskId}` : 'Task ID: (not provided)';
    const domainLabel = domain === 'none' ? 'General' : domain.toUpperCase();

    return [
        `[Escalation Notice — ${domainLabel}]`,
        ``,
        `Agent:      ${persona.displayName} <${persona.emailAddress}>`,
        `${taskRef}`,
        `Requester:  ${requester}`,
        `Urgency:    ${urgency}`,
        ``,
        `Task Summary:`,
        summary.slice(0, 500),
        ``,
        `This task has been automatically routed to the ${domainLabel} team by the ` +
        `Corporate Assistant because it matches ${domainLabel.toLowerCase()}-domain ` +
        `escalation criteria. Please action or acknowledge within your SLA.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function deriveUrgency(description: string): string {
    const lower = description.toLowerCase();
    if (lower.includes('urgent') || lower.includes('asap') || lower.includes('immediately')) {
        return 'HIGH';
    }
    if (lower.includes('soon') || lower.includes('by end of day') || lower.includes('today')) {
        return 'MEDIUM';
    }
    return 'NORMAL';
}
