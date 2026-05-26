/**
 * Project Manager / Scrum Master — Persona Defaults
 *
 * Default identity record for a newly-hired PM/SM bot.
 * Used by the setup wizard and the agent runtime when no custom persona exists.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const AGENT_EMAIL_DOMAIN = process.env['AGENT_EMAIL_DOMAIN'] ?? 'agents.agentfarm.ai';

export function getProjectManagerDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-pm-${botId}`,
        botId,
        tenantId,
        displayName: 'Project Manager',
        emailAddress: `pm-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: 'professional',
        disclosureStatement:
            'Note: This message was sent by an AI Project Manager / Scrum Master agent operated by AgentFarm.',
        language: 'en',
        timezone: 'UTC',
        workingHours: {
            start: '09:00',
            end: '17:00',
            days: [1, 2, 3, 4, 5],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export function getScrumMasterDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-sm-${botId}`,
        botId,
        tenantId,
        displayName: 'Scrum Master',
        emailAddress: `sm-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: 'professional',
        disclosureStatement:
            'Note: This message was sent by an AI Scrum Master agent operated by AgentFarm.',
        language: 'en',
        timezone: 'UTC',
        workingHours: {
            start: '09:00',
            end: '17:00',
            days: [1, 2, 3, 4, 5],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
