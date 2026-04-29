export const QUEUE_PROVISIONING = 'queue_provisioning';
export const QUEUE_APPROVAL = 'queue_approval';
export const QUEUE_EVIDENCE = 'queue_evidence';
export const QUEUE_RUNTIME_TASKS = 'queue_runtime_tasks';

export const TASK_LEASE_ACTIONS = {
    claim: 'claim',
    renew: 'renew',
    release: 'release',
    expire: 'expire',
} as const;

export type TaskLeaseAction = (typeof TASK_LEASE_ACTIONS)[keyof typeof TASK_LEASE_ACTIONS];

export const BUDGET_DECISION_ACTIONS = {
    allowed: 'allowed',
    denied: 'denied',
    warning: 'warning',
} as const;

export type BudgetDecisionAction = (typeof BUDGET_DECISION_ACTIONS)[keyof typeof BUDGET_DECISION_ACTIONS];

