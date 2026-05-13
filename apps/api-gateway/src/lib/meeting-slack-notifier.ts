/**
 * Meeting summary Slack distributor.
 *
 * Reads two env vars:
 *   MEETING_SLACK_DISTRIBUTION  - must equal "true" to enable
 *   MEETING_SLACK_WEBHOOK_URL   - Slack incoming-webhook URL
 *
 * The send is best-effort: any failure is logged but never thrown,
 * so a Slack outage cannot block summary writes.
 */

export function isMeetingSlackEnabled(): boolean {
    return (
        process.env['MEETING_SLACK_DISTRIBUTION'] === 'true' &&
        !!process.env['MEETING_SLACK_WEBHOOK_URL']
    );
}

export async function distributeMeetingSummaryToSlack(params: {
    sessionId: string;
    tenantId: string;
    workspaceId: string;
    platform: string;
    summaryText: string;
    actionItems?: string | null;
}): Promise<boolean> {
    const webhookUrl = process.env['MEETING_SLACK_WEBHOOK_URL'];
    if (!webhookUrl) return false;

    const actionSection =
        params.actionItems && params.actionItems.trim().length > 0
            ? `\n*Action items:*\n${params.actionItems}`
            : '';

    const text =
        `*Meeting summary* [${params.platform}] — workspace \`${params.workspaceId}\`` +
        `\n\n${params.summaryText}${actionSection}`;

    const body = JSON.stringify({ text });

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn(
                `[meeting-slack] Slack responded ${res.status} for session ${params.sessionId}: ${errBody}`,
            );
            return false;
        }

        return true;
    } catch (err) {
        console.warn(
            `[meeting-slack] Failed to distribute summary for session ${params.sessionId}:`,
            err,
        );
        return false;
    }
}
