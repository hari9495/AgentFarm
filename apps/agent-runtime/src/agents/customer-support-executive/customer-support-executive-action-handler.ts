/**
 * Customer Support Executive Action Handler
 *
 * Dispatches all workspace_cse_* actions to their domain modules:
 *   - ticket-manager        (open, update, close, merge, assign)
 *   - response-composer     (compose, send, follow-up, classify)
 *   - knowledge-base-searcher (search, diagnose, create article)
 *   - escalation-router     (escalate, de-escalate)
 *   - refund-processor      (refund, order modify)
 *   - csat-surveyor         (CSAT, NPS send)
 *   - crm-updater           (CRM record, case document)
 *   - kpi-reporter          (KPI report, trend analysis, SLA check)
 *   - standup-builder       (daily standup report)
 *
 * Design rules:
 *   - Validate at the handler boundary; never pass garbage to domain fns.
 *   - MCP-dependent fns throw on missing connector config (fail-fast).
 *   - All refund / escalation / send operations are logged for audit.
 *   - Default case is exhaustive — TS compiler enforces coverage.
 */

import type { LocalWorkspaceResult, LocalWorkspaceConnectorClient } from '../../local-workspace-executor.js';
import { sendEmailViaConnector } from '../shared/connector-email.js';
import {
    openTicket, updateTicket, closeTicket, mergeTickets, assignTicket,
} from './ticket-manager.js';
import {
    composeReply, classifyIssueCategory,
    type IssueCategory, type ResponseTone,
} from './response-composer.js';
import {
    searchKnowledgeBase, buildDiagnosticChecklist, type Industry,
} from './knowledge-base-searcher.js';
import { buildEscalationNote } from './escalation-router.js';
import { processRefund, modifyOrder, type RefundReason, type OrderModificationType } from './refund-processor.js';
import { sendSurvey, type SurveyType } from './csat-surveyor.js';
import { updateCrmRecord, documentCase, type InteractionChannel, type InteractionOutcome } from './crm-updater.js';
import { computeKpiReport, analyseTrends, checkSla, type TicketDataPoint } from './kpi-reporter.js';
import { buildCseStandupSummary } from './customer-support-executive-standup-builder.js';
import {
    handleVoiceCall, handleVoiceTranscribe,
    type VoiceSttProvider, type VoiceTtsProvider,
} from './voice-call-handler.js';
import type { TelephonyConnectorConfig } from './telephony-normalizer.js';

// ---------------------------------------------------------------------------
// Action type union
// ---------------------------------------------------------------------------

export type CustomerSupportExecutiveActionType =
    // Ticket lifecycle
    | 'workspace_cse_ticket_open'
    | 'workspace_cse_ticket_update'
    | 'workspace_cse_ticket_close'
    | 'workspace_cse_ticket_merge'
    | 'workspace_cse_ticket_assign'
    // Communication
    | 'workspace_cse_reply_compose'
    | 'workspace_cse_reply_send'
    | 'workspace_cse_reply_followup'
    | 'workspace_cse_outbound_call_log'
    // Knowledge base
    | 'workspace_cse_kb_search'
    | 'workspace_cse_kb_create_article'
    | 'workspace_cse_issue_diagnose'
    // Escalation
    | 'workspace_cse_escalate'
    | 'workspace_cse_deescalate'
    // Refunds & orders
    | 'workspace_cse_refund_process'
    | 'workspace_cse_order_modify'
    // Surveys
    | 'workspace_cse_csat_send'
    | 'workspace_cse_nps_send'
    // CRM & documentation
    | 'workspace_cse_crm_update'
    | 'workspace_cse_case_document'
    // Analytics
    | 'workspace_cse_kpi_report'
    | 'workspace_cse_trend_analysis'
    | 'workspace_cse_standup_report'
    // Multi-channel
    | 'workspace_cse_live_chat_handle'
    | 'workspace_cse_sla_check'
    // Voice
    | 'workspace_cse_voice_call_handle'
    | 'workspace_cse_voice_transcribe';

export function isCustomerSupportExecutiveActionType(t: string): t is CustomerSupportExecutiveActionType {
    return (
        t === 'workspace_cse_ticket_open' ||
        t === 'workspace_cse_ticket_update' ||
        t === 'workspace_cse_ticket_close' ||
        t === 'workspace_cse_ticket_merge' ||
        t === 'workspace_cse_ticket_assign' ||
        t === 'workspace_cse_reply_compose' ||
        t === 'workspace_cse_reply_send' ||
        t === 'workspace_cse_reply_followup' ||
        t === 'workspace_cse_outbound_call_log' ||
        t === 'workspace_cse_kb_search' ||
        t === 'workspace_cse_kb_create_article' ||
        t === 'workspace_cse_issue_diagnose' ||
        t === 'workspace_cse_escalate' ||
        t === 'workspace_cse_deescalate' ||
        t === 'workspace_cse_refund_process' ||
        t === 'workspace_cse_order_modify' ||
        t === 'workspace_cse_csat_send' ||
        t === 'workspace_cse_nps_send' ||
        t === 'workspace_cse_crm_update' ||
        t === 'workspace_cse_case_document' ||
        t === 'workspace_cse_kpi_report' ||
        t === 'workspace_cse_trend_analysis' ||
        t === 'workspace_cse_standup_report' ||
        t === 'workspace_cse_live_chat_handle' ||
        t === 'workspace_cse_sla_check' ||
        t === 'workspace_cse_voice_call_handle' ||
        t === 'workspace_cse_voice_transcribe'
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(value: unknown): LocalWorkspaceResult {
    return { ok: true, output: JSON.stringify(value, null, 2) };
}

function fail(msg: string): LocalWorkspaceResult {
    return { ok: false, output: '', errorOutput: msg };
}

function str(v: unknown, fallback?: string): string {
    return typeof v === 'string' && v.trim() ? v.trim() : (fallback ?? '');
}

function num(v: unknown, fallback?: number): number | undefined {
    return typeof v === 'number' ? v : fallback;
}

function arr<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleCustomerSupportExecutiveAction(params: {
    actionType: CustomerSupportExecutiveActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    /** Optional — when provided, resolved tickets are ingested and lessons fetched for context. */
    gatewayBaseUrl?: string;
    serviceToken?: string;
    workspaceId?: string;
    /** Optional — dispatches native connector actions (e.g. gmail/outlook send_email). */
    connectorActionExecuteClient?: LocalWorkspaceConnectorClient;
}): Promise<LocalWorkspaceResult> {
    const { actionType, tenantId, botId, taskId, payload } = params;
    const { gatewayBaseUrl, serviceToken, workspaceId, connectorActionExecuteClient } = params;

    // RAG pre-flight — fetch prior resolved tickets, product knowledge, and support lessons
    let ragContextBlock = '';
    if (gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildSupportRagContext } = await import('./customer-support-rag-retriever.js');
            const { deriveMemoryConfig } = await import('@agentfarm/memory-service');
            const ragCtx = await buildSupportRagContext(
                {
                    tenantId,
                    botId,
                    issueTitle: String(payload['subject'] ?? payload['issue_title'] ?? actionType),
                    issueDescription: String(payload['description'] ?? payload['body'] ?? ''),
                    documentType: 'ticket_response',
                },
                gatewayBaseUrl, serviceToken, workspaceId, deriveMemoryConfig(actionType),
            );
            ragContextBlock = ragCtx.contextBlock;
        } catch { /* non-fatal */ }
    }

    switch (actionType) {

        // ====================================================================
        // TICKET LIFECYCLE
        // ====================================================================

        case 'workspace_cse_ticket_open': {
            const subject = str(payload['subject']);
            const description = str(payload['description']);
            if (!subject) return fail('payload.subject is required.');
            if (!description) return fail('payload.description is required.');
            try {
                const result = await openTicket({
                    tenantId, botId,
                    subject, description,
                    priority: str(payload['priority']) as never || 'medium',
                    channel: str(payload['channel']) as never || 'web',
                    customerId: str(payload['customerId']) || undefined,
                    customerEmail: str(payload['customerEmail']) || undefined,
                    tags: arr<string>(payload['tags']),
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_ticket_update': {
            const ticketId = str(payload['ticketId']);
            if (!ticketId) return fail('payload.ticketId is required.');
            try {
                const result = await updateTicket({
                    tenantId, botId, ticketId,
                    status: str(payload['status']) as never || undefined,
                    priority: str(payload['priority']) as never || undefined,
                    assigneeId: str(payload['assigneeId']) || undefined,
                    tags: arr<string>(payload['tags']).length ? arr<string>(payload['tags']) : undefined,
                    internalNote: str(payload['internalNote']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_ticket_close': {
            const ticketId = str(payload['ticketId']);
            const resolutionNote = str(payload['resolutionNote']);
            if (!ticketId) return fail('payload.ticketId is required.');
            if (!resolutionNote) return fail('payload.resolutionNote is required.');
            try {
                const result = await closeTicket({
                    tenantId, botId, ticketId, resolutionNote,
                    satisfactionRating: num(payload['satisfactionRating']),
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_ticket_merge': {
            const primaryTicketId = str(payload['primaryTicketId']);
            const duplicateTicketId = str(payload['duplicateTicketId']);
            if (!primaryTicketId) return fail('payload.primaryTicketId is required.');
            if (!duplicateTicketId) return fail('payload.duplicateTicketId is required.');
            try {
                const result = await mergeTickets({
                    tenantId, botId, primaryTicketId, duplicateTicketId,
                    mergeNote: str(payload['mergeNote']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_ticket_assign': {
            const ticketId = str(payload['ticketId']);
            const assigneeId = str(payload['assigneeId']);
            if (!ticketId) return fail('payload.ticketId is required.');
            if (!assigneeId) return fail('payload.assigneeId is required.');
            try {
                const result = await assignTicket({
                    tenantId, botId, ticketId, assigneeId,
                    assigneeType: (str(payload['assigneeType']) as 'agent' | 'team' | 'bot') || 'agent',
                    reason: str(payload['reason']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        // ====================================================================
        // CUSTOMER COMMUNICATION
        // ====================================================================

        case 'workspace_cse_reply_compose': {
            const issueDescription = str(payload['issueDescription']);
            if (!issueDescription) return fail('payload.issueDescription is required.');

            const subjectHint = str(payload['subject']);
            const bodyHint = str(payload['body']);
            const category = (str(payload['issueCategory']) as IssueCategory) ||
                classifyIssueCategory(subjectHint, issueDescription + ' ' + bodyHint);

            const reply = composeReply({
                issueDescription,
                issueCategory: category,
                customerName: str(payload['customerName']) || undefined,
                industry: str(payload['industry']) as Industry || undefined,
                tone: str(payload['tone']) as ResponseTone || undefined,
                resolutionSteps: arr<string>(payload['resolutionSteps']),
                agentName: str(payload['agentName']) || undefined,
                companyName: str(payload['companyName']) || undefined,
                ticketId: str(payload['ticketId']) || undefined,
                followUpSla: str(payload['followUpSla']) || undefined,
            });
            return ok(reply);
        }

        case 'workspace_cse_reply_send': {
            // Compose the reply first, then dispatch via email MCP (or helpdesk MCP)
            const issueDescription = str(payload['issueDescription']) || str(payload['body']) || 'Support resolution';
            const customerEmail = str(payload['customerEmail']) || str(payload['to']);
            if (!customerEmail) return fail('payload.customerEmail (or payload.to) is required.');

            const category = (str(payload['issueCategory']) as IssueCategory) ||
                classifyIssueCategory(str(payload['subject']), issueDescription);

            const reply = composeReply({
                issueDescription,
                issueCategory: category,
                customerName: str(payload['customerName']) || undefined,
                industry: str(payload['industry']) as Industry || undefined,
                tone: str(payload['tone']) as ResponseTone || undefined,
                resolutionSteps: arr<string>(payload['resolutionSteps']),
                agentName: str(payload['agentName']) || undefined,
                companyName: str(payload['companyName']) || undefined,
                ticketId: str(payload['ticketId']) || undefined,
                followUpSla: str(payload['followUpSla']) || undefined,
            });

            // Preferred path: the workspace's native email connector (gmail/outlook/
            // generic REST/SMTP) via the connector execute client.
            const connectorSend = await sendEmailViaConnector({
                connectorClient: connectorActionExecuteClient,
                workspaceId,
                gatewayBaseUrl,
                serviceToken,
                to: customerEmail,
                subject: reply.subject,
                body: reply.body,
                inReplyTo: str(payload['ticketId']) || undefined,
            });
            if (connectorSend.sent) {
                return ok({
                    sent: true,
                    via: connectorSend.connectorType,
                    attempts: connectorSend.attempts,
                    reply,
                });
            }

            // Fallback: the legacy MCP email server. Kept so deployments already
            // running on MCP_*_URL keep working while connectors are rolled out.
            const emailUrl =
                process.env['MCP_GMAIL_URL'] ??
                process.env['MCP_OUTLOOK_URL'] ??
                process.env['MCP_SMTP_URL'] ??
                process.env['MCP_EMAIL_URL'];

            if (emailUrl) {
                try {
                    const res = await fetch(`${emailUrl}/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tenantId, botId,
                            to: customerEmail,
                            subject: reply.subject,
                            body: reply.body,
                        }),
                    });
                    if (res.ok) {
                        const data = (await res.json()) as { messageId?: string };
                        return ok({ sent: true, messageId: data.messageId, reply });
                    }
                } catch {
                    // fall through — return composed reply for manual dispatch
                }
            }

            // Both paths exhausted — return the composed reply for manual dispatch,
            // naming the connector reason so the operator can see what to fix.
            return ok({
                sent: false,
                reason: `Email not dispatched (connector: ${connectorSend.reason}; no MCP email server configured)`,
                reply,
            });
        }

        case 'workspace_cse_reply_followup': {
            const ticketId = str(payload['ticketId']);
            const customerEmail = str(payload['customerEmail']) || str(payload['to']);
            if (!customerEmail) return fail('payload.customerEmail is required.');

            const reply = composeReply({
                issueDescription: str(payload['issueDescription']) || 'Follow-up on your recent support case',
                issueCategory: 'escalation_followup',
                customerName: str(payload['customerName']) || undefined,
                tone: 'empathetic',
                ticketId: ticketId || undefined,
                agentName: str(payload['agentName']) || undefined,
                companyName: str(payload['companyName']) || undefined,
            });
            // Send the follow-up now when requested (mirrors reply_send); a
            // scheduledAt keeps the compose-only behaviour for later delivery.
            if (payload['send'] === true) {
                const dispatch = await sendEmailViaConnector({
                    connectorClient: connectorActionExecuteClient,
                    workspaceId, gatewayBaseUrl, serviceToken,
                    to: customerEmail,
                    subject: reply.subject,
                    body: reply.body,
                });
                return ok(dispatch.sent
                    ? { sent: true, via: dispatch.connectorType, customerEmail, reply }
                    : { sent: false, followUpComposed: true, dispatch_reason: dispatch.reason, customerEmail, reply });
            }
            return ok({ followUpComposed: true, customerEmail, reply, scheduledAt: payload['scheduledAt'] ?? null });
        }

        case 'workspace_cse_outbound_call_log': {
            const customerId = str(payload['customerId']) || str(payload['customerEmail']);
            if (!customerId) return fail('payload.customerId or payload.customerEmail is required.');
            const duration = num(payload['durationSeconds']) ?? 0;
            const outcome = str(payload['outcome']) || 'completed';
            const notes = str(payload['notes']) || 'Outbound call logged.';
            return ok({
                logged: true,
                customerId,
                durationSeconds: duration,
                outcome,
                notes,
                loggedAt: new Date().toISOString(),
                taskId,
            });
        }

        // ====================================================================
        // KNOWLEDGE BASE & DIAGNOSTICS
        // ====================================================================

        case 'workspace_cse_kb_search': {
            const query = str(payload['query']);
            if (!query) return fail('payload.query is required.');
            try {
                const result = await searchKnowledgeBase({
                    tenantId, botId, query,
                    issueCategory: str(payload['issueCategory']) as IssueCategory || undefined,
                    industry: str(payload['industry']) as Industry || undefined,
                    maxResults: num(payload['maxResults']) ?? 5,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_kb_create_article': {
            const title = str(payload['title']);
            const rootCause = str(payload['rootCause']);
            const resolutionSteps = arr<string>(payload['resolutionSteps']);
            if (!title) return fail('payload.title is required.');
            if (!rootCause) return fail('payload.rootCause is required.');
            if (resolutionSteps.length === 0) return fail('payload.resolutionSteps must be a non-empty array.');
            try {
                const result = await documentCase({
                    tenantId, botId,
                    ticketId: str(payload['ticketId']) || taskId,
                    title, rootCause, resolutionSteps,
                    preventionNotes: str(payload['preventionNotes']) || undefined,
                    industry: str(payload['industry']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_issue_diagnose': {
            const issueCategory = (str(payload['issueCategory']) as IssueCategory) || 'general';
            const checklist = buildDiagnosticChecklist(issueCategory, {
                industry: str(payload['industry']) as Industry || undefined,
                productName: str(payload['productName']) || undefined,
                errorMessage: str(payload['errorMessage']) || undefined,
                accountId: str(payload['accountId']) || undefined,
            });
            return ok({ issueCategory, checklist, steps: checklist.length });
        }

        // ====================================================================
        // ESCALATION
        // ====================================================================

        case 'workspace_cse_escalate': {
            const description = str(payload['description']);
            if (!description) return fail('payload.description is required.');
            const note = buildEscalationNote({
                taskId,
                ticketId: str(payload['ticketId']) || undefined,
                customerId: str(payload['customerId']) || undefined,
                customerEmail: str(payload['customerEmail']) || undefined,
                description,
                stepsAlreadyTried: arr<string>(payload['stepsAlreadyTried']),
                agentName: str(payload['agentName']) || undefined,
                urgency: str(payload['urgency']) || undefined,
            });
            return ok(note);
        }

        case 'workspace_cse_deescalate': {
            const ticketId = str(payload['ticketId']);
            const reason = str(payload['reason']);
            if (!ticketId) return fail('payload.ticketId is required.');
            if (!reason) return fail('payload.reason is required for de-escalation.');
            return ok({
                deescalated: true,
                ticketId,
                reason,
                newTier: 'tier1_support',
                deescalatedAt: new Date().toISOString(),
                note: `Ticket #${ticketId} de-escalated: ${reason}`,
            });
        }

        // ====================================================================
        // REFUNDS & ORDER MANAGEMENT
        // ====================================================================

        case 'workspace_cse_refund_process': {
            const transactionId = str(payload['transactionId']);
            const reason = str(payload['reason']) as RefundReason;
            if (!transactionId) return fail('payload.transactionId is required.');
            if (!reason) return fail('payload.reason is required (e.g. "duplicate_charge", "product_defective").');
            try {
                const result = await processRefund({
                    tenantId, botId, transactionId, reason,
                    amount: num(payload['amount']),
                    currency: str(payload['currency']) || undefined,
                    reasonNote: str(payload['reasonNote']) || undefined,
                    customerId: str(payload['customerId']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_order_modify': {
            const modificationType = str(payload['modificationType']) as OrderModificationType;
            if (!modificationType) return fail('payload.modificationType is required.');
            const orderId = str(payload['orderId']) || undefined;
            const subscriptionId = str(payload['subscriptionId']) || undefined;
            if (!orderId && !subscriptionId) {
                return fail('payload.orderId or payload.subscriptionId is required.');
            }
            try {
                const result = await modifyOrder({
                    tenantId, botId, modificationType, orderId, subscriptionId,
                    newPlanId: str(payload['newPlanId']) || undefined,
                    newQuantity: num(payload['newQuantity']),
                    newAddress: str(payload['newAddress']) || undefined,
                    effectiveDate: (str(payload['effectiveDate']) as 'immediate' | 'next_cycle') || 'next_cycle',
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        // ====================================================================
        // SURVEYS
        // ====================================================================

        case 'workspace_cse_csat_send': {
            const customerEmail = str(payload['customerEmail']) || str(payload['to']);
            if (!customerEmail) return fail('payload.customerEmail is required.');
            try {
                const result = await sendSurvey({
                    tenantId, botId,
                    surveyType: 'csat',
                    customerEmail,
                    customerName: str(payload['customerName']) || undefined,
                    ticketId: str(payload['ticketId']) || undefined,
                    agentName: str(payload['agentName']) || undefined,
                    companyName: str(payload['companyName']) || undefined,
                    language: str(payload['language']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_nps_send': {
            const customerEmail = str(payload['customerEmail']) || str(payload['to']);
            if (!customerEmail) return fail('payload.customerEmail is required.');
            try {
                const result = await sendSurvey({
                    tenantId, botId,
                    surveyType: (str(payload['surveyType']) as SurveyType) || 'nps',
                    customerEmail,
                    customerName: str(payload['customerName']) || undefined,
                    ticketId: str(payload['ticketId']) || undefined,
                    agentName: str(payload['agentName']) || undefined,
                    companyName: str(payload['companyName']) || undefined,
                    language: str(payload['language']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        // ====================================================================
        // CRM & DOCUMENTATION
        // ====================================================================

        case 'workspace_cse_crm_update': {
            const channel = str(payload['channel']) as InteractionChannel || 'ticket';
            const subject = str(payload['subject']) || str(payload['title']);
            const summary = str(payload['summary']);
            const outcome = str(payload['outcome']) as InteractionOutcome || 'resolved';
            if (!subject) return fail('payload.subject (or payload.title) is required.');
            if (!summary) return fail('payload.summary is required.');
            try {
                const result = await updateCrmRecord({
                    tenantId, botId,
                    record: {
                        ticketId: str(payload['ticketId']) || undefined,
                        customerId: str(payload['customerId']) || undefined,
                        customerEmail: str(payload['customerEmail']) || undefined,
                        channel, subject, summary, outcome,
                        agentId: botId,
                        resolutionSteps: arr<string>(payload['resolutionSteps']),
                        durationSeconds: num(payload['durationSeconds']),
                        satisfactionRating: num(payload['satisfactionRating']),
                        tags: arr<string>(payload['tags']),
                        nextFollowUpDate: str(payload['nextFollowUpDate']) || undefined,
                    },
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_case_document': {
            const title = str(payload['title']);
            const rootCause = str(payload['rootCause']);
            const resolutionSteps = arr<string>(payload['resolutionSteps']);
            if (!title) return fail('payload.title is required.');
            if (!rootCause) return fail('payload.rootCause is required.');
            if (resolutionSteps.length === 0) return fail('payload.resolutionSteps must be a non-empty array.');
            try {
                const result = await documentCase({
                    tenantId, botId,
                    ticketId: str(payload['ticketId']) || taskId,
                    title, rootCause, resolutionSteps,
                    preventionNotes: str(payload['preventionNotes']) || undefined,
                    industry: str(payload['industry']) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        // ====================================================================
        // ANALYTICS & REPORTING
        // ====================================================================

        case 'workspace_cse_kpi_report': {
            const tickets = arr<TicketDataPoint>(payload['tickets']);
            const from = str(payload['from']) || new Date(Date.now() - 86_400_000 * 7).toISOString();
            const to = str(payload['to']) || new Date().toISOString();
            if (tickets.length === 0) {
                return fail('payload.tickets must be a non-empty array of TicketDataPoint objects.');
            }
            const report = computeKpiReport(tickets, { from, to });
            return ok(report);
        }

        case 'workspace_cse_trend_analysis': {
            const tickets = arr<TicketDataPoint>(payload['tickets']);
            if (tickets.length === 0) {
                return fail('payload.tickets must be a non-empty array of TicketDataPoint objects.');
            }
            const analysis = analyseTrends(tickets);
            return ok(analysis);
        }

        case 'workspace_cse_standup_report': {
            const recentMemory = arr<string>(payload['recent_memory']);
            const summary = buildCseStandupSummary(recentMemory, {
                botName: str(payload['bot_name']) || undefined,
                teamName: str(payload['team_name']) || undefined,
                shiftPeriod: str(payload['shift_period']) || undefined,
            });
            // Post the shift standup to the team channel when requested.
            if (payload['post'] === true) {
                const channel = str(payload['channel']).trim();
                if (!channel) return ok({ posted: false, reason: 'post=true requires payload.channel', summary });
                if (!connectorActionExecuteClient) return ok({ posted: false, reason: 'no connector client available', summary });
                const r = await connectorActionExecuteClient({
                    connectorType: 'slack',
                    actionType: 'send_message',
                    payload: { channel, message: summary.summary },
                });
                return ok(r.ok ? { posted: true, channel, summary } : { posted: false, reason: r.errorMessage ?? 'slack post failed', summary });
            }
            return ok(summary);
        }

        // ====================================================================
        // MULTI-CHANNEL & SLA
        // ====================================================================

        case 'workspace_cse_live_chat_handle': {
            const sessionId = str(payload['sessionId']);
            const customerMessage = str(payload['customerMessage']);
            if (!sessionId) return fail('payload.sessionId is required.');
            if (!customerMessage) return fail('payload.customerMessage is required.');

            const category = (str(payload['issueCategory']) as IssueCategory) ||
                classifyIssueCategory('', customerMessage);

            const reply = composeReply({
                issueDescription: customerMessage,
                issueCategory: category,
                customerName: str(payload['customerName']) || undefined,
                industry: str(payload['industry']) as Industry || undefined,
                tone: 'friendly',
                resolutionSteps: arr<string>(payload['resolutionSteps']),
                agentName: str(payload['agentName']) || undefined,
                companyName: str(payload['companyName']) || undefined,
            });

            return ok({
                sessionId,
                category,
                response: reply.body,
                tone: reply.tone,
                containsCommitment: reply.containsCommitment,
                handledAt: new Date().toISOString(),
            });
        }

        case 'workspace_cse_sla_check': {
            const ticketId = str(payload['ticketId']);
            const openedAt = str(payload['openedAt']);
            if (!ticketId) return fail('payload.ticketId is required.');
            if (!openedAt) return fail('payload.openedAt (ISO-8601) is required.');
            const result = checkSla({
                ticketId,
                openedAt,
                priority: str(payload['priority']) || undefined,
            });
            return ok(result);
        }

        // ====================================================================
        // VOICE  (Sarvam AI STT/TTS + Deepgram fallback)
        // ====================================================================

        case 'workspace_cse_voice_call_handle': {
            const audioRef = str(payload['audioRef']) || undefined;
            const webhookPayload = typeof payload['webhookPayload'] === 'object' && payload['webhookPayload'] !== null
                ? (payload['webhookPayload'] as Record<string, unknown>)
                : undefined;
            const telephonyConnector = typeof payload['telephonyConnector'] === 'object' && payload['telephonyConnector'] !== null
                ? (payload['telephonyConnector'] as TelephonyConnectorConfig)
                : undefined;
            if (!audioRef && !webhookPayload) {
                return fail('payload.audioRef or payload.webhookPayload is required.');
            }
            try {
                const result = await handleVoiceCall({
                    tenantId, botId,
                    audioRef,
                    webhookPayload,
                    telephonyConnector,
                    callId: str(payload['callId']) || undefined,
                    customerId: str(payload['customerId']) || undefined,
                    customerEmail: str(payload['customerEmail']) || undefined,
                    customerName: str(payload['customerName']) || undefined,
                    language: str(payload['language']) || undefined,
                    industry: str(payload['industry']) as never || undefined,
                    agentName: str(payload['agentName']) || undefined,
                    companyName: str(payload['companyName']) || undefined,
                    ticketId: str(payload['ticketId']) || undefined,
                    sttProvider: (str(payload['sttProvider']) as VoiceSttProvider) || undefined,
                    ttsProvider: (str(payload['ttsProvider']) as VoiceTtsProvider) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        case 'workspace_cse_voice_transcribe': {
            const audioRef = str(payload['audioRef']) || undefined;
            const transcript = str(payload['transcript']) || undefined;
            if (!audioRef && !transcript) {
                return fail('payload.audioRef or payload.transcript is required.');
            }
            try {
                const result = await handleVoiceTranscribe({
                    tenantId, botId,
                    audioRef,
                    transcript,
                    callId: str(payload['callId']) || undefined,
                    ticketId: str(payload['ticketId']) || undefined,
                    customerId: str(payload['customerId']) || undefined,
                    language: str(payload['language']) || undefined,
                    sttProvider: (str(payload['sttProvider']) as VoiceSttProvider) || undefined,
                    connector: str(payload['connector']) || undefined,
                });
                return ok(result);
            } catch (err) {
                return fail(String(err));
            }
        }

        default: {
            const _exhaustive: never = actionType;
            return fail(`Unknown customer support executive action: ${_exhaustive as string}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onTicketResolved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    issueTitle: string; documentType: import('./customer-support-rag-retriever.js').SupportDocumentType;
    content: string; sourceUrl?: string; csatScore?: number;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestResolvedTicket } = await import('./customer-support-rag-retriever.js');
        await ingestResolvedTicket({ ...params });
    } catch { /* non-fatal */ }
}

/** Alias following the onAgent*Approved naming convention used by all other agents. */
export const onCseTicketApproved = onTicketResolved;

export async function onSupportFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; ticketId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestSupportFeedback, GatewaySupportLessonStore } = await import('./customer-support-lesson-pipeline.js');
        const store = new GatewaySupportLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestSupportFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, ticketId: params.ticketId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
