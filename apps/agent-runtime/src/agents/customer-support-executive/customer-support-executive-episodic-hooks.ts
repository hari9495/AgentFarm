// ============================================================================
// CUSTOMER SUPPORT EXECUTIVE EPISODIC HOOKS
//
// Maps every workspace_cse_* action to a domain-specific memory pattern key
// and builds rich summaries so the agent remembers customers, tickets, and
// outcomes across sessions.
//
// buildCseEpisodicPattern  → derives a cse:-namespaced key for recall queries
// buildCseEpisodicSummary  → customer-context summary for the LLM prompt
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'done' | 'fail' {
    return result.status === 'success' ? 'done' : 'fail';
}

function extractCustomerKey(task: TaskEnvelope): string {
    const email = task.payload['customerEmail'];
    const id = task.payload['customerId'];
    if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase();
    if (typeof id === 'string' && id.trim()) return id.trim();
    return '';
}

function extractTicketId(task: TaskEnvelope): string {
    const t = task.payload['ticketId'] ?? task.payload['primaryTicketId'];
    return typeof t === 'string' ? t.trim() : '';
}

function extractChannel(task: TaskEnvelope): string {
    const c = task.payload['channel'];
    return typeof c === 'string' && c.trim() ? c.trim() : '';
}

// ---------------------------------------------------------------------------
// Pattern builder
// ---------------------------------------------------------------------------

/**
 * Derives a CSE-specific episodic pattern key.
 *
 * Examples:
 *   "cse:ticket:opened"
 *   "cse:ticket:closed:done"
 *   "cse:ticket:escalated"
 *   "cse:reply:sent"
 *   "cse:refund:processed:done"
 *   "cse:voice:call_handled"
 *   "cse:chat:handled"
 *   "cse:survey:csat_sent"
 *   "cse:crm:updated"
 *   "cse:kb:searched"
 *   "cse:meeting:joined"
 *   "cse:standup:done"
 */
export function buildCseEpisodicPattern(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Ticket lifecycle
    if (at === 'workspace_cse_ticket_open') return `cse:ticket:opened`;
    if (at === 'workspace_cse_ticket_update') return `cse:ticket:updated:${oc}`;
    if (at === 'workspace_cse_ticket_close') return `cse:ticket:closed:${oc}`;
    if (at === 'workspace_cse_ticket_merge') return `cse:ticket:merged:${oc}`;
    if (at === 'workspace_cse_ticket_assign') return `cse:ticket:assigned:${oc}`;

    // Communication
    if (at === 'workspace_cse_reply_compose') return `cse:reply:composed`;
    if (at === 'workspace_cse_reply_send') return `cse:reply:sent`;
    if (at === 'workspace_cse_reply_followup') return `cse:reply:followup_scheduled`;
    if (at === 'workspace_cse_outbound_call_log') return `cse:call:outbound_logged`;

    // Knowledge base & diagnostics
    if (at === 'workspace_cse_kb_search') return `cse:kb:searched:${oc}`;
    if (at === 'workspace_cse_kb_create_article') return `cse:kb:article_created`;
    if (at === 'workspace_cse_issue_diagnose') return `cse:issue:diagnosed`;

    // Escalation
    if (at === 'workspace_cse_escalate') return `cse:ticket:escalated`;
    if (at === 'workspace_cse_deescalate') return `cse:ticket:deescalated`;

    // Refunds & orders
    if (at === 'workspace_cse_refund_process') return `cse:refund:processed:${oc}`;
    if (at === 'workspace_cse_order_modify') return `cse:order:modified:${oc}`;

    // Surveys
    if (at === 'workspace_cse_csat_send') return `cse:survey:csat_sent`;
    if (at === 'workspace_cse_nps_send') return `cse:survey:nps_sent`;

    // CRM & documentation
    if (at === 'workspace_cse_crm_update') return `cse:crm:updated`;
    if (at === 'workspace_cse_case_document') return `cse:case:documented`;

    // Analytics
    if (at === 'workspace_cse_kpi_report') return `cse:kpi:reported:${oc}`;
    if (at === 'workspace_cse_trend_analysis') return `cse:trend:analysed:${oc}`;
    if (at === 'workspace_cse_standup_report') return `cse:standup:${oc}`;
    if (at === 'workspace_cse_sla_check') return `cse:sla:checked:${oc}`;

    // Multi-channel
    if (at === 'workspace_cse_live_chat_handle') return `cse:chat:handled`;

    // Voice
    if (at === 'workspace_cse_voice_call_handle') return `cse:voice:call_handled`;
    if (at === 'workspace_cse_voice_transcribe') return `cse:voice:transcribed:${oc}`;

    // Meetings (shared)
    if (at === 'workspace_meeting_join') return `cse:meeting:joined`;
    if (at === 'workspace_meeting_speak') return `cse:meeting:spoke`;

    // Fallback
    return `cse:${at}:${oc}`;
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

/**
 * Builds a customer-context summary for episodic recall.
 * Includes: customer key, ticket id, channel, category, outcome,
 * failure reason, and the task's natural-language objective.
 *
 * This is what the LLM reads when it recalls past interactions with a
 * returning customer — the richer it is, the more "human" the recall.
 */
export function buildCseEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const parts: string[] = [];

    // Customer identity (the most important context for re-recognition)
    const customerKey = extractCustomerKey(task);
    if (customerKey) parts.push(`Customer: ${customerKey}`);

    const customerName = task.payload['customerName'];
    if (typeof customerName === 'string' && customerName.trim()) {
        parts.push(`Name: ${customerName.trim()}`);
    }

    // Ticket & channel context
    const ticketId = extractTicketId(task);
    if (ticketId) parts.push(`Ticket: ${ticketId}`);

    const channel = extractChannel(task);
    if (channel) parts.push(`Channel: ${channel}`);

    // Issue category (helps recall what the customer's recurring issues are)
    const category = task.payload['issueCategory'];
    if (typeof category === 'string' && category.trim()) {
        parts.push(`Category: ${category.trim()}`);
    }

    // Refund / order context
    const txId = task.payload['transactionId'];
    if (typeof txId === 'string' && txId.trim()) parts.push(`Transaction: ${txId.trim()}`);
    const orderId = task.payload['orderId'];
    if (typeof orderId === 'string' && orderId.trim()) parts.push(`Order: ${orderId.trim()}`);

    // Outcome
    parts.push(`Outcome: ${result.status}`);

    // Failure details (so future sessions know what went wrong)
    if (result.status !== 'success') {
        if (result.decision.reason) {
            parts.push(`Reason: ${result.decision.reason.slice(0, 200)}`);
        }
        if (result.errorMessage) {
            parts.push(`Error: ${result.errorMessage.slice(0, 200)}`);
        }
    }

    // Natural-language objective from the task
    const textKeys = ['issueDescription', 'description', 'subject', 'summary', 'customerMessage', 'notes'] as const;
    for (const key of textKeys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) {
            parts.push(v.trim().slice(0, 200));
            break;
        }
    }

    return parts.join(' | ').slice(0, 500);
}
