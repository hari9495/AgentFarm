import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const MS_DEFAULT_DISPLAY_NAME = 'Marketing Specialist';
const MS_DEFAULT_COMMUNICATION_STYLE = 'professional' as const;
const MS_DEFAULT_LANGUAGE = 'en';
const MS_DEFAULT_TIMEZONE = 'UTC';
const MS_DEFAULT_DISCLOSURE =
    'Note: This campaign analysis and marketing content was prepared by an AI Marketing Specialist agent operated by AgentFarm.';
const MS_DEFAULT_WORKING_HOURS = {
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5],
};

const AGENT_EMAIL_DOMAIN =
    (process.env['AGENT_EMAIL_DOMAIN'] ?? 'agentfarm.io').replace(/^@/, '');

export function getMarketingSpecialistDefaultPersona(
    botId: string,
    tenantId: string,
): AgentPersonaRecord {
    return {
        id: `default-marketing-specialist-${botId}`,
        botId,
        tenantId,
        displayName: MS_DEFAULT_DISPLAY_NAME,
        emailAddress: `marketing-agent-${botId.slice(0, 8).toLowerCase()}@${AGENT_EMAIL_DOMAIN}`,
        avatarUrl: null,
        communicationStyle: MS_DEFAULT_COMMUNICATION_STYLE,
        disclosureStatement: MS_DEFAULT_DISCLOSURE,
        language: MS_DEFAULT_LANGUAGE,
        timezone: MS_DEFAULT_TIMEZONE,
        workingHours: MS_DEFAULT_WORKING_HOURS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
