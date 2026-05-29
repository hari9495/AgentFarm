/**
 * Fullstack Developer MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Fullstack Developer role.
 * Superset of the Developer connector set, plus design and deployment platforms.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { FSD_ROLE_ALLOWED_CONNECTORS } from './fsd-agent-profile.js';

const FSD_MCP_ENV_MAP: Record<string, string> = {
    // Inherited from Developer
    github:            'MCP_GITHUB_URL',
    gitlab:            'MCP_GITLAB_URL',
    bitbucket:         'MCP_BITBUCKET_URL',
    azure_devops:      'MCP_AZURE_DEVOPS_URL',
    jira:              'MCP_JIRA_URL',
    linear:            'MCP_LINEAR_URL',
    github_issues:     'MCP_GITHUB_ISSUES_URL',
    slack:             'MCP_SLACK_URL',
    microsoft_teams:   'MCP_TEAMS_URL',
    jenkins:           'MCP_JENKINS_URL',
    circleci:          'MCP_CIRCLECI_URL',
    github_actions:    'MCP_GITHUB_ACTIONS_URL',
    gitlab_ci:         'MCP_GITLAB_CI_URL',
    confluence:        'MCP_CONFLUENCE_URL',
    notion:            'MCP_NOTION_URL',
    pagerduty:         'MCP_PAGERDUTY_URL',
    datadog:           'MCP_DATADOG_URL',
    sentry:            'MCP_SENTRY_URL',
    sonarqube:         'MCP_SONARQUBE_URL',
    codecov:           'MCP_CODECOV_URL',
    // FSD-specific: design and deployment
    figma:             'MCP_FIGMA_URL',
    storybook:         'MCP_STORYBOOK_URL',
    vercel:            'MCP_VERCEL_URL',
    netlify:           'MCP_NETLIFY_URL',
    cloudflare_pages:  'MCP_CLOUDFLARE_PAGES_URL',
};

const _provisioner = createMcpProvisioner('fullstack-developer', FSD_ROLE_ALLOWED_CONNECTORS, FSD_MCP_ENV_MAP);

export const ensureFsdMcpServers    = _provisioner.ensureServers.bind(_provisioner);
export const getFsdMcpClients       = _provisioner.getClients.bind(_provisioner);
export const invalidateFsdMcpSession = _provisioner.invalidateSession.bind(_provisioner);
