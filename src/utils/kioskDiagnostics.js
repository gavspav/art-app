const readFlag = (name) => {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search || '').get(name);
    return ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());
  } catch {
    return false;
  }
};

export const isKioskMonitorEnabled = () => readFlag('kioskMonitor');
export const isKioskTestEnabled = () => isKioskMonitorEnabled() && readFlag('kioskTest');

const diagnostics = {
  version: 1,
  startedAt: Date.now(),
  app: {},
  canvas: { frameCount: 0, lastRenderAt: 0 },
  midi: { inputCount: 0, lastInputAt: 0 },
  sound: {},
  screensaver: { active: false },
  counters: { randomize: 0 },
};

let midiInjector = null;

const cloneSnapshot = () => JSON.parse(JSON.stringify({
  ...diagnostics,
  now: Date.now(),
}));

const installBrowserApi = () => {
  if (typeof window === 'undefined' || !isKioskMonitorEnabled()) return;
  if (window.__ARTAPP_KIOSK__) return;

  const api = {
    getSnapshot: cloneSnapshot,
    injectMidi(message) {
      if (!isKioskTestEnabled() || typeof midiInjector !== 'function') return false;
      midiInjector(message);
      return true;
    },
    blockMainThread(durationMs = 120_000) {
      if (!isKioskTestEnabled()) return false;
      const duration = Math.max(1_000, Math.min(300_000, Number(durationMs) || 120_000));
      const deadline = performance.now() + duration;
      while (performance.now() < deadline) {
        // Deliberate renderer hang used to verify external watchdog recovery.
      }
      return true;
    },
  };

  Object.defineProperty(window, '__ARTAPP_KIOSK__', {
    configurable: true,
    value: api,
  });
};

export const updateKioskDiagnostic = (section, patch) => {
  if (!isKioskMonitorEnabled() || !section || !patch) return;
  diagnostics[section] = { ...(diagnostics[section] || {}), ...patch };
  installBrowserApi();
};

export const incrementKioskCounter = (name, amount = 1) => {
  if (!isKioskMonitorEnabled() || !name) return;
  diagnostics.counters[name] = (Number(diagnostics.counters[name]) || 0) + amount;
  installBrowserApi();
};

export const markKioskCanvasFrame = ({ width, height, pixelRatio } = {}) => {
  if (!isKioskMonitorEnabled()) return;
  diagnostics.canvas.frameCount += 1;
  diagnostics.canvas.lastRenderAt = Date.now();
  diagnostics.canvas.width = Number(width) || 0;
  diagnostics.canvas.height = Number(height) || 0;
  diagnostics.canvas.pixelRatio = Number(pixelRatio) || 1;
  installBrowserApi();
};

export const recordKioskMidiInput = (message) => {
  if (!isKioskMonitorEnabled()) return;
  diagnostics.midi.inputCount += 1;
  diagnostics.midi.lastInputAt = Date.now();
  diagnostics.midi.lastMessage = message ? {
    type: message.type,
    channel: message.channel,
    number: message.number,
    value: message.value,
    source: message.source || 'midi',
  } : null;
  installBrowserApi();
};

export const registerKioskMidiInjector = (injector) => {
  if (!isKioskTestEnabled()) return () => {};
  midiInjector = typeof injector === 'function' ? injector : null;
  installBrowserApi();
  return () => {
    if (midiInjector === injector) midiInjector = null;
  };
};

installBrowserApi();

