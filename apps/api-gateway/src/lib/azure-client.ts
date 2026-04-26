/**
 * Azure ARM client factory — Task 2.2
 *
 * Provides singleton ARM clients for the provisioning worker.
 * Auth: DefaultAzureCredential (Managed Identity in production;
 *       env vars AZURE_CLIENT_ID/SECRET/TENANT_ID in dev/CI).
 *
 * Required env vars:
 *   AZURE_SUBSCRIPTION_ID   — target subscription for all provisioning
 *   AZURE_TENANT_ID         — AAD tenant (used by DefaultAzureCredential)
 *   AZURE_CLIENT_ID         — service principal / managed identity client ID
 *   AZURE_CLIENT_SECRET     — service principal secret (dev/CI only; omit in prod)
 *   AZURE_BOT_IMAGE         — fully-qualified Docker image for the bot container
 *                             e.g. agentfarmregistry.azurecr.io/bot-runtime:v1.0.0
 *   AZURE_BOT_REGISTRY_SERVER   — ACR login server (e.g. agentfarmregistry.azurecr.io)
 *   AZURE_BOT_REGISTRY_USERNAME — ACR username (for docker login)
 *   AZURE_BOT_REGISTRY_PASSWORD — ACR password / token (for docker login)
 */

import { DefaultAzureCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

export function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function getAzureSubscriptionId(): string {
    return getRequiredEnv('AZURE_SUBSCRIPTION_ID');
}

// ---------------------------------------------------------------------------
// Singleton credential (shared across all ARM clients)
// ---------------------------------------------------------------------------

let _credential: DefaultAzureCredential | undefined;

export function getAzureCredential(): DefaultAzureCredential {
    if (!_credential) {
        _credential = new DefaultAzureCredential();
    }
    return _credential;
}

// ---------------------------------------------------------------------------
// ARM client singletons
// ---------------------------------------------------------------------------

let _resourceClient: ResourceManagementClient | undefined;
let _computeClient: ComputeManagementClient | undefined;
let _networkClient: NetworkManagementClient | undefined;

export function getResourceClient(): ResourceManagementClient {
    if (!_resourceClient) {
        _resourceClient = new ResourceManagementClient(
            getAzureCredential(),
            getAzureSubscriptionId(),
        );
    }
    return _resourceClient;
}

export function getComputeClient(): ComputeManagementClient {
    if (!_computeClient) {
        _computeClient = new ComputeManagementClient(
            getAzureCredential(),
            getAzureSubscriptionId(),
        );
    }
    return _computeClient;
}

export function getNetworkClient(): NetworkManagementClient {
    if (!_networkClient) {
        _networkClient = new NetworkManagementClient(
            getAzureCredential(),
            getAzureSubscriptionId(),
        );
    }
    return _networkClient;
}

// ---------------------------------------------------------------------------
// Provisioning config helpers
// ---------------------------------------------------------------------------

/** Map runtimeTier to Azure VM SKU. */
export function vmSkuForTier(runtimeTier: string): string {
    const SKU_MAP: Record<string, string> = {
        standard: 'Standard_B2s',
        pro: 'Standard_D2s_v3',
        enterprise: 'Standard_D4s_v3',
    };
    return SKU_MAP[runtimeTier] ?? 'Standard_B2s';
}

/** Default Azure region for new resource groups. Override with AZURE_REGION env. */
export function getAzureRegion(): string {
    return process.env['AZURE_REGION'] ?? 'eastus2';
}
