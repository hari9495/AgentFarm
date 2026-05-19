import { PrismaClient } from "@prisma/client";
import { ProvisioningJobProcessor } from "./job-processor.js";
import { DefaultProvisioningStepExecutor } from "./default-step-executor.js";
import { buildCloudInitScript } from "./vm-bootstrap.js";
import { ProvisioningQueueConsumer } from "./queue-consumer.js";
import { createPrismaJobRepository } from "./prisma-repository.js";
import { VmLifecycleManager, DefaultAzureArmAdapter } from "./vm-lifecycle-manager.js";
import { PrismaWorkspaceVmRepository } from "./workspace-vm-repository.js";

export const serviceName = "provisioning-service";

export {
    buildCloudInitScript,
    DefaultProvisioningStepExecutor,
    ProvisioningJobProcessor,
};

console.log(serviceName, "state machine module ready");

// --- VM lifecycle manager (only when Azure credentials are configured) ---
// When AZURE_SUBSCRIPTION_ID is set the provisioning service performs real
// ARM resource creation and teardown.  Without it the executor falls back to
// no-op stubs (useful in local dev / CI without Azure access).
const vmLifecycleManager = process.env["AZURE_SUBSCRIPTION_ID"]
    ? new VmLifecycleManager(new DefaultAzureArmAdapter())
    : undefined;

if (vmLifecycleManager) {
    console.log(serviceName, "VmLifecycleManager wired — Azure ARM calls enabled");
} else {
    console.log(serviceName, "VmLifecycleManager not wired — set AZURE_SUBSCRIPTION_ID to enable ARM provisioning");
}

// --- Service startup ---
const prisma = new PrismaClient();
const repo = createPrismaJobRepository(prisma);
const workspaceVmRepo = new PrismaWorkspaceVmRepository(prisma);
const updateBotContainerPort = async (botId: string, port: number): Promise<void> => {
    await (prisma as any).bot.update({ where: { id: botId }, data: { containerPort: port } });
};
const executor = new DefaultProvisioningStepExecutor(vmLifecycleManager, workspaceVmRepo, updateBotContainerPort);
const processor = new ProvisioningJobProcessor(repo, executor);
const consumer = new ProvisioningQueueConsumer(prisma, processor);

await consumer.start();
console.log(serviceName, "queue consumer started");

process.on("SIGTERM", () => {
    consumer.stop();
    process.exit(0);
});
process.on("SIGINT", () => {
    consumer.stop();
    process.exit(0);
});

