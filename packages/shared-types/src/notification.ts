// ============================================================================
// Notification types — pluggable outbound notification abstraction
// ============================================================================

/** Channels supported by the pluggable notification-service adapters */
export type AgentNotificationChannel = 'webhook' | 'email' | 'slack' | 'teams';

export type NotificationConfig = {
    channel: AgentNotificationChannel;
    /** Generic webhook URL — used by WebhookAdapter and as Slack incoming webhook */
    webhookUrl?: string;
    /** Slack bot token OR Slack incoming webhook URL */
    slackToken?: string;
    slackChannelId?: string;
    teamsWebhookUrl?: string;
    emailTo?: string;
    emailFrom?: string;
    smtpHost?: string;
    smtpPort?: number;
};

export type NotificationPayload = {
    subject?: string;
    message: string;
    metadata?: Record<string, unknown>;
    agentId?: string;
    taskId?: string;
};

export type NotificationResult = {
    success: boolean;
    adapter: string;
    error?: string;
};

export type CustomerNotificationConfig = {
    customerId: string;
    config: NotificationConfig;
};
