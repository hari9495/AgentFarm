import type { TriggerSource, TriggerSourceKind, TriggerEvent } from '../types.js';
import crypto from 'node:crypto';

type RawEvent = Omit<TriggerEvent, 'tenantId' | 'agentId'>;
type OnEvent = (event: RawEvent) => Promise<void>;

export type SlackTriggerOptions = {
    signingSecret: string;
    token: string;
    /** Defaults to 3000 */
    port?: number;
};

/**
 * SlackTriggerSource — uses @slack/bolt to handle app_mention and message.im
 * events. Dynamically imports @slack/bolt so the module is optional at
 * typecheck time if you only want other sources.
 */
export class SlackTriggerSource implements TriggerSource {
    readonly kind: TriggerSourceKind = 'slack';

    private readonly options: SlackTriggerOptions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private app?: any;

    constructor(options: SlackTriggerOptions) {
        this.options = options;
    }

    async start(onEvent: OnEvent): Promise<void> {
        const { App } = await import('@slack/bolt');

        this.app = new App({
            token: this.options.token,
            signingSecret: this.options.signingSecret,
        });

        const handleEvent = async (args: {
            event: {
                user?: string;
                text?: string;
                channel?: string;
                channel_type?: string;
                thread_ts?: string;
                ts?: string;
            };
        }) => {
            const { event } = args;
            const body = (event.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim();
            if (!body) return;

            const raw: RawEvent = {
                id: crypto.randomUUID(),
                source: 'slack',
                from: event.user ?? 'unknown',
                channel: event.channel,
                body,
                receivedAt: new Date(),
                replyContext: {
                    source: 'slack',
                    channelId: event.channel ?? '',
                    threadTs: event.thread_ts ?? event.ts,
                    token: this.options.token,
                },
            };

            await onEvent(raw);
        };

        this.app.event('app_mention', handleEvent);
        this.app.event('message', async (args: typeof handleEvent extends (a: infer A) => unknown ? A : never) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ev = (args as any).event as { channel_type?: string; subtype?: string };
            if (ev.channel_type !== 'im' || ev.subtype) return;
            await handleEvent(args as Parameters<typeof handleEvent>[0]);
        });

        await this.app.start(this.options.port ?? 3000);
    }

    async stop(): Promise<void> {
        if (this.app) {
            await this.app.stop();
            this.app = undefined;
        }
    }
}
