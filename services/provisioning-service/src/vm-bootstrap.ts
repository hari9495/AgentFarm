export type VmBootstrapConfig = {
    correlationId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleType: string;
    image: string;
    registryServer: string;
    registryUsername: string;
    registryPasswordSecretRef: string;
    evidenceApiEndpoint: string;
    contractVersion: string;
    runtimePolicyPackVersion: string;
    region: string;
};

const SECRET_KEY_PATTERN = /(secret|password|token|api[-_]?key)/i;

export const assertNoInlineSecrets = (input: Record<string, string>): void => {
    for (const [key, value] of Object.entries(input)) {
        if (!SECRET_KEY_PATTERN.test(key)) {
            continue;
        }
        if (value.startsWith("ref:") || value.startsWith("kv://")) {
            continue;
        }
        throw new Error(`Inline secret value is not allowed for key: ${key}`);
    }
};

export const buildCloudInitScript = (cfg: VmBootstrapConfig): string => {
    // Explicit secret guardrail for task 2.2: only secret references are allowed.
    assertNoInlineSecrets({
        registryPasswordSecretRef: cfg.registryPasswordSecretRef,
    });

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
      AGENTFARM_POLICY_PACK_VERSION=${cfg.runtimePolicyPackVersion}
      AGENTFARM_CONTRACT_VERSION=${cfg.contractVersion}
      AGENTFARM_EVIDENCE_API_ENDPOINT=${cfg.evidenceApiEndpoint}
      AGENTFARM_REGION=${cfg.region}
      AGENTFARM_HEALTH_PORT=8080
      AGENTFARM_LOG_LEVEL=info
      AGENTFARM_REGISTRY_SERVER=${cfg.registryServer}
      AGENTFARM_REGISTRY_USERNAME=${cfg.registryUsername}
      AGENTFARM_REGISTRY_PASSWORD_REF=${cfg.registryPasswordSecretRef}
  - path: /usr/local/bin/agentfarm-healthcheck.sh
    permissions: '0755'
    owner: root:root
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      for attempt in {1..24}; do
        if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null 2>&1; then
          exit 0
        fi
        sleep 5
      done
      echo "health check failed after 120 seconds" >&2
      exit 1
  - path: /etc/systemd/system/agentfarm-bot.service
    permissions: '0644'
    owner: root:root
    content: |
      [Unit]
      Description=AgentFarm Bot Container
      After=docker.service network-online.target
      Requires=docker.service

      [Service]
      Restart=always
      RestartSec=10
      ExecStartPre=-/usr/bin/docker stop agentfarm-bot
      ExecStartPre=-/usr/bin/docker rm agentfarm-bot
      ExecStart=/usr/bin/docker run --name agentfarm-bot \\
        --env-file /etc/agentfarm/bot.env \\
        --publish 8080:8080 \\
        --restart unless-stopped \\
        ${cfg.image}
      ExecStartPost=/usr/local/bin/agentfarm-healthcheck.sh
      ExecStop=/usr/bin/docker stop -t 10 agentfarm-bot

      [Install]
      WantedBy=multi-user.target

runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker
  - systemctl start docker
  # Registry login should resolve AGENTFARM_REGISTRY_PASSWORD_REF via secure channel at runtime.
  - docker login ${cfg.registryServer} -u ${cfg.registryUsername} -p "$(cat /dev/null)"
  - docker pull ${cfg.image}
  - systemctl daemon-reload
  - systemctl enable agentfarm-bot
  - systemctl start agentfarm-bot
`;

    return Buffer.from(yaml).toString("base64");
};
