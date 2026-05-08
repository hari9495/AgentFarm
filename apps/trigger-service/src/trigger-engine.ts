import type { TriggerSource, TriggerEvent, TriggerServiceConfig } from './types.js';
import { TriggerRouter } from './trigger-router.js';
import { TriggerDispatcher } from './trigger-dispatcher.js';
import { ReplyDispatcher } from './reply-dispatcher.js';

type RawEvent = Omit<TriggerEvent, 'tenantId' | 'agentId'>;

/**
 * TriggerEngine — orchestrates all TriggerSource adapters.
 * For each inbound event it: routes → dispatches → replies.
 */
export class TriggerEngine {
    private readonly router: TriggerRouter;
    private readonly dispatcher: TriggerDispatcher;
    private readonly replyDispatcher: ReplyDispatcher;
    private readonly sources: TriggerSource[];

    constructor(config: TriggerServiceConfig, sources: TriggerSource[]) {
        this.router = new TriggerRouter(config);
        this.dispatcher = new TriggerDispatcher(config.agentRuntimeUrl);
        this.replyDispatcher = new ReplyDispatcher();
        this.sources = sources;
    }

    async start(): Promise<void> {
        const onEvent = (raw: RawEvent) => this.handleEvent(raw);

        await Promise.all(this.sources.map((s) => s.start(onEvent)));
        console.log(`TriggerEngine: started ${this.sources.length} source(s)`);
    }

    async stop(): Promise<void> {
        await Promise.all(this.sources.map((s) => s.stop().catch((e) => {
            console.error(`TriggerEngine: error stopping source ${s.kind}:`, e);
        })));
        console.log('TriggerEngine: all sources stopped');
    }

    private async handleEvent(raw: RawEvent): Promise<void> {
        let event: TriggerEvent;

        try {
            const { tenantId, agentId } = await this.router.route(raw.body, raw.from);
            event = { ...raw, tenantId, agentId };
        } catch (err) {
            console.error('TriggerEngine: routing failed:', err);
            return;
        }

        const dispatchResult = await this.dispatcher.dispatch(event);

        if (!dispatchResult.ok) {
            console.error(`TriggerEngine: dispatch failed for event ${event.id}:`, dispatchResult.error);
        }

        await this.replyDispatcher.reply(event, dispatchResult);
    }
}
