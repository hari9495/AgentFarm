/**
 * Tester Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for tester bots that have
 * not yet been configured with a custom persona via the setup wizard.
 *
 * This is intentionally minimal — real deployments should configure a proper
 * persona through the dashboard. The defaults exist so the tester agent
 * produces coherent, disclosure-compliant output from day one.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const TESTER_DEFAULT_DISPLAY_NAME = 'QA Engineer';
const TESTER_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const TESTER_DEFAULT_LANGUAGE = 'en';
const TESTER_DEFAULT_TIMEZONE = 'UTC';
const TESTER_DEFAULT_DISCLOSURE =
    'Note: This message was sent by an AI QA agent operated by AgentFarm.';
const TESTER_DEFAULT_WORKING_HOURS = {
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
 * Return a default AgentPersonaRecord for a tester bot.
 *
 * Callers (persona-context-loader.ts) should use this as a fallback when the
 * gateway returns null / 404 for the bot's custom persona.
 *
 * The returned record has placeholder `id`, `createdAt`, and `updatedAt`
 * values — it is not persisted and should never be written back to the DB as-is.
 */
export function getTesterDefaultPersona(botId: string, tenantId: string): AgentPersonaRecord {
    return {
        id: `default-tester-${botId}`,
        botId,
        tenantId,
        displayName: TESTER_DEFAULT_DISPLAY_NAME,
        emailAddress: `qa-agent-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: TESTER_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: TESTER_DEFAULT_DISCLOSURE,
        language: TESTER_DEFAULT_LANGUAGE,
        timezone: TESTER_DEFAULT_TIMEZONE,
        workingHours: TESTER_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
