import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('kiosk diagnostics', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?arcade=1&kioskMonitor=1&kioskTest=1');
    delete window.__ARTAPP_KIOSK__;
    vi.resetModules();
  });

  test('publishes health and routes test MIDI through the registered injector', async () => {
    const diagnostics = await import('../kioskDiagnostics.js');
    const injector = vi.fn();
    diagnostics.updateKioskDiagnostic('app', { ready: true, arcade: true });
    diagnostics.markKioskCanvasFrame({ width: 800, height: 600, pixelRatio: 2 });
    diagnostics.registerKioskMidiInjector(injector);

    const message = { type: 'cc', channel: 2, number: 17, value: 127 };
    expect(window.__ARTAPP_KIOSK__.injectMidi(message)).toBe(true);
    expect(injector).toHaveBeenCalledWith(message);
    expect(window.__ARTAPP_KIOSK__.getSnapshot()).toMatchObject({
      app: { ready: true, arcade: true },
      canvas: { width: 800, height: 600, pixelRatio: 2 },
    });
  });

  test('does not install an API without the monitor flag', async () => {
    window.history.replaceState({}, '', '/?arcade=1');
    const diagnostics = await import('../kioskDiagnostics.js');
    diagnostics.updateKioskDiagnostic('app', { ready: true });
    expect(window.__ARTAPP_KIOSK__).toBeUndefined();
  });
});

