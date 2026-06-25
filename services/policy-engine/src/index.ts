export const serviceName = 'policy-engine';

export {
    resolveApproverIds,
    type GovernanceRoutingContext,
} from './governance-routing-policy.js';

export {
    evaluate,
    buildOpaInput,
    type OpaInput,
    type EvaluateOptions,
} from './opa-evaluator.js';

export {
    loadPolicyBundle,
    pushTenantOverlay,
    removeTenantOverlay,
    defaultPolicyPath,
    type TenantOverlay,
} from './opa-loader.js';

