import test from "node:test";
import assert from "node:assert/strict";
import { assertNoInlineSecrets, buildCloudInitScript } from "./vm-bootstrap.js";

const decode = (base64: string): string => Buffer.from(base64, "base64").toString("utf8");

test("vm bootstrap: cloud-init installs docker and configures restart + health probe", () => {
    const script = decode(buildCloudInitScript({
        correlationId: "cor_1",
        tenantId: "tnt_1",
        workspaceId: "wsp_1",
        botId: "bot_1",
        roleType: "developer",
        image: "agentfarm.azurecr.io/bot-runtime:v1",
        registryServer: "agentfarm.azurecr.io",
        registryUsername: "agentfarm",
        registryPasswordSecretRef: "ref:kv://agentfarm/registry-password",
        evidenceApiEndpoint: "http://api-gateway:3000/v1",
        contractVersion: "1.0",
        runtimePolicyPackVersion: "mvp-v1",
        region: "eastus2",
    }));

    assert.equal(script.includes("apt-get install -y docker-ce docker-ce-cli containerd.io"), true);
    assert.equal(script.includes("Restart=always"), true);
    assert.equal(script.includes("--restart unless-stopped"), true);
    assert.equal(script.includes("ExecStartPost=/usr/local/bin/agentfarm-healthcheck.sh"), true);
    assert.equal(script.includes("/health"), true);
});

test("vm bootstrap: script stores secret reference and never inline secret value", () => {
    const secretRef = "ref:kv://agentfarm/registry-password";
    const script = decode(buildCloudInitScript({
        correlationId: "cor_2",
        tenantId: "tnt_2",
        workspaceId: "wsp_2",
        botId: "bot_2",
        roleType: "developer",
        image: "agentfarm.azurecr.io/bot-runtime:v1",
        registryServer: "agentfarm.azurecr.io",
        registryUsername: "agentfarm",
        registryPasswordSecretRef: secretRef,
        evidenceApiEndpoint: "http://api-gateway:3000/v1",
        contractVersion: "1.0",
        runtimePolicyPackVersion: "mvp-v1",
        region: "eastus2",
    }));

    assert.equal(script.includes(secretRef), true);
    assert.equal(script.includes("super-secret-password"), false);
});

test("vm bootstrap: rejects inline secret values", () => {
    assert.throws(() => {
        assertNoInlineSecrets({
            registry_password: "super-secret-password",
        });
    }, /Inline secret value is not allowed/);
});
