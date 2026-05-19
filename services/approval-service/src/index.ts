export const serviceName = 'approval-service';

export {
	InMemoryApprovalBatcher,
	shouldBatch,
} from './approval-batcher.js';

export type {
	ActionDecision,
	ApprovalBatchRecord,
} from './approval-batcher.js';

export { ApprovalEnforcer } from './approval-enforcer.js';

export type {
	ActivateKillSwitchRequest,
	ResumeAfterKillSwitchRequest,
} from './approval-enforcer.js';

