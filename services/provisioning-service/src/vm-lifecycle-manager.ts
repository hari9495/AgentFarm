/**
 * vm-lifecycle-manager.ts — Sprint 10: VM Lifecycle Management
 *
 * Provides provisionAgentVM() and terminateAgentVM() with an injectable
 * AzureArmAdapter so tests can stub the ARM calls without hitting Azure.
 *
 * Auth: uses Azure ARM REST API with a bearer token obtained via the
 *       AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET env vars.
 *       In production the pod uses Managed Identity (no secret needed).
 */

import type { ProvisioningJobRecord } from "@agentfarm/shared-types";
import { CONTRACT_VERSIONS } from "@agentfarm/shared-types";
import type { VMConfig, VMProvisionResult, VMTerminateResult, VMDeletedResource } from "@agentfarm/shared-types";

// ---------------------------------------------------------------------------
// Azure ARM adapter interface (injectable for testing)
// ---------------------------------------------------------------------------

export interface AzureArmAdapter {
    /** Returns a bearer token for the ARM scope */
    getToken(): Promise<string>;
    /** Creates or ensures a resource group exists */
    ensureResourceGroup(token: string, subscriptionId: string, resourceGroup: string, region: string, tags: Record<string, string>): Promise<void>;
    /** Creates a VM with the given config; returns the VM resource ID and private IP */
    createVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string, config: {
        region: string;
        vmSize: string;
        imageUrn: string;
        tags: Record<string, string>;
    }): Promise<{ vmId: string; privateIp: string }>;
    /** Finds VMs tagged with botId and tenantId; returns their names */
    findVmsByTags(token: string, subscriptionId: string, resourceGroup: string, tags: { botId: string; tenantId: string }): Promise<string[]>;
    /** Deallocates and deletes a VM; returns deleted resource types */
    deleteVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string): Promise<VMDeletedResource[]>;
    /**
     * Runs a shell script on an existing VM via Azure VM Run Command (fire-and-forget).
     * Used to start/stop additional containers on a shared workspace VM.
     */
    runCommandOnVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string, script: string[]): Promise<void>;
    /**
     * Resizes a VM in-place (PATCH hardware profile).
     * Azure allows live resize within the same family; cross-family requires deallocation
     * but the B-series sizes used here are within the same cluster.
     */
    resizeVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string, newVmSize: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Azure REST adapter (uses fetch + ARM REST API)
// ---------------------------------------------------------------------------

const ARM_ENDPOINT = "https://management.azure.com";
const TOKEN_ENDPOINT = (tenantId: string) =>
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

export class DefaultAzureArmAdapter implements AzureArmAdapter {
    constructor(
        private readonly env: NodeJS.ProcessEnv = process.env,
    ) { }

    async getToken(): Promise<string> {
        const tenantId = this.env["AZURE_TENANT_ID"] ?? "";
        const clientId = this.env["AZURE_CLIENT_ID"] ?? "";
        const clientSecret = this.env["AZURE_CLIENT_SECRET"] ?? "";

        // Managed Identity path (no secret needed when running on Azure)
        if (!clientSecret) {
            const miEndpoint = this.env["IDENTITY_ENDPOINT"];
            const miHeader = this.env["IDENTITY_HEADER"];
            if (miEndpoint && miHeader) {
                const res = await fetch(
                    `${miEndpoint}?api-version=2019-08-01&resource=https://management.azure.com/`,
                    { headers: { "X-IDENTITY-TOKEN": miHeader } },
                );
                const data = (await res.json()) as { access_token?: string };
                if (!data.access_token) throw new Error("Managed Identity token fetch failed");
                return data.access_token;
            }
        }

        // Service-principal path
        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: "https://management.azure.com/.default",
        });
        const res = await fetch(TOKEN_ENDPOINT(tenantId), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        const data = (await res.json()) as { access_token?: string };
        if (!data.access_token) throw new Error("ARM token fetch failed");
        return data.access_token;
    }

    async ensureResourceGroup(token: string, subscriptionId: string, resourceGroup: string, region: string, tags: Record<string, string>): Promise<void> {
        const url = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}?api-version=2021-04-01`;
        const res = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ location: region, tags }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ensureResourceGroup failed: ${res.status} ${text}`);
        }
    }

    async createVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string, config: {
        region: string;
        vmSize: string;
        imageUrn: string;
        tags: Record<string, string>;
    }): Promise<{ vmId: string; privateIp: string }> {
        const [publisher, offer, sku] = config.imageUrn.split(":");
        const nicName = `${vmName}-nic`;
        const ipName = `${vmName}-ip`;

        // 1. Create public IP (needed for NIC)
        const ipUrl = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Network/publicIPAddresses/${encodeURIComponent(ipName)}?api-version=2023-05-01`;
        const ipRes = await fetch(ipUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ location: config.region, tags: config.tags, properties: { publicIPAllocationMethod: "Dynamic" } }),
        });
        if (!ipRes.ok) throw new Error(`Create public IP failed: ${ipRes.status}`);

        // 2. Create NIC
        const nicUrl = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Network/networkInterfaces/${encodeURIComponent(nicName)}?api-version=2023-05-01`;
        const nicRes = await fetch(nicUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                location: config.region,
                tags: config.tags,
                properties: {
                    ipConfigurations: [{
                        name: "ipconfig1",
                        properties: {
                            publicIPAddress: { id: `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${ipName}` },
                            privateIPAllocationMethod: "Dynamic",
                        },
                    }],
                },
            }),
        });
        if (!nicRes.ok) throw new Error(`Create NIC failed: ${nicRes.status}`);
        const nicData = (await nicRes.json()) as { properties?: { ipConfigurations?: Array<{ properties?: { privateIPAddress?: string } }> } };
        const privateIp = nicData.properties?.ipConfigurations?.[0]?.properties?.privateIPAddress ?? "10.0.0.1";

        // 3. Create VM
        const vmUrl = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vmName)}?api-version=2023-07-01`;
        const vmRes = await fetch(vmUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                location: config.region,
                tags: config.tags,
                properties: {
                    hardwareProfile: { vmSize: config.vmSize },
                    storageProfile: {
                        imageReference: { publisher, offer, sku, version: "latest" },
                        osDisk: { createOption: "FromImage", managedDisk: { storageAccountType: "Standard_LRS" } },
                    },
                    osProfile: {
                        computerName: vmName.slice(0, 15),
                        adminUsername: "agentfarm",
                        adminPassword: `Af!${Date.now()}x`,
                    },
                    networkProfile: {
                        networkInterfaces: [{
                            id: `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkInterfaces/${nicName}`,
                        }],
                    },
                },
            }),
        });
        if (!vmRes.ok) {
            const text = await vmRes.text();
            throw new Error(`Create VM failed: ${vmRes.status} ${text}`);
        }
        const vmData = (await vmRes.json()) as { id?: string };
        return { vmId: vmData.id ?? `${resourceGroup}/${vmName}`, privateIp };
    }

    async findVmsByTags(token: string, subscriptionId: string, resourceGroup: string, tags: { botId: string; tenantId: string }): Promise<string[]> {
        const url = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Compute/virtualMachines?api-version=2023-07-01`;
        const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
        if (!res.ok) return [];
        const data = (await res.json()) as { value?: Array<{ name: string; tags?: Record<string, string> }> };
        return (data.value ?? [])
            .filter(vm => vm.tags?.["botId"] === tags.botId && vm.tags?.["tenantId"] === tags.tenantId)
            .map(vm => vm.name);
    }

    async deleteVm(token: string, subscriptionId: string, resourceGroup: string, vmName: string): Promise<VMDeletedResource[]> {
        const deleted: VMDeletedResource[] = [];
        const base = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers`;

        const del = async (url: string): Promise<boolean> => {
            const res = await fetch(url, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` },
            });
            return res.ok || res.status === 404;
        };

        // Delete VM first
        if (await del(`${base}/Microsoft.Compute/virtualMachines/${encodeURIComponent(vmName)}?api-version=2023-07-01`)) {
            deleted.push("vm");
        }
        // Delete NIC
        if (await del(`${base}/Microsoft.Network/networkInterfaces/${encodeURIComponent(`${vmName}-nic`)}?api-version=2023-05-01`)) {
            deleted.push("nic");
        }
        // Delete public IP
        if (await del(`${base}/Microsoft.Network/publicIPAddresses/${encodeURIComponent(`${vmName}-ip`)}?api-version=2023-05-01`)) {
            deleted.push("public_ip");
        }
        // Delete OS disk
        if (await del(`${base}/Microsoft.Compute/disks/${encodeURIComponent(`${vmName}_osDisk`)}?api-version=2023-07-03`)) {
            deleted.push("os_disk");
        }

        return deleted;
    }

    async runCommandOnVm(
        token: string,
        subscriptionId: string,
        resourceGroup: string,
        vmName: string,
        script: string[],
    ): Promise<void> {
        const url = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vmName)}/runCommand?api-version=2023-07-01`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ commandId: "RunShellScript", script }),
        });
        // 202 = accepted (async operation); 200 = completed inline — both are fine
        if (!res.ok && res.status !== 202) {
            const text = await res.text();
            throw new Error(`runCommandOnVm failed: ${res.status} ${text}`);
        }
    }

    async resizeVm(
        token: string,
        subscriptionId: string,
        resourceGroup: string,
        vmName: string,
        newVmSize: string,
    ): Promise<void> {
        const url = `${ARM_ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vmName)}?api-version=2023-07-01`;
        const res = await fetch(url, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { hardwareProfile: { vmSize: newVmSize } } }),
        });
        if (!res.ok && res.status !== 202) {
            const text = await res.text();
            throw new Error(`resizeVm failed: ${res.status} ${text}`);
        }
    }
}

// ---------------------------------------------------------------------------
// VM size tiers — maps active bot count to the appropriate VM SKU.
// The VM is resized automatically as the customer adds more bots.
// ---------------------------------------------------------------------------

export const VM_SIZE_TIERS: ReadonlyArray<{ minBots: number; vmSize: string }> = [
    { minBots: 1, vmSize: "Standard_B2s" },   // 1 bot  — 2 vCPU / 4 GB
    { minBots: 2, vmSize: "Standard_B4ms" },  // 2–3 bots — 4 vCPU / 16 GB
    { minBots: 4, vmSize: "Standard_B8ms" },  // 4+ bots — 8 vCPU / 32 GB
];

/** Returns the correct VM size for a given number of active containers. */
export function vmSizeForBotCount(botCount: number): string {
    let size = VM_SIZE_TIERS[0]!.vmSize;
    for (const tier of VM_SIZE_TIERS) {
        if (botCount >= tier.minBots) size = tier.vmSize;
    }
    return size;
}

// ---------------------------------------------------------------------------
// VM Lifecycle Manager
// ---------------------------------------------------------------------------

export class VmLifecycleManager {
    constructor(
        private readonly adapter: AzureArmAdapter,
        private readonly env: NodeJS.ProcessEnv = process.env,
    ) { }

    async provisionAgentVM(
        job: ProvisioningJobRecord,
        config: Partial<VMConfig> = {},
    ): Promise<VMProvisionResult> {
        const subscriptionId = config.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const region = config.region ?? this.env["AZURE_REGION"] ?? "eastus2";
        const vmSize = config.vmSize ?? this.env["AZURE_VM_SIZE"] ?? "Standard_B2s";
        const imageUrn = config.imageUrn ?? this.env["AZURE_VM_IMAGE"] ?? "Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest";
        const agentImage = config.agentImage ?? this.env["AZURE_BOT_IMAGE"] ?? "agentfarm.azurecr.io/bot-runtime:v1";

        const resourceGroup = config.resourceGroup ?? this.env["AZURE_RESOURCE_GROUP"] ?? `agentfarm-${job.tenantId.slice(-8)}-rg`;
        const vmName = `bot-${job.botId.slice(-8)}-vm`;

        const tags: Record<string, string> = {
            botId: job.botId,
            tenantId: job.tenantId,
            workspaceId: job.workspaceId,
            purpose: "agentfarm-runtime",
            ...(config.tags ?? {}),
        };

        const token = await this.adapter.getToken();
        await this.adapter.ensureResourceGroup(token, subscriptionId, resourceGroup, region, tags);

        const { vmId, privateIp } = await this.adapter.createVm(token, subscriptionId, resourceGroup, vmName, {
            region,
            vmSize,
            imageUrn,
            tags,
        });

        return {
            contractVersion: CONTRACT_VERSIONS.VM_LIFECYCLE,
            vmId,
            resourceGroupName: resourceGroup,
            vmName,
            privateIp,
            containerEndpoint: `http://${privateIp}:8080`,
            managedIdentityId: `${vmId}/identity`,
            region,
            provisionedAt: new Date().toISOString(),
        };
    }

    async terminateAgentVM(
        botId: string,
        tenantId: string,
        opts: {
            subscriptionId?: string;
            resourceGroup?: string;
        } = {},
    ): Promise<VMTerminateResult> {
        const subscriptionId = opts.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const resourceGroup = opts.resourceGroup ?? this.env["AZURE_RESOURCE_GROUP"] ?? `agentfarm-${tenantId.slice(-8)}-rg`;

        try {
            const token = await this.adapter.getToken();
            const vmNames = await this.adapter.findVmsByTags(token, subscriptionId, resourceGroup, { botId, tenantId });

            const allDeleted: VMDeletedResource[] = [];
            for (const vmName of vmNames) {
                const deleted = await this.adapter.deleteVm(token, subscriptionId, resourceGroup, vmName);
                allDeleted.push(...deleted);
            }

            return {
                contractVersion: CONTRACT_VERSIONS.VM_LIFECYCLE,
                botId,
                tenantId,
                success: true,
                resourcesDeleted: allDeleted,
                terminatedAt: new Date().toISOString(),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                contractVersion: CONTRACT_VERSIONS.VM_LIFECYCLE,
                botId,
                tenantId,
                success: false,
                resourcesDeleted: [],
                terminatedAt: new Date().toISOString(),
                errorMessage: message,
            };
        }
    }

    /**
     * Provisions a shared workspace-level VM.
     * The VM is tagged with workspaceId (not botId); the first bot's container
     * is started via cloud-init so no extra Run Command is needed.
     */
    async provisionWorkspaceVm(
        job: ProvisioningJobRecord,
        config: Partial<VMConfig> = {},
    ): Promise<VMProvisionResult> {
        const subscriptionId = config.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const region = config.region ?? this.env["AZURE_REGION"] ?? "eastus2";
        // Start small; the VM is resized automatically as more bots join the workspace
        const vmSize = config.vmSize ?? this.env["AZURE_VM_SIZE"] ?? "Standard_B2s";
        const imageUrn = config.imageUrn ?? this.env["AZURE_VM_IMAGE"] ?? "Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest";
        const resourceGroup = config.resourceGroup ?? this.env["AZURE_RESOURCE_GROUP"] ?? `agentfarm-${job.tenantId.slice(-8)}-rg`;
        // VM name keyed on workspaceId — one VM per workspace
        const vmName = `ws-${job.workspaceId.slice(-10)}-vm`;

        const tags: Record<string, string> = {
            workspaceId: job.workspaceId,
            tenantId: job.tenantId,
            purpose: "agentfarm-shared-runtime",
            ...(config.tags ?? {}),
        };

        const token = await this.adapter.getToken();
        await this.adapter.ensureResourceGroup(token, subscriptionId, resourceGroup, region, tags);
        const { vmId, privateIp } = await this.adapter.createVm(token, subscriptionId, resourceGroup, vmName, {
            region,
            vmSize,
            imageUrn,
            tags,
        });

        return {
            contractVersion: CONTRACT_VERSIONS.VM_LIFECYCLE,
            vmId,
            resourceGroupName: resourceGroup,
            vmName,
            privateIp,
            containerEndpoint: `http://${privateIp}:8080`,
            managedIdentityId: `${vmId}/identity`,
            region,
            provisionedAt: new Date().toISOString(),
        };
    }

    /**
     * Starts a new bot container on an already-running workspace VM.
     * Uses Azure VM Run Command (fire-and-forget; health check validates startup).
     */
    async runContainerOnVm(params: {
        workspaceVm: { vmName: string; resourceGroup: string };
        botId: string;
        containerPort: number;
        image: string;
        workspaceId: string;
        tenantId: string;
        subscriptionId?: string;
    }): Promise<void> {
        const subscriptionId = params.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const { vmName, resourceGroup } = params.workspaceVm;

        const script = [
            `docker pull ${params.image}`,
            `docker run -d --name bot-${params.botId} --restart=unless-stopped \\`,
            `  -p ${params.containerPort}:8080 \\`,
            `  -e BOT_ID=${params.botId} \\`,
            `  -e WORKSPACE_ID=${params.workspaceId} \\`,
            `  -e TENANT_ID=${params.tenantId} \\`,
            `  ${params.image}`,
        ];

        const token = await this.adapter.getToken();
        await this.adapter.runCommandOnVm(token, subscriptionId, resourceGroup, vmName, script);
    }

    /**
     * Resizes the shared workspace VM to the correct tier for the new bot count.
     * Uses an in-place PATCH (no deallocation needed within the B-series family).
     * Called automatically in createResources when a tier boundary is crossed.
     */
    async resizeWorkspaceVm(params: {
        workspaceVm: { vmName: string; resourceGroup: string };
        newVmSize: string;
        subscriptionId?: string;
    }): Promise<void> {
        const subscriptionId = params.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const { vmName, resourceGroup } = params.workspaceVm;
        const token = await this.adapter.getToken();
        await this.adapter.resizeVm(token, subscriptionId, resourceGroup, vmName, params.newVmSize);
    }

    /**
     * Stops and removes a bot container from a shared workspace VM.
     * Called when a single bot is terminated while the VM stays alive.
     */
    async removeContainerOnVm(params: {
        workspaceVm: { vmName: string; resourceGroup: string };
        botId: string;
        subscriptionId?: string;
    }): Promise<void> {
        const subscriptionId = params.subscriptionId ?? this.env["AZURE_SUBSCRIPTION_ID"] ?? "";
        const { vmName, resourceGroup } = params.workspaceVm;

        const script = [
            `docker stop bot-${params.botId} 2>/dev/null || true`,
            `docker rm   bot-${params.botId} 2>/dev/null || true`,
        ];

        const token = await this.adapter.getToken();
        await this.adapter.runCommandOnVm(token, subscriptionId, resourceGroup, vmName, script);
    }
}
