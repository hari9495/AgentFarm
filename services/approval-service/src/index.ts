export const serviceName = 'approval-service';

export {
	InMemoryApprovalBatcher,
	shouldBatch,
} from './approval-batcher.js';

export type {
	ActionDecision,
	ApprovalBatchRecord,
} from './approval-batcher.js';

