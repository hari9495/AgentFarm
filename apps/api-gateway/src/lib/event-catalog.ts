// Phase 27 — Typed webhook event catalog.
// Single source of truth for all event definitions. Used for:
//   - Webhook creation validation (reject unknown event types)
//   - Public catalog endpoint (GET /v1/webhooks/events)
//   - Payload enrichment (schemaVersion field in outbound payloads)

export type EventFieldDef = {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'string?';
    description: string;
};

export type EventDefinition = {
    eventType: string;
    schemaVersion: string;
    description: string;
    fields: EventFieldDef[];
    examplePayload: Record<string, unknown>;
};

// Common envelope fields present in every event payload
const ENVELOPE_FIELDS: EventFieldDef[] = [
    { name: 'eventType', type: 'string', description: 'The event type string.' },
    { name: 'tenantId', type: 'string', description: 'The tenant that owns this event.' },
    { name: 'timestamp', type: 'string', description: 'ISO 8601 datetime when the event occurred.' },
];

export const CATALOG: Record<string, EventDefinition> = {
    task_completed: {
        eventType: 'task_completed',
        schemaVersion: '1.0',
        description: 'Fired when a task completes execution (successful or failed outcome).',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string', description: 'The unique task identifier.' },
            { name: 'botId', type: 'string', description: 'The bot that executed the task.' },
            { name: 'outcome', type: 'string', description: "'success' or 'failure'." },
            { name: 'durationMs', type: 'number', description: 'Task execution duration in milliseconds.' },
            { name: 'costUsd', type: 'number', description: 'Estimated cost of the task in USD.' },
        ],
        examplePayload: {
            eventType: 'task_completed',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:00:00.000Z',
            taskId: 'task_xyz',
            botId: 'bot_123',
            outcome: 'success',
            durationMs: 4200,
            costUsd: 0.0012,
        },
    },

    task_failed: {
        eventType: 'task_failed',
        schemaVersion: '1.0',
        description: 'Fired when a task fails and will not be retried automatically.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string', description: 'The unique task identifier.' },
            { name: 'botId', type: 'string', description: 'The bot that attempted the task.' },
            { name: 'errorCode', type: 'string?', description: 'Optional machine-readable error code.' },
            { name: 'reason', type: 'string', description: 'Human-readable failure reason.' },
        ],
        examplePayload: {
            eventType: 'task_failed',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:01:00.000Z',
            taskId: 'task_xyz',
            botId: 'bot_123',
            errorCode: 'TIMEOUT',
            reason: 'Task exceeded maximum execution time.',
        },
    },

    task_started: {
        eventType: 'task_started',
        schemaVersion: '1.0',
        description: 'Fired when a task begins execution by a bot.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string', description: 'The unique task identifier.' },
            { name: 'botId', type: 'string', description: 'The bot executing the task.' },
        ],
        examplePayload: {
            eventType: 'task_started',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T09:59:00.000Z',
            taskId: 'task_xyz',
            botId: 'bot_123',
        },
    },

    task_queued: {
        eventType: 'task_queued',
        schemaVersion: '1.0',
        description: 'Fired when a task is enqueued and waiting for an available bot.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string', description: 'The unique task identifier.' },
            { name: 'priority', type: 'string', description: "Task priority: 'high', 'normal', or 'low'." },
        ],
        examplePayload: {
            eventType: 'task_queued',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T09:58:00.000Z',
            taskId: 'task_xyz',
            priority: 'normal',
        },
    },

    agent_paused: {
        eventType: 'agent_paused',
        schemaVersion: '1.0',
        description: 'Fired when an agent is paused by a user or governance policy.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'botId', type: 'string', description: 'The agent that was paused.' },
            { name: 'pausedBy', type: 'string', description: 'User ID or policy name that triggered the pause.' },
        ],
        examplePayload: {
            eventType: 'agent_paused',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:02:00.000Z',
            botId: 'bot_123',
            pausedBy: 'user_admin_1',
        },
    },

    agent_resumed: {
        eventType: 'agent_resumed',
        schemaVersion: '1.0',
        description: 'Fired when a paused agent is resumed and able to accept new tasks.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'botId', type: 'string', description: 'The agent that was resumed.' },
            { name: 'resumedBy', type: 'string', description: 'User ID that triggered the resume.' },
        ],
        examplePayload: {
            eventType: 'agent_resumed',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:05:00.000Z',
            botId: 'bot_123',
            resumedBy: 'user_admin_1',
        },
    },

    budget_alert: {
        eventType: 'budget_alert',
        schemaVersion: '1.0',
        description: "Fired when a tenant's usage crosses a configured budget threshold.",
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'threshold', type: 'number', description: 'Configured alert threshold as a percentage (0-100).' },
            { name: 'currentUsage', type: 'number', description: 'Current spend in USD.' },
            { name: 'budgetLimit', type: 'number', description: 'Total budget limit in USD.' },
        ],
        examplePayload: {
            eventType: 'budget_alert',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:10:00.000Z',
            threshold: 80,
            currentUsage: 160.0,
            budgetLimit: 200.0,
        },
    },

    budget_alert_warn: {
        eventType: 'budget_alert_warn',
        schemaVersion: '1.0',
        description: "Fired when daily spend crosses the warning threshold (default 80% of daily limit).",
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string?', description: 'The task that triggered the threshold crossing.' },
            { name: 'estimatedCost', type: 'number', description: 'Estimated cost of the triggering task in USD.' },
            { name: 'dailySpent', type: 'number', description: 'Total daily spend so far in USD.' },
            { name: 'dailyLimit', type: 'number', description: 'Configured daily limit in USD.' },
        ],
        examplePayload: {
            eventType: 'budget_alert_warn',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:10:00.000Z',
            taskId: 'task_xyz',
            estimatedCost: 0.05,
            dailySpent: 160.0,
            dailyLimit: 200.0,
        },
    },

    budget_alert_critical: {
        eventType: 'budget_alert_critical',
        schemaVersion: '1.0',
        description: "Fired when daily spend crosses the critical threshold (default 90% of daily limit).",
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string?', description: 'The task that triggered the threshold crossing.' },
            { name: 'estimatedCost', type: 'number', description: 'Estimated cost of the triggering task in USD.' },
            { name: 'dailySpent', type: 'number', description: 'Total daily spend so far in USD.' },
            { name: 'dailyLimit', type: 'number', description: 'Configured daily limit in USD.' },
        ],
        examplePayload: {
            eventType: 'budget_alert_critical',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:12:00.000Z',
            taskId: 'task_xyz',
            estimatedCost: 0.05,
            dailySpent: 181.0,
            dailyLimit: 200.0,
        },
    },

    budget_alert_exceeded: {
        eventType: 'budget_alert_exceeded',
        schemaVersion: '1.0',
        description: "Fired when daily spend meets or exceeds 100% of the daily limit.",
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'taskId', type: 'string?', description: 'The task that triggered the threshold crossing.' },
            { name: 'estimatedCost', type: 'number', description: 'Estimated cost of the triggering task in USD.' },
            { name: 'dailySpent', type: 'number', description: 'Total daily spend so far in USD.' },
            { name: 'dailyLimit', type: 'number', description: 'Configured daily limit in USD.' },
        ],
        examplePayload: {
            eventType: 'budget_alert_exceeded',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:14:00.000Z',
            taskId: 'task_xyz',
            estimatedCost: 0.05,
            dailySpent: 200.5,
            dailyLimit: 200.0,
        },
    },

    connector_action_executed: {
        eventType: 'connector_action_executed',
        schemaVersion: '1.0',
        description: 'Fired when a connector action completes successfully.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'botId', type: 'string', description: 'The bot that executed the connector action.' },
            { name: 'connectorType', type: 'string', description: 'The connector type (e.g. github, jira).' },
            { name: 'actionType', type: 'string', description: 'The action executed (e.g. create_issue).' },
        ],
        examplePayload: {
            eventType: 'connector_action_executed',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:20:00.000Z',
            botId: 'bot_123',
            connectorType: 'github',
            actionType: 'create_issue',
        },
    },

    connector_action_failed: {
        eventType: 'connector_action_failed',
        schemaVersion: '1.0',
        description: 'Fired when a connector action fails after all retry attempts.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'botId', type: 'string', description: 'The bot that attempted the connector action.' },
            { name: 'connectorType', type: 'string', description: 'The connector type (e.g. github, jira).' },
            { name: 'actionType', type: 'string', description: 'The action attempted (e.g. create_issue).' },
            { name: 'errorCode', type: 'string', description: 'Machine-readable error code.' },
        ],
        examplePayload: {
            eventType: 'connector_action_failed',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:21:00.000Z',
            botId: 'bot_123',
            connectorType: 'github',
            actionType: 'create_issue',
            errorCode: 'permission_denied',
        },
    },

    bot_version_restored: {
        eventType: 'bot_version_restored',
        schemaVersion: '1.0',
        description: 'Fired when a bot configuration is restored to a previous version.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'botId', type: 'string', description: 'The bot whose configuration was restored.' },
            { name: 'restoredBy', type: 'string', description: 'User ID that performed the restore.' },
        ],
        examplePayload: {
            eventType: 'bot_version_restored',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:30:00.000Z',
            botId: 'bot_123',
            restoredBy: 'user_admin_1',
        },
    },

    webhook_test: {
        eventType: 'webhook_test',
        schemaVersion: '1.0',
        description: 'Sent when a user manually triggers a test delivery for a configured webhook.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'message', type: 'string', description: 'A human-readable test message.' },
        ],
        examplePayload: {
            eventType: 'webhook_test',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:15:00.000Z',
            message: 'This is a test webhook from AgentFarm',
        },
    },

    subscription_suspended: {
        eventType: 'subscription_suspended',
        schemaVersion: '1.0',
        description: 'Fired when a tenant subscription is suspended due to non-payment or policy violation.',
        fields: [
            ...ENVELOPE_FIELDS,
            { name: 'reason', type: 'string', description: 'The reason the subscription was suspended.' },
        ],
        examplePayload: {
            eventType: 'subscription_suspended',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:20:00.000Z',
            reason: 'non_payment',
        },
    },

    subscription_reactivated: {
        eventType: 'subscription_reactivated',
        schemaVersion: '1.0',
        description: 'Fired when a previously suspended subscription is reactivated.',
        fields: [
            ...ENVELOPE_FIELDS,
        ],
        examplePayload: {
            eventType: 'subscription_reactivated',
            tenantId: 'ten_abc123',
            timestamp: '2026-05-12T10:25:00.000Z',
        },
    },
};

export function getEventDefinition(eventType: string): EventDefinition | null {
    return CATALOG[eventType] ?? null;
}

export function getAllEventTypes(): string[] {
    return Object.keys(CATALOG);
}

export function isValidEventType(eventType: string): boolean {
    return eventType in CATALOG;
}

export function getSchemaVersion(eventType: string): string | null {
    return CATALOG[eventType]?.schemaVersion ?? null;
}
