// DesktopSession shared types — Sprint 9 (Full Desktop VM)
// Frozen 2026-05-15

export type DesktopSessionStatus = 'idle' | 'busy' | 'terminated';
export type DesktopVisionTaskStatus = 'queued' | 'running' | 'completed' | 'timeout' | 'failed';

export interface DesktopSessionRecord {
    sessionId: string;
    tenantId: string;
    botId: string;
    status: DesktopSessionStatus;
    streamUrl: string;
    createdAt: string;
}

export interface DesktopVisionStep {
    step: number;
    action: string;
    target: string;
    value: string;
    ok: boolean;
    errorMessage?: string;
    durationMs: number;
    timestamp: string;
}

export interface DesktopVisionTaskRecord {
    taskId: string;
    sessionId: string;
    tenantId: string;
    botId: string;
    goal: string;
    status: DesktopVisionTaskStatus;
    result: string | null;
    stepCount: number;
    steps: DesktopVisionStep[];
    startedAt: string;
}
