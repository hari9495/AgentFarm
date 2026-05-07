export type {
    ActionEvent,
    ActionRequest,
    ActionCaptureAdapter,
    ActionCategory,
    RiskLevel,
    ActionEventSink,
    ApprovalGate,
    ApprovalResult,
} from './action-interceptor.js';
export {
    ActionInterceptor,
    classifyRiskByAction,
} from './action-interceptor.js';

export type {
    BrowserActionContext,
    BrowserActionResult,
    BrowserPageLike,
} from './browser-agent-wrapper.js';
export { BrowserActionExecutor } from './browser-agent-wrapper.js';

export type { BrowserActionWithUploadOptions } from './browser-action-with-upload.js';
export { BrowserActionWithUpload } from './browser-action-with-upload.js';

export type {
    DomExpectation,
    AssertionDefinition,
    DomDiffResult,
    ScreenshotDiffResult,
    AssertionResult,
    VerificationFailureEvent,
} from './diff-verifier.js';
export {
    verifyDomDiff,
    verifyScreenshotDiff,
    runAssertions,
    buildVerificationFailure,
} from './diff-verifier.js';

export type { ActionAuditRecord } from './audit-log-writer.js';
export { AuditLogWriter } from './audit-log-writer.js';

export type { CorrectnessScore, QualitySignalPayload } from './correctness-scorer.js';
export {
    scoreTaskCorrectness,
    toRuntimeQualitySignal,
} from './correctness-scorer.js';
