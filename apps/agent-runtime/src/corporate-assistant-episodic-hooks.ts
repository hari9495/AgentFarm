// ============================================================================
// CORPORATE ASSISTANT EPISODIC HOOKS
// Sprint 15 — Corporate Assistant Role
//
// Provides corporate-assistant-specific pattern keys and summaries for episodic
// memory writes. The generic runtime write captures result.decision.actionType
// as the pattern, which is too coarse for a corporate assistant — we want to
// remember things like "calendar event scheduled with 3 external attendees" or
// "email routed to legal escalation".
//
// buildCorporateAssistantEpisodicPattern  → derives a domain-specific key
// buildCorporateAssistantEpisodicSummary  → richer assistant-context summary
//
// Both are pure functions; no side-effects, easy to unit-test.
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function outcomeTag(result: ProcessedTaskResult): 'done' | 'fail' {
    return result.status === 'success' ? 'done' : 'fail';
}

function extractCalendarConnector(task: TaskEnvelope): string | null {
    const v = task.payload['connector'];
    if (typeof v === 'string' && v.trim()) {
        const c = v.trim().toLowerCase();
        if (c === 'google_calendar' || c === 'outlook_calendar') return c;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a corporate-assistant-specific episodic pattern key.
 *
 * Examples:
 *   "ca:calendar:scheduled"
 *   "ca:calendar:cancelled"
 *   "ca:email:sent"
 *   "ca:email:routed"
 *   "ca:document:created"
 *   "ca:document:updated"
 *   "ca:escalation:routed"
 *   "ca:standup:done"
 *   "ca:meeting:joined"
 */
export function buildCorporateAssistantEpisodicPattern(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const at = result.decision.actionType;
    const oc = outcomeTag(result);

    // Calendar actions
    if (at === 'schedule_meeting' || at === 'scheduleCalendarEvent') {
        return `ca:calendar:scheduled`;
    }
    if (at === 'cancel_meeting' || at === 'cancelCalendarEvent') {
        return `ca:calendar:cancelled`;
    }
    if (at === 'check_availability' || at === 'checkCalendarAvailability') {
        return `ca:calendar:availability_check:${oc}`;
    }
    if (at.includes('calendar')) return `ca:calendar:${oc}`;

    // Email actions
    if (at === 'send_email' || at === 'sendComposedEmail') return `ca:email:sent`;
    if (at === 'route_email' || at === 'classifyEmailIntent') return `ca:email:routed`;
    if (at.includes('email')) return `ca:email:${oc}`;

    // Document actions
    if (at === 'create_document' || at === 'createInternalDocument') return `ca:document:created`;
    if (at === 'update_document' || at === 'updateExistingDocument') return `ca:document:updated`;
    if (at.includes('document')) return `ca:document:${oc}`;

    // Escalation
    if (at === 'escalate' || at === 'routeEscalation' || at.includes('escalation')) {
        return `ca:escalation:routed`;
    }

    // Meetings
    if (at === 'workspace_meeting_join') return `ca:meeting:joined`;
    if (at === 'workspace_meeting_speak') return `ca:meeting:spoke`;

    // Standup
    if (at === 'workspace_standup_report') return `ca:standup:${oc}`;

    // Memory
    if (at.includes('workspace_memory')) return `ca:memory:${oc}`;

    // Messages / communication
    if (at === 'send_message') return `ca:message:sent`;

    // Fallback — namespaced under "ca:" for easy query
    return `ca:${at}:${oc}`;
}

/**
 * Builds a richer episodic summary for corporate assistant tasks.
 *
 * Includes: action category, attendee/recipient context, outcome,
 * failure reason, and the task's natural-language objective — giving
 * the agent useful context when recalling similar past work.
 */
export function buildCorporateAssistantEpisodicSummary(
    task: TaskEnvelope,
    result: ProcessedTaskResult,
): string {
    const parts: string[] = [];

    // Calendar context
    const calConn = extractCalendarConnector(task);
    if (calConn) parts.push(`Calendar: ${calConn}`);

    const attendeeKeys = ['attendees', 'attendee_emails', 'to', 'recipients'] as const;
    for (const key of attendeeKeys) {
        const v = task.payload[key];
        if (typeof v === 'string' && v.trim()) {
            parts.push(`Recipient(s): ${v.trim().slice(0, 120)}`);
            break;
        }
        if (Array.isArray(v) && v.length > 0) {
            parts.push(`Recipient(s): ${v.slice(0, 5).join(', ').slice(0, 120)}`);
            break;
        }
    }

    // Outcome
    parts.push(`Outcome: ${result.status}`);

    // Failure details
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
