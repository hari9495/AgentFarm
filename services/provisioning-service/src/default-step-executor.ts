import type { ProvisioningJobRecord } from "@agentfarm/shared-types";
import type { ProvisioningExecutionContext, ProvisioningStepExecutor } from "./job-processor.js";
import { buildCloudInitScript } from "./vm-bootstrap.js";

const envOr = (name: string, fallback: string): string => process.env[name] ?? fallback;

export class DefaultProvisioningStepExecutor implements ProvisioningStepExecutor {
    async validateTenant(_job: ProvisioningJobRecord): Promise<void> {
        // Task 2.2 keeps validation lightweight in this service; deep checks belong to cloud adapters.
    }

    async createResources(job: ProvisioningJobRecord): Promise<ProvisioningExecutionContext> {
        return {
            resourceGroupName: `agentfarm-${job.tenantId.slice(-8)}-rg`,
        };
    }

    async bootstrapVm(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        const bootstrapScriptBase64 = buildCloudInitScript({
            correlationId: job.correlationId,
            tenantId: job.tenantId,
            workspaceId: job.workspaceId,
            botId: job.botId,
            roleType: job.roleType,
            image: envOr("AZURE_BOT_IMAGE", "agentfarm.azurecr.io/bot-runtime:v1"),
            registryServer: envOr("AZURE_BOT_REGISTRY_SERVER", "agentfarm.azurecr.io"),
            registryUsername: envOr("AZURE_BOT_REGISTRY_USERNAME", "agentfarm"),
            registryPasswordSecretRef: envOr("AZURE_BOT_REGISTRY_PASSWORD_REF", "ref:kv://agentfarm/registry-password"),
            evidenceApiEndpoint: envOr("EVIDENCE_API_ENDPOINT", "http://api-gateway:3000/v1"),
            contractVersion: "1.0",
            runtimePolicyPackVersion: "mvp-v1",
            region: envOr("AZURE_REGION", "eastus2"),
        });

        return {
            ...context,
            vmName: `bot-${job.botId.slice(-8)}-vm`,
            vmPrivateIp: "10.0.1.10",
            bootstrapScriptBase64,
        };
    }

    async startContainer(_job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        if (!context.vmPrivateIp) {
            throw new Error("VM private IP missing from bootstrap context");
        }
        return {
            ...context,
            containerEndpoint: `http://${context.vmPrivateIp}:8080`,
        };
    }

    async registerRuntime(_job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        if (!context.containerEndpoint) {
            throw new Error("Container endpoint missing before runtime registration");
        }
        return context;
    }

    async healthCheck(_job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        if (!context.containerEndpoint) {
            throw new Error("Container endpoint missing before health check");
        }
        return context;
    }

    async cleanupResources(_job: ProvisioningJobRecord): Promise<void> {
        // Task 2.3 cleanup workflow is implemented by cloud adapters; this default executor
        // intentionally no-ops while still exercising cleanup plan propagation in tests.
    }
}
