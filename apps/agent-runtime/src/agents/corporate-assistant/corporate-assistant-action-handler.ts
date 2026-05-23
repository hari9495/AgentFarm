/**
 * Corporate Assistant Action Handler
 *
 * Bridges the LocalWorkspaceActionType dispatch switch in
 * local-workspace-executor.ts to the four CA domain modules:
 *   - email-composer   (compose, send, classify)
 *   - calendar-scheduler (check availability, schedule, cancel)
 *   - document-preparer  (create, update)
 *   - escalation-router  (classify domain, build handoff note)
 *
 * Design rules:
 *   - Pure domain functions are called directly — no LLM fallback.
 *   - MCP-dependent functions throw on missing connector config (fail-fast).
 *   - Persona is read from payload._persona (injected by processOneTask).
 *   - Validation at the handler boundary — never pass garbage to domain fns.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';
import type { SalesEmailProvider } from '@agentfarm/shared-types';
import type { LocalWorkspaceResult } from '../../local-workspace-executor.js';
import {
    composeDraftEmail,
    sendComposedEmail,
    classifyEmailIntent,
} from './email-composer.js';
import {
    checkCalendarAvailability,
    scheduleCalendarEvent,
    cancelCalendarEvent,
} from './calendar-scheduler.js';
import {
    createInternalDocument,
    updateExistingDocument,
} from './document-preparer.js';
import {
    classifyEscalationDomain,
    buildEscalationNote,
} from './escalation-router.js';
import { sendMessage } from './message-sender.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorporateAssistantActionType =
    | 'workspace_ca_email_compose'
    | 'workspace_ca_email_send'
    | 'workspace_ca_email_classify'
    | 'workspace_ca_calendar_check'
    | 'workspace_ca_calendar_schedule'
    | 'workspace_ca_calendar_cancel'
    | 'workspace_ca_document_create'
    | 'workspace_ca_document_update'
    | 'workspace_ca_escalate'
    | 'workspace_ca_message_send'
    | 'workspace_ca_standup_report';

export function isCorporateAssistantActionType(t: string): t is CorporateAssistantActionType {
    return (
        t === 'workspace_ca_email_compose' ||
        t === 'workspace_ca_email_send' ||
        t === 'workspace_ca_email_classify' ||
        t === 'workspace_ca_calendar_check' ||
        t === 'workspace_ca_calendar_schedule' ||
        t === 'workspace_ca_calendar_cancel' ||
        t === 'workspace_ca_document_create' ||
        t === 'workspace_ca_document_update' ||
        t === 'workspace_ca_escalate' ||
        t === 'workspace_ca_message_send' ||
        t === 'workspace_ca_standup_report'
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonResult(value: unknown): LocalWorkspaceResult {
    return { ok: true, output: JSON.stringify(value, null, 2) };
}

/**
 * Extract the _persona field from payload and validate the minimum required
 * fields (displayName, emailAddress, disclosureStatement).
 *
 * Returns null if the persona block is absent or incomplete so callers can
 * fail fast with a descriptive error rather than an undefined-access crash.
 */
function extractPersona(
    payload: Record<string, unknown>,
): Pick<AgentPersonaRecord, 'displayName' | 'emailAddress' | 'disclosureStatement'> | null {
    const raw = payload['_persona'];
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    if (
        typeof p['displayName'] !== 'string' ||
        typeof p['emailAddress'] !== 'string' ||
        typeof p['disclosureStatement'] !== 'string'
    ) {
        return null;
    }
    return {
        displayName: p['displayName'],
        emailAddress: p['emailAddress'],
        disclosureStatement: p['disclosureStatement'],
    };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleCorporateAssistantAction(params: {
    actionType: CorporateAssistantActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
}): Promise<LocalWorkspaceResult> {
    const { actionType, tenantId, botId, taskId, payload } = params;

    switch (actionType) {
        // ------------------------------------------------------------------
        // workspace_ca_email_compose
        // Build a draft email from task context + persona; no send.
        // payload: { task: { subject?, body?, title?, objective?, recipient?, to? }, _persona }
        // ------------------------------------------------------------------
        case 'workspace_ca_email_compose': {
            try {
                const persona = extractPersona(payload);
                if (!persona) {
                    return {
                        ok: false,
                        output: '',
                        errorOutput: 'payload._persona is required and must have displayName, emailAddress, disclosureStatement.',
                    };
                }
                const taskBlock = (payload['task'] ?? {}) as Record<string, unknown>;
                const draft = composeDraftEmail({
                    task: {
                        subject: typeof taskBlock['subject'] === 'string' ? taskBlock['subject'] : undefined,
                        body: typeof taskBlock['body'] === 'string' ? taskBlock['body'] : undefined,
                        title: typeof taskBlock['title'] === 'string' ? taskBlock['title'] : undefined,
                        objective: typeof taskBlock['objective'] === 'string' ? taskBlock['objective'] : undefined,
                        recipient: typeof taskBlock['recipient'] === 'string' ? taskBlock['recipient'] : undefined,
                        to: typeof taskBlock['to'] === 'string' ? taskBlock['to'] : undefined,
                    },
                    persona,
                });
                return safeJsonResult(draft);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_email_send
        // Compose and immediately dispatch via email provider.
        // payload: { to, subject, body, providerName, _persona }
        // ------------------------------------------------------------------
        case 'workspace_ca_email_send': {
            try {
                const persona = extractPersona(payload);
                if (!persona) {
                    return {
                        ok: false,
                        output: '',
                        errorOutput: 'payload._persona is required and must have displayName, emailAddress, disclosureStatement.',
                    };
                }
                const to = typeof payload['to'] === 'string' ? payload['to'].trim() : '';
                const subject = typeof payload['subject'] === 'string' ? payload['subject'].trim() : '';
                const body = typeof payload['body'] === 'string' ? payload['body'].trim() : '';
                const providerName = typeof payload['providerName'] === 'string'
                    ? payload['providerName'] as SalesEmailProvider
                    : undefined;

                if (!to) return { ok: false, output: '', errorOutput: 'payload.to (recipient email) is required.' };
                if (!subject) return { ok: false, output: '', errorOutput: 'payload.subject is required.' };
                if (!body) return { ok: false, output: '', errorOutput: 'payload.body is required.' };
                if (!providerName) return { ok: false, output: '', errorOutput: 'payload.providerName is required (e.g. "sendgrid", "smtp").' };

                const result = await sendComposedEmail({ to, subject, body, persona, providerName });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_email_classify
        // Heuristic intent classification — pure, no LLM, no network.
        // payload: { subject, body }
        // ------------------------------------------------------------------
        case 'workspace_ca_email_classify': {
            try {
                const subject = typeof payload['subject'] === 'string' ? payload['subject'] : '';
                const body = typeof payload['body'] === 'string' ? payload['body'] : '';
                if (!subject && !body) {
                    return { ok: false, output: '', errorOutput: 'payload.subject or payload.body must be provided.' };
                }
                const intent = classifyEmailIntent(subject, body);
                return safeJsonResult({ intent });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_calendar_check
        // Check calendar availability via MCP connector.
        // payload: { attendeeEmails, durationMinutes, dateRangeStart, dateRangeEnd, connector? }
        // ------------------------------------------------------------------
        case 'workspace_ca_calendar_check': {
            try {
                const attendeeEmails = Array.isArray(payload['attendeeEmails'])
                    ? (payload['attendeeEmails'] as unknown[]).filter((e): e is string => typeof e === 'string')
                    : [];
                const durationMinutes = typeof payload['durationMinutes'] === 'number'
                    ? payload['durationMinutes']
                    : 0;
                const dateRangeStart = typeof payload['dateRangeStart'] === 'string' ? payload['dateRangeStart'] : '';
                const dateRangeEnd = typeof payload['dateRangeEnd'] === 'string' ? payload['dateRangeEnd'] : '';
                const connector = typeof payload['connector'] === 'string' ? payload['connector'] : undefined;

                if (attendeeEmails.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.attendeeEmails must be a non-empty string array.' };
                }
                if (durationMinutes <= 0) {
                    return { ok: false, output: '', errorOutput: 'payload.durationMinutes must be a positive number.' };
                }
                if (!dateRangeStart || !dateRangeEnd) {
                    return { ok: false, output: '', errorOutput: 'payload.dateRangeStart and payload.dateRangeEnd (ISO-8601) are required.' };
                }

                const result = await checkCalendarAvailability({
                    tenantId, botId, attendeeEmails, durationMinutes, dateRangeStart, dateRangeEnd, connector,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_calendar_schedule
        // Create a calendar event via MCP connector.
        // payload: { title, attendeeEmails, startTime, endTime, description?, connector? }
        // ------------------------------------------------------------------
        case 'workspace_ca_calendar_schedule': {
            try {
                const title = typeof payload['title'] === 'string' ? payload['title'].trim() : '';
                const attendeeEmails = Array.isArray(payload['attendeeEmails'])
                    ? (payload['attendeeEmails'] as unknown[]).filter((e): e is string => typeof e === 'string')
                    : [];
                const startTime = typeof payload['startTime'] === 'string' ? payload['startTime'] : '';
                const endTime = typeof payload['endTime'] === 'string' ? payload['endTime'] : '';
                const description = typeof payload['description'] === 'string' ? payload['description'] : undefined;
                const connector = typeof payload['connector'] === 'string' ? payload['connector'] : undefined;

                if (!title) return { ok: false, output: '', errorOutput: 'payload.title is required.' };
                if (attendeeEmails.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.attendeeEmails must be a non-empty string array.' };
                }
                if (!startTime) return { ok: false, output: '', errorOutput: 'payload.startTime (ISO-8601) is required.' };
                if (!endTime) return { ok: false, output: '', errorOutput: 'payload.endTime (ISO-8601) is required.' };

                const result = await scheduleCalendarEvent({
                    tenantId, botId, title, attendeeEmails, startTime, endTime, description, connector,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_calendar_cancel
        // Cancel an existing calendar event via MCP connector.
        // payload: { eventId, cancellationNote?, connector? }
        // ------------------------------------------------------------------
        case 'workspace_ca_calendar_cancel': {
            try {
                const eventId = typeof payload['eventId'] === 'string' ? payload['eventId'].trim() : '';
                const cancellationNote = typeof payload['cancellationNote'] === 'string'
                    ? payload['cancellationNote']
                    : undefined;
                const connector = typeof payload['connector'] === 'string' ? payload['connector'] : undefined;

                if (!eventId) return { ok: false, output: '', errorOutput: 'payload.eventId is required.' };

                const result = await cancelCalendarEvent({
                    tenantId, botId, eventId, cancellationNote, connector,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_document_create
        // Create a new document via Google Drive or Confluence MCP connector.
        // payload: { title, body, provider, parentId? }
        // ------------------------------------------------------------------
        case 'workspace_ca_document_create': {
            try {
                const title = typeof payload['title'] === 'string' ? payload['title'].trim() : '';
                const body = typeof payload['body'] === 'string' ? payload['body'] : '';
                const provider = typeof payload['provider'] === 'string' ? payload['provider'] : '';
                const parentId = typeof payload['parentId'] === 'string' ? payload['parentId'] : undefined;

                if (!title) return { ok: false, output: '', errorOutput: 'payload.title is required.' };
                if (!body) return { ok: false, output: '', errorOutput: 'payload.body is required.' };
                if (!provider) return { ok: false, output: '', errorOutput: 'payload.provider is required (e.g. "google_drive", "confluence").' };

                const result = await createInternalDocument({
                    tenantId, botId, title, body, provider, parentId,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_document_update
        // Update an existing document via MCP connector.
        // payload: { documentId, mode: 'append'|'replace', content, provider }
        // ------------------------------------------------------------------
        case 'workspace_ca_document_update': {
            try {
                const documentId = typeof payload['documentId'] === 'string' ? payload['documentId'].trim() : '';
                const mode = payload['mode'] === 'replace' ? 'replace' : 'append';
                const content = typeof payload['content'] === 'string' ? payload['content'] : '';
                const provider = typeof payload['provider'] === 'string' ? payload['provider'] : '';

                if (!documentId) return { ok: false, output: '', errorOutput: 'payload.documentId is required.' };
                if (!content) return { ok: false, output: '', errorOutput: 'payload.content is required.' };
                if (!provider) return { ok: false, output: '', errorOutput: 'payload.provider is required (e.g. "google_drive", "confluence").' };

                const result = await updateExistingDocument({
                    tenantId, botId, documentId, mode, content, provider,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_escalate
        // Classify domain and build a structured escalation handoff note.
        // payload: { description, urgency?, requestedBy?, _persona }
        // ------------------------------------------------------------------
        case 'workspace_ca_escalate': {
            try {
                const description = typeof payload['description'] === 'string' ? payload['description'].trim() : '';
                if (!description) {
                    return { ok: false, output: '', errorOutput: 'payload.description is required.' };
                }

                const persona = extractPersona(payload) ?? {
                    displayName: `Agent (botId: ${botId})`,
                    emailAddress: 'agent@agentfarm.internal',
                    disclosureStatement: '',
                };

                const domain = classifyEscalationDomain(description);
                const note = buildEscalationNote(
                    {
                        taskId,
                        description,
                        urgency: typeof payload['urgency'] === 'string' ? payload['urgency'] : undefined,
                        requestedBy: typeof payload['requestedBy'] === 'string' ? payload['requestedBy'] : undefined,
                    },
                    domain,
                    persona,
                );
                return safeJsonResult({ domain, note });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_message_send
        // Send a Slack or Teams message to a recipient/channel.
        // payload: { platform: 'slack'|'teams', recipient, message }
        // ------------------------------------------------------------------
        case 'workspace_ca_message_send': {
            try {
                const platform = payload['platform'];
                if (platform !== 'slack' && platform !== 'teams') {
                    return { ok: false, output: '', errorOutput: 'payload.platform must be "slack" or "teams".' };
                }
                const recipient = typeof payload['recipient'] === 'string' ? payload['recipient'].trim() : '';
                if (!recipient) {
                    return { ok: false, output: '', errorOutput: 'payload.recipient is required.' };
                }
                const message = typeof payload['message'] === 'string' ? payload['message'].trim() : '';
                if (!message) {
                    return { ok: false, output: '', errorOutput: 'payload.message is required.' };
                }
                const connector = typeof payload['connector'] === 'string' ? payload['connector'] : undefined;
                const result = await sendMessage({ tenantId, botId, platform, recipient, message, connector });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_ca_standup_report
        // Build a structured standup summary for the CA role and optionally
        // speak it at a meeting.
        // payload: { recent_memory?, bot_name?, team_name?, meeting_type? }
        // ------------------------------------------------------------------
        case 'workspace_ca_standup_report': {
            const { buildCorporateAssistantStandupSummary, buildCorporateAssistantMeetingContext } =
                await import('./corporate-assistant-standup-builder.js');
            const botName = typeof payload['bot_name'] === 'string' && payload['bot_name'].trim()
                ? payload['bot_name'].trim()
                : 'AI Corporate Assistant';
            const teamName = typeof payload['team_name'] === 'string' && payload['team_name'].trim()
                ? payload['team_name'].trim()
                : 'the team';
            const rawMemory = Array.isArray(payload['recent_memory'])
                ? (payload['recent_memory'] as unknown[]).filter((x) => typeof x === 'string') as string[]
                : [];
            const meetingType = (['standup', 'scrum_planning', 'sprint_review', 'retrospective', 'all_hands', 'one_on_one'] as const)
                .includes(payload['meeting_type'] as never)
                ? (payload['meeting_type'] as 'standup' | 'scrum_planning' | 'sprint_review' | 'retrospective' | 'all_hands' | 'one_on_one')
                : 'standup';

            const summary = buildCorporateAssistantStandupSummary(rawMemory, { botName, teamName });
            const context = buildCorporateAssistantMeetingContext(meetingType, { botName, teamName, standupSummary: summary });
            return safeJsonResult({ summary, context });
        }

        default: {
            const _exhaustive: never = actionType;
            return {
                ok: false,
                output: '',
                errorOutput: `Unknown corporate assistant action: ${_exhaustive as string}`,
            };
        }
    }
}
