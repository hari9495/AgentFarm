import type { NotificationConfig, AgentNotificationChannel } from '@agentfarm/shared-types';

/**
 * Loads per-customer notification config from environment variables.
 * This enables per-deployment configuration without a config database:
 * each customer deployment just sets different env vars.
 *
 * Supported env vars:
 *   NOTIFICATION_CHANNEL          — webhook | email | slack | teams
 *   NOTIFICATION_WEBHOOK_URL      — generic webhook URL
 *   NOTIFICATION_EMAIL_TO         — recipient email
 *   NOTIFICATION_EMAIL_FROM       — sender email
 *   NOTIFICATION_SMTP_HOST        — SMTP server hostname
 *   NOTIFICATION_SMTP_PORT        — SMTP server port (number)
 *   NOTIFICATION_SLACK_WEBHOOK_URL — Slack incoming webhook URL
 *   NOTIFICATION_TEAMS_WEBHOOK_URL — Teams incoming webhook URL
 */
export function loadNotificationConfigFromEnv(): NotificationConfig | null {
    const rawChannel = process.env['NOTIFICATION_CHANNEL'];
    if (!rawChannel) return null;
    const channel = rawChannel as AgentNotificationChannel;

    const smtpPortRaw = process.env['NOTIFICATION_SMTP_PORT'];

    return {
        channel,
        webhookUrl: process.env['NOTIFICATION_WEBHOOK_URL'],
        emailTo: process.env['NOTIFICATION_EMAIL_TO'],
        emailFrom: process.env['NOTIFICATION_EMAIL_FROM'],
        smtpHost: process.env['NOTIFICATION_SMTP_HOST'],
        smtpPort: smtpPortRaw ? parseInt(smtpPortRaw, 10) : undefined,
        // slackToken holds the Slack incoming webhook URL
        slackToken: process.env['NOTIFICATION_SLACK_WEBHOOK_URL'],
        teamsWebhookUrl: process.env['NOTIFICATION_TEAMS_WEBHOOK_URL'],
    };
}
