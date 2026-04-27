import test from "node:test";
import assert from "node:assert/strict";
import { DefaultProvisioningStepExecutor } from "./default-step-executor.js";

const job = {
    id: "job_1",
    tenantId: "tenant_12345678",
    workspaceId: "workspace_1",
    botId: "bot_12345678",
    planId: "starter",
    runtimeTier: "standard",
    roleType: "developer",
    correlationId: "cor_1",
    triggerSource: "signup_complete",
    status: "queued",
    requestedAt: new Date().toISOString(),
    requestedBy: "user_1",
} as const;

test("default executor: bootstrap returns VM context with bootstrap script", async () => {
    const executor = new DefaultProvisioningStepExecutor();

    const afterResources = await executor.createResources(job as never);
    const afterBootstrap = await executor.bootstrapVm(job as never, afterResources ?? {});

    assert.ok(afterBootstrap.vmName);
    assert.ok(afterBootstrap.vmPrivateIp);
    assert.ok(afterBootstrap.bootstrapScriptBase64);
});

test("default executor: startContainer computes endpoint and register/health checks require it", async () => {
    const executor = new DefaultProvisioningStepExecutor();

    const context = await executor.startContainer(job as never, { vmPrivateIp: "10.0.1.12" });
    assert.equal(context.containerEndpoint, "http://10.0.1.12:8080");

    const registered = await executor.registerRuntime(job as never, context);
    const healthy = await executor.healthCheck(job as never, registered);

    assert.equal(healthy.containerEndpoint, "http://10.0.1.12:8080");
});

test("default executor: registerRuntime fails fast without endpoint", async () => {
    const executor = new DefaultProvisioningStepExecutor();

    await assert.rejects(async () => {
        await executor.registerRuntime(job as never, {});
    }, /Container endpoint missing/);
});
