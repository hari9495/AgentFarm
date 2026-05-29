/**
 * Project Manager MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Project Manager /
 * Product Owner / Scrum Master role.
 * Covers project tracking, documentation, communication, source control,
 * scheduling, and meeting platforms.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { PROJECT_MANAGER_ROLE_ALLOWED_CONNECTORS } from './project-manager-role-profile.js';

const PROJECT_MANAGER_MCP_ENV_MAP: Record<string, string> = {
    // Issue / project tracking
    jira:              'MCP_JIRA_URL',
    linear:            'MCP_LINEAR_URL',
    asana:             'MCP_ASANA_URL',
    trello:            'MCP_TRELLO_URL',
    clickup:           'MCP_CLICKUP_URL',
    // Documentation / knowledge
    confluence:        'MCP_CONFLUENCE_URL',
    notion:            'MCP_NOTION_URL',
    // Communication
    slack:             'MCP_SLACK_URL',
    teams:             'MCP_TEAMS_URL',
    microsoft_teams:   'MCP_TEAMS_URL',
    outlook:           'MCP_OUTLOOK_URL',
    gmail:             'MCP_GMAIL_URL',
    // Source control (for release tracking)
    github:            'MCP_GITHUB_URL',
    gitlab:            'MCP_GITLAB_URL',
    // Scheduling
    google_calendar:   'MCP_GOOGLE_CALENDAR_URL',
    outlook_calendar:  'MCP_OUTLOOK_CALENDAR_URL',
    // Meeting platforms
    google_meet:       'MCP_GOOGLE_MEET_URL',
    zoom:              'MCP_ZOOM_URL',
};

const _provisioner = createMcpProvisioner('project-manager', PROJECT_MANAGER_ROLE_ALLOWED_CONNECTORS, PROJECT_MANAGER_MCP_ENV_MAP);

export const ensureProjectManagerMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getProjectManagerMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateProjectManagerMcpSession = _provisioner.invalidateSession.bind(_provisioner);
