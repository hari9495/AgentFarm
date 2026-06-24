// ============================================================================
// Persona types — agent identity layer
// ============================================================================

/** Communication tone style for the agent persona. */
export type CommunicationStyle = 'professional' | 'friendly' | 'concise' | 'formal';

/** Working hours window with days-of-week (0=Sun … 6=Sat). */
export interface WorkingHours {
    /** 24h time string, e.g. "09:00" */
    start: string;
    /** 24h time string, e.g. "18:00" */
    end: string;
    /** Days of week the agent is active (0=Sunday … 6=Saturday) */
    days: number[];
}

/**
 * Full agent persona record as returned by the API.
 * One-to-one with a Bot record.
 */
export interface AgentPersonaRecord {
    id: string;
    botId: string;
    tenantId: string;
    /** Human-readable display name, e.g. "Alex" */
    displayName: string;
    /** Email address the agent uses when signing outbound messages */
    emailAddress: string;
    avatarUrl?: string | null;
    communicationStyle: CommunicationStyle;
    /** Appended to all external-facing messages for AI disclosure compliance */
    disclosureStatement: string;
    /** BCP-47 language code, e.g. "en", "ja" */
    language: string;
    /** IANA timezone, e.g. "America/New_York" */
    timezone: string;
    workingHours?: WorkingHours | null;
    /** Org identity — places the agent in the org chart like a human employee. */
    employeeId?: string | null;
    department?: string | null;
    /** botId of this agent's manager (for org-chart hierarchy). */
    managerId?: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Input for creating a new persona (id and timestamps are server-assigned). */
export type CreatePersonaInput = Omit<AgentPersonaRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** Input for partial persona updates. botId and tenantId are immutable. */
export type UpdatePersonaInput = Partial<
    Omit<AgentPersonaRecord, 'id' | 'botId' | 'tenantId' | 'createdAt' | 'updatedAt'>
>;
