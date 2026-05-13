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
      throw new Error(
        'Native desktop adapter is not implemented. ' +
        'Set DESKTOP_OPERATOR=mock or DESKTOP_OPERATOR=playwright instead.'
      );
  }
}
