// ============================================================================
// SALES REP EPISODIC HOOKS
// Sprint 19 — Sales Rep vertical (2026-05-21)
//
// Provides sales-rep-specific pattern keys and summaries for episodic memory
// writes.  The generic runtime write uses result.decision.actionType as the
// pattern, which is too coarse for a sales agent — we want to remember things
// like "outreach:sent to VP Engineering at Acme" or "deal:closed_won $50k".
//
// buildSalesRepEpisodicPattern  → derives a domain-specific pattern key
// buildSalesRepEpisodicSummary  → builds a CRM-contextualised summary
//
// Both are pure functions; no side-effects, easy to unit-test.
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'success' | 'fail' {
    return result.status === 'success' ? 'success' : 'fail';
}

function extractCompany(task: TaskEnvelope): string | null {
    const keys = ['company', 'company_name', 'account', 'prospect_company'] as const;
    for (const key of keys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
    }
    return null;
}

function extractProspect(task: TaskEnvelope): string | null {
    const keys = ['prospect', 'contact', 'contact_name', 'lead', 'prospect_name'] as const;
    for (const key of keys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
    }
    return null;
}

function extractDealStage(task: TaskEnvelope): string | null {
    const keys = ['stage', 'deal_stage', 'pipeline_stage'] as const;
    for (const key of keys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 40);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a sales-rep-specific episodic pattern key.
 *
 * The pattern is used as the ON CONFLICT key in AgentLongTermMemory — each
 * distinct pattern represents one "class" of sales knowledge per tenant.
 *
 * Examples:
 *   "sales_rep:outreach:sent"
 *   "sales_rep:outreach:bounced"
 *   "sales_rep:reply:positive"
 *   "sales_rep:reply:negative"
 *   "sales_rep:prospect_research:found"
 *   "sales_rep:prospect_research:not_found"
 *   "sales_rep:lead_enrich:success"
 *   "sales_rep:deal:closed_won"
 *   "sales_rep:deal:closed_lost"
 *   "sales_rep:meeting:scheduled"
 *   "sales_rep:meeting:cancelled"
 *   "sales_rep:sequence:started"
 *   "sales_rep:sequence:completed"
 *   "sales_rep:contract:sent"
 *   "sales_rep:crm:updated"
 */
export function buildSalesRepEpisodicPattern(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // ── Email outreach ───────────────────────────────────────────────────
    if (at === 'workspace_outreach_send' || at === 'workspace_email_send') {
        const bounced = result.decision.reason?.toLowerCase().includes('bounce');
        if (bounced) return 'sales_rep:outreach:bounced';
        return oc === 'success' ? 'sales_rep:outreach:sent' : `sales_rep:outreach:${oc}`;
    }

    // ── Email personalisation ────────────────────────────────────────────
    if (at === 'workspace_email_personalize') return `sales_rep:personalisation:${oc}`;

    // ── Reply classification ─────────────────────────────────────────────
    if (at === 'workspace_reply_classify') {
        const classification = String(task.payload['classification'] ?? '').toLowerCase();
        if (classification.includes('positive') || classification.includes('interest')) {
            return 'sales_rep:reply:positive';
        }
        if (classification.includes('negative') || classification.includes('unsubscribe')) {
            return 'sales_rep:reply:negative';
        }
        if (classification.includes('objection')) return 'sales_rep:reply:objection';
        return `sales_rep:reply:${oc}`;
    }

    // ── Prospecting / research ───────────────────────────────────────────
    if (at === 'workspace_prospect_research' || at === 'workspace_find_prospects') {
        const count = Number(task.payload['leads_found'] ?? 0);
        return count > 0 ? 'sales_rep:prospect_research:found' : 'sales_rep:prospect_research:not_found';
    }
    if (at === 'workspace_pre_meeting_research') return `sales_rep:pre_meeting_research:${oc}`;

    // ── Lead enrichment ──────────────────────────────────────────────────
    if (at === 'workspace_lead_enrich' || at === 'workspace_icp_score') {
        return `sales_rep:lead_enrich:${oc}`;
    }

    // ── Email sequences ──────────────────────────────────────────────────
    if (at === 'workspace_sequence_create') return 'sales_rep:sequence:created';
    if (at === 'workspace_sequence_send') return 'sales_rep:sequence:started';
    if (at === 'workspace_sequence_complete') return 'sales_rep:sequence:completed';

    // ── Deals ────────────────────────────────────────────────────────────
    if (at === 'workspace_deal_close') {
        const stage = String(task.payload['stage'] ?? '').toLowerCase();
        if (stage.includes('won')) return 'sales_rep:deal:closed_won';
        if (stage.includes('lost')) return 'sales_rep:deal:closed_lost';
        return `sales_rep:deal:${oc}`;
    }
    if (at === 'workspace_deal_update' || at === 'workspace_crm_update_deal') {
        return `sales_rep:deal:${oc}`;
    }

    // ── Contracts ────────────────────────────────────────────────────────
    if (at === 'workspace_contract_send') return `sales_rep:contract:${oc === 'success' ? 'sent' : oc}`;

    // ── Meetings ─────────────────────────────────────────────────────────
    if (at === 'workspace_meeting_schedule' || at === 'workspace_booking_invite') {
        return oc === 'success' ? 'sales_rep:meeting:scheduled' : 'sales_rep:meeting:failed';
    }
    if (at === 'workspace_meeting_join') return `sales_rep:meeting:joined:${oc}`;
    if (at === 'workspace_meeting_speak' || at === 'workspace_meeting_interview_live') {
        return `sales_rep:meeting:live:${oc}`;
    }

    // ── CRM updates (generic) ────────────────────────────────────────────
    if (at.startsWith('workspace_crm_') || at.startsWith('workspace_hubspot_') ||
        at.startsWith('workspace_salesforce_')) {
        return `sales_rep:crm:${oc}`;
    }

    // ── Web / desktop automation for CRM / LinkedIn ──────────────────────
    if (at.startsWith('workspace_web_') || at === 'workspace_browser_open') {
        return `sales_rep:web_action:${oc}`;
    }

    // Fallback — still namespaced under "sales_rep:" so it's easy to query
    return `sales_rep:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for sales rep tasks.
 *
 * Includes: prospect/company, action taken, outcome, deal stage, and the
 * task's natural-language objective — giving the agent useful context when
 * recalling similar past work (e.g. "I sent 3 emails to Acme with no reply").
 */
export function buildSalesRepEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const parts: string[] = [];

    // Who / where
    const company = extractCompany(task);
    if (company) parts.push(`Company: ${company}`);

    const prospect = extractProspect(task);
    if (prospect) parts.push(`Contact: ${prospect}`);

    // What was done
    parts.push(`Action: ${result.decision.actionType}`);

    // Deal stage context
    const stage = extractDealStage(task);
    if (stage) parts.push(`Stage: ${stage}`);

    // Revenue / ARR if available
    const revenueKeys = ['deal_value', 'arr', 'mrr', 'contract_value'] as const;
    for (const key of revenueKeys) {
        const v = task.payload[key];
        if (v !== undefined && v !== null) {
            parts.push(`Value: ${String(v).slice(0, 40)}`);
            break;
        }
    }

    // Classification for replies
    const classification = task.payload['classification'];
    if (typeof classification === 'string' && classification.trim()) {
        parts.push(`Classification: ${classification.trim().slice(0, 60)}`);
    }

    // Outcome
    parts.push(`Outcome: ${result.status}`);

    // Failure reason
    if (result.status !== 'success') {
        if (result.decision.reason) {
            parts.push(`Reason: ${result.decision.reason.slice(0, 200)}`);
        }
        if (result.errorMessage) {
            parts.push(`Error: ${result.errorMessage.slice(0, 200)}`);
        }
    }

    // Natural-language objective from task payload
    const summaryKeys = ['summary', 'objective', 'prompt', 'title', 'subject'] as const;
    for (const key of summaryKeys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) {
            parts.push(v.trim().slice(0, 200));
            break;
        }
    }

    return parts.join(' | ').slice(0, 500);
}
