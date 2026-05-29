/**
 * Mobile Engineer MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Mobile Engineer role.
 * Superset of the Developer connector set, plus mobile-specific platforms:
 * app stores, real-device cloud testing, crash reporting, push notifications,
 * CI/CD for mobile (Bitrise, CodeMagic, Fastlane), and distribution services.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { MOBILE_ROLE_ALLOWED_CONNECTORS } from './mobile-agent-profile.js';

const MOBILE_MCP_ENV_MAP: Record<string, string> = {
    // Source control
    github:               'MCP_GITHUB_URL',
    gitlab:               'MCP_GITLAB_URL',
    bitbucket:            'MCP_BITBUCKET_URL',
    azure_devops:         'MCP_AZURE_DEVOPS_URL',
    // Issue trackers
    jira:                 'MCP_JIRA_URL',
    linear:               'MCP_LINEAR_URL',
    github_issues:        'MCP_GITHUB_ISSUES_URL',
    // Communication
    slack:                'MCP_SLACK_URL',
    microsoft_teams:      'MCP_TEAMS_URL',
    // CI/CD
    github_actions:       'MCP_GITHUB_ACTIONS_URL',
    gitlab_ci:            'MCP_GITLAB_CI_URL',
    bitrise:              'MCP_BITRISE_URL',
    codemagic:            'MCP_CODEMAGIC_URL',
    fastlane:             'MCP_FASTLANE_URL',
    // App stores
    app_store_connect:    'MCP_APP_STORE_CONNECT_URL',
    google_play:          'MCP_GOOGLE_PLAY_URL',
    // Mobile-specific services
    firebase:             'MCP_FIREBASE_URL',
    appcenter:            'MCP_APPCENTER_URL',
    testflight:           'MCP_TESTFLIGHT_URL',
    // Real-device cloud testing
    browserstack:         'MCP_BROWSERSTACK_URL',
    saucelabs:            'MCP_SAUCELABS_URL',
    // Monitoring & crash reporting
    sentry:               'MCP_SENTRY_URL',
    datadog:              'MCP_DATADOG_URL',
    pagerduty:            'MCP_PAGERDUTY_URL',
    // Push notifications
    onesignal:            'MCP_ONESIGNAL_URL',
    braze:                'MCP_BRAZE_URL',
    // Documentation
    confluence:           'MCP_CONFLUENCE_URL',
    notion:               'MCP_NOTION_URL',
};

const _provisioner = createMcpProvisioner('mobile-engineer', MOBILE_ROLE_ALLOWED_CONNECTORS, MOBILE_MCP_ENV_MAP);

export const ensureMobileMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getMobileMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateMobileMcpSession = _provisioner.invalidateSession.bind(_provisioner);
