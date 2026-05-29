/**
 * Developer MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Developer role.
 * One env var per connector (all optional — unset means connector is unavailable).
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { DEVELOPER_ROLE_ALLOWED_CONNECTORS } from './developer-agent-profile.js';

const DEVELOPER_MCP_ENV_MAP: Record<string, string> = {
    github:           'MCP_GITHUB_URL',
    gitlab:           'MCP_GITLAB_URL',
    bitbucket:        'MCP_BITBUCKET_URL',
    azure_devops:     'MCP_AZURE_DEVOPS_URL',
    jira:             'MCP_JIRA_URL',
    linear:           'MCP_LINEAR_URL',
    github_issues:    'MCP_GITHUB_ISSUES_URL',
    slack:            'MCP_SLACK_URL',
    microsoft_teams:  'MCP_TEAMS_URL',
    jenkins:          'MCP_JENKINS_URL',
    circleci:         'MCP_CIRCLECI_URL',
    github_actions:   'MCP_GITHUB_ACTIONS_URL',
    gitlab_ci:        'MCP_GITLAB_CI_URL',
    confluence:       'MCP_CONFLUENCE_URL',
    notion:           'MCP_NOTION_URL',
    pagerduty:        'MCP_PAGERDUTY_URL',
    datadog:          'MCP_DATADOG_URL',
    sentry:           'MCP_SENTRY_URL',
    sonarqube:        'MCP_SONARQUBE_URL',
    codecov:          'MCP_CODECOV_URL',
};

const _provisioner = createMcpProvisioner('developer', DEVELOPER_ROLE_ALLOWED_CONNECTORS, DEVELOPER_MCP_ENV_MAP);

export const ensureDeveloperMcpServers    = _provisioner.ensureServers.bind(_provisioner);
export const getDeveloperMcpClients       = _provisioner.getClients.bind(_provisioner);
export const invalidateDeveloperMcpSession = _provisioner.invalidateSession.bind(_provisioner);
