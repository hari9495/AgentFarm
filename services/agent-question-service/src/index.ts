/**
 * Agent Question Service Public API
 * Frozen 2026-05-07
 */

export {
    createQuestion,
    answerQuestion,
    resolveTimeout,
    sweepExpiredQuestions,
    InMemoryQuestionStore,
    type IQuestionStore,
    type CreateQuestionInput,
} from './question-store.js';

export { PrismaQuestionStore } from './prisma-question-store.js';

export type { AgentQuestionRecord, AgentQuestionStatus } from '@agentfarm/shared-types';
