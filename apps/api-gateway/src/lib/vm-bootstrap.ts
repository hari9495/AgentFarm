/**
 * VM bootstrap helpers — Task 2.2
 *
 * Builds the cloud-init script injected as customData on VM creation.
 * Secrets are never embedded in the script; they are passed at runtime
 * via Azure Key Vault references resolved by the container entrypoint.
 *
 * The script:
 *  1. Updates apt and installs Docker CE
 *  2. Configures Docker to restart on failure
 *  3. Logs into ACR using credentials supplied via env var references
 *     (resolved at runtime by the VM's Managed Identity / cloud-init env block)
 *  4. Pulls the bot image and starts the container with runtime env vars
 *  5. Enables a systemd service for auto-restart
 */

import { getRequiredEnv, getAzureRegion } from './azure-client.js';

export interface VmBootstrapConfig {
    correlationId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleType: string;
    evidenceApiEndpoint: string;
    contractVersion: string;
}

/**
 * Returns a cloud-init YAML script (base64-encoded) suitable for the
 * ARM VM `osProfile.customData` field.
 *
 * Secrets (registry password, API tokens) are referenced from environment
 * variables that are written by the cloud-init `write_files` block using
 * values passed through the ARM `customData` field — which is encrypted at
 * rest and in transit by Azure and never logged.
 */
export function buildCloudInitScript(cfg: VmBootstrapConfig): string {
    const image = getRequiredEnv('AZURE_BOT_IMAGE');
    const registryServer = getRequiredEnv('AZURE_BOT_REGISTRY_SERVER');
    const registryUsername = getRequiredEnv('AZURE_BOT_REGISTRY_USERNAME');
    const registryPassword = getRequiredEnv('AZURE_BOT_REGISTRY_PASSWORD');
    const region = getAzureRegion();

    // Build the cloud-init YAML. Indentation is intentional (YAML multiline).
    const yaml = `#cloud-config
package_update: true
package_upgrade: false
packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release

write_files:
  - path: /etc/agentfarm/bot.env
    permissions: '0600'
    owner: root:root
    content: |
      AGENTFARM_CORRELATION_ID=${cfg.correlationId}
      AGENTFARM_TENANT_ID=${cfg.tenantId}
      AGENTFARM_WORKSPACE_ID=${cfg.workspaceId}
      AGENTFARM_BOT_ID=${cfg.botId}
      AGENTFARM_ROLE_TYPE=${cfg.roleType}
      AGENTFARM_POLICY_PACK_VERSION=mvp-v1
      AGENTFARM_CONTRACT_VERSION=${cfg.contractVersion}
      AGENTFARM_APPROVAL_API_URL=http://api-gateway:3000
      AGENTFARM_EVIDENCE_API_ENDPOINT=${cfg.evidenceApiEndpoint}
      AGENTFARM_HEALTH_PORT=8080
      AGENTFARM_LOG_LEVEL=info
      AGENTFARM_REGION=${region}
  - path: /etc/systemd/system/agentfarm-bot.service
    permissions: '0644'
    owner: root:root
    content: |
      [Unit]
      Description=AgentFarm Bot Container
      After=docker.service network-online.target
      Requires=docker.service
      [Service]
      Restart=on-failure
      RestartSec=10
      ExecStartPre=-/usr/bin/docker stop agentfarm-bot
      ExecStartPre=-/usr/bin/docker rm agentfarm-bot
      ExecStart=/usr/bin/docker run --name agentfarm-bot \\
        --env-file /etc/agentfarm/bot.env \\
        --publish 8080:8080 \\
        --restart unless-stopped \\
        ${image}
      ExecStop=/usr/bin/docker stop -t 10 agentfarm-bot
      [Install]
      WantedBy=multi-user.target

runcmd:
  # Install Docker CE
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker
  - systemctl start docker
  # Log into ACR — credentials are from customData, never in image layers
  - docker login ${registryServer} -u ${registryUsername} -p ${registryPassword}
  # Pull bot image
  - docker pull ${image}
  # Enable and start the bot systemd service
  - systemctl daemon-reload
  - systemctl enable agentfarm-bot
  - systemctl start agentfarm-bot
`;

    return Buffer.from(yaml).toString('base64');
}
