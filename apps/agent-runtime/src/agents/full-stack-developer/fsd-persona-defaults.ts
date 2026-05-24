/**
 * Full-Stack Developer Persona Defaults
 *
 * Provides a sensible default AgentPersonaRecord for full-stack developer bots
 * that have not yet been configured with a custom persona via the setup wizard.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const FSD_DEFAULT_DISPLAY_NAME        = 'Full-Stack Developer';
const FSD_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const FSD_DEFAULT_LANGUAGE            = 'en';
const FSD_DEFAULT_TIMEZONE            = 'UTC';
const FSD_DEFAULT_DISCLOSURE          =
    'Note: This message was sent by an AI full-stack developer agent operated by AgentFarm.';
const FSD_DEFAULT_WORKING_HOURS = {
    start: '09:00',
    end:   '17:00',
    days:  [1, 2, 3, 4, 5],
};

const AGENT_EMAIL_DOMAIN =
    (process.env['AGENT_EMAIL_DOMAIN'] ?? 'agentfarm.io').replace(/^@/, '');

export function getFsdDefaultPersona(botId: string, tenantId: string): AgentPersonaRecord {
    return {
        id:                 `default-fsd-${botId}`,
        botId,
        tenantId,
        displayName:        FSD_DEFAULT_DISPLAY_NAME,
        emailAddress:       `fsd-agent-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl:          null,
        communicationStyle: FSD_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: FSD_DEFAULT_DISCLOSURE,
        language:           FSD_DEFAULT_LANGUAGE,
        timezone:           FSD_DEFAULT_TIMEZONE,
        workingHours:       FSD_DEFAULT_WORKING_HOURS,
        createdAt:          new Date().toISOString(),
        updatedAt:          new Date().toISOString(),
    };
}
