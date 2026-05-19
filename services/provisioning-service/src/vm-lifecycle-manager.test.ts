import test from "node:test";
import assert from "node:assert/strict";
import { VmLifecycleManager } from "./vm-lifecycle-manager.js";
import type { AzureArmAdapter } from "./vm-lifecycle-manager.js";
import type { VMDeletedResource } from "@agentfarm/shared-types";
import { CONTRACT_VERSIONS } from "@agentfarm/shared-types";
import type { ProvisioningJobRecord } from "@agentfarm/shared-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<ProvisioningJobRecord> = {}): ProvisioningJobRecord {
    return {
        id: "job-1",
        contractVersion: "1.0.0",
        tenantId: "tenant-abc12345",
        workspaceId: "ws-xyz67890",
        botId: "bot-qrstuv12",
        planId: "plan-starter",
        runtimeTier: "standard",
        roleType: "developer",
        correlationId: "corr-0001",
        triggerSource: "signup_complete",
        status: "creating_resources",
        requestedAt: "2026-05-22T10:00:00.000Z",
        requestedBy: "system",
        ...overrides,
    };
}

function makeAdapter(overrides: Partial<AzureArmAdapter> = {}): AzureArmAdapter {
    return {
        getToken: async () => "test-token",
        ensureResourceGroup: async () => undefined,
        createVm: async (_token: string, _sub: string, rg: string, vmName: string) => ({
            vmId: `/subscriptions/sub-1/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${vmName}`,
            privateIp: "10.0.1.100",
        }),
        findVmsByTags: async () => ["bot-qrstuv12-vm"],
        deleteVm: async (): Promise<VMDeletedResource[]> => ["vm", "nic", "os_disk", "public_ip"],
        runCommandOnVm: async () => undefined,
        resizeVm: async () => undefined,
        ...overrides,
    };
}

const TEST_ENV: NodeJS.ProcessEnv = {
    AZURE_SUBSCRIPTION_ID: "sub-1",
    AZURE_RESOURCE_GROUP: "agentfarm-rg",
    AZURE_REGION: "eastus2",
    AZURE_VM_SIZE: "Standard_B2s",
    AZURE_VM_IMAGE: "Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest",
    AZURE_BOT_IMAGE: "agentfarm.azurecr.io/bot-runtime:v1",
};

// ---------------------------------------------------------------------------
// provisionAgentVM tests
// ---------------------------------------------------------------------------

test("provisionAgentVM returns a VMProvisionResult with correct contract version", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.provisionAgentVM(makeJob());

    assert.equal(result.contractVersion, CONTRACT_VERSIONS.VM_LIFECYCLE);
});

test("provisionAgentVM populates vmName from botId suffix", async () => {
    const job = makeJob({ botId: "bot-qrstuv12" });
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.provisionAgentVM(job);

    // vmName is derived from last 8 chars of botId
    assert.equal(result.vmName, "bot-qrstuv12-vm");
});

test("provisionAgentVM populates resourceGroupName from env", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.provisionAgentVM(makeJob());

    assert.equal(result.resourceGroupName, "agentfarm-rg");
});

test("provisionAgentVM sets containerEndpoint from adapter privateIp", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.provisionAgentVM(makeJob());

    assert.equal(result.containerEndpoint, "http://10.0.1.100:8080");
    assert.equal(result.privateIp, "10.0.1.100");
});

test("provisionAgentVM calls adapter.ensureResourceGroup once", async () => {
    let ensureCalled = 0;
    const adapter = makeAdapter({
        ensureResourceGroup: async () => { ensureCalled++; },
    });

    const manager = new VmLifecycleManager(adapter, TEST_ENV);
    await manager.provisionAgentVM(makeJob());

    assert.equal(ensureCalled, 1);
});

test("provisionAgentVM calls adapter.createVm with correct tags", async () => {
    const capturedTags: Record<string, string>[] = [];
    const adapter = makeAdapter({
        createVm: async (_token: string, _sub: string, rg: string, vmName: string, config: Parameters<AzureArmAdapter['createVm']>[4]) => {
            capturedTags.push(config.tags);
            return {
                vmId: `/subscriptions/sub-1/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${vmName}`,
                privateIp: "10.0.1.100",
            };
        },
    });

    const job = makeJob();
    const manager = new VmLifecycleManager(adapter, TEST_ENV);
    await manager.provisionAgentVM(job);

    assert.equal(capturedTags.length, 1);
    assert.equal(capturedTags[0]!["botId"], job.botId);
    assert.equal(capturedTags[0]!["tenantId"], job.tenantId);
    assert.equal(capturedTags[0]!["purpose"], "agentfarm-runtime");
});

test("provisionAgentVM throws when adapter.createVm throws", async () => {
    const adapter = makeAdapter({
        createVm: async () => { throw new Error("Azure ARM error"); },
    });

    const manager = new VmLifecycleManager(adapter, TEST_ENV);

    await assert.rejects(
        () => manager.provisionAgentVM(makeJob()),
        /Azure ARM error/,
    );
});

// ---------------------------------------------------------------------------
// terminateAgentVM tests
// ---------------------------------------------------------------------------

test("terminateAgentVM returns a VMTerminateResult with correct contract version", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.equal(result.contractVersion, CONTRACT_VERSIONS.VM_LIFECYCLE);
});

test("terminateAgentVM returns success=true when adapter succeeds", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.equal(result.success, true);
    assert.equal(result.botId, "bot-qrstuv12");
    assert.equal(result.tenantId, "tenant-abc12345");
});

test("terminateAgentVM includes deleted resources from adapter.deleteVm", async () => {
    const manager = new VmLifecycleManager(makeAdapter(), TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.deepEqual(result.resourcesDeleted, ["vm", "nic", "os_disk", "public_ip"]);
});

test("terminateAgentVM calls deleteVm for each VM found by findVmsByTags", async () => {
    const deletedVms: string[] = [];
    const adapter = makeAdapter({
        findVmsByTags: async () => ["vm-a", "vm-b"],
        deleteVm: async (_token: string, _sub: string, _rg: string, vmName: string): Promise<VMDeletedResource[]> => {
            deletedVms.push(vmName);
            return ["vm"];
        },
    });

    const manager = new VmLifecycleManager(adapter, TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.deepEqual(deletedVms, ["vm-a", "vm-b"]);
    assert.equal(result.success, true);
});

test("terminateAgentVM returns success=false and errorMessage when adapter.getToken throws", async () => {
    const adapter = makeAdapter({
        getToken: async () => { throw new Error("Auth failure"); },
    });

    const manager = new VmLifecycleManager(adapter, TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.equal(result.success, false);
    assert.match(result.errorMessage ?? "", /Auth failure/);
    assert.deepEqual(result.resourcesDeleted, []);
});

test("terminateAgentVM returns empty resourcesDeleted when no VMs found", async () => {
    const adapter = makeAdapter({
        findVmsByTags: async () => [],
    });

    const manager = new VmLifecycleManager(adapter, TEST_ENV);
    const result = await manager.terminateAgentVM("bot-qrstuv12", "tenant-abc12345");

    assert.equal(result.success, true);
    assert.deepEqual(result.resourcesDeleted, []);
});
