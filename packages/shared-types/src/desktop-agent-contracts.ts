// desktop-agent-contracts.ts — Sprint 10 (Full Desktop VM)
// Frozen 2026-05-22

/**
 * A single desktop action returned by the LLM vision loop.
 */
export type DesktopActionType = 'click' | 'type' | 'key' | 'scroll' | 'open_app' | 'wait' | 'done';

export interface DesktopAction {
    action: DesktopActionType;
    /** x,y coordinates for click/scroll; app name for open_app; key name for key */
    target?: string;
    /** text to type or scroll direction ('up' | 'down') */
    value?: string;
}

/**
 * Request body when submitting a vision-loop task to the desktop agent.
 */
export interface VisionLoopRequest {
    contractVersion: string; // CONTRACT_VERSIONS.DESKTOP_AGENT
    /** Natural-language goal for the agent to accomplish on-screen */
    goal: string;
    /** Override the provider max iterations (default: MAX_VISION_STEPS env) */
    maxIterations?: number;
    /** 'anthropic' | 'openai' — overrides service default */
    llmProvider?: string;
}

/**
 * Final result returned once the vision loop terminates.
 */
export interface VisionLoopResult {
    contractVersion: string; // CONTRACT_VERSIONS.DESKTOP_AGENT
    taskId: string;
    sessionId: string;
    goal: string;
    /** 'completed' | 'timeout' | 'failed' */
    status: 'completed' | 'timeout' | 'failed';
    /** Human-readable summary produced by the LLM when it signals 'done' */
    result: string | null;
    stepsTaken: number;
    /** Base64-encoded PNG of the final screen state */
    finalScreenshot?: string;
    startedAt: string;
    durationMs?: number;
}
