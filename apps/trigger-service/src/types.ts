// ============================================================================
// Trigger Service — Core Types
// ============================================================================

export type TriggerSourceKind = 'slack' | 'email' | 'teams' | 'google_chat' | 'webhook';

// ---------------------------------------------------------------------------
// Per-source reply contexts
// ---------------------------------------------------------------------------

export type SlackReplyContext = {
    source: 'slack';
    channelId: string;
    threadTs?: string;
    token: string;
};

export type EmailReplyContext = {
    source: 'email';
    replyTo: string;
    subject: string;
    smtpConfig: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
    };
};

export type WebhookReplyContext = {
    source: 'webhook';
    callbackUrl?: string;
};

export type TeamsReplyContext = {
    source: 'teams';
    serviceUrl: string;
    conversationId: string;
    activityId: string;
};

export type GoogleChatReplyContext = {
    source: 'google_chat';
    /** Google Chat space resource name, e.g. "spaces/AAAA1234" */
    spaceId: string;
    /** Thread resource name for threaded replies, e.g. "spaces/AAAA1234/threads/BBBB5678" */
    threadName?: string;
    /** OAuth2 or service-account bearer token with chat.messages.create scope */
    token: string;
};

export type ReplyContext =
    | SlackReplyContext
    | EmailReplyContext
    | WebhookReplyContext
    | TeamsReplyContext
    | GoogleChatReplyContext;

// ---------------------------------------------------------------------------
// Normalised event produced by every TriggerSource
// ---------------------------------------------------------------------------

export type TriggerEvent = {
    /** UUID assigned at ingestion time */
    id: string;
    source: TriggerSourceKind;
    /** Filled by TriggerRouter */
    tenantId: string;
    /** Filled by TriggerRouter */
    agentId: string;
    /** Email address or Slack user ID of sender */
    from: string;
    /** L1 — recipient address the message was sent TO (the agent's persona mailbox), when known.
     *  Used for deterministic per-agent routing: mail to recruiter@acme.com → the recruiter agent. */
    recipient?: string;
    /** Thread / channel for reply routing */
    channel?: string;
    /** Email subject or Slack channel name */
    subject?: string;
    /** Becomes the task string passed to runTask() */
    body: string;
    receivedAt: Date;
    replyContext: ReplyContext;
};

// ---------------------------------------------------------------------------
// TriggerSource interface — every adapter must implement this
// ---------------------------------------------------------------------------

export interface TriggerSource {
    readonly kind: TriggerSourceKind;
    start(onEvent: (event: Omit<TriggerEvent, 'tenantId' | 'agentId'>) => Promise<void>): Promise<void>;
    stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tenant / agent configuration
// ---------------------------------------------------------------------------

export type AgentConfig = {
    agentId: string;
    /** Human-readable description used in the LLM routing prompt */
    description: string;
    /** L1 — the agent persona's inbound mailbox. When an email's recipient matches this,
     *  routing is deterministic (no LLM guess needed). */
    email?: string;
};

export type TenantTriggerConfig = {
    tenantId: string;
    /** Used when single-tenant mode bypasses LLM routing */
    defaultAgentId: string;
    agents: AgentConfig[];
    /** Display name used in LLM routing prompt */
    name?: string;
};

export type TriggerServiceConfig = {
    tenants: TenantTriggerConfig[];
    agentRuntimeUrl: string;
    anthropicApiKey?: string;
    anthropicApiVersion?: string;
};
