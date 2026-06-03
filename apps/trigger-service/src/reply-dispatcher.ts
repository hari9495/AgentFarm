import type { TriggerEvent, ReplyContext } from './types.js';
import type { DispatchResult } from './trigger-dispatcher.js';

function formatReply(result: DispatchResult, event: TriggerEvent): string {
    if (!result.ok) {
        return `⚠️ Task failed: ${result.error ?? 'unknown error'}`;
    }
    const taskResult = result.taskRunResult as { goal?: string; success?: boolean; steps_taken?: number } | undefined;
    if (taskResult?.goal) {
        const status = taskResult.success ? '✓' : '⚠️';
        return `${status} Task complete (${taskResult.steps_taken ?? '?'} steps): ${taskResult.goal}`;
    }
    return `✓ Task dispatched for: ${event.body.slice(0, 100)}`;
}

async function replySlack(
    ctx: Extract<ReplyContext, { source: 'slack' }>,
    message: string,
): Promise<void> {
    const payload: Record<string, string> = {
        channel: ctx.channelId,
        text: message,
    };
    if (ctx.threadTs) {
        payload['thread_ts'] = ctx.threadTs;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            'content-type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${ctx.token}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Slack reply failed: ${response.status}`);
    }
}

async function replyEmail(
    ctx: Extract<ReplyContext, { source: 'email' }>,
    message: string,
): Promise<void> {
    // Dynamic import so the dependency is optional at compile time
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
        host: ctx.smtpConfig.host,
        port: ctx.smtpConfig.port,
        secure: ctx.smtpConfig.secure,
        auth: { user: ctx.smtpConfig.user, pass: ctx.smtpConfig.pass },
    });

    await transporter.sendMail({
        from: ctx.smtpConfig.user,
        to: ctx.replyTo,
        subject: `Re: ${ctx.subject}`,
        text: message,
    });
}

async function replyWebhook(
    ctx: Extract<ReplyContext, { source: 'webhook' }>,
    message: string,
): Promise<void> {
    if (!ctx.callbackUrl) {
        return; // no callback — skip silently
    }

    const response = await fetch(ctx.callbackUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
    });

    if (!response.ok) {
        throw new Error(`Webhook reply failed: ${response.status}`);
    }
}

// Module-level cache: Bot Framework tokens are valid for 3600 s; re-fetch 60 s early.
let _botFwTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Obtain a short-lived Bot Framework bearer token using client credentials.
 * Tokens are cached for ~59 minutes so concurrent replies share one token.
 * Requires TEAMS_BOT_APP_ID and TEAMS_BOT_APP_PASSWORD environment variables.
 */
async function getBotFrameworkToken(): Promise<string> {
    const now = Date.now();
    if (_botFwTokenCache && _botFwTokenCache.expiresAt > now + 60_000) {
        return _botFwTokenCache.token;
    }

    const appId = process.env['TEAMS_BOT_APP_ID'];
    const appPassword = process.env['TEAMS_BOT_APP_PASSWORD'];
    if (!appId || !appPassword) {
        throw new Error(
            'Teams reply requires TEAMS_BOT_APP_ID and TEAMS_BOT_APP_PASSWORD ' +
            'environment variables. Set these to your Azure Bot registration credentials.',
        );
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appPassword,
        scope: 'https://api.botframework.com/.default',
    });

    const res = await fetch(
        'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
        {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        },
    );

    if (!res.ok) {
        throw new Error(`Bot Framework token fetch failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
        throw new Error('Bot Framework token response missing access_token');
    }
    const ttlMs = (json.expires_in ?? 3600) * 1000;
    _botFwTokenCache = { token: json.access_token, expiresAt: now + ttlMs };
    return json.access_token;
}

async function replyTeams(
    ctx: Extract<ReplyContext, { source: 'teams' }>,
    message: string,
): Promise<void> {
    const token = await getBotFrameworkToken();

    // serviceUrl already includes trailing slash in most Bot Framework payloads;
    // normalise to avoid double-slash.
    const base = ctx.serviceUrl.replace(/\/$/, '');
    // POST to /activities (no activityId in path) — the Bot Framework reply endpoint.
    // replyToId in the body threads the reply under the original inbound activity.
    const url = `${base}/v3/conversations/${encodeURIComponent(ctx.conversationId)}/activities`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            type: 'message',
            text: message,
            replyToId: ctx.activityId,
        }),
    });

    if (!response.ok) {
        throw new Error(`Teams reply failed: ${response.status} ${await response.text()}`);
    }
}

export class ReplyDispatcher {
    async reply(event: TriggerEvent, result: DispatchResult): Promise<void> {
        const message = formatReply(result, event);
        const ctx = event.replyContext;

        try {
            switch (ctx.source) {
                case 'slack':
                    await replySlack(ctx, message);
                    break;
                case 'email':
                    await replyEmail(ctx, message);
                    break;
                case 'webhook':
                    await replyWebhook(ctx, message);
                    break;
                case 'teams':
                    await replyTeams(ctx, message);
                    break;
                default: {
                    const _exhaustive: never = ctx;
                    console.error(`ReplyDispatcher: unknown source in reply context: ${JSON.stringify(_exhaustive)}`);
                }
            }
        } catch (err) {
            console.error('ReplyDispatcher: failed to send reply:', err);
        }
    }
}
