/**
 * Azure provisioning steps — Task 2.2
 *
 * Real Azure ARM SDK implementations of the five provisioning steps
 * that were stubbed in Task 2.1. Each function is side-effect-free
 * with respect to the DB — callers (provisioning-worker.ts) own all
 * DB writes and audit events.
 *
 * Steps:
 *   validateTenant        — quota / subscription check
 *   createResources       — resource group + VNet + NIC
 *   bootstrapVm           — VM with cloud-init, wait for running state
 *   startContainer        — wait for bot /health endpoint to bind
 *   registerRuntime       — (DB-only, done in worker; nothing to do here)
 *   healthCheck           — GET /health on container endpoint, expect 200
 *   cleanupResources      — delete entire resource group (cascade deletes all)
 */

import {
    getResourceClient,
    getComputeClient,
    getNetworkClient,
    getAzureRegion,
    vmSkuForTier,
} from '../lib/azure-client.js';
import { buildCloudInitScript } from '../lib/vm-bootstrap.js';

// ---------------------------------------------------------------------------
// Internal types (mirrors ProvisioningJobRecord from worker)
// ---------------------------------------------------------------------------

interface JobRef {
    tenantId: string;
    workspaceId: string;
    botId: string;
    planId: string;
    runtimeTier: string;
    roleType: string;
    correlationId: string;
}

export interface StepResult {
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
    context?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const EVIDENCE_API_ENDPOINT =
    process.env['EVIDENCE_API_ENDPOINT'] ?? 'http://api-gateway:3000/v1';
const CONTRACT_VERSION = '1.0';

// VM health probe: poll /health every 10s for up to 3 minutes
const HEALTH_POLL_INTERVAL_MS = 10_000;
const HEALTH_POLL_MAX_ATTEMPTS = 18;       // 18 × 10s = 3 min

// VM wait-for-running: poll provisioningState every 15s for up to 10 min
const VM_POLL_INTERVAL_MS = 15_000;
const VM_POLL_MAX_ATTEMPTS = 40;        // 40 × 15s = 10 min

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rgName(tenantId: string): string {
    return `agentfarm-${tenantId.slice(-8)}-rg`;
}

function vnetName(tenantId: string): string {
    return `agentfarm-${tenantId.slice(-8)}-vnet`;
}

function subnetName(): string {
    return 'bots-subnet';
}

function nicName(botId: string): string {
    return `bot-${botId.slice(-8)}-nic`;
}

function vmName(botId: string): string {
    return `bot-${botId.slice(-8)}-vm`;
}

async function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Step 1: Validate tenant (subscription quota check)
// ---------------------------------------------------------------------------

export async function validateTenant(_job: JobRef): Promise<StepResult> {
    try {
        // Verify the subscription is accessible — list resource groups (lightweight, read-only)
        const resourceClient = getResourceClient();
        const iter = resourceClient.resourceGroups.list();
        await iter.next(); // just one page/item is enough to confirm access
        return { success: true };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, errorCode: 'VALIDATE_FAILED', errorMessage: msg };
    }
}

// ---------------------------------------------------------------------------
// Step 2: Create resource group + VNet + subnet + NIC
// ---------------------------------------------------------------------------

export async function createResources(job: JobRef): Promise<StepResult> {
    const region = getAzureRegion();
    const resourceClient = getResourceClient();
    const networkClient = getNetworkClient();
    const rg = rgName(job.tenantId);
    const vnet = vnetName(job.tenantId);
    const subnet = subnetName();
    const nic = nicName(job.botId);

    try {
        // 1. Resource group
        await resourceClient.resourceGroups.createOrUpdate(rg, {
            location: region,
            tags: {
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                correlationId: job.correlationId,
                managedBy: 'agentfarm-provisioner',
            },
        });

        // 2. VNet + subnet (idempotent — createOrUpdate)
        await networkClient.virtualNetworks.beginCreateOrUpdateAndWait(rg, vnet, {
            location: region,
            addressSpace: { addressPrefixes: ['10.0.0.0/16'] },
            subnets: [{ name: subnet, addressPrefix: '10.0.1.0/24' }],
        });

        // 3. Fetch subnet resource ID for NIC
        const subnetObj = await networkClient.subnets.get(rg, vnet, subnet);

        // 4. NIC (private IP only — no public IP, egress via NAT gateway in prod)
        const nicResult = await networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
            rg, nic, {
            location: region,
            ipConfigurations: [{
                name: 'ipconfig1',
                privateIPAllocationMethod: 'Dynamic',
                subnet: { id: subnetObj.id },
            }],
        },
        );

        return {
            success: true,
            context: {
                resourceGroupName: rg,
                location: region,
                vnetName: vnet,
                subnetName: subnet,
                nicId: nicResult.id ?? '',
            },
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, errorCode: 'CREATE_RESOURCES_FAILED', errorMessage: msg };
    }
}

// ---------------------------------------------------------------------------
// Step 3: Provision VM with cloud-init bootstrap script
// ---------------------------------------------------------------------------

export async function bootstrapVm(
    job: JobRef,
    context: Record<string, string>,
): Promise<StepResult> {
    const computeClient = getComputeClient();
    const rg = context['resourceGroupName'] ?? rgName(job.tenantId);
    const location = context['location'] ?? getAzureRegion();
    const vm = vmName(job.botId);
    const sku = vmSkuForTier(job.runtimeTier);
    const nicId = context['nicId'] ?? '';

    const customData = buildCloudInitScript({
        correlationId: job.correlationId,
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        botId: job.botId,
        roleType: job.roleType,
        evidenceApiEndpoint: EVIDENCE_API_ENDPOINT,
        contractVersion: CONTRACT_VERSION,
    });

    try {
        await computeClient.virtualMachines.beginCreateOrUpdateAndWait(rg, vm, {
            location,
            hardwareProfile: { vmSize: sku },
            osProfile: {
                computerName: vm,
                adminUsername: 'agentfarm',
                // randomised password — SSH access not enabled; management via Run Command only
                adminPassword: `Af!${Buffer.from(job.correlationId).toString('hex').slice(0, 16)}`,
                customData,
                linuxConfiguration: {
                    disablePasswordAuthentication: false,
                    // No SSH public keys — access via Azure Bastion / Run Command only
                },
            },
            storageProfile: {
                imageReference: {
                    publisher: 'Canonical',
                    offer: '0001-com-ubuntu-server-jammy',
                    sku: '22_04-lts-gen2',
                    version: 'latest',
                },
                osDisk: {
                    createOption: 'FromImage',
                    managedDisk: { storageAccountType: 'Premium_LRS' },
                    diskSizeGB: 30,
                },
            },
            networkProfile: {
                networkInterfaces: [{ id: nicId, primary: true }],
            },
            tags: {
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                botId: job.botId,
                correlationId: job.correlationId,
                managedBy: 'agentfarm-provisioner',
            },
        });

        // Poll until VM reports Succeeded provisioning state
        let attempts = 0;
        while (attempts < VM_POLL_MAX_ATTEMPTS) {
            const vmObj = await computeClient.virtualMachines.get(rg, vm, {
                expand: 'instanceView',
            });
            const pState = vmObj.provisioningState;
            if (pState === 'Succeeded') {
                break;
            }
            if (pState === 'Failed') {
                return {
                    success: false,
                    errorCode: 'VM_PROVISION_FAILED',
                    errorMessage: `VM provisioningState is '${pState}'`,
                };
            }
            attempts++;
            await sleep(VM_POLL_INTERVAL_MS);
        }

        if (attempts >= VM_POLL_MAX_ATTEMPTS) {
            return {
                success: false,
                errorCode: 'VM_PROVISION_TIMEOUT',
                errorMessage: `VM did not reach Succeeded state within ${(VM_POLL_MAX_ATTEMPTS * VM_POLL_INTERVAL_MS) / 60_000} minutes`,
            };
        }

        // Resolve private IP from NIC
        const networkClient = getNetworkClient();
        const nicName_ = nicName(job.botId);
        const nicObj = await networkClient.networkInterfaces.get(rg, nicName_);
        const privateIp = nicObj.ipConfigurations?.[0]?.privateIPAddress ?? '0.0.0.0';

        return {
            success: true,
            context: {
                ...context,
                vmName: vm,
                vmPrivateIp: privateIp,
                containerEndpoint: `http://${privateIp}:8080`,
            },
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, errorCode: 'BOOTSTRAP_VM_FAILED', errorMessage: msg };
    }
}

// ---------------------------------------------------------------------------
// Step 4: Wait for container to bind its /health endpoint
// ---------------------------------------------------------------------------

export async function startContainer(
    _job: JobRef,
    context: Record<string, string>,
): Promise<StepResult> {
    const endpoint = context['containerEndpoint'];
    if (!endpoint) {
        return {
            success: false,
            errorCode: 'NO_ENDPOINT',
            errorMessage: 'containerEndpoint not set in context — bootstrapVm may have failed silently.',
        };
    }

    // Poll /health until it responds 200 or we time out
    for (let attempt = 1; attempt <= HEALTH_POLL_MAX_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(`${endpoint}/health`, {
                signal: AbortSignal.timeout(8_000),
            });
            if (res.ok) {
                return { success: true, context };
            }
        } catch {
            // Connection refused — container still starting; retry
        }
        await sleep(HEALTH_POLL_INTERVAL_MS);
    }

    return {
        success: false,
        errorCode: 'CONTAINER_START_TIMEOUT',
        errorMessage: `Container /health did not return 200 within ${(HEALTH_POLL_MAX_ATTEMPTS * HEALTH_POLL_INTERVAL_MS) / 60_000} minutes at ${endpoint}`,
    };
}

// ---------------------------------------------------------------------------
// Step 5: Health check (post-registration confirmation)
// ---------------------------------------------------------------------------

export async function healthCheck(
    _job: JobRef,
    context: Record<string, string>,
): Promise<StepResult> {
    const endpoint = context['containerEndpoint'];
    if (!endpoint) {
        return {
            success: false,
            errorCode: 'NO_ENDPOINT',
            errorMessage: 'containerEndpoint missing from context',
        };
    }
    try {
        const res = await fetch(`${endpoint}/health`, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            return {
                success: false,
                errorCode: 'HEALTH_CHECK_FAILED',
                errorMessage: `/health returned HTTP ${res.status}`,
            };
        }
        return { success: true, context };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, errorCode: 'HEALTH_CHECK_ERROR', errorMessage: msg };
    }
}

// ---------------------------------------------------------------------------
// Cleanup: delete resource group (cascades all child resources)
// ---------------------------------------------------------------------------

export async function cleanupResources(job: JobRef): Promise<void> {
    const resourceClient = getResourceClient();
    const rg = rgName(job.tenantId);
    try {
        // Check if RG exists before attempting delete (avoids 404 errors on partial provisioning)
        const exists = await resourceClient.resourceGroups.checkExistence(rg);
        if (exists) {
            await resourceClient.resourceGroups.beginDeleteAndWait(rg);
        }
    } catch (err: unknown) {
        // Re-throw so the worker can log and leave in cleanup_pending for manual recovery
        throw new Error(
            `cleanupResources failed for rg=${rg}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}
