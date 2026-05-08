import type { DesktopOperator, DesktopOperatorResult } from '@agentfarm/shared-types';

class MockDesktopOperator implements DesktopOperator {
  async browserOpen(url: string, browser?: string): Promise<DesktopOperatorResult> {
    console.log(`[mock] browserOpen url=${url} browser=${browser}`);
    return { ok: true, output: `mock: opened ${url}`, durationMs: 0 };
  }

  async appLaunch(app: string, args?: string[]): Promise<DesktopOperatorResult> {
    console.log(`[mock] appLaunch app=${app} args=${args?.join(' ')}`);
    return { ok: true, output: `mock: launched ${app}`, durationMs: 0 };
  }

  async meetingJoin(meetingUrl: string, mode?: string): Promise<DesktopOperatorResult> {
    console.log(`[mock] meetingJoin url=${meetingUrl} mode=${mode}`);
    return { ok: true, output: `mock: joined ${meetingUrl}`, durationMs: 0 };
  }

  async meetingSpeak(text: string): Promise<DesktopOperatorResult> {
    console.log(`[mock] meetingSpeak text=${text}`);
    return { ok: true, output: `mock: spoke "${text}"`, durationMs: 0 };
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
      // TODO: wire up a real native adapter (e.g. AppleScript / xdg-open / PowerShell)
      return new MockDesktopOperator();
  }
}
