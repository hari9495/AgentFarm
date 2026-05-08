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
                    // Teams outbound not yet implemented — log and skip
                    console.warn('ReplyDispatcher: Teams reply not yet implemented');
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
