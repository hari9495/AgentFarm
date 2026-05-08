import { NotificationService, CustomerNotificationStore } from '@agentfarm/notification-adapters';
import type { NotificationPayload } from '@agentfarm/shared-types';
import type { ProcessedTaskResult } from './execution-engine.js';

/**
 * Singleton store shared across the runtime process lifetime.
 * Populate via registerCustomer() during startup when you have loaded
 * NotificationConfig (e.g. from loadNotificationConfigFromEnv()).
 */
export const customerNotificationStore = new CustomerNotificationStore();

/**
 * Fires an outbound notification if the task payload explicitly opts in with
 * `notify: true` and a known customerId is resolvable.
 *
 * This is a strict no-op when:
 *  - payload['notify'] !== true (preserves all existing agent-runtime tests)
 *  - no customerId can be resolved
 *  - the resolved customerId has no config registered in customerNotificationStore
 */
export async function maybeNotify(
    payload: Record<string, unknown>,
    result: ProcessedTaskResult,
): Promise<void> {
    // ---- opt-in guard — must be explicit, not just truthy ----
    if (payload['notify'] !== true) return;

    const customerId =
        typeof payload['customerId'] === 'string'
            ? payload['customerId']
            : process.env['CUSTOMER_ID'];

    if (!customerId) return;
    if (!customerNotificationStore.has(customerId)) return;

    const service = new NotificationService(customerNotificationStore);

    const actionType = (result.decision as { actionType?: string } | undefined)?.actionType ?? 'unknown';

    const notifPayload: NotificationPayload = {
        subject: `Task ${result.status}: ${actionType}`,
        message:
            result.status === 'success'
                ? `Task completed (${result.attempts} attempt(s))`
                : `Task failed: ${result.errorMessage ?? 'unknown error'}`,
        agentId: typeof payload['botId'] === 'string' ? payload['botId'] : undefined,
        taskId: typeof payload['taskId'] === 'string' ? payload['taskId'] : undefined,
        metadata: {
            status: result.status,
            actionType,
        },
    };

    try {
        await service.send(customerId, notifPayload);
    } catch (err) {
        // Notifications are best-effort — never let them crash the agent runtime
        console.error('[notification-hook] send error:', err);
    }
}
