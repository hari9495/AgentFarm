import { PrismaClient } from "@prisma/client";
import { ProvisioningJobProcessor } from "./job-processor.js";
import { DefaultProvisioningStepExecutor } from "./default-step-executor.js";
import { buildCloudInitScript } from "./vm-bootstrap.js";
import { ProvisioningQueueConsumer } from "./queue-consumer.js";
import { createPrismaJobRepository } from "./prisma-repository.js";

export const serviceName = "provisioning-service";

export {
    buildCloudInitScript,
    DefaultProvisioningStepExecutor,
    ProvisioningJobProcessor,
};

console.log(serviceName, "state machine module ready");

// --- Service startup ---
const prisma = new PrismaClient();
const repo = createPrismaJobRepository(prisma);
const executor = new DefaultProvisioningStepExecutor();
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

