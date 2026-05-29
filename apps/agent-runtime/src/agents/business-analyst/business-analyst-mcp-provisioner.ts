/**
 * Business Analyst MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Business Analyst role.
 * Covers issue tracking, documentation, communication, and scheduling.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { BUSINESS_ANALYST_ROLE_ALLOWED_CONNECTORS } from './business-analyst-role-profile.js';

const BUSINESS_ANALYST_MCP_ENV_MAP: Record<string, string> = {
    // Issue / requirements tracking
    jira:             'MCP_JIRA_URL',
    linear:           'MCP_LINEAR_URL',
    asana:            'MCP_ASANA_URL',
    trello:           'MCP_TRELLO_URL',
    clickup:          'MCP_CLICKUP_URL',
    // Documentation / knowledge
    confluence:       'MCP_CONFLUENCE_URL',
    notion:           'MCP_NOTION_URL',
    google_drive:     'MCP_GOOGLE_DRIVE_URL',
    // Communication
    slack:            'MCP_SLACK_URL',
    teams:            'MCP_TEAMS_URL',
    microsoft_teams:  'MCP_TEAMS_URL',
    outlook:          'MCP_OUTLOOK_URL',
    gmail:            'MCP_GMAIL_URL',
    // Meeting platforms
    google_meet:      'MCP_GOOGLE_MEET_URL',
    zoom:             'MCP_ZOOM_URL',
    // Scheduling
    google_calendar:  'MCP_GOOGLE_CALENDAR_URL',
};

const _provisioner = createMcpProvisioner('business-analyst', BUSINESS_ANALYST_ROLE_ALLOWED_CONNECTORS, BUSINESS_ANALYST_MCP_ENV_MAP);

export const ensureBusinessAnalystMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getBusinessAnalystMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateBusinessAnalystMcpSession = _provisioner.invalidateSession.bind(_provisioner);
