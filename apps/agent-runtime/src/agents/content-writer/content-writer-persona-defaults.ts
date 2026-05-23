/**
 * Content Writer Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for content writer bots that
 * have not yet been configured with a custom persona via the setup wizard.
 *
 * This is intentionally minimal — real deployments should configure a proper
 * persona through the dashboard. The defaults exist so the content writer agent
 * produces coherent, disclosure-compliant output from day one.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const CW_DEFAULT_DISPLAY_NAME = 'Content Writer';
const CW_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const CW_DEFAULT_LANGUAGE = 'en';
const CW_DEFAULT_TIMEZONE = 'UTC';
const CW_DEFAULT_DISCLOSURE =
    'Note: This content was drafted by an AI Content Writer agent operated by AgentFarm.';
const CW_DEFAULT_WORKING_HOURS = {
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5], // Mon–Fri
};

/** Domain used to generate the agent's email address. Overridable via env. */
const AGENT_EMAIL_DOMAIN =
    (process.env['AGENT_EMAIL_DOMAIN'] ?? 'agentfarm.io').replace(/^@/, '');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a default AgentPersonaRecord for a content writer bot.
 *
 * Callers (persona-context-loader.ts) should use this as a fallback when the
 * gateway returns null / 404 for the bot's custom persona.
 *
 * The returned record has placeholder `id`, `createdAt`, and `updatedAt`
 * values — it is not persisted and should never be written back to the DB as-is.
 */
export function getContentWriterDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-content-writer-${botId}`,
        botId,
        tenantId,
        displayName: CW_DEFAULT_DISPLAY_NAME,
        emailAddress: `content-agent-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: CW_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: CW_DEFAULT_DISCLOSURE,
        language: CW_DEFAULT_LANGUAGE,
        timezone: CW_DEFAULT_TIMEZONE,
        workingHours: CW_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
