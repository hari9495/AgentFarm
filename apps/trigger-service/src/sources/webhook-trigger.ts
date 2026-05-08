import type { TriggerSource, TriggerSourceKind, TriggerEvent } from '../types.js';
import crypto from 'node:crypto';

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

        const callbackUrl =
            typeof parsed['callbackUrl'] === 'string' ? parsed['callbackUrl'] : undefined;

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
