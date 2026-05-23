/**
 * Corporate Assistant Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for corporate assistant bots
 * that have not yet been configured with a custom persona via the setup wizard.
 *
 * This is intentionally minimal — real deployments should configure a proper
 * persona through the dashboard. The defaults exist so the corporate assistant
 * produces coherent, disclosure-compliant output from day one.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const CA_DEFAULT_DISPLAY_NAME = 'Corporate Assistant';
const CA_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const CA_DEFAULT_LANGUAGE = 'en';
const CA_DEFAULT_TIMEZONE = 'UTC';
const CA_DEFAULT_DISCLOSURE =
    'Note: This message was sent by an AI Corporate Assistant operated by AgentFarm.';
const CA_DEFAULT_WORKING_HOURS = {
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
 * Return a default AgentPersonaRecord for a corporate assistant bot.
 *
 * Callers (persona-context-loader.ts) should use this as a fallback when the
 * gateway returns null / 404 for the bot's custom persona.
 *
 * The returned record has placeholder `id`, `createdAt`, and `updatedAt`
 * values — it is not persisted and should never be written back to the DB as-is.
 */
export function getCorporateAssistantDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-ca-${botId}`,
        botId,
        tenantId,
        displayName: CA_DEFAULT_DISPLAY_NAME,
        emailAddress: `assistant-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: CA_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: CA_DEFAULT_DISCLOSURE,
        language: CA_DEFAULT_LANGUAGE,
        timezone: CA_DEFAULT_TIMEZONE,
        workingHours: CA_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
