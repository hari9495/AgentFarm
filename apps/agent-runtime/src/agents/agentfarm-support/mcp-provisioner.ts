/**
 * AgentFarm Support Agent — MCP Provisioner
 *
 * Maps the support agent's allowed connectors to their MCP server env vars
 * using the shared createMcpProvisioner factory.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { AGENTFARM_SUPPORT_ALLOWED_CONNECTORS } from './agent-profile.js';

const AGENTFARM_SUPPORT_MCP_ENV_MAP: Record<string, string> = {
    github:          'MCP_GITHUB_URL',
    slack:           'MCP_SLACK_URL',
    microsoft_teams: 'MCP_TEAMS_URL',
    pagerduty:       'MCP_PAGERDUTY_URL',
    datadog:         'MCP_DATADOG_URL',
    grafana:         'MCP_GRAFANA_URL',
};

const _provisioner = createMcpProvisioner(
    'agentfarm-support',
    AGENTFARM_SUPPORT_ALLOWED_CONNECTORS,
    AGENTFARM_SUPPORT_MCP_ENV_MAP,
);

export const ensureAgentfarmSupportMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getAgentfarmSupportMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateAgentfarmSupportMcpSession = _provisioner.invalidateSession.bind(_provisioner);
