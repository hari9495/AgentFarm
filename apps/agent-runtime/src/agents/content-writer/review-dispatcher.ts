/**
 * Review Dispatcher
 *
 * Packages a content draft as a review request and delivers it to a human
 * reviewer via a configurable channel (Slack webhook, generic webhook, or
 * email API).  All I/O is injected so the module is fully unit-testable.
 */

import { classifyEditorialRisk } from './editorial-router.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Delivery channel for the review notification. */
export type ReviewChannel = 'slack' | 'webhook' | 'email';

export interface SendReviewRequest {
    /** Draft title. */
    title: string;
    /** Full draft body text. */
    draftBody: string;
    /** Approximate word count — computed from draftBody if omitted. */
    wordCount?: number;
    /** Destination Slack webhook URL, generic webhook URL, or email API endpoint. */
    reviewerUrl: string;
    /** Display name or email of the intended reviewer (for logging / payload). */
    reviewerDisplayName: string;
    /** Delivery channel — determines payload shape. */
    channel: ReviewChannel;
    /** Name of the agent that produced the draft. */
    agentName?: string;
    /** Optional notes from the agent to the reviewer. */
    notes?: string;
}

export interface SendReviewResult {
    /** Unique review ID generated for traceability. */
    reviewId: string;
    /** ISO timestamp of dispatch. */
    sentAt: string;
    /** Channel used for delivery. */
    channel: ReviewChannel;
    /** Display name or endpoint the review was sent to. */
    deliveredTo: string;
    /** Risk level inferred from draft body. */
    riskLevel: 'low' | 'medium' | 'high';
    /** Whether the notification was delivered successfully. */
    ok: boolean;
    /** Human-readable error, present when ok=false. */
    errorMessage: string | null;
}

export type ReviewFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateReviewId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `rev-${ts}-${rand}`;
}

function truncate(text: string, maxChars: number): string {
    return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}

function buildSlackPayload(req: SendReviewRequest, riskLevel: string, reviewId: string): string {
    const wordCount = req.wordCount ?? req.draftBody.split(/\s+/).filter(Boolean).length;
    const agentName = req.agentName ?? 'Content Writer Agent';
    const excerpt = truncate(req.draftBody, 300);
    const riskEmoji = riskLevel === 'high' ? ':red_circle:' : riskLevel === 'medium' ? ':large_yellow_circle:' : ':large_green_circle:';

    const blocks = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `Content Review Request — ${req.title}`, emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Review ID:*\n${reviewId}` },
                { type: 'mrkdwn', text: `*Risk Level:*\n${riskEmoji} ${riskLevel}` },
                { type: 'mrkdwn', text: `*Author:*\n${agentName}` },
                { type: 'mrkdwn', text: `*Word Count:*\n${wordCount}` },
                { type: 'mrkdwn', text: `*Reviewer:*\n${req.reviewerDisplayName}` },
            ],
        },
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Draft Excerpt:*\n${excerpt}` },
        },
    ] as unknown[];

    if (req.notes) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Agent Notes:*\n${req.notes}` },
        });
    }

    return JSON.stringify({ blocks });
}

function buildWebhookPayload(req: SendReviewRequest, riskLevel: string, reviewId: string): string {
    const wordCount = req.wordCount ?? req.draftBody.split(/\s+/).filter(Boolean).length;
    return JSON.stringify({
        reviewId,
        title: req.title,
        riskLevel,
        wordCount,
        agentName: req.agentName ?? 'Content Writer Agent',
        reviewerDisplayName: req.reviewerDisplayName,
        draftExcerpt: truncate(req.draftBody, 500),
        notes: req.notes ?? null,
        sentAt: new Date().toISOString(),
    });
}

function buildEmailPayload(req: SendReviewRequest, riskLevel: string, reviewId: string): string {
    const wordCount = req.wordCount ?? req.draftBody.split(/\s+/).filter(Boolean).length;
    const agentName = req.agentName ?? 'Content Writer Agent';
    const excerpt = truncate(req.draftBody, 500);
    const subject = `[Content Review] ${req.title} — Risk: ${riskLevel} (${reviewId})`;
    const body =
        `Hello ${req.reviewerDisplayName},\n\n` +
        `${agentName} has submitted a content draft for your review.\n\n` +
        `Title: ${req.title}\n` +
        `Review ID: ${reviewId}\n` +
        `Risk Level: ${riskLevel}\n` +
        `Word Count: ${wordCount}\n\n` +
        `Draft Excerpt:\n${excerpt}\n\n` +
        (req.notes ? `Agent Notes:\n${req.notes}\n\n` : '') +
        `Please review and approve or request revisions.\n`;

    return JSON.stringify({ to: req.reviewerDisplayName, subject, body });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a content review request to a human reviewer.
 *
 * Infers the editorial risk level from the draft body and formats the
 * notification payload for the specified channel.  Credentials are never
 * embedded; the reviewerUrl is injected at runtime from the connector config.
 *
 * @param req      Review request — draft content and routing metadata.
 * @param fetchFn  Injectable HTTP client (defaults to globalThis.fetch).
 */
export async function sendForReview(
    req: SendReviewRequest,
    fetchFn: ReviewFetchFn = async (url, init) => {
        const resp = await fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
        });
        return { ok: resp.ok, status: resp.status };
    },
): Promise<SendReviewResult> {
    const reviewId = generateReviewId();
    const sentAt = new Date().toISOString();

    // Infer risk from draft body using the editorial router logic.
    const riskLevel = classifyEditorialRisk({
        title: req.title,
        body: req.draftBody,
        format: 'blog_post',
        wordCount: req.wordCount ?? 0,
    });

    const body =
        req.channel === 'slack'
            ? buildSlackPayload(req, riskLevel, reviewId)
            : req.channel === 'email'
                ? buildEmailPayload(req, riskLevel, reviewId)
                : buildWebhookPayload(req, riskLevel, reviewId);

    try {
        const resp = await fetchFn(req.reviewerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!resp.ok) {
            return {
                reviewId,
                sentAt,
                channel: req.channel,
                deliveredTo: req.reviewerDisplayName,
                riskLevel,
                ok: false,
                errorMessage: `Review notification delivery failed: HTTP ${resp.status}`,
            };
        }

        return {
            reviewId,
            sentAt,
            channel: req.channel,
            deliveredTo: req.reviewerDisplayName,
            riskLevel,
            ok: true,
            errorMessage: null,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            reviewId,
            sentAt,
            channel: req.channel,
            deliveredTo: req.reviewerDisplayName,
            riskLevel,
            ok: false,
            errorMessage: `Review notification dispatch error: ${msg}`,
        };
    }
}
