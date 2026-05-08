import type { NotificationPayload, NotificationResult } from '@agentfarm/shared-types';

export abstract class NotificationAdapter {
    abstract readonly adapterName: string;
    abstract send(payload: NotificationPayload): Promise<NotificationResult>;
}
