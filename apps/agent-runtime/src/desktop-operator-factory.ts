import type { DesktopOperator, DesktopOperatorResult } from '@agentfarm/shared-types';
import {
  generateActionId,
  generateSessionId,
  generateScreenshotId,
} from '@agentfarm/shared-types';
import {
  getAuditLogWriter,
} from './action-observability.js';

async function runWithAudit(
  sessionId: string,
  actionType: string,
  target: string,
  fn: () => Promise<DesktopOperatorResult>,
): Promise<DesktopOperatorResult> {
  const writer = getAuditLogWriter();
  const sequence = writer.nextSequence(sessionId);
  const actionId = generateActionId(sessionId, sequence);
  const screenshotBefore = generateScreenshotId(actionId, 'before');
  const startedAt = new Date();
  let result: DesktopOperatorResult;
  try {
    result = await fn();
  } catch (err) {
    result = { ok: false, output: '', durationMs: 0, errorOutput: String(err) };
  }
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const screenshotAfter = generateScreenshotId(actionId, 'after');
  writer.append({
    sessionId,
    actionId,
    actionType,
    agentId: 'mock-agent',
    workspaceId: 'mock-workspace',
    taskId: 'mock-task',
    type: 'desktop',
    action: actionType,
    target,
    payload: {},
    startedAt,
    completedAt,
    durationMs,
    success: result.ok,
    errorMessage: result.errorOutput,
    verified: false,
    riskLevel: 'low',
    screenshotBefore: screenshotBefore,
    screenshotAfter: screenshotAfter,
    evidenceBundle: {
      screenshotBefore: {
        url: screenshotBefore,
        sha256: 'mock',
        sizeBytes: 0,
        contentType: 'image/png',
        provider: 'inline',
      },
      screenshotAfter: {
        url: screenshotAfter,
        sha256: 'mock',
        sizeBytes: 0,
        contentType: 'image/png',
        provider: 'inline',
      },
      domCheckpoint: null,
      domSnapshotStored: false,
    },
  });
  return { ...result, durationMs };
}

class MockDesktopOperator implements DesktopOperator {
  private readonly sessionId: string;

  constructor() {
    this.sessionId =
      process.env['DESKTOP_OPERATOR_SESSION_ID']?.trim() ||
      generateSessionId('agt_mock_developer_0001');
  }

  async browserOpen(url: string, browser = 'default'): Promise<DesktopOperatorResult> {
    return runWithAudit(this.sessionId, 'workspace_browser_open', url, async () => {
      const msg = `[MockDesktopOperator] browserOpen: url=${url} browser=${browser}`;
      console.log(msg);
      return { ok: true, output: JSON.stringify({ mock: true, method: 'browserOpen', url, browser }), durationMs: 5 };
    });
  }

  async appLaunch(app: string, args?: string[]): Promise<DesktopOperatorResult> {
    return runWithAudit(this.sessionId, 'workspace_app_launch', app, async () => {
      const msg = `[MockDesktopOperator] appLaunch: app=${app} args=${args?.join(' ')}`;
      console.log(msg);
      return { ok: true, output: JSON.stringify({ mock: true, method: 'appLaunch', app, args }), durationMs: 5 };
    });
  }

  async meetingJoin(meetingUrl: string, mode?: string): Promise<DesktopOperatorResult> {
    return runWithAudit(this.sessionId, 'workspace_meeting_join', meetingUrl, async () => {
      const msg = `[MockDesktopOperator] meetingJoin: url=${meetingUrl} mode=${mode}`;
      console.log(msg);
      return { ok: true, output: JSON.stringify({ mock: true, method: 'meetingJoin', meetingUrl, mode }), durationMs: 5 };
    });
  }

  async meetingSpeak(text: string): Promise<DesktopOperatorResult> {
    return runWithAudit(this.sessionId, 'workspace_meeting_speak', text, async () => {
      const msg = `[MockDesktopOperator] meetingSpeak: text=${text}`;
      console.log(msg);
      return { ok: true, output: JSON.stringify({ mock: true, method: 'meetingSpeak', text }), durationMs: 5 };
    });
  }
}

// ---------------------------------------------------------------------------
// NativeDesktopOperator — HTTP client for the Python desktop-agent service
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

class NativeDesktopOperator implements DesktopOperator {
  private readonly agentUrl: string;
  private readonly voiceUrl: string;
  private sessionId: string | null = null;

  constructor() {
    this.agentUrl = (process.env['DESKTOP_AGENT_URL'] ?? 'http://localhost:5003').replace(/\/$/, '');
    this.voiceUrl = (process.env['VOICE_SERVICE_URL'] ?? 'http://localhost:5001').replace(/\/$/, '');
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const res = await fetch(`${this.agentUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`[NativeDesktopOperator] create session failed: HTTP ${res.status}`);
    const body = await res.json() as { sessionId: string };
    this.sessionId = body.sessionId;
    return this.sessionId;
  }

  private async submitTask(sessionId: string, goal: string): Promise<string> {
    const res = await fetch(`${this.agentUrl}/v1/sessions/${encodeURIComponent(sessionId)}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal }),
    });
    if (!res.ok) throw new Error(`[NativeDesktopOperator] submit task failed: HTTP ${res.status}`);
    const body = await res.json() as { taskId: string };
    return body.taskId;
  }

  private async pollTask(sessionId: string, taskId: string, startMs: number): Promise<DesktopOperatorResult> {
    const deadline = startMs + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>(r => setTimeout(r, POLL_INTERVAL_MS));
      let body: { taskId: string; status: string; result?: string } | null = null;
      try {
        const res = await fetch(`${this.agentUrl}/v1/sessions/${encodeURIComponent(sessionId)}/task`);
        if (res.ok) body = await res.json() as { taskId: string; status: string; result?: string };
      } catch {
        // transient — keep polling
      }
      if (!body || body.taskId !== taskId) continue;
      if (body.status === 'completed') {
        return { ok: true, output: body.result ?? 'completed', durationMs: Date.now() - startMs };
      }
      if (body.status === 'timeout' || body.status === 'failed') {
        return { ok: false, output: '', durationMs: Date.now() - startMs, errorOutput: body.result ?? body.status };
      }
    }
    return { ok: false, output: '', durationMs: POLL_TIMEOUT_MS, errorOutput: 'poll timeout' };
  }

  async browserOpen(url: string, browser = 'chromium-browser'): Promise<DesktopOperatorResult> {
    const start = Date.now();
    try {
      const sessionId = await this.ensureSession();
      const goal = `Open ${browser} and navigate to ${url}. Wait for the page to fully load. Return done when the page is visible.`;
      const taskId = await this.submitTask(sessionId, goal);
      return await this.pollTask(sessionId, taskId, start);
    } catch (err) {
      return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: String(err) };
    }
  }

  async appLaunch(app: string, args?: string[]): Promise<DesktopOperatorResult> {
    const start = Date.now();
    try {
      const sessionId = await this.ensureSession();
      const argStr = args?.join(' ') ?? '';
      const goal = `Launch the application: ${app}${argStr ? ' ' + argStr : ''}. Return done when the application window is visible.`;
      const taskId = await this.submitTask(sessionId, goal);
      return await this.pollTask(sessionId, taskId, start);
    } catch (err) {
      return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: String(err) };
    }
  }

  async meetingJoin(meetingUrl: string, mode = 'teams'): Promise<DesktopOperatorResult> {
    const start = Date.now();
    try {
      const sessionId = await this.ensureSession();
      const res = await fetch(`${this.agentUrl}/v1/sessions/${encodeURIComponent(sessionId)}/join-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingUrl, platform: mode }),
      });
      if (!res.ok) return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: `join-meeting failed: HTTP ${res.status}` };
      const body = await res.json() as { taskId: string };
      return await this.pollTask(sessionId, body.taskId, start);
    } catch (err) {
      return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: String(err) };
    }
  }

  async meetingSpeak(text: string): Promise<DesktopOperatorResult> {
    const start = Date.now();
    try {
      const sessionId = await this.ensureSession();
      // Synthesize speech via the voxcpm2 TTS service
      const ttsRes = await fetch(`${this.voiceUrl}/v1/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!ttsRes.ok) {
        return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: `TTS synthesis failed: HTTP ${ttsRes.status}` };
      }
      const wavBytes = Buffer.from(await ttsRes.arrayBuffer());
      const audioBase64 = wavBytes.toString('base64');

      const speakRes = await fetch(`${this.agentUrl}/v1/sessions/${encodeURIComponent(sessionId)}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64 }),
      });
      const body = await speakRes.json() as { ok: boolean; durationMs?: number; error?: string };
      return { ok: body.ok, output: body.ok ? text : '', durationMs: Date.now() - start, errorOutput: body.error };
    } catch (err) {
      return { ok: false, output: '', durationMs: Date.now() - start, errorOutput: String(err) };
    }
  }
}

export async function getDesktopOperator(): Promise<DesktopOperator> {
  const provider = process.env.DESKTOP_OPERATOR ?? 'native';
  switch (provider) {
    case 'mock':
      return new MockDesktopOperator();
    case 'playwright': {
      const { PlaywrightDesktopOperator } = await import('./desktop-operator-playwright.js');
      return new PlaywrightDesktopOperator();
    }
    case 'native':
    default:
      return new NativeDesktopOperator();
  }
}
