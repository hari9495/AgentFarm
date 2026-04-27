import type { ProvisioningJobStatus } from "@agentfarm/shared-types";

export const PROVISIONING_HAPPY_PATH: ProvisioningJobStatus[] = [
    "queued",
    "validating",
    "creating_resources",
    "bootstrapping_vm",
    "starting_container",
    "registering_runtime",
    "healthchecking",
    "completed",
];

export const PROVISIONING_FAILURE_PATH: ProvisioningJobStatus[] = [
    "failed",
    "cleanup_pending",
    "cleaned_up",
];

const TRANSITIONS: Record<ProvisioningJobStatus, ProvisioningJobStatus[]> = {
    queued: ["validating"],
    validating: ["creating_resources", "failed"],
    creating_resources: ["bootstrapping_vm", "failed"],
    bootstrapping_vm: ["starting_container", "failed"],
    starting_container: ["registering_runtime", "failed"],
    registering_runtime: ["healthchecking", "failed"],
    healthchecking: ["completed", "failed"],
    completed: [],
    failed: ["cleanup_pending"],
    cleanup_pending: ["cleaned_up"],
    cleaned_up: [],
};

export const canTransition = (
    from: ProvisioningJobStatus,
    to: ProvisioningJobStatus,
): boolean => {
    return TRANSITIONS[from].includes(to);
};

export const nextHappyPathState = (
    current: ProvisioningJobStatus,
): ProvisioningJobStatus | null => {
    const index = PROVISIONING_HAPPY_PATH.indexOf(current);
    if (index < 0 || index === PROVISIONING_HAPPY_PATH.length - 1) {
        return null;
    }
    return PROVISIONING_HAPPY_PATH[index + 1];
};
