/**
 * DevOps Engineer MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the DevOps Engineer role.
 * Covers source control, CI/CD, container registries, cloud providers,
 * Kubernetes management, observability, and secret management.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { DEVOPS_ROLE_ALLOWED_CONNECTORS } from './devops-agent-profile.js';

const DEVOPS_MCP_ENV_MAP: Record<string, string> = {
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
    pagerduty:            'MCP_PAGERDUTY_URL',
    // CI/CD
    jenkins:              'MCP_JENKINS_URL',
    circleci:             'MCP_CIRCLECI_URL',
    github_actions:       'MCP_GITHUB_ACTIONS_URL',
    gitlab_ci:            'MCP_GITLAB_CI_URL',
    azure_pipelines:      'MCP_AZURE_PIPELINES_URL',
    tekton:               'MCP_TEKTON_URL',
    argocd:               'MCP_ARGOCD_URL',
    // Container registries
    docker_hub:           'MCP_DOCKER_HUB_URL',
    ecr:                  'MCP_ECR_URL',
    gcr:                  'MCP_GCR_URL',
    acr:                  'MCP_ACR_URL',
    ghcr:                 'MCP_GHCR_URL',
    // Cloud providers
    aws:                  'MCP_AWS_URL',
    azure:                'MCP_AZURE_URL',
    gcp:                  'MCP_GCP_URL',
    terraform_cloud:      'MCP_TERRAFORM_CLOUD_URL',
    // Kubernetes management
    rancher:              'MCP_RANCHER_URL',
    lens:                 'MCP_LENS_URL',
    // Observability
    datadog:              'MCP_DATADOG_URL',
    grafana:              'MCP_GRAFANA_URL',
    prometheus:           'MCP_PROMETHEUS_URL',
    sentry:               'MCP_SENTRY_URL',
    new_relic:            'MCP_NEW_RELIC_URL',
    cloudwatch:           'MCP_CLOUDWATCH_URL',
    // Secret management
    vault:                'MCP_VAULT_URL',
    aws_secrets_manager:  'MCP_AWS_SECRETS_MANAGER_URL',
    // Documentation
    confluence:           'MCP_CONFLUENCE_URL',
    notion:               'MCP_NOTION_URL',
};

const _provisioner = createMcpProvisioner('devops-engineer', DEVOPS_ROLE_ALLOWED_CONNECTORS, DEVOPS_MCP_ENV_MAP);

export const ensureDevopsMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getDevopsMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateDevopsMcpSession = _provisioner.invalidateSession.bind(_provisioner);
