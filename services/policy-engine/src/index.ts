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

export {
    getActivePolicy,
    nextVersion,
    publishPolicy,
    type PublishResult,
} from './policy-store.js';

export {
    evaluateWithCache,
    invalidateTenant,
    type CacheClient,
    type EvaluateWithCacheDeps,
} from './policy-cache.js';

