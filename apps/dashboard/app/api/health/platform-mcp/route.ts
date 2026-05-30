import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

/**
 * GET /api/health/platform-mcp
 *
 * Returns the current state of all platform-level MCP env vars.
 * These are the "generic across the product" MCP connections —
 * setting them makes that MCP server available to ALL agents across ALL tenants.
 *
 * Each entry shows: envVar name, connector id, whether it is currently set,
 * and the URL value (masked for security — only shows if set or not).
 */

const PLATFORM_MCP_REGISTRY: Array<{
    group: string;
    connectors: Array<{ id: string; envVar: string; label: string; agents: string[] }>;
}> = [
    {
        group: 'Code & Version Control',
        connectors: [
            { id: 'github',        envVar: 'MCP_GITHUB_URL',        label: 'GitHub',         agents: ['developer', 'fsd', 'devops'] },
            { id: 'gitlab',        envVar: 'MCP_GITLAB_URL',         label: 'GitLab',         agents: ['developer', 'fsd'] },
            { id: 'bitbucket',     envVar: 'MCP_BITBUCKET_URL',      label: 'Bitbucket',      agents: ['developer'] },
            { id: 'azure_devops',  envVar: 'MCP_AZURE_DEVOPS_URL',   label: 'Azure DevOps',   agents: ['developer', 'devops'] },
        ],
    },
    {
        group: 'Project Management',
        connectors: [
            { id: 'jira',       envVar: 'MCP_JIRA_URL',        label: 'Jira',       agents: ['developer', 'fsd', 'pm', 'ba'] },
            { id: 'linear',     envVar: 'MCP_LINEAR_URL',       label: 'Linear',     agents: ['developer', 'fsd'] },
            { id: 'notion',     envVar: 'MCP_NOTION_URL',       label: 'Notion',     agents: ['tw', 'ba', 'pm'] },
            { id: 'confluence', envVar: 'MCP_CONFLUENCE_URL',   label: 'Confluence', agents: ['tw', 'ba', 'pm'] },
            { id: 'asana',      envVar: 'MCP_ASANA_URL',        label: 'Asana',      agents: ['pm'] },
            { id: 'trello',     envVar: 'MCP_TRELLO_URL',       label: 'Trello',     agents: ['pm'] },
            { id: 'clickup',    envVar: 'MCP_CLICKUP_URL',      label: 'ClickUp',    agents: ['pm'] },
        ],
    },
    {
        group: 'Communication',
        connectors: [
            { id: 'slack',            envVar: 'MCP_SLACK_URL',            label: 'Slack',             agents: ['developer', 'fsd', 'devops', 'cs', 'ca'] },
            { id: 'microsoft_teams',  envVar: 'MCP_TEAMS_URL',            label: 'Microsoft Teams',   agents: ['developer', 'ca', 'cs'] },
            { id: 'discord',          envVar: 'MCP_DISCORD_URL',          label: 'Discord',           agents: ['developer'] },
            { id: 'gmail',            envVar: 'MCP_GMAIL_URL',            label: 'Gmail',             agents: ['ca', 'cs', 'sales'] },
            { id: 'outlook',          envVar: 'MCP_OUTLOOK_URL',          label: 'Outlook',           agents: ['ca', 'cs'] },
        ],
    },
    {
        group: 'CI / CD',
        connectors: [
            { id: 'jenkins',         envVar: 'MCP_JENKINS_URL',         label: 'Jenkins',        agents: ['devops', 'developer'] },
            { id: 'circleci',        envVar: 'MCP_CIRCLECI_URL',        label: 'CircleCI',       agents: ['devops', 'developer'] },
            { id: 'github_actions',  envVar: 'MCP_GITHUB_ACTIONS_URL',  label: 'GitHub Actions', agents: ['devops', 'developer'] },
            { id: 'gitlab_ci',       envVar: 'MCP_GITLAB_CI_URL',       label: 'GitLab CI',      agents: ['devops'] },
            { id: 'vercel',          envVar: 'MCP_VERCEL_URL',          label: 'Vercel',         agents: ['fsd'] },
            { id: 'netlify',         envVar: 'MCP_NETLIFY_URL',         label: 'Netlify',        agents: ['fsd'] },
        ],
    },
    {
        group: 'Monitoring & Observability',
        connectors: [
            { id: 'pagerduty',  envVar: 'MCP_PAGERDUTY_URL',  label: 'PagerDuty',  agents: ['devops'] },
            { id: 'datadog',    envVar: 'MCP_DATADOG_URL',    label: 'Datadog',    agents: ['devops'] },
            { id: 'sentry',     envVar: 'MCP_SENTRY_URL',     label: 'Sentry',     agents: ['developer', 'devops'] },
            { id: 'grafana',    envVar: 'MCP_GRAFANA_URL',    label: 'Grafana',    agents: ['devops'] },
            { id: 'prometheus', envVar: 'MCP_PROMETHEUS_URL', label: 'Prometheus', agents: ['devops'] },
            { id: 'new_relic',  envVar: 'MCP_NEW_RELIC_URL',  label: 'New Relic',  agents: ['devops'] },
        ],
    },
    {
        group: 'CRM & Sales',
        connectors: [
            { id: 'hubspot',    envVar: 'MCP_HUBSPOT_URL',    label: 'HubSpot',    agents: ['sales', 'marketing'] },
            { id: 'salesforce', envVar: 'MCP_SALESFORCE_URL', label: 'Salesforce', agents: ['sales'] },
            { id: 'dynamics',   envVar: 'MCP_DYNAMICS_URL',   label: 'Dynamics',   agents: ['sales'] },
            { id: 'apollo',     envVar: 'MCP_APOLLO_URL',     label: 'Apollo.io',  agents: ['sales'] },
            { id: 'linkedin',   envVar: 'MCP_LINKEDIN_URL',   label: 'LinkedIn',   agents: ['sales', 'recruiter'] },
        ],
    },
    {
        group: 'Testing & QA',
        connectors: [
            { id: 'playwright',   envVar: 'MCP_PLAYWRIGHT_URL',   label: 'Playwright',     agents: ['tester', 'fsd'] },
            { id: 'selenium',     envVar: 'MCP_SELENIUM_URL',     label: 'Selenium',       agents: ['tester'] },
            { id: 'sonarqube',    envVar: 'MCP_SONARQUBE_URL',    label: 'SonarQube',      agents: ['developer', 'tester'] },
            { id: 'browserstack', envVar: 'MCP_BROWSERSTACK_URL', label: 'BrowserStack',   agents: ['tester', 'mobile'] },
            { id: 'postman',      envVar: 'MCP_POSTMAN_URL',      label: 'Postman/Newman', agents: ['tester'] },
        ],
    },
    {
        group: 'Cloud Providers',
        connectors: [
            { id: 'aws',   envVar: 'MCP_AWS_URL',   label: 'AWS',           agents: ['devops'] },
            { id: 'gcp',   envVar: 'MCP_GCP_URL',   label: 'Google Cloud',  agents: ['devops'] },
            { id: 'azure', envVar: 'MCP_AZURE_URL',  label: 'Azure',         agents: ['devops'] },
        ],
    },
];

export async function GET(): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const groups = PLATFORM_MCP_REGISTRY.map(group => ({
        ...group,
        connectors: group.connectors.map(c => ({
            ...c,
            configured: !!(process.env[c.envVar]?.trim()),
            // Never expose the actual URL value — just configured: true/false
        })),
    }));

    const total      = groups.flatMap(g => g.connectors).length;
    const configured = groups.flatMap(g => g.connectors).filter(c => c.configured).length;

    return NextResponse.json({ groups, total, configured });
}
