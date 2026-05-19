import type { ProvisioningJobRecord } from "@agentfarm/shared-types";
import type { ProvisioningExecutionContext, ProvisioningStepExecutor } from "./job-processor.js";
import { buildCloudInitScript } from "./vm-bootstrap.js";
import { vmSizeForBotCount } from "./vm-lifecycle-manager.js";
import type { VmLifecycleManager } from "./vm-lifecycle-manager.js";
import type { WorkspaceVmRepository } from "./workspace-vm-repository.js";

const envOr = (name: string, fallback: string): string => process.env[name] ?? fallback;

export class DefaultProvisioningStepExecutor implements ProvisioningStepExecutor {
    constructor(
        private readonly vmLifecycleManager?: VmLifecycleManager,
        private readonly workspaceVmRepo?: WorkspaceVmRepository,
        /** Used to record Bot.containerPort once a slot is claimed. */
        private readonly updateBotContainerPort?: (botId: string, port: number) => Promise<void>,
    ) { }

    async validateTenant(_job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        return context;
    }

    /**
     * createResources — shared VM gate:
     *
     * Case A — workspace already has a running VM:
     *   Claim a port slot (atomic increment) and reuse the VM.
     *   vmAlreadyExisted = true → bootstrapVm and startContainer will use RunCommand.
     *
     * Case B — no VM yet:
     *   Provision a new workspace-level VM. First bot container starts via cloud-init.
     *   vmAlreadyExisted = false → full bootstrap path.
     */
    async createResources(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        if (!this.vmLifecycleManager || !this.workspaceVmRepo) {
            // Local dev / CI: no real cloud resources
            return {
                ...context,
                resourceGroupName: `agentfarm-${job.tenantId.slice(-8)}-rg`,
                vmAlreadyExisted: false,
                containerPort: 8080,
            };
        }

        // --- Check for existing shared VM ---
        const existing = await this.workspaceVmRepo.findByWorkspaceId(job.workspaceId);

        if (existing && existing.status === "running") {
            // Reuse existing VM — claim a container slot and check if a resize is needed
            const { port: containerPort, activeContainerCount } =
                await this.workspaceVmRepo.claimContainerSlot(existing.id);

            if (this.updateBotContainerPort) {
                await this.updateBotContainerPort(job.botId, containerPort);
            }

            // Resize the VM if this new bot count crosses a size tier boundary
            const previousSize = existing.vmSize;
            const newSize = vmSizeForBotCount(activeContainerCount);
            if (newSize !== previousSize) {
                await this.vmLifecycleManager.resizeWorkspaceVm({
                    workspaceVm: { vmName: existing.vmName, resourceGroup: existing.resourceGroup },
                    newVmSize: newSize,
                });
                await this.workspaceVmRepo.updateVmSize(existing.id, newSize);
            }

            return {
                ...context,
                resourceGroupName: existing.resourceGroup,
                vmName: existing.vmName,
                vmPrivateIp: existing.privateIp,
                containerEndpoint: `http://${existing.privateIp}:${containerPort}`,
                workspaceVmId: existing.id,
                containerPort,
                vmAlreadyExisted: true,
            };
        }

        // --- Provision new workspace VM ---
        const result = await this.vmLifecycleManager.provisionWorkspaceVm(job);
        const containerPort = 8080; // first container always gets the default port

        const workspaceVm = await this.workspaceVmRepo.create({
            workspaceId: job.workspaceId,
            tenantId: job.tenantId,
            vmName: result.vmName,
            vmResourceId: result.vmId,
            resourceGroup: result.resourceGroupName,
            privateIp: result.privateIp,
            region: result.region,
            vmSize: envOr("AZURE_VM_SIZE", "Standard_B4ms"),
        });

        if (this.updateBotContainerPort) {
            await this.updateBotContainerPort(job.botId, containerPort);
        }

        return {
            ...context,
            resourceGroupName: result.resourceGroupName,
            vmName: result.vmName,
            vmPrivateIp: result.privateIp,
            containerEndpoint: `http://${result.privateIp}:${containerPort}`,
            workspaceVmId: workspaceVm.id,
            containerPort,
            vmAlreadyExisted: false,
        };
    }

    async bootstrapVm(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        // If the workspace VM already existed, skip bootstrap entirely —
        // the VM is already running Docker; startContainer will use RunCommand.
        if (context.vmAlreadyExisted) {
            return context;
        }

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
            vmName: context.vmName ?? `ws-${job.workspaceId.slice(-10)}-vm`,
            vmPrivateIp: context.vmPrivateIp ?? "10.0.1.10",
            bootstrapScriptBase64,
        };
    }

    async startContainer(job: ProvisioningJobRecord, context: ProvisioningExecutionContext): Promise<ProvisioningExecutionContext> {
        if (!context.vmPrivateIp) {
            throw new Error("VM private IP missing from bootstrap context");
        }

        const containerPort = context.containerPort ?? 8080;
        const containerEndpoint = `http://${context.vmPrivateIp}:${containerPort}`;

        // If the VM already existed, cloud-init won't run — start the container via Run Command
        if (context.vmAlreadyExisted && this.vmLifecycleManager && context.vmName && context.resourceGroupName) {
            await this.vmLifecycleManager.runContainerOnVm({
                workspaceVm: { vmName: context.vmName, resourceGroup: context.resourceGroupName },
                botId: job.botId,
                containerPort,
                image: envOr("AZURE_BOT_IMAGE", "agentfarm.azurecr.io/bot-runtime:v1"),
                workspaceId: job.workspaceId,
                tenantId: job.tenantId,
            });
        }
        // When vmAlreadyExisted === false, cloud-init starts the first container automatically

        return { ...context, containerEndpoint };
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

    /**
     * cleanupResources — two paths:
     *
     * Path A — other containers still running on the shared VM:
     *   Use Run Command to stop/remove only this bot's container.
     *   Decrement activeContainerCount.
     *
     * Path B — this was the last container:
     *   Remove the container, then deprovision the entire VM.
     *   Delete the WorkspaceVm record.
     */
    async cleanupResources(job: ProvisioningJobRecord, _context: ProvisioningExecutionContext): Promise<void> {
        if (!this.vmLifecycleManager || !this.workspaceVmRepo) {
            return;
        }

        const existing = await this.workspaceVmRepo.findByWorkspaceId(job.workspaceId);
        if (!existing) {
            // WorkspaceVm already cleaned up or never created; nothing to do
            return;
        }

        // Always remove this bot's container from the VM
        await this.vmLifecycleManager.removeContainerOnVm({
            workspaceVm: { vmName: existing.vmName, resourceGroup: existing.resourceGroup },
            botId: job.botId,
        });

        const remainingCount = await this.workspaceVmRepo.releaseContainerSlot(existing.id);

        if (remainingCount <= 0) {
            // Last container gone — tear down the whole VM
            await this.vmLifecycleManager.terminateAgentVM(job.botId, job.tenantId, {
                resourceGroup: existing.resourceGroup,
            });
            await this.workspaceVmRepo.delete(existing.id);
        }
    }
}
