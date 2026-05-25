/**
 * Business Analyst — Async Approval Notifier
 *
 * Sends a one-click approve / reject notification to a stakeholder via Slack
 * or email instead of blocking the agent until a human responds.
 *
 * Flow:
 *   1. BA action handler classifies risk as 'medium' via the approval gate
 *   2. Calls `POST /v1/approvals/intake` → gets back an `approvalId`
 *   3. Calls `sendAsyncApprovalNotification()` here → Slack/email with two
 *      buttons linking to `POST /v1/approvals/:approvalId/decision`
 *   4. Agent continues other work (non-blocking)
 *   5. Stakeholder clicks ✅ or ❌ → gateway stores decision → webhook fires
 *      to the runtime → agent is unblocked and can proceed or abort
 *
 * For 'high' risk actions the existing approval intake escalation flow handles
 * the notification — this module only deals with 'medium' (async) actions.
 *
 * Uses the same MeetingProviderExecutor pattern as meeting-transcription.ts
 * for Slack sends, keeping the dependency boundary clean.
 */

import type { MeetingProviderExecutor } from '../meeting-agent/meeting-transcription.js';
import type { BrdCompletenessResult } from './business-analyst-brd-completeness-checker.js';
import type { RiskClassificationResult } from './business-analyst-approval-gate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AsyncApprovalChannel = 'slack' | 'email';

export interface AsyncApprovalNotificationRequest {
    approvalId: string;
    taskId: string;
    actionType: string;
    /** Short description of what the agent is about to do. */
    actionSummary: string;
    documentTitle?: string;
    /** Completeness check result — shown in the notification to help the reviewer. */
    completenessResult?: BrdCompletenessResult;
    /** Gate classification result — shown alongside completeness. */
    gateResult: RiskClassificationResult;
    /** The stakeholder (Slack user ID, channel ID, or email address) to notify. */
    notificationTarget: string;
    channel: AsyncApprovalChannel;
    /** Gateway base URL for the approve/reject deep links. */
    gatewayBaseUrl: string;
    /** Workspace ID — required for the decision endpoint. */
    workspaceId: string;
    /** ISO-8601 deadline after which the request will be auto-rejected by the gateway. */
    escalationDeadlineIso?: string;
}

export interface AsyncApprovalNotificationReceipt {
    approvalId: string;
    channel: AsyncApprovalChannel;
    notificationTarget: string;
    messageText: string;
    sentAt: string;
    sent: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Decision URL builder
// ---------------------------------------------------------------------------

/**
 * Build the gateway URL that a stakeholder POSTs to in order to approve or
 * reject the action.  This URL is embedded in the notification as a deep link.
 *
 * In practice the dashboard wraps this in a one-click button — the raw URL is
 * also included for email clients that strip interactive elements.
 */
export function buildDecisionUrl(
    gatewayBaseUrl: string,
    approvalId: string,
    workspaceId: string,
    decision: 'approved' | 'rejected',
): string {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    // The dashboard intercepts this URL and calls the API; it is not a raw API call.
    return `${base}/approvals/${encodeURIComponent(approvalId)}/decide?workspace_id=${encodeURIComponent(workspaceId)}&decision=${decision}`;
}

// ---------------------------------------------------------------------------
// Message formatters
// ---------------------------------------------------------------------------

/**
 * Build a plain-text Slack message body for the approval notification.
 *
 * Keeps it readable in clients that don't render Block Kit (e.g. email fallback).
 */
export function buildSlackApprovalMessage(
    req: AsyncApprovalNotificationRequest,
): string {
    const {
        approvalId,
        actionType,
        actionSummary,
        documentTitle,
        completenessResult,
        gateResult,
        gatewayBaseUrl,
        workspaceId,
        escalationDeadlineIso,
    } = req;

    const approveUrl = buildDecisionUrl(gatewayBaseUrl, approvalId, workspaceId, 'approved');
    const rejectUrl = buildDecisionUrl(gatewayBaseUrl, approvalId, workspaceId, 'rejected');

    const lines: string[] = [
        `📋 *BA Approval Required*`,
        '',
        `*Action:* \`${actionType}\``,
    ];

    if (documentTitle) {
        lines.push(`*Document:* ${documentTitle}`);
    }

    lines.push(`*Summary:* ${actionSummary}`);

    if (gateResult) {
        lines.push(`*Risk tier:* ${gateResult.baseRisk.toUpperCase()} → ${gateResult.effectiveRisk.toUpperCase()} (${gateResult.documentType})`);
    }

    if (completenessResult) {
        const scorePct = Math.round(completenessResult.score * 100);
        lines.push(`*Completeness score:* ${scorePct}%`);

        if (completenessResult.gaps.length > 0) {
            lines.push(`*Gaps to review:*`);
            for (const gap of completenessResult.gaps.slice(0, 5)) {
                lines.push(`  • ${gap}`);
            }
        } else {
            lines.push(`✅ All completeness checks passed`);
        }
    }

    if (escalationDeadlineIso) {
        const deadline = new Date(escalationDeadlineIso).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
        lines.push(`*Auto-rejects at:* ${deadline} if no response`);
    }

    lines.push('');
    lines.push(`*Approval ID:* \`${approvalId}\``);
    lines.push('');
    lines.push(`✅ *Approve:* ${approveUrl}`);
    lines.push(`❌ *Reject:* ${rejectUrl}`);

    return lines.join('\n');
}

/**
 * Build a plain-text email body for the approval notification.
 */
export function buildEmailApprovalMessage(
    req: AsyncApprovalNotificationRequest,
): string {
    const {
        approvalId,
        actionType,
        actionSummary,
        documentTitle,
        completenessResult,
        gatewayBaseUrl,
        workspaceId,
        escalationDeadlineIso,
    } = req;

    const approveUrl = buildDecisionUrl(gatewayBaseUrl, approvalId, workspaceId, 'approved');
    const rejectUrl = buildDecisionUrl(gatewayBaseUrl, approvalId, workspaceId, 'rejected');

    const scoreLine = completenessResult
        ? `Completeness score: ${Math.round(completenessResult.score * 100)}%\n` +
          (completenessResult.gaps.length > 0
              ? `Gaps: ${completenessResult.gaps.slice(0, 5).join('; ')}\n`
              : `All completeness checks passed.\n`)
        : '';

    const deadlineLine = escalationDeadlineIso
        ? `This request will auto-reject on ${new Date(escalationDeadlineIso).toUTCString()} if no action is taken.\n\n`
        : '';

    return (
        `BA Agent — Approval Required\n\n` +
        `Action: ${actionType}\n` +
        (documentTitle ? `Document: ${documentTitle}\n` : '') +
        `Summary: ${actionSummary}\n\n` +
        scoreLine +
        deadlineLine +
        `APPROVE: ${approveUrl}\n\n` +
        `REJECT: ${rejectUrl}\n\n` +
        `Approval ID: ${approvalId}`
    );
}

// ---------------------------------------------------------------------------
// Notification sender
// ---------------------------------------------------------------------------

/**
 * Send the async approval notification via Slack or email using the
 * MeetingProviderExecutor (connector abstraction layer).
 *
 * Returns a receipt — always resolves, never throws.  Failures are captured
 * in the receipt's `error` field so the caller can log and continue.
 */
export async function sendAsyncApprovalNotification(
    req: AsyncApprovalNotificationRequest,
    executor: MeetingProviderExecutor,
): Promise<AsyncApprovalNotificationReceipt> {
    const sentAt = new Date().toISOString();

    let messageText: string;
    let connectorType: string;
    let actionType: string;
    let payload: Record<string, unknown>;

    if (req.channel === 'slack') {
        messageText = buildSlackApprovalMessage(req);
        connectorType = 'slack';
        actionType = 'send_message';
        payload = {
            text: messageText,
            channel: req.notificationTarget,
        };
    } else {
        messageText = buildEmailApprovalMessage(req);
        connectorType = 'email';
        actionType = 'send_email';
        payload = {
            to: req.notificationTarget,
            subject: `Action Required: BA Agent needs your approval (${req.approvalId.slice(0, 8)})`,
            body: messageText,
        };
    }

    try {
        const result = await executor({
            connectorType,
            actionType,
            payload,
            attempt: 1,
            secretRefId: null,
        });

        return {
            approvalId: req.approvalId,
            channel: req.channel,
            notificationTarget: req.notificationTarget,
            messageText,
            sentAt,
            sent: result.ok,
            error: result.ok ? undefined : result.resultSummary,
        };
    } catch (err) {
        return {
            approvalId: req.approvalId,
            channel: req.channel,
            notificationTarget: req.notificationTarget,
            messageText,
            sentAt,
            sent: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Approval status poller
// ---------------------------------------------------------------------------

export type ApprovalDecisionStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'timeout_rejected';

export interface ApprovalPollResult {
    approvalId: string;
    decision: ApprovalDecisionStatus;
    decidedAt?: string;
    decisionReason?: string;
    polledAt: string;
}

/**
 * Poll the gateway once to get the current decision status for an approval.
 *
 * Returns 'pending' when no decision has been made yet.
 * The caller is responsible for re-polling on a schedule (via the orchestrator
 * cron or a task loop) — this function makes exactly one HTTP call.
 */
export async function pollApprovalDecision(
    approvalId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
): Promise<ApprovalPollResult> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const polledAt = new Date().toISOString();

    try {
        const res = await fetch(
            `${base}/v1/approvals/${encodeURIComponent(approvalId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) {
            return {
                approvalId,
                decision: 'pending',
                polledAt,
            };
        }

        const body = (await res.json()) as {
            decision?: string;
            decided_at?: string;
            decision_reason?: string;
        };

        const decision = (body.decision ?? 'pending') as ApprovalDecisionStatus;

        return {
            approvalId,
            decision,
            decidedAt: body.decided_at,
            decisionReason: body.decision_reason ?? undefined,
            polledAt,
        };
    } catch (err) {
        console.warn(`[ba-async-approval] poll failed for ${approvalId}: ${String(err)}`);
        return { approvalId, decision: 'pending', polledAt };
    }
}

// ---------------------------------------------------------------------------
// Reminder sender
// ---------------------------------------------------------------------------

/**
 * Send a follow-up reminder if an approval has been pending too long.
 *
 * Call this from the orchestrator's routine scheduler when an approval
 * created more than `reminderAfterHours` hours ago is still pending.
 */
export async function sendApprovalReminder(
    req: AsyncApprovalNotificationRequest & { originalSentAt: string; hoursElapsed: number },
    executor: MeetingProviderExecutor,
): Promise<AsyncApprovalNotificationReceipt> {
    // Build a shorter reminder message re-using the same deep links
    const approveUrl = buildDecisionUrl(req.gatewayBaseUrl, req.approvalId, req.workspaceId, 'approved');
    const rejectUrl = buildDecisionUrl(req.gatewayBaseUrl, req.approvalId, req.workspaceId, 'rejected');

    const reminderText =
        req.channel === 'slack'
            ? [
                  `🔔 *Reminder — BA Approval Still Pending*`,
                  ``,
                  `Action \`${req.actionType}\` has been awaiting your approval for ${req.hoursElapsed} hour(s).`,
                  ``,
                  `✅ *Approve:* ${approveUrl}`,
                  `❌ *Reject:* ${rejectUrl}`,
                  ``,
                  `Approval ID: \`${req.approvalId}\``,
              ].join('\n')
            : `Reminder: BA Agent approval "${req.approvalId}" has been waiting ${req.hoursElapsed}h.\n\n` +
              `Approve: ${approveUrl}\nReject: ${rejectUrl}`;

    const connectorType = req.channel === 'slack' ? 'slack' : 'email';
    const actionType = req.channel === 'slack' ? 'send_message' : 'send_email';
    const payload: Record<string, unknown> =
        req.channel === 'slack'
            ? { text: reminderText, channel: req.notificationTarget }
            : {
                  to: req.notificationTarget,
                  subject: `Reminder: BA Approval pending ${req.hoursElapsed}h (${req.approvalId.slice(0, 8)})`,
                  body: reminderText,
              };

    const sentAt = new Date().toISOString();
    try {
        const result = await executor({
            connectorType,
            actionType,
            payload,
            attempt: 1,
            secretRefId: null,
        });

        return {
            approvalId: req.approvalId,
            channel: req.channel,
            notificationTarget: req.notificationTarget,
            messageText: reminderText,
            sentAt,
            sent: result.ok,
            error: result.ok ? undefined : result.resultSummary,
        };
    } catch (err) {
        return {
            approvalId: req.approvalId,
            channel: req.channel,
            notificationTarget: req.notificationTarget,
            messageText: reminderText,
            sentAt,
            sent: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
