import { ProvisioningJobProcessor } from "./job-processor.js";
import { DefaultProvisioningStepExecutor } from "./default-step-executor.js";
import { buildCloudInitScript } from "./vm-bootstrap.js";

export const serviceName = "provisioning-service";

export {
    buildCloudInitScript,
    DefaultProvisioningStepExecutor,
    ProvisioningJobProcessor,
};

console.log(serviceName, "state machine module ready");

