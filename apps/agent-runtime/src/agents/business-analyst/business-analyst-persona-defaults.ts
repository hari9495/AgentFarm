/**
 * Business Analyst Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for business analyst bots
 * that have not yet been configured with a custom persona via the setup wizard.
 *
 * This is intentionally minimal — real deployments should configure a proper
 * persona through the dashboard. The defaults exist so the BA produces coherent,
 * disclosure-compliant output from day one.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const BA_DEFAULT_DISPLAY_NAME = 'Business Analyst';
const BA_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const BA_DEFAULT_LANGUAGE = 'en';
const BA_DEFAULT_TIMEZONE = 'UTC';
const BA_DEFAULT_DISCLOSURE =
    'Note: This message was sent by an AI Business Analyst operated by AgentFarm.';
const BA_DEFAULT_WORKING_HOURS = {
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
 * Return a default AgentPersonaRecord for a business analyst bot.
 *
 * Callers (persona-context-loader.ts) should use this as a fallback when the
 * gateway returns null / 404 for the bot's custom persona.
 *
 * The returned record has placeholder `id`, `createdAt`, and `updatedAt`
 * values — it is not persisted and should never be written back to the DB as-is.
 */
export function getBusinessAnalystDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-ba-${botId}`,
        botId,
        tenantId,
        displayName: BA_DEFAULT_DISPLAY_NAME,
        emailAddress: `ba-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: BA_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: BA_DEFAULT_DISCLOSURE,
        language: BA_DEFAULT_LANGUAGE,
        timezone: BA_DEFAULT_TIMEZONE,
        workingHours: BA_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
