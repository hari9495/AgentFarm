// Frozen 2026-05-08 — never changes, only adapters change

export interface DesktopOperatorResult {
  ok: boolean;
  output: string;
  durationMs: number;
  errorOutput?: string;
}

export type DesktopOperatorProvider = 'native' | 'mock';

export interface DesktopOperator {
  browserOpen(url: string, browser?: string): Promise<DesktopOperatorResult>;
  appLaunch(app: string, args?: string[]): Promise<DesktopOperatorResult>;
  meetingJoin(meetingUrl: string, mode?: string): Promise<DesktopOperatorResult>;
  meetingSpeak(text: string): Promise<DesktopOperatorResult>;
}
