import type { TaskProgressEvent } from '@agentfarm/shared-types';

/**
 * Publishes a task progress event to the SSE push endpoint.
 *
 * Never throws — all errors are caught and logged.
 * If SSE_PUSH_URL is set to an empty string, the call is silently skipped.
 */
export async function publishTaskProgress(
    workspaceId: string,
    event: TaskProgressEvent,
): Promise<void> {
    const pushUrl = process.env['SSE_PUSH_URL'] ?? 'http://localhost:3000/sse/tasks/push';

    if (pushUrl === '') {
        return;
    }

    const internalToken = process.env['SSE_INTERNAL_TOKEN'];
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (internalToken) {
        headers['x-internal-token'] = internalToken;
    }

    try {
        await fetch(pushUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ workspaceId, event }),
        });
    } catch (err) {
        console.error('[sse-publish]', err);
    }
}
