/**
 * Technical Writer Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for technical writer bots
 * that have not yet been configured with a custom persona via the setup wizard.
 *
 * This is intentionally minimal — real deployments should configure a proper
 * persona through the dashboard. The defaults exist so the technical writer
 * produces coherent, disclosure-compliant output from day one.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const TW_DEFAULT_DISPLAY_NAME = 'Technical Writer';
const TW_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const TW_DEFAULT_LANGUAGE = 'en';
const TW_DEFAULT_TIMEZONE = 'UTC';
const TW_DEFAULT_DISCLOSURE =
    'Note: This documentation was produced by an AI Technical Writer operated by AgentFarm.';
const TW_DEFAULT_WORKING_HOURS = {
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
 * Return a default AgentPersonaRecord for a technical writer bot.
 *
 * Callers (persona-context-loader.ts) should use this as a fallback when the
 * gateway returns null / 404 for the bot's custom persona.
 *
 * The returned record has placeholder `id`, `createdAt`, and `updatedAt`
 * values — it is not persisted and should never be written back to the DB as-is.
 */
export function getTechnicalWriterDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-tw-${botId}`,
        botId,
        tenantId,
        displayName: TW_DEFAULT_DISPLAY_NAME,
        emailAddress: `writer-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: TW_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: TW_DEFAULT_DISCLOSURE,
        language: TW_DEFAULT_LANGUAGE,
        timezone: TW_DEFAULT_TIMEZONE,
        workingHours: TW_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
