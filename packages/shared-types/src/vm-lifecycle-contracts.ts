// vm-lifecycle-contracts.ts — Sprint 10 (VM Lifecycle Management)
// Frozen 2026-05-22

/**
 * Configuration passed to the VM provisioner when creating a new agent VM.
 */
export interface VMConfig {
    subscriptionId: string;
    resourceGroup: string;
    region: string;
    vmSize: string;
    imageUrn: string;
    /** Docker image for the agent-runtime container */
    agentImage: string;
    /** Tags applied to all Azure resources created for this agent */
    tags: {
        botId: string;
        tenantId: string;
        workspaceId: string;
        purpose: 'agentfarm-runtime';
        [key: string]: string;
    };
}

/**
 * Result returned when a VM is successfully provisioned.
 */
export interface VMProvisionResult {
    contractVersion: string; // CONTRACT_VERSIONS.VM_LIFECYCLE
    vmId: string;
    resourceGroupName: string;
    vmName: string;
    privateIp: string;
    containerEndpoint: string;
    managedIdentityId: string;
    region: string;
    provisionedAt: string;
}

/**
 * Describes each Azure resource that was deleted during VM teardown.
 */
export type VMDeletedResource =
    | 'vm'
    | 'nic'
    | 'os_disk'
    | 'data_disk'
    | 'public_ip'
    | 'nsg'
    | 'vnet'
    | 'storage_account'
    | 'resource_group';

/**
 * Result returned when a VM is successfully terminated.
 */
export interface VMTerminateResult {
    contractVersion: string; // CONTRACT_VERSIONS.VM_LIFECYCLE
    botId: string;
    tenantId: string;
    success: boolean;
    resourcesDeleted: VMDeletedResource[];
    terminatedAt: string;
    /** Populated if success is false */
    errorMessage?: string;
}
