import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { getDesktopOperator } from '../desktop-operator-factory.js';

describe('desktop-operator-factory', () => {
  let originalProvider: string | undefined;

  beforeEach(() => {
    originalProvider = process.env.DESKTOP_OPERATOR;
  });

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.DESKTOP_OPERATOR;
    } else {
      process.env.DESKTOP_OPERATOR = originalProvider;
    }
  });

  it('getDesktopOperator returns defined with DESKTOP_OPERATOR=mock', () => {
    process.env.DESKTOP_OPERATOR = 'mock';
    const operator = getDesktopOperator();
    assert.ok(operator, 'operator should be defined');
    assert.equal(typeof operator.browserOpen, 'function');
    assert.equal(typeof operator.appLaunch, 'function');
    assert.equal(typeof operator.meetingJoin, 'function');
    assert.equal(typeof operator.meetingSpeak, 'function');
  });

  it('mock browserOpen returns ok:true and output contains "mock"', async () => {
    process.env.DESKTOP_OPERATOR = 'mock';
    const operator = getDesktopOperator();
    const result = await operator.browserOpen('https://example.com');
    assert.equal(result.ok, true);
    assert.ok(result.output.includes('mock'), `expected output to contain "mock", got: ${result.output}`);
  });

  it('mock appLaunch returns ok:true', async () => {
    process.env.DESKTOP_OPERATOR = 'mock';
    const operator = getDesktopOperator();
    const result = await operator.appLaunch('vscode', ['--new-window']);
    assert.equal(result.ok, true);
  });
});
