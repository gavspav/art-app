const KEY = 'artapp-canvas-fps';
const EVENT = 'artapp:canvas-fps';

const clampFps = (value) => {
  if (value == null) return 60;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 60;
  return Math.max(10, Math.min(120, Math.round(num)));
};

export const getCanvasFps = () => {
  if (typeof window === 'undefined') return 60;
  const memo = window.__artapp_canvasFps;
  if (Number.isFinite(memo) && memo > 0) return clampFps(memo);
  try {
    const raw = window.localStorage?.getItem(KEY);
    const fps = clampFps(raw);
    window.__artapp_canvasFps = fps;
    return fps;
  } catch {
    return 60;
  }
};

export const setCanvasFps = (fps) => {
  if (typeof window === 'undefined') return;
  const next = clampFps(fps);
  window.__artapp_canvasFps = next;
  try {
    window.localStorage?.setItem(KEY, String(next));
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { fps: next } }));
  } catch {
    /* noop */
  }
};

export const subscribeCanvasFps = (listener) => {
  if (typeof window === 'undefined') return () => {};
  if (typeof listener !== 'function') return () => {};

  const handler = (e) => {
    const fps = clampFps(e?.detail?.fps);
    listener(fps);
  };

  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};

