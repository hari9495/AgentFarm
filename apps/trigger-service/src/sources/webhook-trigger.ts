import type { TriggerSource, TriggerSourceKind, TriggerEvent } from '../types.js';
import crypto from 'node:crypto';
import { validateCallbackUrl } from '../ssrf-guard.js';

type RawWebhookEvent = Omit<TriggerEvent, 'tenantId' | 'agentId'>;
type OnEvent = (event: RawWebhookEvent) => Promise<void>;

export type WebhookTriggerOptions = {
    /** Optional shared HMAC secret for request verification */
    hmacSecret?: string;
};

/**
 * WebhookTriggerSource — registers a POST /webhook route on an existing Fastify
 * instance (passed in via `registerRoute`). This keeps the transport layer
 * decoupled from the source implementation.
 */
export class WebhookTriggerSource implements TriggerSource {
    readonly kind: TriggerSourceKind = 'webhook';

    private onEvent?: OnEvent;
    private readonly hmacSecret?: string;

    constructor(options: WebhookTriggerOptions = {}) {
        this.hmacSecret = options.hmacSecret;
    }

    async start(onEvent: OnEvent): Promise<void> {
        this.onEvent = onEvent;
    }

    async stop(): Promise<void> {
        this.onEvent = undefined;
    }

    /**
     * Call this from your Fastify route handler to process an inbound webhook.
     * Returns false if HMAC verification fails.
     */
    async handleRequest(body: string, signature?: string): Promise<boolean> {
        if (this.hmacSecret) {
            if (!signature) return false;
            const expected = crypto
                .createHmac('sha256', this.hmacSecret)
                .update(body)
                .digest('hex');
            const sigBuffer = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
            const expectedBuffer = Buffer.from(expected, 'hex');
            if (
                sigBuffer.length !== expectedBuffer.length ||
                !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
            ) {
                return false;
            }
        }

        if (!this.onEvent) return true;

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
            parsed = { body };
        }

        const textBody =
            typeof parsed['body'] === 'string'
                ? parsed['body']
                : typeof parsed['text'] === 'string'
                    ? parsed['text']
                    : body;

        // SSRF guard: validate callbackUrl at intake so a malicious URL never
        // reaches the ReplyDispatcher at all. Strip it if it fails validation.
        const rawCallbackUrl =
            typeof parsed['callbackUrl'] === 'string' ? parsed['callbackUrl'] : undefined;
        let callbackUrl: string | undefined;
        if (rawCallbackUrl) {
            const guard = await validateCallbackUrl(rawCallbackUrl);
            if (guard.ok) {
                callbackUrl = rawCallbackUrl;
            } else {
                console.warn(
                    `[WebhookTrigger] callbackUrl rejected by SSRF guard: ${guard.reason}. ` +
                    `URL: ${rawCallbackUrl.slice(0, 100)}`,
                );
                // callbackUrl stays undefined — event is still processed, reply is silently skipped
            }
        }

        const event: RawWebhookEvent = {
            id: crypto.randomUUID(),
            source: 'webhook',
            from: typeof parsed['from'] === 'string' ? parsed['from'] : 'webhook',
            channel: typeof parsed['channel'] === 'string' ? parsed['channel'] : undefined,
            subject: typeof parsed['subject'] === 'string' ? parsed['subject'] : undefined,
            body: textBody,
            receivedAt: new Date(),
            replyContext: { source: 'webhook', callbackUrl },
        };

        await this.onEvent(event);
        return true;
    }
}
