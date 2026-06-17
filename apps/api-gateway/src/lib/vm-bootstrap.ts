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
 *  6. (Optional) When AXIOM_TOKEN is configured, also runs an OpenTelemetry
 *     Collector that ships this customer VM's Docker logs + container metrics to
 *     Axiom, tagged with tenant_id = this VM's tenant, so every per-customer VM
 *     is monitored automatically.
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

// ── OpenTelemetry Collector config (ships Docker logs/metrics → Axiom) ──────────
// Kept in sync with docker/otel-collector/config.yaml. tenant_id comes from the
// AF_TENANT_ID env (set per VM below), so Axiom data is filterable per customer.
const OTEL_COLLECTOR_CONFIG_YAML = `receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  filelog:
    include: [/var/lib/docker/containers/*/*-json.log]
    start_at: end
    include_file_path: true
    operators:
      - type: json_parser
        timestamp:
          parse_from: attributes.time
          layout: '%Y-%m-%dT%H:%M:%S.%LZ'
      - type: regex_parser
        parse_from: attributes["log.file.path"]
        regex: '^/var/lib/docker/containers/(?P<container_id>[a-f0-9]+)/'
      - type: move
        from: attributes.log
        to: body
  docker_stats:
    endpoint: unix:///var/run/docker.sock
    api_version: "1.40"
    collection_interval: 30s
processors:
  batch:
    timeout: 5s
  resourcedetection:
    detectors: [env, system]
    timeout: 5s
  resource/tenant:
    attributes:
      - key: tenant_id
        value: \${env:AF_TENANT_ID}
        action: upsert
exporters:
  otlphttp/axiom_logs:
    compression: gzip
    endpoint: \${env:AXIOM_URL}
    headers:
      authorization: Bearer \${env:AXIOM_TOKEN}
      x-axiom-dataset: \${env:AXIOM_DATASET_LOGS}
  otlphttp/axiom_traces:
    compression: gzip
    endpoint: \${env:AXIOM_URL}
    headers:
      authorization: Bearer \${env:AXIOM_TOKEN}
      x-axiom-dataset: \${env:AXIOM_DATASET_TRACES}
  otlphttp/axiom_metrics:
    compression: gzip
    endpoint: \${env:AXIOM_URL}
    headers:
      authorization: Bearer \${env:AXIOM_TOKEN}
      x-axiom-dataset: \${env:AXIOM_DATASET_METRICS}
service:
  pipelines:
    logs:
      receivers: [filelog, otlp]
      processors: [resource/tenant, resourcedetection, batch]
      exporters: [otlphttp/axiom_logs]
    traces:
      receivers: [otlp]
      processors: [resource/tenant, resourcedetection, batch]
      exporters: [otlphttp/axiom_traces]
    metrics:
      receivers: [otlp, docker_stats]
      processors: [resource/tenant, resourcedetection, batch]
      exporters: [otlphttp/axiom_metrics]
`;

const OTEL_COLLECTOR_IMAGE = 'otel/opentelemetry-collector-contrib:0.119.0';

/**
 * Builds the optional cloud-init fragments (write_files entries + runcmd lines)
 * that run the OTel Collector on the VM. Returns empty strings when Axiom is not
 * configured (AXIOM_TOKEN unset), so VMs without monitoring are unaffected.
 */
function buildCollectorFragments(cfg: VmBootstrapConfig): { writeFiles: string; runcmd: string } {
    const axiomToken = process.env['AXIOM_TOKEN'];
    if (!axiomToken || !axiomToken.trim()) {
        return { writeFiles: '', runcmd: '' };
    }
    const axiomUrl = process.env['AXIOM_URL'] ?? 'https://api.axiom.co';
    const dsLogs = process.env['AXIOM_DATASET_LOGS'] ?? 'agentfarm-logs';
    const dsTraces = process.env['AXIOM_DATASET_TRACES'] ?? 'agentfarm-traces';
    const dsMetrics = process.env['AXIOM_DATASET_METRICS'] ?? 'agentfarm-metrics';
    const configB64 = Buffer.from(OTEL_COLLECTOR_CONFIG_YAML).toString('base64');

    // Env file consumed by the collector. AF_TENANT_ID = this VM's tenant → all
    // its telemetry is tagged for per-customer filtering in the dashboard.
    const writeFiles = `  - path: /etc/agentfarm/otel.env
    permissions: '0600'
    owner: root:root
    content: |
      AXIOM_URL=${axiomUrl}
      AXIOM_TOKEN=${axiomToken}
      AXIOM_DATASET_LOGS=${dsLogs}
      AXIOM_DATASET_TRACES=${dsTraces}
      AXIOM_DATASET_METRICS=${dsMetrics}
      AF_TENANT_ID=${cfg.tenantId}
  - path: /etc/systemd/system/agentfarm-otel-collector.service
    permissions: '0644'
    owner: root:root
    content: |
      [Unit]
      Description=AgentFarm OTel Collector (Axiom)
      After=docker.service network-online.target
      Requires=docker.service
      [Service]
      Restart=always
      RestartSec=10
      ExecStartPre=-/usr/bin/docker stop agentfarm-otel-collector
      ExecStartPre=-/usr/bin/docker rm agentfarm-otel-collector
      ExecStart=/usr/bin/docker run --name agentfarm-otel-collector \\
        --env-file /etc/agentfarm/otel.env \\
        --user 0:0 \\
        --volume /etc/agentfarm/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml:ro \\
        --volume /var/lib/docker/containers:/var/lib/docker/containers:ro \\
        --volume /var/run/docker.sock:/var/run/docker.sock:ro \\
        --restart unless-stopped \\
        ${OTEL_COLLECTOR_IMAGE} \\
        --config=/etc/otelcol-contrib/config.yaml
      ExecStop=/usr/bin/docker stop -t 10 agentfarm-otel-collector
      [Install]
      WantedBy=multi-user.target
`;

    const runcmd = `  # Start the OTel Collector → Axiom (per-customer Docker log/metric shipping)
  - mkdir -p /etc/agentfarm
  - echo ${configB64} | base64 -d > /etc/agentfarm/otel-collector-config.yaml
  - docker pull ${OTEL_COLLECTOR_IMAGE}
  - systemctl daemon-reload
  - systemctl enable agentfarm-otel-collector
  - systemctl start agentfarm-otel-collector
`;

    return { writeFiles, runcmd };
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

    const collector = buildCollectorFragments(cfg);

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
      ExecStartPre=-/usr/bin/docker stop agentfarm-bot-${cfg.botId.slice(-8)}
      ExecStartPre=-/usr/bin/docker rm agentfarm-bot-${cfg.botId.slice(-8)}
      ExecStartPre=-/usr/bin/docker network rm agentfarm-net-${cfg.botId.slice(-8)}
      ExecStartPre=/usr/bin/docker network create agentfarm-net-${cfg.botId.slice(-8)}
      ExecStart=/usr/bin/docker run --name agentfarm-bot-${cfg.botId.slice(-8)} \\
        --env-file /etc/agentfarm/bot.env \\
        --publish 8080:8080 \\
        --network agentfarm-net-${cfg.botId.slice(-8)} \\
        --cpus=1.0 \\
        --memory=2g \\
        --memory-swap=2g \\
        --security-opt=no-new-privileges \\
        --cap-drop=ALL \\
        --restart unless-stopped \\
        ${image}
      ExecStop=/usr/bin/docker stop -t 10 agentfarm-bot-${cfg.botId.slice(-8)}
      [Install]
      WantedBy=multi-user.target
${collector.writeFiles}
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
${collector.runcmd}`;

    return Buffer.from(yaml).toString('base64');
}
