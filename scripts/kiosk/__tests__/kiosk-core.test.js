import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  KioskSupervisor,
  buildLaunchAgentPlist,
  buildReportHtml,
  classifyHealth,
  isPreflightAccepted,
  restartDelayMs,
} from '../kiosk-core.mjs';

const healthySnapshot = {
  app: {
    ready: true,
    arcade: true,
    parameterTargetMode: 'global',
    arcadeJoystickMidiEnabled: true,
    arcadeKeyboardMidiEnabled: true,
    arcadeButtonPairsMidiEnabled: true,
  },
  canvas: { lastRenderAt: 9_900, width: 1920, height: 1080 },
  sound: { enabled: true, started: true, contextState: 'running', startError: '' },
};

describe('kiosk health', () => {
  test('accepts a healthy fullscreen arcade snapshot', () => {
    const result = classifyHealth({
      snapshot: healthySnapshot,
      viewport: {
        innerWidth: 1920,
        innerHeight: 1080,
        screenWidth: 1920,
        screenHeight: 1080,
        availWidth: 1920,
        availHeight: 1040,
        windowState: 'normal',
        url: 'http://127.0.0.1:4173/?arcade=1',
      },
      expectedUrl: 'http://127.0.0.1:4173/',
      now: 10_000,
    });
    expect(result).toEqual({ ok: true, failures: [], warnings: [] });
  });

  test('reports stalled, disabled, and undersized viewport states', () => {
    const result = classifyHealth({
      snapshot: {
        ...healthySnapshot,
        app: { ...healthySnapshot.app, arcadeButtonPairsMidiEnabled: false },
        canvas: { lastRenderAt: 1, width: 1920, height: 1080 },
      },
      viewport: {
        innerWidth: 1200,
        innerHeight: 800,
        screenWidth: 1920,
        screenHeight: 1080,
        availWidth: 1920,
        availHeight: 1040,
        windowState: 'normal',
        url: 'http://127.0.0.1:4173/',
      },
      expectedUrl: 'http://127.0.0.1:4173/',
      now: 30_000,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining(['button-pairs-disabled', 'canvas-stalled', 'not-fullscreen']));
  });
});

test('restart backoff is capped', () => {
  expect([1, 2, 3, 4, 5, 20].map(restartDelayMs)).toEqual([1_000, 5_000, 15_000, 30_000, 60_000, 60_000]);
});

test('headless preflight defers physical MIDI and audio checks', () => {
  expect(isPreflightAccepted({
    health: { ok: true },
    heardAudio: false,
    teensySelected: false,
    headlessMode: true,
  })).toBe(true);
  expect(isPreflightAccepted({
    health: { ok: true },
    heardAudio: false,
    teensySelected: false,
    headlessMode: false,
  })).toBe(false);
});

test('LaunchAgent uses absolute executable and working paths', () => {
  const plist = buildLaunchAgentPlist({
    nodePath: '/usr/local/bin/node',
    cliPath: '/app/scripts/kiosk/kiosk-cli.mjs',
    workdir: '/app',
    stdoutPath: '/logs/out.log',
    stderrPath: '/logs/error.log',
  });
  expect(plist).toContain('<string>/usr/local/bin/node</string>');
  expect(plist).toContain('<string>/app</string>');
  expect(plist).toContain('<key>RunAtLoad</key><true/>');
});

test('report distinguishes pass and incident data', () => {
  const html = buildReportHtml({
    passed: false,
    mode: 'soak',
    incidents: [{ at: 'now', kind: 'organic', reason: '<hang>', recoveredMs: 2000 }],
    drills: [],
  });
  expect(html).toContain('FAIL');
  expect(html).toContain('&lt;hang&gt;');
});

test('preflight cleanup is safe before background processes start', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artapp-kiosk-test-'));
  const supervisor = new KioskSupervisor({
    mode: 'preflight',
    appDir: root,
    supportDir: path.join(root, 'support'),
    logDir: path.join(root, 'logs'),
  });

  await expect(supervisor.finish()).resolves.toBeUndefined();
  expect(supervisor.finished).toBe(true);
  fs.rmSync(root, { recursive: true, force: true });
});
